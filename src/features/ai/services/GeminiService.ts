import { GoogleGenAI, JobState } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { IAiService, IconAtlasResult } from "@core/services/ai/IAiService";
import { ImageSize, IconDefinition, IconGenerationMode, MapStylePreset, PopupStyle } from "@/types";
import { createLogger } from "@core/logger";
import { buildIconAtlasLayout, sliceAtlasIntoIconsWithValidation } from './iconAtlasUtils';
import { DEFAULT_STYLE_URL } from '@/constants';
import { compileThemeStyle } from '@features/map/services/styleCompiler';
import {
    ThemeSpec,
    convertLegacyMapColorsToTokens,
    normalizeThemePopupStyle,
    normalizeThemeSpec,
    toLegacyPalette
} from './themeSpec';
import { FALLBACK_POI_ICON_KEY, getCanonicalPoiCategories } from '@features/map/services/poiIconResolver';

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
const TRANSPARENT_PLACEHOLDER_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const INVALID_API_KEY_USER_MESSAGE = 'Invalid Gemini API key. Update API key in AI Configuration and try again.';
const IMAGE_RATE_LIMIT_USER_MESSAGE = 'Image model is temporarily rate-limited. Please retry in about a minute.';
const FALLBACK_BASE_STYLE = { version: 8, sources: {}, layers: [] };
const TERMINAL_BATCH_JOB_STATES = new Set<string>([
    JobState.JOB_STATE_SUCCEEDED,
    JobState.JOB_STATE_PARTIALLY_SUCCEEDED,
    JobState.JOB_STATE_FAILED,
    JobState.JOB_STATE_CANCELLED,
    JobState.JOB_STATE_EXPIRED,
    'BATCH_STATE_SUCCEEDED',
    'BATCH_STATE_PARTIALLY_SUCCEEDED',
    'BATCH_STATE_FAILED',
    'BATCH_STATE_CANCELLED',
    'BATCH_STATE_EXPIRED'
]);
const SUCCESS_BATCH_JOB_STATES = new Set<string>([
    JobState.JOB_STATE_SUCCEEDED,
    JobState.JOB_STATE_PARTIALLY_SUCCEEDED,
    'BATCH_STATE_SUCCEEDED',
    'BATCH_STATE_PARTIALLY_SUCCEEDED'
]);

type AsyncBatchInlinedRequest = {
    contents: string;
    metadata?: Record<string, string>;
};

let cachedBaseStyleTemplate: any | null = null;

const parseJsonIfPossible = (value: string): any | null => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const getGeminiErrorEnvelope = (error: unknown): { message: string; status?: string; code?: number; reasons: string[] } => {
    const baseMessage = error instanceof Error ? error.message : String(error ?? '');
    const parsed = parseJsonIfPossible(baseMessage);
    const errorNode = parsed?.error;
    const details = Array.isArray(errorNode?.details) ? errorNode.details : [];
    const reasons = details
        .map((detail: any) => (typeof detail?.reason === 'string' ? detail.reason : ''))
        .filter(Boolean);

    return {
        message: typeof errorNode?.message === 'string' ? errorNode.message : baseMessage,
        status: typeof errorNode?.status === 'string' ? errorNode.status : undefined,
        code: typeof errorNode?.code === 'number' ? errorNode.code : undefined,
        reasons
    };
};

const isInvalidApiKeyError = (error: unknown): boolean => {
    const envelope = getGeminiErrorEnvelope(error);
    const reasonMatch = envelope.reasons.some((reason) => reason.toUpperCase() === 'API_KEY_INVALID');
    const statusMatch = (envelope.status || '').toUpperCase() === 'INVALID_ARGUMENT';
    const message = envelope.message.toLowerCase();
    const messageMatch = message.includes('api key not valid') || message.includes('api_key_invalid');
    return reasonMatch || (statusMatch && messageMatch);
};

const toUserFacingGeminiError = (error: unknown): Error | null => {
    if (error instanceof Error && error.message === INVALID_API_KEY_USER_MESSAGE) {
        return error;
    }
    if (isInvalidApiKeyError(error)) {
        return new Error(INVALID_API_KEY_USER_MESSAGE);
    }
    return null;
};

const isRateLimitError = (error: unknown): boolean => {
    const envelope = getGeminiErrorEnvelope(error);
    if (envelope.code === 429) return true;

    const upperStatus = (envelope.status || '').toUpperCase();
    if (upperStatus === 'RESOURCE_EXHAUSTED') return true;

    const hasRateLimitReason = envelope.reasons.some((reason) => {
        const normalized = reason.toUpperCase();
        return normalized.includes('RATE_LIMIT') || normalized.includes('RESOURCE_EXHAUSTED');
    });
    if (hasRateLimitReason) return true;

    const message = envelope.message.toLowerCase();
    return message.includes('too many requests')
        || message.includes('rate limit')
        || message.includes('resource exhausted');
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const computeRateLimitBackoffMs = (retryIndex: number): number => {
    const exponential = Math.min(
        IMAGE_RATE_LIMIT_BACKOFF_MAX_MS,
        IMAGE_RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, retryIndex)
    );
    const jitter = Math.floor(Math.random() * 120);
    return exponential + jitter;
};

