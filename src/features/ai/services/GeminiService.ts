import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { IAiService, IconAtlasResult } from "@core/services/ai/IAiService";
import { ImageSize, IconDefinition, IconGenerationMode, MapStylePreset, PopupStyle } from "@/types";
import { createLogger } from "@core/logger";
import { buildIconAtlasLayout, sliceAtlasIntoIcons } from './iconAtlasUtils';

const logger = createLogger('GeminiService');
const ICON_ATLAS_MAX_ICONS_PER_BATCH = 144;
const ICON_ATLAS_MIN_BATCH_SIZE = 9;
const ICON_AUTO_FALLBACK_MAX = 24;
const IMAGE_PROCESSING_TIMEOUT_MS = 5000;
const TRANSPARENT_PLACEHOLDER_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const INVALID_API_KEY_USER_MESSAGE = 'Invalid Gemini API key. Update API key in AI Configuration and try again.';

const parseJsonIfPossible = (value: string): any | null => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const getGeminiErrorEnvelope = (error: unknown): { message: string; status?: string; reasons: string[] } => {
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
    if (isInvalidApiKeyError(error)) {
        return new Error(INVALID_API_KEY_USER_MESSAGE);
    }
    return null;
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

const generateMapVisuals = async (prompt: string, apiKey: string, model: string): Promise<{ mapStyle: any, popupStyle: PopupStyle, iconTheme: string }> => {
    const client = getClient(apiKey);

    const systemInstruction = `You are a Mapbox Style Generator. Output JSON ONLY.
    Task: Create a visual theme definition based on: "${prompt}".
  
    You must output a JSON object with:
    1. "mapColors": A simple object defining hex codes for standard MapLibre layers.
       Keys MUST be: "water", "land", "building", "road", "park", "text".
    2. "popupStyle": Styling for info windows.
    3. "iconTheme": Art direction description.
  
    Response Format:
    {
      "mapColors": {
        "water": "#...",
        "land": "#...",
        "building": "#...",
        "road": "#...",
        "park": "#...",
        "text": "#..."
      },
      "popupStyle": { "backgroundColor": "#...", "textColor": "#...", "borderColor": "#...", "borderRadius": "...", "fontFamily": "..." },
      "iconTheme": "A string describing the icon style..."
    }`;

    try {
        const response = await client.models.generateContent({
            model: model,
            contents: `Generate map theme for: "${prompt}".`,
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

        return {
            mapStyle: result.mapColors || { water: '#a0c8f0', land: '#f0f0f0' },
            popupStyle: result.popupStyle || {
                backgroundColor: '#ffffff',
                textColor: '#000000',
                borderColor: '#cccccc',
                borderRadius: '8px',
                fontFamily: 'sans-serif'
            },
            iconTheme: result.iconTheme || `Minimalist flat icons matching ${prompt}`
        };

    } catch (error) {
        const userFacingError = toUserFacingGeminiError(error);
        if (userFacingError) {
            logger.error("Style Generation Error:", error);
            throw userFacingError;
        }

        logger.error("Style Generation Error:", error);
        return {
            mapStyle: {},
            popupStyle: { backgroundColor: '#fff', textColor: '#000', borderColor: '#ccc', borderRadius: '4px', fontFamily: 'Arial' },
            iconTheme: `Simple icons for ${prompt}`
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

export class GeminiService implements IAiService {
    private apiKey: string;
    private model: string;
    private iconGenerationMode: IconGenerationMode;

    constructor(apiKey: string, model: string, iconGenerationMode: IconGenerationMode = 'auto') {
        this.apiKey = apiKey;
        this.model = model;
        this.iconGenerationMode = iconGenerationMode;
    }

    async generateIconAtlas(categories: string[], styleDescription: string, size: ImageSize = '1K'): Promise<IconAtlasResult> {
        const normalizedCategories = [...new Set(categories.map((category) => category.trim()).filter(Boolean))];

        if (normalizedCategories.length === 0) {
            return {
                atlasImageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
                entries: {}
            };
        }

        const client = getClient(this.apiKey);
        const layout = buildIconAtlasLayout(normalizedCategories, { size });
        const prompt = buildAtlasPrompt(normalizedCategories, styleDescription, size);

        const response = await client.models.generateContent({
            model: this.model,
            contents: prompt
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    const rawBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    const processedImage = await removeBackground(rawBase64);
                    return {
                        atlasImageUrl: processedImage,
                        entries: layout.entries
                    };
                }
            }
        }

        throw new Error('No atlas image data returned.');
    }

    async generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string> {
        const client = getClient(this.apiKey);

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
            const response = await client.models.generateContent({
                model: this.model,
                contents: prompt,
            });

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

            logger.error(`Icon Generation Error (${category}):`, error);
            return TRANSPARENT_PLACEHOLDER_ICON;
        }
    }

    async generateMapTheme(prompt: string, categories: string[], onProgress?: (message: string) => void): Promise<MapStylePreset> {
        onProgress?.("Designing visual language & palette...");
        const visualsPromise = generateMapVisuals(prompt, this.apiKey, this.model);
        const visuals = await visualsPromise;

        const iconTheme = visuals.iconTheme;
        onProgress?.(`Art Direction: ${iconTheme.substring(0, 50)}...`);
        const useAtlasOnly = this.iconGenerationMode === 'atlas';
        const usePerIconOnly = this.iconGenerationMode === 'per-icon';
        const useAutoMode = this.iconGenerationMode === 'auto';

        if (usePerIconOnly) {
            onProgress?.(`Generating ${categories.length} icons one by one...`);
        } else if (useAtlasOnly) {
            onProgress?.(`Generating ${categories.length} icons from atlas batches...`);
        } else {
            onProgress?.(`Generating ${categories.length} icons with auto mode (atlas + fallback)...`);
        }

        let completedCount = 0;
        const totalCount = categories.length;

        const batchSize = (useAtlasOnly || (useAutoMode && categories.length >= ICON_ATLAS_MIN_BATCH_SIZE))
            ? Math.min(categories.length, ICON_ATLAS_MAX_ICONS_PER_BATCH)
            : 6;
        const icons: IconDefinition[] = [];
        let fallbackCount = 0;
        let fallbackLimitReported = false;

        for (let i = 0; i < categories.length; i += batchSize) {
            const batch = categories.slice(i, i + batchSize);
            const atlasBatchIndex = Math.floor(i / batchSize) + 1;
            let atlasIcons: Record<string, string | null> = {};
            const shouldTryAtlas = useAtlasOnly || (useAutoMode && batch.length >= ICON_ATLAS_MIN_BATCH_SIZE);

            if (shouldTryAtlas) {
                try {
                    onProgress?.(`Generating icon atlas batch ${atlasBatchIndex} (${batch.length} icons)...`);
                    const atlas = await this.generateIconAtlas(batch, iconTheme, '1K');
                    atlasIcons = await sliceAtlasIntoIcons(atlas.atlasImageUrl, atlas.entries);
                } catch (atlasError) {
                    logger.warn(`Atlas batch ${atlasBatchIndex} failed, falling back to per-icon generation`, atlasError);
                }
            }

            const batchPromises = batch.map(async (cat) => {
                try {
                    const atlasIcon = atlasIcons[cat];
                    const shouldUsePerIconOnly = usePerIconOnly;
                    const shouldUseAtlasFallback = useAutoMode && shouldTryAtlas;
                    const canUseAutoFallback = shouldUseAtlasFallback && fallbackCount < ICON_AUTO_FALLBACK_MAX;

                    let imageUrl: string | null = atlasIcon || null;

                    if (!imageUrl && shouldUsePerIconOnly) {
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && canUseAutoFallback) {
                        fallbackCount += 1;
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && useAutoMode && !shouldTryAtlas) {
                        imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    } else if (!imageUrl && shouldUseAtlasFallback && !fallbackLimitReported) {
                        fallbackLimitReported = true;
                        onProgress?.(`Auto fallback limit reached (${ICON_AUTO_FALLBACK_MAX}). Remaining icons kept empty.`);
                    }

                    return {
                        category: cat,
                        prompt: iconTheme,
                        imageUrl: imageUrl || null,
                        isLoading: false
                    } as IconDefinition;
                } catch (e) {
                    return {
                        category: cat,
                        prompt: iconTheme,
                        imageUrl: null,
                        isLoading: false
                    } as IconDefinition;
                } finally {
                    completedCount++;
                    onProgress?.(`Created icon for ${cat} (${completedCount}/${totalCount})`);
                }
            });

            const batchResults = await Promise.all(batchPromises);
            icons.push(...batchResults);
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
            popupStyle: visuals.popupStyle,
            iconsByCategory
        };
    }
}
