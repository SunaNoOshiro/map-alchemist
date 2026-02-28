import { IconAtlasResult } from '@core/services/ai/IAiService';
import { ImageSize, IconGenerationMode } from '@/types';
import { createLogger } from '@core/logger';
import { buildIconAtlasLayout } from './iconAtlasUtils';
import { AbstractAiService } from './AbstractAiService';
import {
  IMAGE_RATE_LIMIT_USER_MESSAGE,
  isGeminiRateLimitError,
  toUserFacingGeminiError
} from './gemini/geminiErrors';
import {
  createGeminiAsyncBatchTransport,
  extractInlineImageDataUrl,
  getClient
} from './gemini/geminiBatchTransport';

const logger = createLogger('GeminiService');
const ICON_ATLAS_GRID_DIM = 4;
const ICON_ATLAS_CHUNK_SIZE = ICON_ATLAS_GRID_DIM * ICON_ATLAS_GRID_DIM;
const ICON_ATLAS_RETRY_PASSES = 1;
const ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB = 24;
const ICON_ASYNC_BATCH_MAX_ICONS_PER_JOB = 24;
const ICON_ASYNC_BATCH_MAX_RETRY_ICONS = 48;
const ICON_ASYNC_BATCH_POLL_INTERVAL_MS = 5000;
const ICON_ASYNC_BATCH_POLL_TIMEOUT_MS = 480000;
const ICON_PER_ICON_MAX_CALLS = 32;
const IMAGE_REQUEST_MIN_INTERVAL_MS = 180;
const IMAGE_RATE_LIMIT_MAX_RETRIES = 4;
const IMAGE_RATE_LIMIT_BACKOFF_BASE_MS = 400;
const IMAGE_RATE_LIMIT_BACKOFF_MAX_MS = 4000;
const IMAGE_RATE_LIMIT_COOLDOWN_MS = 45000;
const IMAGE_PROCESSING_TIMEOUT_MS = 5000;
const TRANSPARENT_PLACEHOLDER_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export class GeminiService extends AbstractAiService {
    constructor(
        apiKey: string,
        textModel: string,
        imageModel: string,
        iconGenerationMode: IconGenerationMode = 'auto'
    ) {
        super(apiKey, textModel, imageModel, iconGenerationMode);
    }

    private async generateImageContentWithRetries(contents: string) {
        const client = getClient(this.apiKey);
        return this.runWithImageRateLimitRetries({
            operation: () =>
                client.models.generateContent({
                    model: this.imageModel,
                    contents
                }),
            isRateLimitError: isGeminiRateLimitError,
            toUserFacingError: toUserFacingGeminiError,
            maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
            backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
            backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
            minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
            cooldownMs: IMAGE_RATE_LIMIT_COOLDOWN_MS,
            onRetry: (retryIndex, backoffMs) => {
                logger.warn(
                    `Image model rate-limited (attempt ${retryIndex + 1}/${IMAGE_RATE_LIMIT_MAX_RETRIES + 1}). Retrying in ${backoffMs}ms...`
                );
            }
        });
    }

    private createGeminiBatchTransport(displayNamePrefix: string) {
        return createGeminiAsyncBatchTransport(this.apiKey, this.imageModel, displayNamePrefix);
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
                atlasImageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
                entries: {}
            };
        }

        const layout = buildIconAtlasLayout(normalizedCategories, { size, ...options });
        const prompt = this.buildAtlasPrompt(normalizedCategories, styleDescription, size, options);

        const response = await this.generateImageContentWithRetries(prompt);

        const rawBase64 = extractInlineImageDataUrl(response);
        if (rawBase64) {
            return {
                atlasImageUrl: rawBase64,
                entries: layout.entries
            };
        }

        throw new Error('No atlas image data returned.');
    }

    async generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string> {
        const prompt = this.buildSingleIconPrompt(category, styleDescription);

        try {
            const response = await this.generateImageContentWithRetries(prompt);

            const rawBase64 = extractInlineImageDataUrl(response);
            if (rawBase64) {
                const processedImage = await this.removeBackground(rawBase64, IMAGE_PROCESSING_TIMEOUT_MS);
                return processedImage;
            }
            throw new Error("No image data returned.");
        } catch (error) {
            const userFacingError = toUserFacingGeminiError(error);
            if (userFacingError) {
                logger.error(`Icon Generation Error (${category}):`, error);
                throw userFacingError;
            }

            if (isGeminiRateLimitError(error)) {
                logger.warn(`Icon Generation Rate Limited (${category})`, error);
                throw new Error(IMAGE_RATE_LIMIT_USER_MESSAGE);
            }

            logger.error(`Icon Generation Error (${category}):`, error);
            return TRANSPARENT_PLACEHOLDER_ICON;
        }
    }

    protected async buildProviderThemeVisuals(prompt: string) {
        const client = getClient(this.apiKey);

        try {
            const response = await client.models.generateContent({
                model: this.textModel,
                contents: `Generate a complete themed map design package for "${prompt}".`,
                config: {
                    systemInstruction: this.buildThemeSystemInstruction(prompt),
                    responseMimeType: "application/json",
                }
            });

            if (!response.text) {
                throw new Error("No text returned from model");
            }

            const result = this.tryParseJson(response.text);
            return await this.buildThemeVisualPackage(result, prompt);
        } catch (error) {
            const userFacingError = toUserFacingGeminiError(error);
            if (userFacingError) {
                logger.error("Style Generation Error:", error);
                throw userFacingError;
            }

            logger.error("Style Generation Error:", error);
            return this.buildThemeVisualPackage({}, prompt, 'Simple icons for');
        }
    }

    protected getProviderIconPipelineConfig(_onProgress?: (message: string) => void) {
        return {
            placeholderIcon: TRANSPARENT_PLACEHOLDER_ICON,
            perIconMaxCalls: ICON_PER_ICON_MAX_CALLS,
            rateLimitLabel: 'Image model',
            isRateLimitError: isGeminiRateLimitError,
            toUserFacingError: toUserFacingGeminiError,
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
            asyncIconChunk: (chunk: string[], styleDescription: string, 
                onProgress?: (message: string) => void) =>
                this.runAsyncIconChunkViaTransport(chunk, styleDescription, onProgress, {
                    transport: this.createGeminiBatchTransport('mapalchemist-icons'),
                    isRateLimitError: isGeminiRateLimitError,
                    toUserFacingError: toUserFacingGeminiError,
                    minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
                    maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
                    backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
                    backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
                    cooldownMs: IMAGE_RATE_LIMIT_COOLDOWN_MS,
                    pollIntervalMs: ICON_ASYNC_BATCH_POLL_INTERVAL_MS,
                    pollTimeoutMs: ICON_ASYNC_BATCH_POLL_TIMEOUT_MS,
                    createRetryLabel: 'Async batch creation',
                    createCooldownErrorPrefix: 'Image model rate limit cooldown active',
                    pollRetryLabel: 'Batch polling',
                    imageProcessingTimeoutMs: IMAGE_PROCESSING_TIMEOUT_MS
                }),
            asyncRetryMaxIcons: ICON_ASYNC_BATCH_MAX_RETRY_ICONS,
            atlasRetryPasses: ICON_ATLAS_RETRY_PASSES,
            asyncAtlas: {
                maxChunksPerBatch: ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB,
                transport: this.createGeminiBatchTransport('mapalchemist-atlas'),
                minIntervalMs: IMAGE_REQUEST_MIN_INTERVAL_MS,
                maxRetries: IMAGE_RATE_LIMIT_MAX_RETRIES,
                backoffBaseMs: IMAGE_RATE_LIMIT_BACKOFF_BASE_MS,
                backoffMaxMs: IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
                pollIntervalMs: ICON_ASYNC_BATCH_POLL_INTERVAL_MS,
                pollTimeoutMs: ICON_ASYNC_BATCH_POLL_TIMEOUT_MS,
                createRetryLabel: 'Async batch creation',
                createCooldownErrorPrefix: 'Image model rate limit cooldown active',
                pollRetryLabel: 'Batch polling',
                buildChunkMetadata: ({ passLabel: metadataPassLabel, chunkNumber }) => ({
                    mode: 'atlas',
                    pass: metadataPassLabel,
                    chunk: String(chunkNumber)
                })
            },
            onCellRejected: (category: string, validation: any) => {
                logger.debug(`Atlas cell rejected for "${category}"`, validation);
            }
        };
    }
}