// Helper functions (kept local to the module)
const getClient = (apiKey: string) => {
    if (!apiKey) throw new Error("API Key not found.");
    return new GoogleGenAI({ apiKey });
};

const tryParseJSON = (jsonString: string) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        logger.warn("JSON Parse failed, attempting repair...");
        try {
            let trimmed = jsonString.trim();
            // Remove markdown code blocks if present
            if (trimmed.startsWith('```json')) {
                trimmed = trimmed.replace(/^```json/, '').replace(/```$/, '');
            } else if (trimmed.startsWith('```')) {
                trimmed = trimmed.replace(/^```/, '').replace(/```$/, '');
            }

            if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
            const lastBrace = trimmed.lastIndexOf('}');
            if (lastBrace > -1) {
                return JSON.parse(trimmed.substring(0, lastBrace + 1));
            }
        } catch (repairError) {
            logger.error("JSON Repair failed", repairError);
        }
        return { mapStyle: {}, popupStyle: null };
    }
};

const cloneJson = <T>(value: T): T => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const loadBaseStyleTemplate = async (): Promise<any> => {
    if (cachedBaseStyleTemplate) {
        return cloneJson(cachedBaseStyleTemplate);
    }

    try {
        const response = await fetch(DEFAULT_STYLE_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch base style (${response.status})`);
        }
        const styleJson = await response.json();
        cachedBaseStyleTemplate = styleJson;
        return cloneJson(styleJson);
    } catch (error) {
        logger.error("Failed to load base style template", error);
        cachedBaseStyleTemplate = FALLBACK_BASE_STYLE;
        return cloneJson(FALLBACK_BASE_STYLE);
    }
};

const resolveThemeSpec = (result: Record<string, any>): ThemeSpec => {
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
};

const removeBackground = (base64Image: string): Promise<string> => {
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

        timeoutId = setTimeout(() => {
            logger.warn(`Image processing timed out after ${IMAGE_PROCESSING_TIMEOUT_MS}ms, using raw image`);
            finish(base64Image);
        }, IMAGE_PROCESSING_TIMEOUT_MS);

        const img = new Image();
        img.crossOrigin = "Anonymous";
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

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const dist = Math.sqrt(
                    (r - bgR) ** 2 +
                    (g - bgG) ** 2 +
                    (b - bgB) ** 2
                );

                if (dist < tolerance) {
                    data[i + 3] = 0;
                }
            }

            ctx.putImageData(imageData, 0, 0);
            finish(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            logger.error("Image processing failed", e);
            finish(base64Image);
        };
        try {
            img.src = base64Image;
        } catch (error) {
            logger.warn("Image source assignment failed, using raw image", error);
            finish(base64Image);
        }
    });
};

const generateMapVisuals = async (
    prompt: string,
    apiKey: string,
    model: string
): Promise<{ mapStyle: any, popupStyle: PopupStyle, iconTheme: string, themeSpec: ThemeSpec, palette: Record<string, string> }> => {
    const client = getClient(apiKey);

    const systemInstruction = `You are Cartographer-AI. Return JSON only.
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

    try {
        const response = await client.models.generateContent({
            model: model,
            contents: `Generate a complete themed map design package for "${prompt}".`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
            }
        });

        let result;
        if (response.text) {
            result = tryParseJSON(response.text);
        } else {
            throw new Error("No text returned from model");
        }

        const themeSpec = resolveThemeSpec(result || {});
        const palette = toLegacyPalette(themeSpec.tokens);
        const popupStyle = normalizeThemePopupStyle(result?.popupStyle);
        const baseStyle = await loadBaseStyleTemplate();
        const compiledStyle = compileThemeStyle(baseStyle, themeSpec);

        return {
            mapStyle: compiledStyle,
            popupStyle,
            iconTheme: typeof result?.iconTheme === 'string' && result.iconTheme.trim()
                ? result.iconTheme.trim()
                : `Minimalist flat icons matching ${prompt}`,
            themeSpec,
            palette
        };

    } catch (error) {
        const userFacingError = toUserFacingGeminiError(error);
        if (userFacingError) {
            logger.error("Style Generation Error:", error);
            throw userFacingError;
        }

        logger.error("Style Generation Error:", error);
        const themeSpec = normalizeThemeSpec({});
        const palette = toLegacyPalette(themeSpec.tokens);
        const baseStyle = await loadBaseStyleTemplate();
        const compiledStyle = compileThemeStyle(baseStyle, themeSpec);
        return {
            mapStyle: compiledStyle,
            popupStyle: normalizeThemePopupStyle(null),
            iconTheme: `Simple icons for ${prompt}`,
            themeSpec,
            palette
        };
    }
};

const buildAtlasPrompt = (
    categories: string[],
    styleDescription: string,
    size: ImageSize,
    options: { fixedColumns?: number; fixedRows?: number } = {}
) => {
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
};

const buildSingleIconPrompt = (category: string, styleDescription: string) => {
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
};

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
};

