import { IAiService, IconAtlasResult } from '@core/services/ai/IAiService';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_STYLE_URL } from '@/constants';
import { IconDefinition, ImageSize, IconGenerationMode, MapStylePreset, PopupStyle } from '@/types';
import { createLogger } from '@core/logger';
import { compileThemeStyle } from '@features/map/services/styleCompiler';
import {
  ThemeSpec,
  convertLegacyMapColorsToTokens,
  normalizeThemePopupStyle,
  normalizeThemeSpec,
  toLegacyPalette
} from './themeSpec';
import { FALLBACK_POI_ICON_KEY, getCanonicalPoiCategories } from '@features/map/services/poiIconResolver';
import { buildIconAtlasLayout, sliceAtlasIntoIconsWithValidation } from './iconAtlasUtils';

const logger = createLogger('AbstractAiService');
const FALLBACK_BASE_STYLE = { version: 8, sources: {}, layers: [] };

export type ThemeVisualPackage = {
  mapStyle: any;
  popupStyle: PopupStyle;
  iconTheme: string;
  themeSpec: ThemeSpec;
  palette: Record<string, string>;
};

export type IconGenerationBatchResult = {
  iconUrls: Record<string, string | null>;
  failedCategories: string[];
};

type IconModeHandlers = {
  generateAtlas: (
    categories: string[],
    iconTheme: string,
    onProgress: ((message: string) => void) | undefined,
    options: { retryFailedViaAtlas: boolean; useAsyncBatchTransport: boolean }
  ) => Promise<IconGenerationBatchResult>;
  generatePerIcon: (category: string, iconTheme: string) => Promise<string>;
  generateBatchAsync?: (
    categories: string[],
    iconTheme: string,
    onProgress?: (message: string) => void
  ) => Promise<IconGenerationBatchResult>;
  placeholderIcon: string;
  perIconMaxCalls: number;
  isRateLimitError?: (error: unknown) => boolean;
  isRateLimitActive?: () => boolean;
  onRateLimitSkip?: () => void;
  onPerIconBudgetCapped?: (maxCalls: number) => void;
};

type IconModeHandlerBuildOptions = {
  generateAtlas: IconModeHandlers['generateAtlas'];
  generatePerIcon: IconModeHandlers['generatePerIcon'];
  generateBatchAsync?: IconModeHandlers['generateBatchAsync'];
  placeholderIcon: string;
  perIconMaxCalls: number;
  isRateLimitError?: (error: unknown) => boolean;
  isRateLimitActive?: () => boolean;
  onProgress?: (message: string) => void;
  rateLimitLabel: string;
  logWarning?: (message: string, error?: unknown) => void;
  onPerIconBudgetCapped?: (maxCalls: number) => void;
};

type IconModeResult = {
  generationCategories: string[];
  imageUrlsByCategory: Record<string, string | null>;
};

type AtlasChunkRequest = {
  categories: string[];
  entries: IconAtlasResult['entries'];
  prompt: string;
};

type AtlasPassRunner = (
  categories: string[],
  passLabel: string
) => Promise<IconGenerationBatchResult>;

type RetryBatchRunner = (
  categories: string[]
) => Promise<IconGenerationBatchResult>;

type ChunkRunContext = {
  chunk: string[];
  chunkIndex: number;
  chunkCount: number;
};

type ChunkPassOptions<TChunkResult> = {
  onProgress?: (message: string) => void;
  getSkipMessage?: (context: ChunkRunContext) => string | null;
  onChunkStart?: (context: ChunkRunContext) => void;
  processChunk: (context: ChunkRunContext) => Promise<TChunkResult>;
  mapChunkToIcons: (context: ChunkRunContext, result: TChunkResult) => Record<string, string | null>;
  onChunkSuccess?: (
    context: ChunkRunContext,
    result: TChunkResult,
    mappedIcons: Record<string, string | null>
  ) => void;
  onChunkError?: (context: ChunkRunContext, error: unknown) => void;
};

type SharedChunkFlowOptions = {
  isRateLimitError: (error: unknown) => boolean;
  toUserFacingError?: (error: unknown) => Error | null;
  cooldownMs: number;
  onWarning?: (message: string, error?: unknown) => void;
};

type AsyncIconChunkPassOptions = SharedChunkFlowOptions & {
  chunkSize: number;
  processChunk: (
    chunk: string[],
    styleDescription: string,
    onProgress?: (message: string) => void
  ) => Promise<Record<string, string | null>>;
};

type ProviderAsyncIconChunkTransportOptions = {
  transport: ProviderAsyncBatchTransport;
  isRateLimitError: (error: unknown) => boolean;
  toUserFacingError?: (error: unknown) => Error | null;
  minIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  cooldownMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  createRetryLabel?: string;
  createCooldownErrorPrefix?: string;
  pollRetryLabel?: string;
  buildRequestMetadata?: (category: string, index: number) => Record<string, string> | undefined;
  imageProcessingTimeoutMs?: number;
};

type SequentialIconChunkOptions = {
  placeholderIcon: string;
  generateIcon: (category: string, styleDescription: string) => Promise<string>;
  isRateLimitError: (error: unknown) => boolean;
  cooldownMs: number;
};

type DirectAtlasPassOptions = SharedChunkFlowOptions & {
  chunkSize: number;
  fixedColumns: number;
  fixedRows: number;
  generateAtlasChunk: (
    chunk: string[],
    styleDescription: string,
    grid: { fixedColumns: number; fixedRows: number }
  ) => Promise<IconAtlasResult>;
  onCellRejected?: (category: string, validation: any) => void;
};

type AsyncAtlasBatchPassOptions = SharedChunkFlowOptions & {
  chunkSize: number;
  fixedColumns: number;
  fixedRows: number;
  maxChunksPerBatch: number;
  transport: ProviderAsyncBatchTransport;
  minIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  createRetryLabel?: string;
  createCooldownErrorPrefix?: string;
  pollRetryLabel?: string;
  buildChunkMetadata?: (args: { passLabel: string; chunkNumber: number }) => Record<string, string> | undefined;
  onCellRejected?: (category: string, validation: any) => void;
};

type ImageRateLimitRetryOptions<T> = {
  operation: () => Promise<T>;
  isRateLimitError: (error: unknown) => boolean;
  toUserFacingError?: (error: unknown) => Error | null;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  minIntervalMs: number;
  cooldownMs: number;
  retryLabel?: string;
  cooldownErrorPrefix?: string;
  onRetry?: (retryIndex: number, backoffMs: number, error: unknown) => void;
};

export type ProviderAsyncImageRequest = {
  prompt: string;
  metadata?: Record<string, string>;
};

export type ProviderAsyncImageResponse = {
  imageDataUrl?: string | null;
  error?: string | null;
};

export type ProviderAsyncBatchState =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type ProviderAsyncBatchSnapshot = {
  state: ProviderAsyncBatchState;
  responses?: Array<ProviderAsyncImageResponse | null>;
  errorMessage?: string;
};

