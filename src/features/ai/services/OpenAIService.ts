import { IconAtlasResult } from '@core/services/ai/IAiService';
import { IconGenerationMode, ImageSize } from '@/types';
import { createLogger } from '@core/logger';
import { buildIconAtlasLayout } from './iconAtlasUtils';
import { AbstractAiService } from './AbstractAiService';
import {
  OPENAI_INVALID_KEY_USER_MESSAGE,
  OPENAI_RATE_LIMIT_USER_MESSAGE,
  isOpenAiRateLimitError,
  toUserFacingOpenAiAuthError,
  toUserFacingOpenAiError
} from './openai/openaiErrors';
import { createOpenAiBatchTransport } from './openai/openaiBatchTransport';

const logger = createLogger('OpenAIService');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const TRANSPARENT_PLACEHOLDER_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ICON_ATLAS_GRID_DIM = 4;
const ICON_ATLAS_CHUNK_SIZE = ICON_ATLAS_GRID_DIM * ICON_ATLAS_GRID_DIM;
const ICON_ATLAS_RETRY_PASSES = 1;
const ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB = 24;
const ICON_PER_ICON_MAX_CALLS = 32;
const ICON_ASYNC_BATCH_MAX_ICONS_PER_JOB = 24;
const ICON_ASYNC_BATCH_MAX_RETRY_ICONS = 48;
const ICON_ASYNC_BATCH_POLL_INTERVAL_MS = 5000;
const ICON_ASYNC_BATCH_POLL_TIMEOUT_MS = 480000;
const IMAGE_REQUEST_MIN_INTERVAL_MS = 180;
const IMAGE_RATE_LIMIT_MAX_RETRIES = 4;
const IMAGE_RATE_LIMIT_BACKOFF_BASE_MS = 400;
const IMAGE_RATE_LIMIT_BACKOFF_MAX_MS = 4000;
const IMAGE_RATE_LIMIT_COOLDOWN_MS = 45000;
const IMAGE_PROCESSING_TIMEOUT_MS = 5000;

const sizeToResolution: Record<ImageSize, string> = {
  '1K': '1024x1024',
  '2K': '1024x1024',
  '4K': '1024x1024'
};