const extractInlineImageDataUrl = (response: any): string | null => {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;

    for (const part of parts) {
        if (part?.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            return `data:${mimeType};base64,${part.inlineData.data}`;
        }
    }

    return null;
};

const extractBatchJobState = (job: any): string | undefined => {
    if (typeof job?.state === 'string' && job.state.trim()) {
        return job.state;
    }
    if (typeof job?.metadata?.state === 'string' && job.metadata.state.trim()) {
        return job.metadata.state;
    }
    return undefined;
};

const extractBatchInlinedResponses = (job: any): any[] => {
    if (Array.isArray(job?.dest?.inlinedResponses)) {
        return job.dest.inlinedResponses;
    }
    if (Array.isArray(job?.output?.inlinedResponses)) {
        return job.output.inlinedResponses;
    }
    const nested = job?.metadata?.output?.inlinedResponses?.inlinedResponses;
    if (Array.isArray(nested)) {
        return nested;
    }
    return [];
};

const normalizeToken = (value?: string): string =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const applyPerIconBudget = (
    categories: string[]
): { categories: string[]; wasCapped: boolean } => {
    if (categories.length <= ICON_PER_ICON_MAX_CALLS) {
        return { categories, wasCapped: false };
    }

    const limited = categories.slice(0, ICON_PER_ICON_MAX_CALLS);
    const hasFallback = limited.some(
        (category) => normalizeToken(category) === normalizeToken(FALLBACK_POI_ICON_KEY)
    );
    if (!hasFallback && limited.length > 0) {
        limited[limited.length - 1] = FALLBACK_POI_ICON_KEY;
    }

    return { categories: limited, wasCapped: true };
};

export class GeminiService implements IAiService {
    private apiKey: string;
    private textModel: string;
    private imageModel: string;
    private iconGenerationMode: IconGenerationMode;
    private lastImageRequestAt: number;
    private imageRateLimitedUntil: number;

    constructor(
        apiKey: string,
        textModel: string,
        imageModel: string,
        iconGenerationMode: IconGenerationMode = 'auto'
    ) {
        this.apiKey = apiKey;
        this.textModel = textModel;
        this.imageModel = imageModel;
        this.iconGenerationMode = iconGenerationMode;
        this.lastImageRequestAt = 0;
        this.imageRateLimitedUntil = 0;
    }

    private getImageRateLimitRemainingMs(): number {
        return Math.max(0, this.imageRateLimitedUntil - Date.now());
    }

    private isImageRateLimited(): boolean {
        return this.getImageRateLimitRemainingMs() > 0;
    }

    private activateImageRateLimitCooldown() {
        const cooldownUntil = Date.now() + IMAGE_RATE_LIMIT_COOLDOWN_MS;
        this.imageRateLimitedUntil = Math.max(this.imageRateLimitedUntil, cooldownUntil);
    }

    private async waitForImageRequestSlot() {
        const now = Date.now();
        const elapsed = now - this.lastImageRequestAt;
        if (elapsed < IMAGE_REQUEST_MIN_INTERVAL_MS) {
            await sleep(IMAGE_REQUEST_MIN_INTERVAL_MS - elapsed);
        }
        this.lastImageRequestAt = Date.now();
    }

    private async generateImageContentWithRetries(contents: string) {
        const client = getClient(this.apiKey);
        let retryIndex = 0;

        while (true) {
            if (this.isImageRateLimited()) {
                const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
                throw new Error(`Image model rate limit cooldown active (${remainingSeconds}s remaining).`);
            }

            await this.waitForImageRequestSlot();
            try {
                return await client.models.generateContent({
                    model: this.imageModel,
                    contents
                });
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                const retryableRateLimit = isRateLimitError(error);
                if (!retryableRateLimit || retryIndex >= IMAGE_RATE_LIMIT_MAX_RETRIES) {
                    if (retryableRateLimit) {
                        this.activateImageRateLimitCooldown();
                    }
                    throw error;
                }

                const backoffMs = computeRateLimitBackoffMs(retryIndex);
                logger.warn(
                    `Image model rate-limited (attempt ${retryIndex + 1}/${IMAGE_RATE_LIMIT_MAX_RETRIES + 1}). Retrying in ${backoffMs}ms...`
                );
                await sleep(backoffMs);
                retryIndex += 1;
            }
        }
    }

