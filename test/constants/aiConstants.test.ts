import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, sanitizeAiConfig } from '@/constants/aiConstants';

describe('sanitizeAiConfig', () => {
  it('uses strict defaults when text/image models are missing and ignores legacy single-model keys', () => {
    const sanitized = sanitizeAiConfig({
      provider: 'google-gemini',
      model: 'gemini-1.5-pro',
      apiKey: 'test-key'
    });

    expect(sanitized.provider).toBe('google-gemini');
    expect(sanitized.textModel).toBe('gemini-2.5-flash');
    expect(sanitized.imageModel).toBe('gemini-2.5-flash-image');
    expect((sanitized as { model?: string }).model).toBeUndefined();
  });

  it('preserves valid explicit text/image model selections', () => {
    const sanitized = sanitizeAiConfig({
      provider: 'google-gemini',
      textModel: 'gemini-2.5-flash-lite',
      imageModel: 'gemini-2.5-flash-image',
      iconGenerationMode: 'atlas',
      isCustomKey: true,
      apiKey: 'abc123'
    });

    expect(sanitized).toEqual({
      provider: 'google-gemini',
      textModel: 'gemini-2.5-flash-lite',
      imageModel: 'gemini-2.5-flash-image',
      iconGenerationMode: 'atlas',
      isCustomKey: true,
      apiKey: 'abc123'
    });
  });

  it('falls back to defaults when provider or model ids are invalid', () => {
    const sanitized = sanitizeAiConfig({
      provider: 'unknown-provider',
      textModel: 'not-a-real-model',
      imageModel: 'not-a-real-model',
      iconGenerationMode: 'invalid',
      apiKey: 123
    });

    expect(sanitized).toEqual(DEFAULT_AI_CONFIG);
  });
});