export type ProviderAsyncBatchTransport = {
  create: (requests: ProviderAsyncImageRequest[]) => Promise<string>;
  get: (batchId: string) => Promise<ProviderAsyncBatchSnapshot>;
  delete?: (batchId: string) => Promise<void>;
};

type ProviderAsyncBatchRunOptions = {
  onProgress?: (message: string) => void;
  onBatchCreated?: (batchId: string) => void;
  onBatchState?: (batchId: string, state: ProviderAsyncBatchState) => void;
  isRateLimitError: (error: unknown) => boolean;
  toUserFacingError?: (error: unknown) => Error | null;
  minIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  cooldownMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  createRetryLabel?: string;
  createCooldownErrorPrefix?: string;
  pollRetryLabel?: string;
};

type ProviderAsyncAtlasConfig = {
  maxChunksPerBatch: number;
  transport: ProviderAsyncBatchTransport;
  minIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  createRetryLabel?: string;
  createCooldownErrorPrefix?: string;
  pollRetryLabel?: string;
  buildChunkMetadata?: (args: { passLabel: string; chunkNumber: number }) => Record<string, string> | undefined;
};

type ProviderIconPipelineConfig = {
  placeholderIcon: string;
  perIconMaxCalls: number;
  rateLimitLabel: string;
  isRateLimitError: (error: unknown) => boolean;
  toUserFacingError?: (error: unknown) => Error | null;
  cooldownMs: number;
  onWarning?: (message: string, error?: unknown) => void;
  grid: {
    chunkSize: number;
    fixedColumns: number;
    fixedRows: number;
  };
  asyncIconChunk?: (
    chunk: string[],
    styleDescription: string,
    onProgress?: (message: string) => void
  ) => Promise<Record<string, string | null>>;
  asyncIconChunkSize?: number;
  asyncRetryMaxIcons?: number;
  atlasRetryPasses?: number;
  asyncAtlas?: ProviderAsyncAtlasConfig;
  onCellRejected?: (category: string, validation: any) => void;
  generateAtlasChunk?: (
    chunk: string[],
    styleDescription: string,
    grid: { fixedColumns: number; fixedRows: number }
  ) => Promise<IconAtlasResult>;
};

export abstract class AbstractAiService implements IAiService {
  protected apiKey: string;
  protected textModel: string;
  protected imageModel: string;
  protected iconGenerationMode: IconGenerationMode;
  private imageRateLimitedUntil: number;
  private lastImageRequestAt: number;

  private static cachedBaseStyleTemplate: any | null = null;

  constructor(
    apiKey: string,
    textModel: string,
    imageModel: string,
    iconGenerationMode: IconGenerationMode
  ) {
    this.apiKey = apiKey;
    this.textModel = textModel;
    this.imageModel = imageModel;
    this.iconGenerationMode = iconGenerationMode;
    this.imageRateLimitedUntil = 0;
    this.lastImageRequestAt = 0;
  }

  async generateMapTheme(
    prompt: string,
    categories: string[],
    onProgress?: (message: string) => void
  ): Promise<MapStylePreset> {
    onProgress?.('Designing visual language & palette...');
    const visuals = await this.buildProviderThemeVisuals(prompt);
    const iconTheme = visuals.iconTheme;

    onProgress?.(`Art Direction: ${iconTheme.substring(0, 50)}...`);
    const modeResult = await this.generateIconsByMode(
      categories,
      iconTheme,
      onProgress,
      this.getIconModeHandlers(onProgress)
    );
    const { iconsByCategory, usableIconCount } = this.finalizeIconsByCategory(
      modeResult.generationCategories,
      iconTheme,
      modeResult.imageUrlsByCategory,
      onProgress
    );

    if (usableIconCount === 0) {
      onProgress?.(this.getNoUsableIconsWarning(this.iconGenerationMode));
    }

    onProgress?.('Finalizing theme...');
    return {
      id: uuidv4(),
      name: `${prompt.split(' ').slice(0, 4).join(' ')}...`,
      prompt,
      iconTheme,
      createdAt: new Date().toISOString(),
      mapStyleJson: visuals.mapStyle,
      palette: visuals.palette,
      popupStyle: visuals.popupStyle,
      iconsByCategory
    };
  }

  protected abstract buildProviderThemeVisuals(prompt: string): Promise<ThemeVisualPackage>;
  protected abstract getProviderIconPipelineConfig(onProgress?: (message: string) => void): ProviderIconPipelineConfig;
  abstract generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string>;
  abstract generateIconAtlas(
    categories: string[],
    styleDescription: string,
    size?: ImageSize,
    options?: { fixedColumns?: number; fixedRows?: number }
  ): Promise<IconAtlasResult>;

  protected getIconModeHandlers(onProgress?: (message: string) => void): IconModeHandlers {
    const config = this.getProviderIconPipelineConfig(onProgress);
    const generateBatchAsync = config.asyncIconChunk
      ? (categories: string[], styleDescription: string, progress?: (message: string) => void) =>
        this.generateIconsWithAsyncBatchRetryShared(categories, styleDescription, progress, config)
      : undefined;

    return this.buildCommonIconModeHandlers({
      generateAtlas: (
        atlasCategories: string[],
        styleDescription: string,
        progress: ((message: string) => void) | undefined,
        options: { retryFailedViaAtlas: boolean; useAsyncBatchTransport: boolean }
      ) => this.generateIconsWithAtlasRepairShared(atlasCategories, styleDescription, progress, options, config),
      generatePerIcon: (category: string, styleDescription: string) =>
        this.generateIconImage(category, styleDescription, '1K'),
      generateBatchAsync,
      placeholderIcon: config.placeholderIcon,
      perIconMaxCalls: config.perIconMaxCalls,
      isRateLimitError: config.isRateLimitError,
      isRateLimitActive: this.isImageRateLimited.bind(this),
      onProgress,
      rateLimitLabel: config.rateLimitLabel,
      logWarning: config.onWarning
    });
  }

  protected buildThemeSystemInstruction(prompt: string): string {
    return `You are Cartographer-AI. Return JSON only.
Task: create a theme definition for "${prompt}".

Output object format:
{
  "themeSpec": {
    "tokens": {
      "background": "#...",
      "land": "#...",
      "park": "#...",
      "industrial": "#...",
      "residential": "#...",
      "building": "#...",
      "water": "#...",
      "waterLine": "#...",
      "motorway": "#...",
      "primaryRoad": "#...",
      "secondaryRoad": "#...",
      "localRoad": "#...",
      "roadCasing": "#...",
      "boundary": "#...",
      "admin": "#...",
      "poiAccent": "#...",
      "poiText": "#...",
      "poiHalo": "#...",
      "textPrimary": "#...",
      "textSecondary": "#...",
      "haloPrimary": "#...",
      "haloSecondary": "#..."
    },
    "layerOverrides": {
      "optional-layer-id": {
        "paint": { "line-color": "#..." },
        "layout": { "text-color": "#..." }
      }
    }
  },
  "popupStyle": {
    "backgroundColor": "#...",
    "textColor": "#...",
    "borderColor": "#...",
    "borderRadius": "8px",
    "fontFamily": "Noto Sans"
  },
  "iconTheme": "short visual art direction string for POI icons"
}`;
  }