    private isBatchJobTerminalState(state?: string): boolean {
        if (!state) return false;
        return TERMINAL_BATCH_JOB_STATES.has(state);
    }

    private isBatchJobSuccessState(state?: string): boolean {
        if (!state) return false;
        return SUCCESS_BATCH_JOB_STATES.has(state);
    }

    private async createAsyncBatchJob(
        inlinedRequests: AsyncBatchInlinedRequest[],
        displayNamePrefix: string
    ) {
        const client = getClient(this.apiKey);
        let retryIndex = 0;

        if (!Array.isArray(inlinedRequests) || inlinedRequests.length === 0) {
            throw new Error('Cannot create async batch without requests.');
        }

        while (true) {
            if (this.isImageRateLimited()) {
                const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
                throw new Error(`Image model rate limit cooldown active (${remainingSeconds}s remaining).`);
            }

            await this.waitForImageRequestSlot();
            try {
                return await client.batches.create({
                    model: this.imageModel,
                    src: {
                        inlinedRequests
                    },
                    config: {
                        displayName: `${displayNamePrefix}-${Date.now()}`
                    }
                });
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                const retryableRateLimit = isRateLimitError(error);
                if (!retryableRateLimit || retryIndex >= IMAGE_RATE_LIMIT_MAX_RETRIES) {
                    if (retryableRateLimit) {
                        this.activateImageRateLimitCooldown();
                    }
                    throw error;
                }

                const backoffMs = computeRateLimitBackoffMs(retryIndex);
                logger.warn(
                    `Async batch creation rate-limited (attempt ${retryIndex + 1}/${IMAGE_RATE_LIMIT_MAX_RETRIES + 1}). Retrying in ${backoffMs}ms...`
                );
                await sleep(backoffMs);
                retryIndex += 1;
            }
        }
    }

    private async createAsyncIconBatchJob(categories: string[], styleDescription: string) {
        const inlinedRequests = categories.map((category) => ({
            contents: buildSingleIconPrompt(category, styleDescription),
            metadata: {
                category
            }
        }));
        return this.createAsyncBatchJob(inlinedRequests, 'mapalchemist-icons');
    }

    private async waitForAsyncBatchJobCompletion(jobName: string, onProgress?: (message: string) => void) {
        const client = getClient(this.apiKey);
        const startedAt = Date.now();
        let pollAttempt = 0;

        while (true) {
            if (Date.now() - startedAt > ICON_ASYNC_BATCH_POLL_TIMEOUT_MS) {
                throw new Error(`Async batch timeout after ${(ICON_ASYNC_BATCH_POLL_TIMEOUT_MS / 1000).toFixed(0)}s`);
            }

            const pollDelay = pollAttempt === 0
                ? Math.max(1000, Math.floor(ICON_ASYNC_BATCH_POLL_INTERVAL_MS / 2))
                : ICON_ASYNC_BATCH_POLL_INTERVAL_MS;
            await sleep(pollDelay);

            try {
                const job = await client.batches.get({ name: jobName });
                const state = extractBatchJobState(job) || JobState.JOB_STATE_UNSPECIFIED;
                onProgress?.(`Batch ${jobName} state: ${state}`);

                if (!this.isBatchJobTerminalState(state)) {
                    pollAttempt += 1;
                    continue;
                }

                if (this.isBatchJobSuccessState(state)) {
                    return job;
                }

                const errorMessage = job.error?.message
                    || job?.metadata?.error?.message
                    || `Batch job failed with state ${state}`;
                throw new Error(errorMessage);
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                if (isRateLimitError(error)) {
                    const backoffMs = Math.max(ICON_ASYNC_BATCH_POLL_INTERVAL_MS, computeRateLimitBackoffMs(pollAttempt));
                    logger.warn(`Batch polling rate-limited; retrying in ${backoffMs}ms...`);
                    await sleep(backoffMs);
                    pollAttempt += 1;
                    continue;
                }

                throw error;
            }
        }
    }

    private async deleteBatchJobIfPossible(jobName?: string) {
        if (!jobName) return;
        try {
            const client = getClient(this.apiKey);
            await client.batches.delete({ name: jobName });
        } catch (error) {
            logger.debug(`Batch cleanup skipped for ${jobName}`, error);
        }
    }

