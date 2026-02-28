import { AiConfig, AiProvider, IconGenerationMode } from '@/types';

export const AI_PROVIDERS: Record<AiProvider, {
  displayName: string;
  textModels: Record<string, string>;
  imageModels: Record<string, string>;
  iconGenerationModes: IconGenerationMode[];
}> = {
  'google-gemini': {
    displayName: 'Google Gemini',
    textModels: {
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
    },
    imageModels: {
      'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
    },
    iconGenerationModes: ['auto', 'batch-async', 'atlas', 'per-icon']
  },
  openai: {
    displayName: 'OpenAI',
    textModels: {
      'gpt-4o-mini': 'GPT-4o mini (Budget)',
    },
    imageModels: {
      'gpt-image-1-mini': 'GPT Image 1 mini',
    },
    iconGenerationModes: ['auto', 'batch-async', 'atlas', 'per-icon']
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

const PROVIDER_ICON_GENERATION_MODE_DESCRIPTIONS: Record<AiProvider, Record<IconGenerationMode, string>> = {
  'google-gemini': {
    auto: 'Recommended: true Gemini Batch API runs 4x4 atlas chunks, validates cells, and repairs only failed chunks. Cost scales with ~ceil(N/16) images per pass.',
    'batch-async': 'Cheapest reliable full-set mode on Gemini: true async Batch API per-icon chunks (~24 icons/job). Cost scales with icon count; best for large sets.',
    atlas: 'Draft mode: direct 4x4 atlas calls only (no repair). Lowest immediate request count (~ceil(N/16)), but failed cells stay empty.',
    'per-icon': 'Precision mode: one icon per request, capped at 32 calls/run to protect budget. Use for targeted fixes only.'
  },
  openai: {
    auto: 'Recommended: true OpenAI Batch API for 4x4 atlas chunks + validation + repair. Cost scales with ~ceil(N/16) images per pass; repair adds only failed chunks.',
    'batch-async': 'True OpenAI Batch API per-icon chunking for maximum reliability. Most calls, but best for large catalogs and batch-priced asynchronous runs.',
    atlas: 'Draft mode: direct 4x4 atlas image requests only (no repair). Lowest request count (~ceil(N/16)), but empty cells remain if generation misses icons.',
    'per-icon': 'Precision mode: one icon per request, capped at 32 calls/run to control spend. Best for manual regeneration of specific icons.'
  }
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

export const getSupportedIconGenerationModes = (provider: AiProvider): IconGenerationMode[] => {
  return AI_PROVIDERS[provider]?.iconGenerationModes || ['auto'];
};

export const getDefaultIconGenerationMode = (provider: AiProvider): IconGenerationMode => {
  return getSupportedIconGenerationModes(provider)[0] || DEFAULT_AI_CONFIG.iconGenerationMode;
};

export const getIconGenerationModeDescription = (
  provider: AiProvider,
  mode: IconGenerationMode
): string => {
  const providerDescriptions = PROVIDER_ICON_GENERATION_MODE_DESCRIPTIONS[provider];
  return providerDescriptions?.[mode] || ICON_GENERATION_MODE_DESCRIPTIONS[mode];
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
  const providerIconModes = new Set(getSupportedIconGenerationModes(provider));

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
    && providerIconModes.has(candidate.iconGenerationMode)
    ? candidate.iconGenerationMode
    : getDefaultIconGenerationMode(provider);

  return {
    provider,
    textModel,
    imageModel,
    apiKey,
    isCustomKey,
    iconGenerationMode,
  };
};
