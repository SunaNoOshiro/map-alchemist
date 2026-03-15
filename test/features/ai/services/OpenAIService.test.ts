import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIService } from '@/features/ai/services/OpenAIService';

const baseStyle = {
  version: 8,
  sources: {
    openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000000' } }
  ]
};

const themeResponseContent = JSON.stringify({
  themeSpec: {
    tokens: {
      water: '#0a84ff',
      primaryRoad: '#ff6b3d',
      textPrimary: '#f8fbff',
      haloPrimary: '#11182b'
    }
  },
  popupStyle: {
    backgroundColor: '#101828',
    textColor: '#f8fafc',
    borderColor: '#334155',
    borderRadius: '10px',
    fontFamily: 'Fira Sans'
  },
  iconTheme: 'OpenAI budget style'
});

const imageSuccessPayload = {
  created: 123456,
  data: [{ b64_json: 'ZmFrZS1pbWFnZS1kYXRh' }]
};

describe('OpenAIService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails fast on invalid API key for theme generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided' } }),
    }));

    const service = new OpenAIService('bad-key', 'gpt-4o-mini', 'gpt-image-1-mini', 'auto');
    await expect(
      service.generateMapTheme('openai invalid key test', ['Restaurant'])
    ).rejects.toThrow('Invalid OpenAI API key');
  });

  it('caps per-icon mode requests to control API spend', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: themeResponseContent } }]
          }),
        } as Response;
      }

      if (url.includes('/styles/liberty')) {
        return {
          ok: true,
          status: 200,
          json: async () => baseStyle,
        } as Response;
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const categories = Array.from({ length: 90 }, (_, index) => `Category ${index + 1}`);
    const service = new OpenAIService('valid-key', 'gpt-4o-mini', 'gpt-image-1-mini', 'per-icon');
    const generateIconImageSpy = vi
      .spyOn(service, 'generateIconImage')
      .mockResolvedValue('data:image/png;base64,abc');

    const preset = await service.generateMapTheme('OpenAI budget cap', categories);

    expect(generateIconImageSpy).toHaveBeenCalledTimes(32);
    expect(Object.keys(preset.iconsByCategory).length).toBe(32);
    expect(preset.iconsByCategory['Landmark']).toBeDefined();
  });

  it('retries atlas generation after transient 429', async () => {
    let imageCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/v1/images/generations')) {
        throw new Error(`Unexpected URL in test: ${url}`);
      }
      imageCalls += 1;
      if (imageCalls === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Too many requests' } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => imageSuccessPayload,
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new OpenAIService('valid-key', 'gpt-4o-mini', 'gpt-image-1-mini', 'atlas');
    const result = await service.generateIconAtlas(['Cafe', 'Bar'], 'OpenAI atlas retry test', '1K');

    expect(imageCalls).toBe(2);
    expect(result.atlasImageUrl).toContain('data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh');
    expect(Object.keys(result.entries)).toEqual(expect.arrayContaining(['Cafe', 'Bar']));
  });

  it('activates cooldown after repeated 429 errors', async () => {
    let imageCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/v1/images/generations')) {
        throw new Error(`Unexpected URL in test: ${url}`);
      }
      imageCalls += 1;
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Too many requests' } }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((handler: any) => {
        if (typeof handler === 'function') {
          handler();
        }
        return 0 as any;
      });

    try {
      const service = new OpenAIService('valid-key', 'gpt-4o-mini', 'gpt-image-1-mini', 'atlas');
      await expect(
        service.generateIconAtlas(['Cafe'], 'OpenAI cooldown test', '1K')
      ).rejects.toThrow(/too many requests|429|rate limit/i);

      expect(imageCalls).toBe(5);

      await expect(
        service.generateIconAtlas(['Cafe'], 'OpenAI cooldown test', '1K')
      ).rejects.toThrow(/cooldown active/i);

      expect(imageCalls).toBe(5);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