    private async extractAsyncBatchChunkIcons(
        categories: string[],
        styleDescription: string,
        onProgress?: (message: string) => void
    ): Promise<Record<string, string | null>> {
        const chunkResult = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
        let batchJobName = '';

        try {
            const createdBatch = await this.createAsyncIconBatchJob(categories, styleDescription);
            batchJobName = createdBatch.name || '';
            if (!batchJobName) {
                throw new Error('Async batch created without a job name.');
            }

            onProgress?.(`Submitted async batch ${batchJobName} (${categories.length} icons)...`);
            const completedBatch = await this.waitForAsyncBatchJobCompletion(batchJobName, onProgress);
            const inlinedResponses = extractBatchInlinedResponses(completedBatch);

            if (!Array.isArray(inlinedResponses) || inlinedResponses.length === 0) {
                logger.warn(`Async batch ${batchJobName} completed without inline responses`);
                return chunkResult;
            }

            for (let index = 0; index < categories.length; index += 1) {
                const category = categories[index];
                const responseItem = inlinedResponses[index];
                if (!responseItem || responseItem.error) {
                    chunkResult[category] = null;
                    continue;
                }

                const imageUrl = extractInlineImageDataUrl(responseItem.response);
                if (!imageUrl) {
                    chunkResult[category] = null;
                    continue;
                }

                chunkResult[category] = await removeBackground(imageUrl);
            }

            return chunkResult;
        } finally {
            await this.deleteBatchJobIfPossible(batchJobName);
        }
    }

    private async generateIconsWithAsyncBatch(
        categories: string[],
        styleDescription: string,
        onProgress?: (message: string) => void
    ): Promise<{ iconUrls: Record<string, string | null>; failedCategories: string[] }> {
        const iconUrls = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
        const chunks = chunkArray(categories, ICON_ASYNC_BATCH_MAX_ICONS_PER_JOB);

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            if (chunk.length === 0) continue;

            if (this.isImageRateLimited()) {
                const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
                onProgress?.(`Image model cooldown active (${remainingSeconds}s). Skipping async icon chunk.`);
                chunk.forEach((category) => { iconUrls[category] = null; });
                continue;
            }

            onProgress?.(`Running async batch chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} icons)...`);
            try {
                const chunkIcons = await this.extractAsyncBatchChunkIcons(chunk, styleDescription, onProgress);
                chunk.forEach((category) => {
                    iconUrls[category] = chunkIcons[category] || null;
                });
                const usableCount = chunk.filter((category) => Boolean(iconUrls[category])).length;
                onProgress?.(`Async batch chunk ${chunkIndex + 1} usable icons: ${usableCount}/${chunk.length}`);
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                if (isRateLimitError(error)) {
                    this.activateImageRateLimitCooldown();
                    const warning = `Async batch chunk ${chunkIndex + 1} hit rate limits. Remaining chunk icons left empty.`;
                    logger.warn(warning, error);
                    onProgress?.(warning);
                } else {
                    logger.warn(`Async batch chunk ${chunkIndex + 1} failed`, error);
                }

                chunk.forEach((category) => {
                    iconUrls[category] = null;
                });
            }
        }

