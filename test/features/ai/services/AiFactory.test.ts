import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConfig } from '@/types';

const geminiCtor = vi.fn();
const openAiCtor = vi.fn();

vi.mock('@/features/ai/services/GeminiService', () => ({
  GeminiService: class GeminiService {
    constructor(...args: unknown[]) {
      geminiCtor(...args);
      return { provider: 'gemini' } as any;
    }
  },
}));

vi.mock('@/features/ai/services/OpenAIService', () => ({
  OpenAIService: class OpenAIService {
    constructor(...args: unknown[]) {
      openAiCtor(...args);
      return { provider: 'openai' } as any;
    }
  },
}));

import { AiFactory } from '@/features/ai/services/AiFactory';

const baseConfig: Omit<AiConfig, 'provider'> = {
  textModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  apiKey: 'test-key',
  isCustomKey: true,
  iconGenerationMode: 'auto',
};

describe('AiFactory', () => {
  beforeEach(() => {
    AiFactory.clearInstance();
    geminiCtor.mockClear();
    openAiCtor.mockClear();
  });

  it('creates GeminiService for google-gemini provider', () => {
    const service = AiFactory.getService({
      ...baseConfig,
      provider: 'google-gemini',
    });

    expect(service).toEqual({ provider: 'gemini' });
    expect(geminiCtor).toHaveBeenCalledTimes(1);
    expect(openAiCtor).toHaveBeenCalledTimes(0);
  });

  it('creates OpenAIService for openai provider', () => {
    const service = AiFactory.getService({
      ...baseConfig,
      provider: 'openai',
      textModel: 'gpt-4o-mini',
      imageModel: 'gpt-image-1-mini',
    });

    expect(service).toEqual({ provider: 'openai' });
    expect(openAiCtor).toHaveBeenCalledTimes(1);
    expect(geminiCtor).toHaveBeenCalledTimes(0);
  });
});
