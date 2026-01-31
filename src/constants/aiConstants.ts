import { AiProvider } from '@/types';

export const AI_PROVIDERS: Record<AiProvider, {
  displayName: string;
  models: Record<string, string>;
}> = {
  'google-gemini': {
    displayName: 'Google Gemini',
    models: {
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
    }
  }
};

export const DEFAULT_AI_CONFIG = {
  provider: 'google-gemini' as AiProvider,
  model: 'gemini-2.5-flash',
  apiKey: '',
  isCustomKey: false
};

export const getAvailableModels = (provider: AiProvider): Record<string, string> => {
  return AI_PROVIDERS[provider]?.models || {};
};

export const getProviderDisplayName = (provider: AiProvider): string => {
  return AI_PROVIDERS[provider]?.displayName || provider;
};