export class OpenAIService extends AbstractAiService {
  constructor(
    apiKey: string,
    textModel: string,
    imageModel: string,
    iconGenerationMode: IconGenerationMode = 'auto'
  ) {
    super(apiKey, textModel, imageModel, iconGenerationMode);
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error('API Key not found.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  private async requestOpenAiJson<T>(path: string, body: Record<string, any>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${OPENAI_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(`Failed to reach OpenAI API: ${error instanceof Error ? error.message : String(error)}`);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const authError = toUserFacingOpenAiAuthError(response.status, payload);
      if (authError) throw authError;
      const message = payload?.error?.message
        ? `${payload.error.message} (status ${response.status})`
        : `OpenAI request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }

  private async generateTextJson(prompt: string): Promise<Record<string, any>> {
    const response = await this.requestOpenAiJson<any>('/chat/completions', {
      model: this.textModel,
      messages: [
        { role: 'system', content: this.buildThemeSystemInstruction(prompt) },
        { role: 'user', content: `Generate a complete themed map design package for "${prompt}".` }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('No text returned from OpenAI text model.');
    }

    return this.tryParseJson(content);
  }

  private async generateImageDataUrl(prompt: string, size: ImageSize = '1K'): Promise<string> {
    return this.runWithImageRateLimitRetries({
      operation: async () => {
        const response = await this.requestOpenAiJson<any>('/images/generations', {
          model: this.imageModel,
          prompt,
          size: sizeToResolution[size] || sizeToResolution['1K'],
          response_format: 'b64_json'
        });

        const item = response?.data?.[0];
        const b64 = item?.b64_json;
        if (typeof b64 === 'string' && b64.length > 0) {
          return `data:image/png;base64,${b64}`;
        }
        if (typeof item?.url === 'string' && item.url.length > 0) {
          return item.url;
        }
        throw new Error('No image data returned from OpenAI image model.');
      },
      isRateLimitError: isOpenAiRateLimitError,
      toUserFacingError: toUserFacingOpenAiError,
      maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
      backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
      backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
      minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
      cooldownMs: IMAGE_RATE_LIMIT_COOLDOWN_MS,
      onRetry: (retryIndex, backoffMs) => {
        logger.warn(
          `OpenAI image model rate-limited (attempt ${retryIndex + 1}/${IMAGE_RATE_LIMIT_MAX_RETRIES + 1}). Retrying in ${backoffMs}ms...`
        );
      }
    });
  }

  private createOpenAiBatchTransport(displayNamePrefix: string) {
    return createOpenAiBatchTransport({
      apiKey: this.apiKey,
      imageModel: this.imageModel,
      displayNamePrefix,
      baseUrl: OPENAI_BASE_URL,
      imageSize: sizeToResolution['1K'],
      responseFormat: 'b64_json'
    });
  }

  private isInvalidApiKeyError(error: unknown): boolean {
    const userFacingError = toUserFacingOpenAiError(error);
    return Boolean(userFacingError && userFacingError.message === OPENAI_INVALID_KEY_USER_MESSAGE);
  }

  private async generateOpenAiAsyncIconChunk(
    chunk: string[],
    styleDescription: string,
    onProgress?: (message: string) => void
  ): Promise<Record<string, string | null>> {
    return this.runAsyncIconChunkViaTransport(chunk, styleDescription, onProgress, {
      transport: this.createOpenAiBatchTransport('mapalchemist-icons'),
      isRateLimitError: isOpenAiRateLimitError,
      toUserFacingError: toUserFacingOpenAiError,
      minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
      maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
      backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
      backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
      cooldownMs: IMAGE_RATE_LIMIT_COOLDOWN_MS,
      pollIntervalMs: ICON_ASYNC_BATCH_POLL_INTERVAL_MS,
      pollTimeoutMs: ICON_ASYNC_BATCH_POLL_TIMEOUT_MS,
      createRetryLabel: 'Async batch creation',
      createCooldownErrorPrefix: 'OpenAI image model rate limit cooldown active',
      pollRetryLabel: 'Batch polling',
      imageProcessingTimeoutMs: IMAGE_PROCESSING_TIMEOUT_MS
    });
  }

  async generateIconAtlas(
    categories: string[],
    styleDescription: string,
    size: ImageSize = '1K',
    options: { fixedColumns?: number; fixedRows?: number } = {}
  ): Promise<IconAtlasResult> {
    const normalizedCategories = [...new Set(categories.map((category) => category.trim()).filter(Boolean))];

    if (normalizedCategories.length === 0) {
      return {
        atlasImageUrl: TRANSPARENT_PLACEHOLDER_ICON,
        entries: {}
      };
    }

    const layout = buildIconAtlasLayout(normalizedCategories, { size, ...options });
    const prompt = this.buildAtlasPrompt(normalizedCategories, styleDescription, size, options);
    const atlasImageUrl = await this.generateImageDataUrl(prompt, size);

    return {
      atlasImageUrl,
      entries: layout.entries
    };
  }

  async generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string> {
    const prompt = this.buildSingleIconPrompt(category, styleDescription);

    try {
      const rawImage = await this.generateImageDataUrl(prompt, size || '1K');
      return await this.removeBackground(rawImage);
    } catch (error) {
      const userFacingError = toUserFacingOpenAiError(error);
      if (userFacingError) {
        if (this.isInvalidApiKeyError(userFacingError)) {
          throw userFacingError;
        }
      }
      if (isOpenAiRateLimitError(error)) {
        throw new Error(OPENAI_RATE_LIMIT_USER_MESSAGE);
      }
      logger.error(`Icon Generation Error (${category}):`, error);
      return TRANSPARENT_PLACEHOLDER_ICON;
    }
  }

  protected async buildProviderThemeVisuals(prompt: string) {
    let visualResult: Record<string, any> = {};
    try {
      visualResult = await this.generateTextJson(prompt);
    } catch (error) {
      const userFacingError = toUserFacingOpenAiError(error);
      if (userFacingError && this.isInvalidApiKeyError(userFacingError)) {
        throw userFacingError;
      }
      logger.error('Style Generation Error:', error);
    }

    return this.buildThemeVisualPackage(visualResult, prompt);
  }

  protected getProviderIconPipelineConfig(_onProgress?: (message: string) => void) {
    return {
      placeholderIcon: TRANSPARENT_PLACEHOLDER_ICON,
      perIconMaxCalls: ICON_PER_ICON_MAX_CALLS,
      rateLimitLabel: 'OpenAI image model',
      isRateLimitError: isOpenAiRateLimitError,
      toUserFacingError: toUserFacingOpenAiError,
      cooldownMs: IMAGE_RATE_LIMIT_COOLDOWN_MS,
      onWarning: (message: string, error?: unknown) => {
        if (typeof error === 'undefined') {
          logger.warn(message);
          return;
        }
        logger.warn(message, error);
      },
      grid: {
        chunkSize: ICON_ATLAS_CHUNK_SIZE,
        fixedColumns: ICON_ATLAS_GRID_DIM,
        fixedRows: ICON_ATLAS_GRID_DIM,
      },
      asyncIconChunkSize: ICON_ASYNC_BATCH_MAX_ICONS_PER_JOB,
      asyncIconChunk: (
        chunk: string[],
        styleDescription: string,
        onProgress?: (message: string) => void
      ) => this.generateOpenAiAsyncIconChunk(chunk, styleDescription, onProgress),
      asyncRetryMaxIcons: ICON_ASYNC_BATCH_MAX_RETRY_ICONS,
      atlasRetryPasses: ICON_ATLAS_RETRY_PASSES,
      asyncAtlas: {
        maxChunksPerBatch: ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB,
        transport: this.createOpenAiBatchTransport('mapalchemist-atlas'),
        minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
        maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
        backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
        backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
        pollIntervalMs: ICON_ASYNC_BATCH_POLL_INTERVAL_MS,
        pollTimeoutMs: ICON_ASYNC_BATCH_POLL_TIMEOUT_MS,
        createRetryLabel: 'Async batch creation',
        createCooldownErrorPrefix: 'OpenAI image model rate limit cooldown active',
        pollRetryLabel: 'Batch polling',
        buildChunkMetadata: ({ passLabel, chunkNumber }) => ({
          mode: 'atlas',
          pass: passLabel,
          chunk: String(chunkNumber)
        })
      },
      onCellRejected: (category: string, validation: any) => {
        logger.debug(`Atlas cell rejected for "${category}"`, validation);
      }
    };
  }
}