  protected tryParseJson(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch {
      try {
        let trimmed = jsonString.trim();
        if (trimmed.startsWith('```json')) {
          trimmed = trimmed.replace(/^```json/, '').replace(/```$/, '');
        } else if (trimmed.startsWith('```')) {
          trimmed = trimmed.replace(/^```/, '').replace(/```$/, '');
        }
        if (trimmed.endsWith(',')) {
          trimmed = trimmed.slice(0, -1);
        }
        const lastBrace = trimmed.lastIndexOf('}');
        if (lastBrace > -1) {
          return JSON.parse(trimmed.substring(0, lastBrace + 1));
        }
      } catch (error) {
        logger.debug('JSON repair failed in AbstractAiService', error);
      }
      return { mapStyle: {}, popupStyle: null };
    }
  }

  protected resolveThemeSpec(result: Record<string, any>): ThemeSpec {
    const rawThemeSpec = (result.themeSpec && typeof result.themeSpec === 'object')
      ? result.themeSpec
      : {};
    const rawThemeTokens = (rawThemeSpec.tokens && typeof rawThemeSpec.tokens === 'object')
      ? rawThemeSpec.tokens
      : {};
    const legacyTokens = convertLegacyMapColorsToTokens(
      result.mapColors && typeof result.mapColors === 'object'
        ? result.mapColors
        : undefined
    );

    return normalizeThemeSpec({
      ...rawThemeSpec,
      tokens: {
        ...legacyTokens,
        ...rawThemeTokens
      }
    });
  }

