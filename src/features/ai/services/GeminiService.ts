import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { IAiService, IconAtlasResult } from "@core/services/ai/IAiService";
import { ImageSize, IconDefinition, IconGenerationMode, MapStylePreset, PopupStyle } from "@/types";
import { createLogger } from "@core/logger";
import { buildIconAtlasLayout, sliceAtlasIntoIcons } from './iconAtlasUtils';
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
const ICON_ATLAS_MAX_ICONS_PER_BATCH = 64;
const ICON_ATLAS_MIN_BATCH_SIZE = 9;
const ICON_AUTO_FALLBACK_MAX = 24;
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
        const finish = (value: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(value);
        };

        const timeoutId = setTimeout(() => {
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
    size: ImageSize
) => {
    const layout = buildIconAtlasLayout(categories, { size });
    const categoryManifest = layout.orderedCategories
        .map((category, index) => {
            const row = Math.floor(index / layout.columns) + 1;
            const col = (index % layout.columns) + 1;
            return `${index + 1}. Row ${row}, Column ${col}: ${category}`;
        })
        .join('\n');

    return `Create ONE square icon sprite atlas image exactly ${layout.atlasSize}x${layout.atlasSize}px.

ART DIRECTION / THEME:
${styleDescription}

GRID REQUIREMENTS:
- Grid is ${layout.columns} columns x ${layout.rows} rows.
- Every cell should contain exactly one icon, centered.
- Keep icon visuals inside the cell bounds.
- No text labels, no numbers, no border lines, no guides, no shadows on background.
- Use SOLID BRIGHT GREEN background (#00FF00) in all non-icon pixels for chroma-key cleanup.
- Keep visual style and stroke weight consistent across all icons.

CATEGORY-TO-CELL MAP (STRICT):
${categoryManifest}

Return only the final atlas image.`;
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

    async generateIconAtlas(categories: string[], styleDescription: string, size: ImageSize = '1K'): Promise<IconAtlasResult> {
        const normalizedCategories = [...new Set(categories.map((category) => category.trim()).filter(Boolean))];

        if (normalizedCategories.length === 0) {
            return {
                atlasImageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
                entries: {}
            };
        }

        const layout = buildIconAtlasLayout(normalizedCategories, { size });
        const prompt = buildAtlasPrompt(normalizedCategories, styleDescription, size);

        const response = await this.generateImageContentWithRetries(prompt);

        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    const rawBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    return {
                        atlasImageUrl: rawBase64,
                        entries: layout.entries
                    };
                }
            }
        }

        throw new Error('No atlas image data returned.');
    }

    async generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string> {
        const prompt = `Create a single graphical SYMBOL representing: "${category}".
      
      ART DIRECTION / THEME: ${styleDescription}
      
      CRITICAL INSTRUCTIONS:
      1. **SUBJECT**: 
         - Draw an OBJECT, ITEM, or CHARACTER FACE that visually explains "${category}".
         - **THEME INTEGRATION**: The object MUST look like it belongs in the world of the theme.
      2. **VISUAL STYLE**:
         - **VIBRANT**: Use bold, saturated colors suitable for the theme.
         - **FLAT / VECTOR / STICKER**: Clean lines, no noise.
         - **ICONOGRAPHY**: Must be readable at 32px. Big shapes.
      3. **COMPOSITION**:
         - **FILL THE FRAME**: The subject must occupy 90% of the image canvas. **ZOOM IN.**
         - **CENTERED**: The object must be perfectly centered.
         - **BACKGROUND**: SOLID BRIGHT GREEN (Hex #00FF00) for chroma keying. NO gradients, NO shadows on background.
      4. **NO TEXT**.
        `;

        try {
            const response = await this.generateImageContentWithRetries(prompt);

            const parts = response.candidates?.[0]?.content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const rawBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        const processedImage = await removeBackground(rawBase64);
                        return processedImage;
                    }
                }
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
                const warning = `Per-icon mode capped at ${ICON_PER_ICON_MAX_CALLS} requests to control API spend. Switch to Atlas or Auto for broader coverage.`;
                logger.warn(warning);
                onProgress?.(warning);
            }
        }

        if (usePerIconOnly) {
            onProgress?.(`Generating ${generationCategories.length} icons one by one...`);
        } else if (useAtlasOnly) {
            onProgress?.(`Generating ${generationCategories.length} icons from atlas batches...`);
        } else {
            onProgress?.(`Generating ${generationCategories.length} icons with auto mode (atlas + fallback)...`);
        }

        let completedCount = 0;
        const totalCount = generationCategories.length;

        const batchSize = (useAtlasOnly || (useAutoMode && generationCategories.length >= ICON_ATLAS_MIN_BATCH_SIZE))
            ? Math.min(generationCategories.length, ICON_ATLAS_MAX_ICONS_PER_BATCH)
            : 6;
        const icons: IconDefinition[] = [];
        let fallbackCount = 0;
        let fallbackLimitReported = false;
        let usableIconCount = 0;

        for (let i = 0; i < generationCategories.length; i += batchSize) {
            const batch = generationCategories.slice(i, i + batchSize);
            const atlasBatchIndex = Math.floor(i / batchSize) + 1;
            let atlasIcons: Record<string, string | null> = {};
            const shouldTryAtlas = useAtlasOnly || (useAutoMode && batch.length >= ICON_ATLAS_MIN_BATCH_SIZE);

            if (shouldTryAtlas) {
                if (this.isImageRateLimited()) {
                    reportRateLimitSkip();
                } else {
                    try {
                        onProgress?.(`Generating icon atlas batch ${atlasBatchIndex} (${batch.length} icons)...`);
                        const atlas = await this.generateIconAtlas(batch, iconTheme, '1K');
                        atlasIcons = await sliceAtlasIntoIcons(atlas.atlasImageUrl, atlas.entries);
                    } catch (atlasError) {
                        if (isRateLimitError(atlasError)) {
                            reportRateLimitSkip();
                        } else {
                            logger.warn(`Atlas batch ${atlasBatchIndex} failed, falling back to per-icon generation`, atlasError);
                        }
                    }
                }
            }

            const batchResults: IconDefinition[] = [];
            for (const cat of batch) {
                try {
                    if (this.isImageRateLimited()) {
                        reportRateLimitSkip();
                        batchResults.push({
                            category: cat,
                            prompt: iconTheme,
                            imageUrl: null,
                            isLoading: false
                        } as IconDefinition);
                        continue;
                    }

                    const atlasIcon = atlasIcons[cat];
                    const shouldUsePerIconOnly = usePerIconOnly;
                    const shouldUseAtlasFallback = useAutoMode && shouldTryAtlas && !this.isImageRateLimited();
                    const canUseAutoFallback = shouldUseAtlasFallback && fallbackCount < ICON_AUTO_FALLBACK_MAX;

                    let imageUrl: string | null = atlasIcon || null;

                    if (!imageUrl && shouldUsePerIconOnly) {
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && canUseAutoFallback) {
                        fallbackCount += 1;
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && useAutoMode && !shouldTryAtlas && !this.isImageRateLimited()) {
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && shouldUseAtlasFallback && !fallbackLimitReported) {
                        fallbackLimitReported = true;
                        onProgress?.(`Auto fallback limit reached (${ICON_AUTO_FALLBACK_MAX}). Remaining icons kept empty.`);
                    }

                    batchResults.push({
                        category: cat,
                        prompt: iconTheme,
                        imageUrl: imageUrl || null,
                        isLoading: false
                    } as IconDefinition);
                } catch (e) {
                    batchResults.push({
                        category: cat,
                        prompt: iconTheme,
                        imageUrl: null,
                        isLoading: false
                    } as IconDefinition);
                    if (isRateLimitError(e)) {
                        reportRateLimitSkip();
                    }
                } finally {
                    completedCount++;
                    onProgress?.(`Created icon for ${cat} (${completedCount}/${totalCount})`);
                }
            }
            const batchUsableCount = batchResults.filter((icon) => Boolean(icon.imageUrl)).length;
            usableIconCount += batchUsableCount;
            if (shouldTryAtlas) {
                onProgress?.(`Atlas batch ${atlasBatchIndex} usable icons: ${batchUsableCount}/${batch.length}`);
            }
            icons.push(...batchResults);
        }

        onProgress?.(`Usable icons: ${usableIconCount}/${totalCount}`);
        if (usableIconCount === 0) {
            const warning = useAtlasOnly
                ? 'Atlas produced no usable icons. Switch Icon Generation mode to "Auto (Atlas + Fallback)" and regenerate.'
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
