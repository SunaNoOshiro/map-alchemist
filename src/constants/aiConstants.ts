import { AiConfig, AiProvider, IconGenerationMode } from '@/types';

export const AI_PROVIDERS: Record<AiProvider, {
  displayName: string;
  textModels: Record<string, string>;
  imageModels: Record<string, string>;
}> = {
  'google-gemini': {
    displayName: 'Google Gemini',
    textModels: {
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
    },
    imageModels: {
      'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
    }
  }
};

export const DEFAULT_AI_CONFIG = {
  provider: 'google-gemini' as AiProvider,
  textModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  apiKey: '',
  isCustomKey: false,
  iconGenerationMode: 'auto' as IconGenerationMode
};

export const ICON_GENERATION_MODE_LABELS: Record<IconGenerationMode, string> = {
  auto: 'Auto (HQ Atlas 4x4 + Repair)',
  'batch-async': 'Batch API (Async, Cheap)',
  atlas: 'Atlas only',
  'per-icon': 'Per-icon only'
};

export const ICON_GENERATION_MODE_DESCRIPTIONS: Record<IconGenerationMode, string> = {
  auto: 'Recommended default: async 4x4 atlas batches with cell validation, then repair only failed chunks.',
  'batch-async': 'Most robust for large runs: async per-icon batch jobs with retry. More requests than atlas, but very reliable.',
  atlas: 'Fast draft mode: 4x4 atlas chunks only, no repair. Fewest image-generation requests, but failed cells remain empty.',
  'per-icon': 'Manual precise mode: one request per icon (max 32 per run). Best for targeted re-generation, not full sets.'
};

export const getAvailableTextModels = (provider: AiProvider): Record<string, string> => {
  return AI_PROVIDERS[provider]?.textModels || {};
};

export const getAvailableImageModels = (provider: AiProvider): Record<string, string> => {
  return AI_PROVIDERS[provider]?.imageModels || {};
};

export const getProviderDisplayName = (provider: AiProvider): string => {
  return AI_PROVIDERS[provider]?.displayName || provider;
};

const ICON_GENERATION_MODES = new Set<IconGenerationMode>(['auto', 'batch-async', 'atlas', 'per-icon']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAiProvider = (value: unknown): value is AiProvider =>
  typeof value === 'string' && value in AI_PROVIDERS;

const getProviderTextDefault = (provider: AiProvider): string =>
  Object.keys(AI_PROVIDERS[provider].textModels)[0] || DEFAULT_AI_CONFIG.textModel;

const getProviderImageDefault = (provider: AiProvider): string =>
  Object.keys(AI_PROVIDERS[provider].imageModels)[0] || DEFAULT_AI_CONFIG.imageModel;

const isIconGenerationMode = (value: unknown): value is IconGenerationMode =>
  typeof value === 'string' && ICON_GENERATION_MODES.has(value as IconGenerationMode);

export const sanitizeAiConfig = (raw: unknown): AiConfig => {
  const candidate = isRecord(raw) ? raw : {};
  const provider = isAiProvider(candidate.provider) ? candidate.provider : DEFAULT_AI_CONFIG.provider;
  const providerTextModels = AI_PROVIDERS[provider].textModels;
  const providerImageModels = AI_PROVIDERS[provider].imageModels;

  const textModel = typeof candidate.textModel === 'string' && candidate.textModel in providerTextModels
    ? candidate.textModel
    : getProviderTextDefault(provider);
  const imageModel = typeof candidate.imageModel === 'string' && candidate.imageModel in providerImageModels
    ? candidate.imageModel
    : getProviderImageDefault(provider);
  const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey : DEFAULT_AI_CONFIG.apiKey;
  const isCustomKey = typeof candidate.isCustomKey === 'boolean'
    ? candidate.isCustomKey
    : apiKey.length > 0;
  const iconGenerationMode = isIconGenerationMode(candidate.iconGenerationMode)
    ? candidate.iconGenerationMode
    : DEFAULT_AI_CONFIG.iconGenerationMode;

  return {
    provider,
    textModel,
    imageModel,
    apiKey,
    isCustomKey,
    iconGenerationMode,
  };
};