  protected async loadBaseStyleTemplate(): Promise<any> {
    if (AbstractAiService.cachedBaseStyleTemplate) {
      return this.cloneJson(AbstractAiService.cachedBaseStyleTemplate);
    }

    try {
      const response = await fetch(DEFAULT_STYLE_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch base style (${response.status})`);
      }
      const styleJson = await response.json();
      AbstractAiService.cachedBaseStyleTemplate = styleJson;
      return this.cloneJson(styleJson);
    } catch (error) {
      logger.error('Failed to load base style template', error);
      AbstractAiService.cachedBaseStyleTemplate = FALLBACK_BASE_STYLE;
      return this.cloneJson(FALLBACK_BASE_STYLE);
    }
  }

  protected async buildThemeVisualPackage(
    result: Record<string, any>,
    prompt: string,
    fallbackIconThemePrefix = 'Minimalist flat icons matching'
  ): Promise<ThemeVisualPackage> {
    const themeSpec = this.resolveThemeSpec(result || {});
    const palette = toLegacyPalette(themeSpec.tokens);
    const popupStyle = normalizeThemePopupStyle(result?.popupStyle);
    const baseStyle = await this.loadBaseStyleTemplate();
    const compiledStyle = compileThemeStyle(baseStyle, themeSpec);

    return {
      mapStyle: compiledStyle,
      popupStyle,
      iconTheme: typeof result?.iconTheme === 'string' && result.iconTheme.trim()
        ? result.iconTheme.trim()
        : `${fallbackIconThemePrefix} ${prompt}`,
      themeSpec,
      palette
    };
  }

  protected buildAtlasPrompt(
    categories: string[],
    styleDescription: string,
    size: ImageSize,
    options: { fixedColumns?: number; fixedRows?: number } = {}
  ): string {
    const layout = buildIconAtlasLayout(categories, { size, ...options });
    const normalizedArtDirection = (() => {
      const cleaned = styleDescription.replace(/\s+/g, ' ').trim();
      if (!cleaned) {
        return 'Clean geometric vector symbols, high contrast, no decorative noise.';
      }
      if (/glitchy|glitch|distorted/i.test(cleaned)) {
        return `${cleaned}. Interpret glitch aesthetics as controlled geometric HUD accents only (no random artifacts).`;
      }
      return cleaned;
    })();

    const categoryManifest = layout.orderedCategories
      .map((category, index) => {
        const row = Math.floor(index / layout.columns) + 1;
        const col = (index % layout.columns) + 1;
        return `${index + 1}. Row ${row}, Column ${col}: ${category}`;
      })
      .join('\n');

    return `Create ONE square icon sprite atlas image exactly ${layout.atlasSize}x${layout.atlasSize}px.

ART DIRECTION / THEME:
${normalizedArtDirection}

GRID REQUIREMENTS:
- Grid is ${layout.columns} columns x ${layout.rows} rows.
- Every cell should contain exactly one icon, centered.
- Keep icon visuals inside the cell bounds.
- SYMBOLS ONLY: no letters, no words, no captions, no numbers.
- No border lines, no guides, no drop shadows on the background.
- Decorative noise is forbidden: no particles, no grain, no static, no texture, no visual garbage.
- Use SOLID BRIGHT GREEN background (#00FF00) in all non-icon pixels for chroma-key cleanup.
- Keep visual style and stroke weight consistent across all icons.

CATEGORY-TO-CELL MAP (STRICT):
${categoryManifest}

Return only the final atlas image.`;
  }

  protected buildSingleIconPrompt(category: string, styleDescription: string): string {
    const normalizedArtDirection = styleDescription.replace(/\s+/g, ' ').trim();
    return `Create one flat vector map icon for category "${category}".

ART DIRECTION / THEME:
${normalizedArtDirection}

HARD CONSTRAINTS:
- SYMBOLS ONLY. No letters, words, numbers, captions, labels, or typography.
- No decorative noise, particles, grain, static, texture, or glitch trash.
- Keep line weight consistent and legible at 32px.
- Center icon and fill ~85-90% of frame with clear silhouette.
- Background must be solid #00FF00 only (for chroma key).
- No shadows cast on the background.

Return only the icon image.`;
  }

  protected chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }

  protected applyPerIconBudget(
    categories: string[],
    maxCalls: number
  ): { categories: string[]; wasCapped: boolean } {
    if (categories.length <= maxCalls) {
      return { categories, wasCapped: false };
    }

    const limited = categories.slice(0, maxCalls);
    const hasFallback = limited.some(
      (category) => this.normalizeToken(category) === this.normalizeToken(FALLBACK_POI_ICON_KEY)
    );
    if (!hasFallback && limited.length > 0) {
      limited[limited.length - 1] = FALLBACK_POI_ICON_KEY;
    }

    return { categories: limited, wasCapped: true };
  }

  protected removeBackground(base64Image: string, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      };

      timeoutId = setTimeout(() => finish(base64Image), timeoutMs);

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(base64Image);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];
        const tolerance = 120;

        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          if (dist < tolerance) {
            data[index + 3] = 0;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        finish(canvas.toDataURL('image/png'));
      };
      img.onerror = () => finish(base64Image);
      img.src = base64Image;
    });
  }

  protected async generateIconsByMode(
    categories: string[],
    iconTheme: string,
    onProgress: ((message: string) => void) | undefined,
    handlers: IconModeHandlers
  ): Promise<IconModeResult> {
    const useBatchAsyncOnly = this.iconGenerationMode === 'batch-async';
    const useAtlasOnly = this.iconGenerationMode === 'atlas';
    const usePerIconOnly = this.iconGenerationMode === 'per-icon';
    const useAutoMode = this.iconGenerationMode === 'auto';

    let generationCategories = getCanonicalPoiCategories(categories);
    if (usePerIconOnly) {
      const budgeted = this.applyPerIconBudget(generationCategories, handlers.perIconMaxCalls);
      generationCategories = budgeted.categories;
      if (budgeted.wasCapped) {
        handlers.onPerIconBudgetCapped?.(handlers.perIconMaxCalls);
        onProgress?.(
          `Per-icon mode capped at ${handlers.perIconMaxCalls} requests to control API spend. Switch to Batch API or Auto for broader coverage.`
        );
      }
    }

    if (useBatchAsyncOnly) {
      onProgress?.(`Generating ${generationCategories.length} icons with true async Batch API...`);
    } else if (usePerIconOnly) {
      onProgress?.(`Generating ${generationCategories.length} icons one by one...`);
    } else if (useAtlasOnly) {
      onProgress?.(`Generating ${generationCategories.length} icons via 4x4 atlas chunks (no repair fallback)...`);
    } else {
      onProgress?.(`Generating ${generationCategories.length} icons with auto mode (async batch 4x4 atlas + validation + repair)...`);
    }

    const imageUrlsByCategory = Object.fromEntries(
      generationCategories.map((category) => [category, null])
    ) as Record<string, string | null>;

    if (useBatchAsyncOnly) {
      if (handlers.generateBatchAsync) {
        const batchResult = await handlers.generateBatchAsync(generationCategories, iconTheme, onProgress);
        Object.entries(batchResult.iconUrls).forEach(([category, imageUrl]) => {
          imageUrlsByCategory[category] = imageUrl || null;
        });
      } else {
        onProgress?.('Async batch transport is not available for this provider. Falling back to per-icon calls.');
        await this.generatePerIconUrls(generationCategories, iconTheme, imageUrlsByCategory, handlers);
      }

      return { generationCategories, imageUrlsByCategory };
    }

    if (useAutoMode || useAtlasOnly) {
      const atlasResult = await handlers.generateAtlas(
        generationCategories,
        iconTheme,
        onProgress,
        {
          retryFailedViaAtlas: useAutoMode,
          useAsyncBatchTransport: useAutoMode
        }
      );

      Object.entries(atlasResult.iconUrls).forEach(([category, imageUrl]) => {
        imageUrlsByCategory[category] = imageUrl || null;
      });

      if (useAtlasOnly && atlasResult.failedCategories.length > 0) {
        onProgress?.(`Atlas-only mode kept ${atlasResult.failedCategories.length} failed cells empty (repair disabled).`);
      }

      return { generationCategories, imageUrlsByCategory };
    }

    await this.generatePerIconUrls(generationCategories, iconTheme, imageUrlsByCategory, handlers);
    return { generationCategories, imageUrlsByCategory };
  }

  protected finalizeIconsByCategory(
    generationCategories: string[],
    iconTheme: string,
    imageUrlsByCategory: Record<string, string | null>,
    onProgress?: (message: string) => void
  ): { iconsByCategory: Record<string, IconDefinition>; totalCount: number; usableIconCount: number } {
    let completedCount = 0;
    let usableIconCount = 0;
    const totalCount = generationCategories.length;
    const iconsByCategory: Record<string, IconDefinition> = {};

    generationCategories.forEach((category) => {
      completedCount += 1;
      const imageUrl = imageUrlsByCategory[category] || null;
      if (imageUrl) {
        usableIconCount += 1;
      }
      onProgress?.(`Created icon for ${category} (${completedCount}/${totalCount})`);
      iconsByCategory[category] = {
        category,
        prompt: iconTheme,
        imageUrl,
        isLoading: false
      };
    });

    onProgress?.(`Usable icons: ${usableIconCount}/${totalCount}`);
    return { iconsByCategory, totalCount, usableIconCount };
  }

  protected async runAtlasRepairPasses(
    categories: string[],
    onProgress: ((message: string) => void) | undefined,
    retryPasses: number,
    runPass: AtlasPassRunner
  ): Promise<IconGenerationBatchResult> {
    const firstPass = await runPass(categories, 'Primary');
    if (retryPasses <= 0 || firstPass.failedCategories.length === 0) {
      return firstPass;
    }

    let merged = { ...firstPass.iconUrls };
    let retryTargets = firstPass.failedCategories;

    for (let passIndex = 0; passIndex < retryPasses; passIndex += 1) {
      if (retryTargets.length === 0) break;

      onProgress?.(
        `Retrying ${retryTargets.length} failed icons with 4x4 atlas repair pass ${passIndex + 1}/${retryPasses}...`
      );
      const retryPass = await runPass(retryTargets, `Repair ${passIndex + 1}`);

      retryTargets.forEach((category) => {
        if (retryPass.iconUrls[category]) {
          merged[category] = retryPass.iconUrls[category];
        }
      });

      retryTargets = retryTargets.filter((category) => !merged[category]);
    }

    const failedCategories = categories.filter((category) => !merged[category]);
    return { iconUrls: merged, failedCategories };
  }

  protected async runRetrySubsetPass(
    categories: string[],
    onProgress: ((message: string) => void) | undefined,
    maxRetryItems: number,
    runBatch: RetryBatchRunner
  ): Promise<IconGenerationBatchResult> {
    const firstPass = await runBatch(categories);
    if (firstPass.failedCategories.length === 0) {
      return firstPass;
    }

    const retryTargets = firstPass.failedCategories.slice(0, maxRetryItems);
    if (retryTargets.length === 0) {
      return firstPass;
    }

    if (firstPass.failedCategories.length > retryTargets.length) {
      onProgress?.(`Retry budget cap reached (${maxRetryItems}); some failed icons remain empty.`);
    }

    onProgress?.(`Retrying ${retryTargets.length} failed icons via async batch...`);
    const retryPass = await runBatch(retryTargets);
    const merged = { ...firstPass.iconUrls };

    retryTargets.forEach((category) => {
      if (retryPass.iconUrls[category]) {
        merged[category] = retryPass.iconUrls[category];
      }
    });

    const failedCategories = categories.filter((category) => !merged[category]);
    return { iconUrls: merged, failedCategories };
  }

  protected async generateIconsWithAsyncBatchShared(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    config: ProviderIconPipelineConfig
  ): Promise<IconGenerationBatchResult> {
    if (!config.asyncIconChunk) {
      return {
        iconUrls: Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>,
        failedCategories: [...categories]
      };
    }

    return this.runAsyncIconChunkPass(categories, styleDescription, onProgress, {
      chunkSize: config.asyncIconChunkSize ?? config.grid.chunkSize,
      processChunk: (chunk, chunkStyleDescription, progress) =>
        config.asyncIconChunk!(chunk, chunkStyleDescription, progress),
      isRateLimitError: config.isRateLimitError,
      toUserFacingError: config.toUserFacingError,
      cooldownMs: config.cooldownMs,
      onWarning: config.onWarning
    });
  }

  protected async generateIconsWithAsyncBatchRetryShared(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    config: ProviderIconPipelineConfig
  ): Promise<IconGenerationBatchResult> {
    const maxRetryItems = config.asyncRetryMaxIcons ?? 48;
    return this.runRetrySubsetPass(
      categories,
      onProgress,
      maxRetryItems,
      (retryCategories) =>
        this.generateIconsWithAsyncBatchShared(retryCategories, styleDescription, onProgress, config)
    );
  }

  protected async generateIconsWithAtlasRepairShared(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    options: { retryFailedViaAtlas: boolean; useAsyncBatchTransport: boolean },
    config: ProviderIconPipelineConfig
  ): Promise<IconGenerationBatchResult> {
    const runDirectPass = (passCategories: string[], passLabel: string) =>
      this.runDirectAtlasChunkPass(passCategories, styleDescription, onProgress, passLabel, {
        chunkSize: config.grid.chunkSize,
        fixedColumns: config.grid.fixedColumns,
        fixedRows: config.grid.fixedRows,
        generateAtlasChunk: (chunk, chunkStyleDescription, grid) => {
          if (config.generateAtlasChunk) {
            return config.generateAtlasChunk(chunk, chunkStyleDescription, grid);
          }
          return this.generateIconAtlas(chunk, chunkStyleDescription, '1K', {
            fixedColumns: grid.fixedColumns,
            fixedRows: grid.fixedRows
          });
        },
        isRateLimitError: config.isRateLimitError,
        toUserFacingError: config.toUserFacingError,
        cooldownMs: config.cooldownMs,
        onWarning: config.onWarning,
        onCellRejected: config.onCellRejected
      });

    const runAsyncAtlasPass = (passCategories: string[], passLabel: string) => {
      if (!config.asyncAtlas) {
        return runDirectPass(passCategories, passLabel);
      }

      const asyncAtlas = config.asyncAtlas;
      return this.runAsyncAtlasBatchPass(passCategories, styleDescription, onProgress, passLabel, {
        chunkSize: config.grid.chunkSize,
        fixedColumns: config.grid.fixedColumns,
        fixedRows: config.grid.fixedRows,
        maxChunksPerBatch: asyncAtlas.maxChunksPerBatch,
        transport: asyncAtlas.transport,
        minIntervalMs: asyncAtlas.minIntervalMs,
        maxRetries: asyncAtlas.maxRetries,
        backoffBaseMs: asyncAtlas.backoffBaseMs,
        backoffMaxMs: asyncAtlas.backoffMaxMs,
        pollIntervalMs: asyncAtlas.pollIntervalMs,
        pollTimeoutMs: asyncAtlas.pollTimeoutMs,
        createRetryLabel: asyncAtlas.createRetryLabel,
        createCooldownErrorPrefix: asyncAtlas.createCooldownErrorPrefix,
        pollRetryLabel: asyncAtlas.pollRetryLabel,
        buildChunkMetadata: asyncAtlas.buildChunkMetadata,
        isRateLimitError: config.isRateLimitError,
        toUserFacingError: config.toUserFacingError,
        cooldownMs: config.cooldownMs,
        onWarning: config.onWarning,
        onCellRejected: config.onCellRejected
      });
    };

    const retryPasses = options.retryFailedViaAtlas ? (config.atlasRetryPasses ?? 1) : 0;
    const atlasPassRunner = options.useAsyncBatchTransport
      ? runAsyncAtlasPass
      : runDirectPass;

    return this.runAtlasRepairPasses(
      categories,
      onProgress,
      retryPasses,
      atlasPassRunner
    );
  }

  protected async runChunkedIconPass<TChunkResult>(
    categories: string[],
    chunkSize: number,
    options: ChunkPassOptions<TChunkResult>
  ): Promise<IconGenerationBatchResult> {
    const iconUrls = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
    const chunks = this.chunkArray(categories, chunkSize);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (chunk.length === 0) continue;

      const context: ChunkRunContext = {
        chunk,
        chunkIndex,
        chunkCount: chunks.length
      };

      const skipMessage = options.getSkipMessage?.(context) || null;
      if (skipMessage) {
        options.onProgress?.(skipMessage);
        chunk.forEach((category) => {
          iconUrls[category] = null;
        });
        continue;
      }

      options.onChunkStart?.(context);

      try {
        const chunkResult = await options.processChunk(context);
        const mappedIcons = options.mapChunkToIcons(context, chunkResult);
        chunk.forEach((category) => {
          iconUrls[category] = mappedIcons[category] || null;
        });
        options.onChunkSuccess?.(context, chunkResult, mappedIcons);
      } catch (error) {
        options.onChunkError?.(context, error);
        chunk.forEach((category) => {
          iconUrls[category] = null;
        });
      }
    }

    const failedCategories = categories.filter((category) => !iconUrls[category]);
    return { iconUrls, failedCategories };
  }

  protected buildAtlasChunkRequests(
    categories: string[],
    styleDescription: string,
    options: {
      size?: ImageSize;
      chunkSize: number;
      fixedColumns: number;
      fixedRows: number;
    }
  ): AtlasChunkRequest[] {
    const requests: AtlasChunkRequest[] = [];
    const chunks = this.chunkArray(categories, options.chunkSize);
    const size = options.size || '1K';

    for (const chunk of chunks) {
      const normalizedChunk = [...new Set(chunk.map((category) => category.trim()).filter(Boolean))];
      if (normalizedChunk.length === 0) continue;

      const layout = buildIconAtlasLayout(normalizedChunk, {
        size,
        fixedColumns: options.fixedColumns,
        fixedRows: options.fixedRows
      });

      requests.push({
        categories: layout.orderedCategories,
        entries: layout.entries,
        prompt: this.buildAtlasPrompt(layout.orderedCategories, styleDescription, size, {
          fixedColumns: options.fixedColumns,
          fixedRows: options.fixedRows
        })
      });
    }

    return requests;
  }

  protected async runAsyncIconChunkPass(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    options: AsyncIconChunkPassOptions
  ): Promise<IconGenerationBatchResult> {
    return this.runChunkedIconPass(categories, options.chunkSize, {
      onProgress,
      getSkipMessage: () => {
        if (!this.isImageRateLimited()) return null;
        const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
        return `Image model cooldown active (${remainingSeconds}s). Skipping async icon chunk.`;
      },
      onChunkStart: ({ chunk, chunkIndex, chunkCount }) => {
        onProgress?.(`Running async batch chunk ${chunkIndex + 1}/${chunkCount} (${chunk.length} icons)...`);
      },
      processChunk: ({ chunk }) =>
        options.processChunk(chunk, styleDescription, onProgress),
      mapChunkToIcons: (_context, chunkIcons) => chunkIcons,
      onChunkSuccess: ({ chunk, chunkIndex }, _chunkIcons, mappedIcons) => {
        const usableCount = chunk.filter((category) => Boolean(mappedIcons[category])).length;
        onProgress?.(`Async batch chunk ${chunkIndex + 1} usable icons: ${usableCount}/${chunk.length}`);
      },
      onChunkError: ({ chunkIndex }, error) => {
        const userFacingError = options.toUserFacingError?.(error);
        if (userFacingError) {
          throw userFacingError;
        }

        if (options.isRateLimitError(error)) {
          this.activateImageRateLimitCooldown(options.cooldownMs);
          const warning = `Async batch chunk ${chunkIndex + 1} hit rate limits. Remaining chunk icons left empty.`;
          if (options.onWarning) {
            options.onWarning(warning, error);
          } else {
            logger.warn(warning, error);
          }
          onProgress?.(warning);
          return;
        }

        const warning = `Async batch chunk ${chunkIndex + 1} failed`;
        if (options.onWarning) {
          options.onWarning(warning, error);
        } else {
          logger.warn(warning, error);
        }
      }
    });
  }

  protected async runAsyncIconChunkViaTransport(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    options: ProviderAsyncIconChunkTransportOptions
  ): Promise<Record<string, string | null>> {
    const chunkIcons = Object.fromEntries(
      categories.map((category) => [category, null])
    ) as Record<string, string | null>;

    if (!Array.isArray(categories) || categories.length === 0) {
      return chunkIcons;
    }

    const requests: ProviderAsyncImageRequest[] = categories.map((category, index) => ({
      prompt: this.buildSingleIconPrompt(category, styleDescription),
      metadata: options.buildRequestMetadata
        ? options.buildRequestMetadata(category, index)
        : { category }
    }));

    const responses = await this.runProviderAsyncImageBatch(requests, options.transport, {
      onProgress,
      onBatchCreated: (batchId) => {
        onProgress?.(`Submitted async batch ${batchId} (${categories.length} icons)...`);
      },
      onBatchState: (batchId, state) => {
        onProgress?.(`Batch ${batchId} state: ${state}`);
      },
      isRateLimitError: options.isRateLimitError,
      toUserFacingError: options.toUserFacingError,
      minIntervalMs: options.minIntervalMs,
      maxRetries: options.maxRetries,
      backoffBaseMs: options.backoffBaseMs,
      backoffMaxMs: options.backoffMaxMs,
      cooldownMs: options.cooldownMs,
      pollIntervalMs: options.pollIntervalMs,
      pollTimeoutMs: options.pollTimeoutMs,
      createRetryLabel: options.createRetryLabel,
      createCooldownErrorPrefix: options.createCooldownErrorPrefix,
      pollRetryLabel: options.pollRetryLabel
    });

    if (responses.length === 0) {
      return chunkIcons;
    }

    const timeoutMs = options.imageProcessingTimeoutMs ?? 5000;
    for (let index = 0; index < categories.length; index += 1) {
      const category = categories[index];
      const response = responses[index];
      const imageDataUrl = response?.imageDataUrl || null;
      if (!imageDataUrl) {
        chunkIcons[category] = null;
        continue;
      }
      chunkIcons[category] = await this.removeBackground(imageDataUrl, timeoutMs);
    }

    return chunkIcons;
  }

  protected async runSequentialIconChunk(
    categories: string[],
    styleDescription: string,
    options: SequentialIconChunkOptions
  ): Promise<Record<string, string | null>> {
    const chunkIcons = Object.fromEntries(
      categories.map((category) => [category, null])
    ) as Record<string, string | null>;

    for (const category of categories) {
      try {
        const imageUrl = await options.generateIcon(category, styleDescription);
        chunkIcons[category] = imageUrl && imageUrl !== options.placeholderIcon
          ? imageUrl
          : null;
      } catch (error) {
        if (options.isRateLimitError(error)) {
          this.activateImageRateLimitCooldown(options.cooldownMs);
        }
        chunkIcons[category] = null;
      }
    }

    return chunkIcons;
  }

  protected async runDirectAtlasChunkPass(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    passLabel: string,
    options: DirectAtlasPassOptions
  ): Promise<IconGenerationBatchResult> {
    return this.runChunkedIconPass(categories, options.chunkSize, {
      onProgress,
      getSkipMessage: ({ chunkIndex }) => {
        if (!this.isImageRateLimited()) return null;
        const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
        return `Image model cooldown active (${remainingSeconds}s). Skipping ${passLabel} atlas chunk ${chunkIndex + 1}.`;
      },
      onChunkStart: ({ chunk, chunkIndex, chunkCount }) => {
        onProgress?.(`Generating ${passLabel} 4x4 atlas chunk ${chunkIndex + 1}/${chunkCount} (${chunk.length} icons)...`);
      },
      processChunk: async ({ chunk }) => {
        const atlas = await options.generateAtlasChunk(chunk, styleDescription, {
          fixedColumns: options.fixedColumns,
          fixedRows: options.fixedRows
        });
        return sliceAtlasIntoIconsWithValidation(atlas.atlasImageUrl, atlas.entries);
      },
      mapChunkToIcons: ({ chunk }, sliced) =>
        Object.fromEntries(
          chunk.map((category) => [category, sliced[category]?.imageUrl || null])
        ) as Record<string, string | null>,
      onChunkSuccess: ({ chunk, chunkIndex }, sliced, mappedIcons) => {
        chunk.forEach((category) => {
          const cell = sliced[category];
          if (mappedIcons[category]) return;
          if (cell?.validation?.reason && cell.validation.reason !== 'ok') {
            options.onCellRejected?.(category, cell.validation);
          }
        });

        const usable = chunk.filter((category) => Boolean(mappedIcons[category])).length;
        const failed = chunk.length - usable;
        onProgress?.(`${passLabel} atlas chunk ${chunkIndex + 1} usable icons: ${usable}/${chunk.length}; failed: ${failed}`);
      },
      onChunkError: ({ chunkIndex }, error) => {
        const userFacingError = options.toUserFacingError?.(error);
        if (userFacingError) {
          throw userFacingError;
        }

        if (options.isRateLimitError(error)) {
          this.activateImageRateLimitCooldown(options.cooldownMs);
          onProgress?.(`${passLabel} atlas chunk ${chunkIndex + 1} hit rate limits. Chunk deferred.`);
          return;
        }

        const warning = `${passLabel} atlas chunk ${chunkIndex + 1} failed`;
        if (options.onWarning) {
          options.onWarning(warning, error);
        } else {
          logger.warn(warning, error);
        }
      }
    });
  }

  protected async runAsyncAtlasBatchPass(
    categories: string[],
    styleDescription: string,
    onProgress: ((message: string) => void) | undefined,
    passLabel: string,
    options: AsyncAtlasBatchPassOptions
  ): Promise<IconGenerationBatchResult> {
    const iconUrls = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
    const failedCategoriesSet = new Set<string>();
    const atlasChunkRequests = this.buildAtlasChunkRequests(categories, styleDescription, {
      size: '1K',
      chunkSize: options.chunkSize,
      fixedColumns: options.fixedColumns,
      fixedRows: options.fixedRows
    });
    const groupedRequests = this.chunkArray(atlasChunkRequests, options.maxChunksPerBatch);

    const markChunkFailed = (chunkCategories: string[]) => {
      chunkCategories.forEach((category) => {
        iconUrls[category] = null;
        failedCategoriesSet.add(category);
      });
    };

    for (let groupIndex = 0; groupIndex < groupedRequests.length; groupIndex += 1) {
      const requestGroup = groupedRequests[groupIndex];
      if (requestGroup.length === 0) continue;

      if (this.isImageRateLimited()) {
        const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
        onProgress?.(
          `Image model cooldown active (${remainingSeconds}s). Skipping ${passLabel} async atlas batch ${groupIndex + 1}.`
        );
        requestGroup.forEach((request) => markChunkFailed(request.categories));
        continue;
      }

      onProgress?.(
        `Generating ${passLabel} 4x4 atlas batch ${groupIndex + 1}/${groupedRequests.length} (${requestGroup.length} chunks)...`
      );

      try {
        const requests: ProviderAsyncImageRequest[] = requestGroup.map((request, requestIndex) => {
          const chunkNumber = groupIndex * options.maxChunksPerBatch + requestIndex + 1;
          return {
            prompt: request.prompt,
            metadata: options.buildChunkMetadata?.({
              passLabel,
              chunkNumber
            })
          };
        });

        const responses = await this.runProviderAsyncImageBatch(requests, options.transport, {
          onProgress,
          onBatchCreated: (batchId) => {
            onProgress?.(`Submitted ${passLabel} async atlas batch ${batchId} (${requestGroup.length} chunks)...`);
          },
          onBatchState: (batchId, state) => {
            onProgress?.(`Batch ${batchId} state: ${state}`);
          },
          isRateLimitError: options.isRateLimitError,
          toUserFacingError: options.toUserFacingError,
          minIntervalMs: options.minIntervalMs,
          maxRetries: options.maxRetries,
          backoffBaseMs: options.backoffBaseMs,
          backoffMaxMs: options.backoffMaxMs,
          cooldownMs: options.cooldownMs,
          pollIntervalMs: options.pollIntervalMs,
          pollTimeoutMs: options.pollTimeoutMs,
          createRetryLabel: options.createRetryLabel,
          createCooldownErrorPrefix: options.createCooldownErrorPrefix,
          pollRetryLabel: options.pollRetryLabel
        });

        if (responses.length === 0) {
          requestGroup.forEach((request) => markChunkFailed(request.categories));
          continue;
        }

        for (let requestIndex = 0; requestIndex < requestGroup.length; requestIndex += 1) {
          const atlasRequest = requestGroup[requestIndex];
          const chunkNumber = groupIndex * options.maxChunksPerBatch + requestIndex + 1;
          const response = responses[requestIndex];
          const atlasImageUrl = response?.imageDataUrl || null;
          if (!atlasImageUrl) {
            markChunkFailed(atlasRequest.categories);
            onProgress?.(`${passLabel} atlas chunk ${chunkNumber} returned no image.`);
            continue;
          }

          const sliced = await sliceAtlasIntoIconsWithValidation(atlasImageUrl, atlasRequest.entries);
          let usable = 0;
          let failed = 0;

          atlasRequest.categories.forEach((category) => {
            const cell = sliced[category];
            const imageUrl = cell?.imageUrl || null;
            if (imageUrl) {
              iconUrls[category] = imageUrl;
              usable += 1;
              return;
            }

            failed += 1;
            iconUrls[category] = null;
            failedCategoriesSet.add(category);
            if (cell?.validation?.reason && cell.validation.reason !== 'ok') {
              options.onCellRejected?.(category, cell.validation);
            }
          });

          onProgress?.(`${passLabel} atlas chunk ${chunkNumber} usable icons: ${usable}/${atlasRequest.categories.length}; failed: ${failed}`);
        }
      } catch (error) {
        const userFacingError = options.toUserFacingError?.(error);
        if (userFacingError) {
          throw userFacingError;
        }

        if (options.isRateLimitError(error)) {
          this.activateImageRateLimitCooldown(options.cooldownMs);
          onProgress?.(`${passLabel} async atlas batch ${groupIndex + 1} hit rate limits. Chunks deferred.`);
        } else {
          const warning = `${passLabel} async atlas batch ${groupIndex + 1} failed`;
          if (options.onWarning) {
            options.onWarning(warning, error);
          } else {
            logger.warn(warning, error);
          }
        }

        requestGroup.forEach((request) => markChunkFailed(request.categories));
      }
    }

    const failedCategories = categories.filter((category) => failedCategoriesSet.has(category) || !iconUrls[category]);
    return { iconUrls, failedCategories };
  }

  protected getImageRateLimitRemainingMs(): number {
    return Math.max(0, this.imageRateLimitedUntil - Date.now());
  }

  protected isImageRateLimited(): boolean {
    return this.getImageRateLimitRemainingMs() > 0;
  }

  protected activateImageRateLimitCooldown(cooldownMs: number): void {
    const cooldownUntil = Date.now() + Math.max(0, cooldownMs);
    this.imageRateLimitedUntil = Math.max(this.imageRateLimitedUntil, cooldownUntil);
  }

  protected async waitForImageRequestSlot(minIntervalMs: number): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastImageRequestAt;
    if (elapsed < minIntervalMs) {
      await this.sleep(minIntervalMs - elapsed);
    }
    this.lastImageRequestAt = Date.now();
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  }

  protected computeRateLimitBackoffMs(
    retryIndex: number,
    backoffBaseMs: number,
    backoffMaxMs: number
  ): number {
    const exponential = Math.min(
      backoffMaxMs,
      backoffBaseMs * Math.pow(2, retryIndex)
    );
    const jitter = Math.floor(Math.random() * 120);
    return exponential + jitter;
  }

  protected async runWithImageRateLimitRetries<T>(
    options: ImageRateLimitRetryOptions<T>
  ): Promise<T> {
    let retryIndex = 0;

    while (true) {
      if (this.isImageRateLimited()) {
        const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
        const prefix = options.cooldownErrorPrefix || 'Image model rate limit cooldown active';
        throw new Error(`${prefix} (${remainingSeconds}s remaining).`);
      }

      await this.waitForImageRequestSlot(options.minIntervalMs);

      try {
        return await options.operation();
      } catch (error) {
        const userFacingError = options.toUserFacingError?.(error);
        if (userFacingError) {
          throw userFacingError;
        }

        const retryableRateLimit = options.isRateLimitError(error);
        if (!retryableRateLimit || retryIndex >= options.maxRetries) {
          if (retryableRateLimit) {
            this.activateImageRateLimitCooldown(options.cooldownMs);
          }
          throw error;
        }

        const backoffMs = this.computeRateLimitBackoffMs(
          retryIndex,
          options.backoffBaseMs,
          options.backoffMaxMs
        );
        options.onRetry?.(retryIndex, backoffMs, error);
        if (!options.onRetry && options.retryLabel) {
          logger.warn(
            `${options.retryLabel} rate-limited (attempt ${retryIndex + 1}/${options.maxRetries + 1}). Retrying in ${backoffMs}ms...`
          );
        }
        await this.sleep(backoffMs);
        retryIndex += 1;
      }
    }
  }

  protected async runProviderAsyncImageBatch(
    requests: ProviderAsyncImageRequest[],
    transport: ProviderAsyncBatchTransport,
    options: ProviderAsyncBatchRunOptions
  ): Promise<Array<ProviderAsyncImageResponse | null>> {
    if (!Array.isArray(requests) || requests.length === 0) {
      return [];
    }

    let batchId = '';

    try {
      batchId = await this.runWithImageRateLimitRetries({
        operation: () => transport.create(requests),
        isRateLimitError: options.isRateLimitError,
        toUserFacingError: options.toUserFacingError,
        maxRetries: options.maxRetries,
        backoffBaseMs: options.backoffBaseMs,
        backoffMaxMs: options.backoffMaxMs,
        minIntervalMs: options.minIntervalMs,
        cooldownMs: options.cooldownMs,
        retryLabel: options.createRetryLabel,
        cooldownErrorPrefix: options.createCooldownErrorPrefix
      });

      options.onBatchCreated?.(batchId);
      const startedAt = Date.now();
      let pollAttempt = 0;

      while (true) {
        if (Date.now() - startedAt > options.pollTimeoutMs) {
          throw new Error(`Async batch timeout after ${(options.pollTimeoutMs / 1000).toFixed(0)}s`);
        }

        const pollDelay = pollAttempt === 0
          ? Math.max(1000, Math.floor(options.pollIntervalMs / 2))
          : options.pollIntervalMs;
        await this.sleep(pollDelay);

        try {
          const snapshot = await transport.get(batchId);
          const state = snapshot.state;
          options.onBatchState?.(batchId, state);

          if (state === 'pending' || state === 'running') {
            pollAttempt += 1;
            continue;
          }

          if (state === 'succeeded' || state === 'partially_succeeded') {
            return Array.isArray(snapshot.responses) ? snapshot.responses : [];
          }

          const reason = snapshot.errorMessage || `Batch job failed with state ${state}`;
          throw new Error(reason);
        } catch (error) {
          const userFacingError = options.toUserFacingError?.(error);
          if (userFacingError) {
            throw userFacingError;
          }

          if (options.isRateLimitError(error)) {
            const backoffMs = Math.max(
              options.pollIntervalMs,
              this.computeRateLimitBackoffMs(
                pollAttempt,
                options.backoffBaseMs,
                options.backoffMaxMs
              )
            );
            if (options.pollRetryLabel) {
              logger.warn(`${options.pollRetryLabel} rate-limited; retrying in ${backoffMs}ms...`);
            }
            await this.sleep(backoffMs);
            pollAttempt += 1;
            continue;
          }

          throw error;
        }
      }
    } finally {
      if (batchId && transport.delete) {
        try {
          await transport.delete(batchId);
        } catch (error) {
          logger.debug(`Batch cleanup skipped for ${batchId}`, error);
        }
      }
    }
  }

  protected buildCommonIconModeHandlers(options: IconModeHandlerBuildOptions): IconModeHandlers {
    let rateLimitSkipNoticeShown = false;

    const reportRateLimitSkip = () => {
      if (rateLimitSkipNoticeShown) return;
      rateLimitSkipNoticeShown = true;
      const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
      const rateLimitLabel = options.rateLimitLabel.trim() || 'Image model';
      const warning = remainingSeconds > 0
        ? `${rateLimitLabel} rate-limited. Skipping remaining icon requests for ~${remainingSeconds}s to avoid quota burn.`
        : `${rateLimitLabel} rate-limited. Skipping remaining icon requests to avoid quota burn.`;

      if (options.logWarning) {
        options.logWarning(warning);
      } else {
        logger.warn(warning);
      }
      options.onProgress?.(warning);
    };

    return {
      generateAtlas: options.generateAtlas,
      generatePerIcon: options.generatePerIcon,
      generateBatchAsync: options.generateBatchAsync,
      placeholderIcon: options.placeholderIcon,
      perIconMaxCalls: options.perIconMaxCalls,
      isRateLimitError: options.isRateLimitError,
      isRateLimitActive: options.isRateLimitActive,
      onRateLimitSkip: reportRateLimitSkip,
      onPerIconBudgetCapped: options.onPerIconBudgetCapped || ((maxCalls: number) => {
        const warning = `Per-icon mode capped at ${maxCalls} requests to control API spend. Switch to Batch API or Auto for broader coverage.`;
        if (options.logWarning) {
          options.logWarning(warning);
        } else {
          logger.warn(warning);
        }
      })
    };
  }

  private async generatePerIconUrls(
    generationCategories: string[],
    iconTheme: string,
    imageUrlsByCategory: Record<string, string | null>,
    handlers: IconModeHandlers
  ) {
    for (const category of generationCategories) {
      try {
        if (handlers.isRateLimitActive?.()) {
          handlers.onRateLimitSkip?.();
          imageUrlsByCategory[category] = null;
          continue;
        }

        const imageUrl = await handlers.generatePerIcon(category, iconTheme);
        imageUrlsByCategory[category] =
          imageUrl && imageUrl !== handlers.placeholderIcon
            ? imageUrl
            : null;
      } catch (error) {
        imageUrlsByCategory[category] = null;
        if (handlers.isRateLimitError?.(error)) {
          handlers.onRateLimitSkip?.();
        }
      }
    }
  }

  private normalizeToken(value?: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private cloneJson<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  protected getNoUsableIconsWarning(mode: IconGenerationMode): string {
    if (mode === 'atlas') {
      return 'Atlas produced no usable icons. Switch Icon Generation mode to "Batch API (Async, Cheap)" and regenerate.';
    }
    return 'No usable icons were generated. Try regenerating or changing icon generation mode.';
  }
}
