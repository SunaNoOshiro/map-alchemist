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
});
