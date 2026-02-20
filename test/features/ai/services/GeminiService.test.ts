import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models = {
      generateContent: generateContentMock,
    };
  }

  return { GoogleGenAI };
});

import { GeminiService } from '@/features/ai/services/GeminiService';

const invalidApiKeyError = new Error(JSON.stringify({
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    status: 'INVALID_ARGUMENT',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'API_KEY_INVALID',
        domain: 'googleapis.com',
      },
    ],
  },
}));

describe('GeminiService invalid key handling', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('fails fast on invalid API key and does not continue to icon generation', async () => {
    generateContentMock.mockRejectedValueOnce(invalidApiKeyError);

    const service = new GeminiService('bad-key', 'gemini-2.5-flash', 'auto');

    await expect(
      service.generateMapTheme('pirates map of treasures', ['Restaurant', 'Cafe', 'Bar'])
    ).rejects.toThrow('Invalid Gemini API key');

    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('throws a user-facing error for single icon generation with invalid API key', async () => {
    generateContentMock.mockRejectedValueOnce(invalidApiKeyError);

    const service = new GeminiService('bad-key', 'gemini-2.5-flash', 'auto');

    await expect(
      service.generateIconImage('Bakery', 'cartoon style')
    ).rejects.toThrow('Invalid Gemini API key');
  });

  it('compiles a full MapLibre style from a ThemeSpec response', async () => {
    const baseStyle = {
      version: 8,
      sources: {
        openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
      },
      layers: [
        { id: 'water', type: 'fill', source: 'openfreemap', 'source-layer': 'water', paint: { 'fill-color': '#000000' } },
        { id: 'road-primary', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'primary'], paint: { 'line-color': '#000000' } },
        { id: 'place-label', type: 'symbol', source: 'openfreemap', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff' } }
      ]
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseStyle,
    }));

    generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
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
          iconTheme: 'Neon tactical'
        })
      });

    const service = new GeminiService('valid-key', 'gemini-2.5-flash', 'per-icon');
    const preset = await service.generateMapTheme('Cyber city pulse', []);

    expect(preset.mapStyleJson.version).toBe(8);
    expect(preset.mapStyleJson.layers.find((layer: any) => layer.id === 'water').paint['fill-color']).toBe('#0a84ff');
    expect(preset.mapStyleJson.layers.find((layer: any) => layer.id === 'road-primary').paint['line-color']).toBe('#ff6b3d');
    expect(preset.popupStyle.backgroundColor).toBe('#101828');
    expect(preset.iconTheme).toBe('Neon tactical');
    expect(preset.palette?.road).toBe('#ff6b3d');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('caps per-icon mode requests to keep API usage bounded', async () => {
    const baseStyle = {
      version: 8,
      sources: {
        openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#000000' } }
      ]
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => baseStyle,
    }));

    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
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
        iconTheme: 'Budget-safe icon theme'
      })
    });

    const categories = Array.from({ length: 90 }, (_, index) => `Category ${index + 1}`);
    const service = new GeminiService('valid-key', 'gemini-2.5-flash', 'per-icon');
    const generateIconImageSpy = vi
      .spyOn(service, 'generateIconImage')
      .mockResolvedValue('data:image/png;base64,abc');

    const preset = await service.generateMapTheme('Budget safety test', categories);

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateIconImageSpy).toHaveBeenCalledTimes(32);
    expect(Object.keys(preset.iconsByCategory).length).toBe(32);
    expect(preset.iconsByCategory['Landmark']).toBeDefined();
  });
});