        const failedCategories = categories.filter((category) => !iconUrls[category]);
        return { iconUrls, failedCategories };
    }

    private async generateIconsWithAsyncBatchRetry(
        categories: string[],
        styleDescription: string,
        onProgress?: (message: string) => void
    ): Promise<{ iconUrls: Record<string, string | null>; failedCategories: string[] }> {
        const firstPass = await this.generateIconsWithAsyncBatch(categories, styleDescription, onProgress);
        if (firstPass.failedCategories.length === 0) {
            return firstPass;
        }

        const retryTargets = firstPass.failedCategories.slice(0, ICON_ASYNC_BATCH_MAX_RETRY_ICONS);
        if (retryTargets.length === 0) {
            return firstPass;
        }

        if (firstPass.failedCategories.length > retryTargets.length) {
            onProgress?.(`Retry budget cap reached (${ICON_ASYNC_BATCH_MAX_RETRY_ICONS}); some failed icons remain empty.`);
        }

        onProgress?.(`Retrying ${retryTargets.length} failed icons via async batch...`);
        const retryPass = await this.generateIconsWithAsyncBatch(retryTargets, styleDescription, onProgress);
        const merged = { ...firstPass.iconUrls };

        retryTargets.forEach((category) => {
            if (retryPass.iconUrls[category]) {
                merged[category] = retryPass.iconUrls[category];
            }
        });

        const failedCategories = categories.filter((category) => !merged[category]);
        return { iconUrls: merged, failedCategories };
    }

    private buildAtlasChunkRequests(
        categories: string[],
        styleDescription: string,
        size: ImageSize = '1K'
    ): Array<{ categories: string[]; entries: IconAtlasResult['entries']; prompt: string }> {
        const requests: Array<{ categories: string[]; entries: IconAtlasResult['entries']; prompt: string }> = [];
        const chunks = chunkArray(categories, ICON_ATLAS_CHUNK_SIZE);

        for (const chunk of chunks) {
            const normalizedChunk = [...new Set(chunk.map((category) => category.trim()).filter(Boolean))];
            if (normalizedChunk.length === 0) continue;

            const layout = buildIconAtlasLayout(normalizedChunk, {
                size,
                fixedColumns: ICON_ATLAS_GRID_DIM,
                fixedRows: ICON_ATLAS_GRID_DIM
            });

            requests.push({
                categories: layout.orderedCategories,
                entries: layout.entries,
                prompt: buildAtlasPrompt(layout.orderedCategories, styleDescription, size, {
                    fixedColumns: ICON_ATLAS_GRID_DIM,
                    fixedRows: ICON_ATLAS_GRID_DIM
                })
            });
        }

        return requests;
    }

    private async generateIconsWithAtlasPassDirect(
        categories: string[],
        styleDescription: string,
        onProgress: ((message: string) => void) | undefined,
        passLabel: string
    ): Promise<{ iconUrls: Record<string, string | null>; failedCategories: string[] }> {
        const iconUrls = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
        const chunks = chunkArray(categories, ICON_ATLAS_CHUNK_SIZE);
        const failedCategoriesSet = new Set<string>();

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            if (chunk.length === 0) continue;

            if (this.isImageRateLimited()) {
                const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
                onProgress?.(`Image model cooldown active (${remainingSeconds}s). Skipping ${passLabel} atlas chunk ${chunkIndex + 1}.`);
                chunk.forEach((category) => failedCategoriesSet.add(category));
                continue;
            }

            onProgress?.(`Generating ${passLabel} 4x4 atlas chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} icons)...`);

            try {
                const atlas = await this.generateIconAtlas(chunk, styleDescription, '1K', {
                    fixedColumns: ICON_ATLAS_GRID_DIM,
                    fixedRows: ICON_ATLAS_GRID_DIM
                });
                const sliced = await sliceAtlasIntoIconsWithValidation(atlas.atlasImageUrl, atlas.entries);

                let usable = 0;
                let failed = 0;

                chunk.forEach((category) => {
                    const cell = sliced[category];
                    const imageUrl = cell?.imageUrl || null;
                    if (imageUrl) {
                        iconUrls[category] = imageUrl;
                        usable += 1;
                        return;
                    }

                    failed += 1;
                    failedCategoriesSet.add(category);
                    iconUrls[category] = null;
                    if (cell?.validation?.reason && cell.validation.reason !== 'ok') {
                        logger.debug(`Atlas cell rejected for "${category}"`, cell.validation);
                    }
                });

                onProgress?.(`${passLabel} atlas chunk ${chunkIndex + 1} usable icons: ${usable}/${chunk.length}; failed: ${failed}`);
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                if (isRateLimitError(error)) {
                    this.activateImageRateLimitCooldown();
                    onProgress?.(`${passLabel} atlas chunk ${chunkIndex + 1} hit rate limits. Chunk deferred.`);
                } else {
                    logger.warn(`${passLabel} atlas chunk ${chunkIndex + 1} failed`, error);
                }
                chunk.forEach((category) => {
                    iconUrls[category] = null;
                    failedCategoriesSet.add(category);
                });
            }
        }

        const failedCategories = categories.filter((category) => failedCategoriesSet.has(category) || !iconUrls[category]);
        return { iconUrls, failedCategories };
    }

    private async generateIconsWithAtlasPassViaAsyncBatch(
        categories: string[],
        styleDescription: string,
        onProgress: ((message: string) => void) | undefined,
        passLabel: string
    ): Promise<{ iconUrls: Record<string, string | null>; failedCategories: string[] }> {
        const iconUrls = Object.fromEntries(categories.map((category) => [category, null])) as Record<string, string | null>;
        const failedCategoriesSet = new Set<string>();
        const atlasChunkRequests = this.buildAtlasChunkRequests(categories, styleDescription, '1K');
        const groupedRequests = chunkArray(atlasChunkRequests, ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB);

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

            let batchJobName = '';
            try {
                const createdBatch = await this.createAsyncBatchJob(
                    requestGroup.map((request, requestIndex) => ({
                        contents: request.prompt,
                        metadata: {
                            mode: 'atlas',
                            pass: passLabel,
                            chunk: `${groupIndex * ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB + requestIndex + 1}`
                        }
                    })),
                    'mapalchemist-atlas'
                );

                batchJobName = createdBatch.name || '';
                if (!batchJobName) {
                    throw new Error('Async atlas batch created without a job name.');
                }

                onProgress?.(`Submitted ${passLabel} async atlas batch ${batchJobName} (${requestGroup.length} chunks)...`);
                const completedBatch = await this.waitForAsyncBatchJobCompletion(batchJobName, onProgress);
                const inlinedResponses = extractBatchInlinedResponses(completedBatch);

                if (!Array.isArray(inlinedResponses) || inlinedResponses.length === 0) {
                    logger.warn(`Async atlas batch ${batchJobName} completed without inline responses`);
                    requestGroup.forEach((request) => markChunkFailed(request.categories));
                    continue;
                }

                for (let requestIndex = 0; requestIndex < requestGroup.length; requestIndex += 1) {
                    const atlasRequest = requestGroup[requestIndex];
                    const chunkNumber = groupIndex * ICON_ATLAS_ASYNC_BATCH_MAX_CHUNKS_PER_JOB + requestIndex + 1;
                    const responseItem = inlinedResponses[requestIndex];
                    if (!responseItem || responseItem.error) {
                        markChunkFailed(atlasRequest.categories);
                        onProgress?.(`${passLabel} atlas chunk ${chunkNumber} failed in batch response.`);
                        continue;
                    }

                    const atlasImageUrl = extractInlineImageDataUrl(responseItem.response);
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
                            logger.debug(`Atlas cell rejected for "${category}"`, cell.validation);
                        }
                    });

                    onProgress?.(`${passLabel} atlas chunk ${chunkNumber} usable icons: ${usable}/${atlasRequest.categories.length}; failed: ${failed}`);
                }
            } catch (error) {
                const userFacingError = toUserFacingGeminiError(error);
                if (userFacingError) {
                    throw userFacingError;
                }

                if (isRateLimitError(error)) {
                    this.activateImageRateLimitCooldown();
                    onProgress?.(`${passLabel} async atlas batch ${groupIndex + 1} hit rate limits. Chunks deferred.`);
                } else {
                    logger.warn(`${passLabel} async atlas batch ${groupIndex + 1} failed`, error);
                }

                requestGroup.forEach((request) => markChunkFailed(request.categories));
            } finally {
                await this.deleteBatchJobIfPossible(batchJobName);
            }
        }

        const failedCategories = categories.filter((category) => failedCategoriesSet.has(category) || !iconUrls[category]);
        return { iconUrls, failedCategories };
    }

    private async generateIconsWithAtlasRepair(
        categories: string[],
        styleDescription: string,
        onProgress: ((message: string) => void) | undefined,
        options: { retryFailedViaAtlas: boolean; useAsyncBatchTransport: boolean }
    ): Promise<{ iconUrls: Record<string, string | null>; failedCategories: string[] }> {
        const atlasPassGenerator = options.useAsyncBatchTransport
            ? this.generateIconsWithAtlasPassViaAsyncBatch.bind(this)
            : this.generateIconsWithAtlasPassDirect.bind(this);
        const firstPass = await atlasPassGenerator(categories, styleDescription, onProgress, 'Primary');

        if (!options.retryFailedViaAtlas || firstPass.failedCategories.length === 0 || ICON_ATLAS_RETRY_PASSES <= 0) {
            return firstPass;
        }

        let merged = { ...firstPass.iconUrls };
        let retryTargets = firstPass.failedCategories;

        for (let passIndex = 0; passIndex < ICON_ATLAS_RETRY_PASSES; passIndex += 1) {
            if (retryTargets.length === 0) {
                break;
            }

            onProgress?.(`Retrying ${retryTargets.length} failed icons with 4x4 atlas repair pass ${passIndex + 1}/${ICON_ATLAS_RETRY_PASSES}...`);
            const retryPass = await atlasPassGenerator(
                retryTargets,
                styleDescription,
                onProgress,
                `Repair ${passIndex + 1}`
            );

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
        const prompt = buildAtlasPrompt(normalizedCategories, styleDescription, size, options);

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
        const prompt = buildSingleIconPrompt(category, styleDescription);

        try {
            const response = await this.generateImageContentWithRetries(prompt);

            const rawBase64 = extractInlineImageDataUrl(response);
            if (rawBase64) {
                const processedImage = await removeBackground(rawBase64);
                return processedImage;
            }
            throw new Error("No image data returned.");
        } catch (error) {
            const userFacingError = toUserFacingGeminiError(error);
            if (userFacingError) {
                logger.error(`Icon Generation Error (${category}):`, error);
                throw userFacingError;
            }

            if (isRateLimitError(error)) {
                logger.warn(`Icon Generation Rate Limited (${category})`, error);
                throw new Error(IMAGE_RATE_LIMIT_USER_MESSAGE);
            }

            logger.error(`Icon Generation Error (${category}):`, error);
            return TRANSPARENT_PLACEHOLDER_ICON;
        }
    }

    async generateMapTheme(prompt: string, categories: string[], onProgress?: (message: string) => void): Promise<MapStylePreset> {
        onProgress?.("Designing visual language & palette...");
        const visualsPromise = generateMapVisuals(prompt, this.apiKey, this.textModel);
        const visuals = await visualsPromise;

        const iconTheme = visuals.iconTheme;
        onProgress?.(`Art Direction: ${iconTheme.substring(0, 50)}...`);
        const useBatchAsyncOnly = this.iconGenerationMode === 'batch-async';
        const useAtlasOnly = this.iconGenerationMode === 'atlas';
        const usePerIconOnly = this.iconGenerationMode === 'per-icon';
        const useAutoMode = this.iconGenerationMode === 'auto';
        let generationCategories = getCanonicalPoiCategories(categories);
        let rateLimitSkipNoticeShown = false;

        const reportRateLimitSkip = () => {
            if (rateLimitSkipNoticeShown) return;
            rateLimitSkipNoticeShown = true;
            const remainingSeconds = Math.ceil(this.getImageRateLimitRemainingMs() / 1000);
            const warning = remainingSeconds > 0
                ? `Image model rate-limited. Skipping remaining icon requests for ~${remainingSeconds}s to avoid quota burn.`
                : 'Image model rate-limited. Skipping remaining icon requests to avoid quota burn.';
            logger.warn(warning);
            onProgress?.(warning);
        };

        if (usePerIconOnly) {
            const budgeted = applyPerIconBudget(generationCategories);
            generationCategories = budgeted.categories;
            if (budgeted.wasCapped) {
                const warning = `Per-icon mode capped at ${ICON_PER_ICON_MAX_CALLS} requests to control API spend. Switch to Batch API or Auto for broader coverage.`;
                logger.warn(warning);
                onProgress?.(warning);
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

        const totalCount = generationCategories.length;
        const imageUrlsByCategory = Object.fromEntries(
            generationCategories.map((category) => [category, null])
        ) as Record<string, string | null>;

        if (useBatchAsyncOnly) {
            const batchResult = await this.generateIconsWithAsyncBatchRetry(generationCategories, iconTheme, onProgress);
            Object.entries(batchResult.iconUrls).forEach(([category, imageUrl]) => {
                imageUrlsByCategory[category] = imageUrl || null;
            });
        } else if (useAutoMode || useAtlasOnly) {
            const atlasResult = await this.generateIconsWithAtlasRepair(
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
                onProgress?.(
                    `Atlas-only mode kept ${atlasResult.failedCategories.length} failed cells empty (repair disabled).`
                );
            }
        } else {
            for (const category of generationCategories) {
                try {
                    if (this.isImageRateLimited()) {
                        reportRateLimitSkip();
                        imageUrlsByCategory[category] = null;
                        continue;
                    }

                    const imageUrl = await this.generateIconImage(category, iconTheme, '1K');
                    imageUrlsByCategory[category] = imageUrl && imageUrl !== TRANSPARENT_PLACEHOLDER_ICON
                        ? imageUrl
                        : null;
                } catch (error) {
                    imageUrlsByCategory[category] = null;
                    if (isRateLimitError(error)) {
                        reportRateLimitSkip();
                    }
                }
            }
        }

        let completedCount = 0;
        let usableIconCount = 0;
        const icons: IconDefinition[] = generationCategories.map((category) => {
            completedCount += 1;
            const imageUrl = imageUrlsByCategory[category] || null;
            if (imageUrl) {
                usableIconCount += 1;
            }
            onProgress?.(`Created icon for ${category} (${completedCount}/${totalCount})`);
            return {
                category,
                prompt: iconTheme,
                imageUrl,
                isLoading: false
            } as IconDefinition;
        });

        onProgress?.(`Usable icons: ${usableIconCount}/${totalCount}`);
        if (usableIconCount === 0) {
            const warning = useAtlasOnly
                ? 'Atlas produced no usable icons. Switch Icon Generation mode to "Batch API (Async, Cheap)" and regenerate.'
                : 'No usable icons were generated. Try regenerating or changing icon generation mode.';
            logger.warn(warning);
            onProgress?.(warning);
        }

        onProgress?.("Finalizing theme...");

        const iconsByCategory: Record<string, IconDefinition> = {};
        icons.forEach(icon => {
            iconsByCategory[icon.category] = icon;
        });

        return {
            id: uuidv4(),
            name: prompt.split(' ').slice(0, 4).join(' ') + '...',
            prompt,
            iconTheme,
            createdAt: new Date().toISOString(),
            mapStyleJson: visuals.mapStyle,
            palette: visuals.palette,
            popupStyle: visuals.popupStyle,
            iconsByCategory
        };
    }
}
