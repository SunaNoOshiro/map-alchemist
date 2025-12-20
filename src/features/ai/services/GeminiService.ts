import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { IAiService } from "@core/services/ai/IAiService";
import { ImageSize, IconDefinition, MapStylePreset, PopupStyle } from "@/types";
import { createLogger } from "@core/logger";

const logger = createLogger('GeminiService');

// Helper functions (kept local to the module)
const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found in environment.");
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
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Image);
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
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            logger.error("Image processing failed", e);
            resolve(base64Image);
        };
        img.src = base64Image;
    });
};

const generateMapVisuals = async (prompt: string): Promise<{ mapStyle: any, popupStyle: PopupStyle, iconTheme: string }> => {
    const client = getClient();

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
            model: 'gemini-2.5-flash',
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
        logger.error("Style Generation Error:", error);
        return {
            mapStyle: {},
            popupStyle: { backgroundColor: '#fff', textColor: '#000', borderColor: '#ccc', borderRadius: '4px', fontFamily: 'Arial' },
            iconTheme: `Simple icons for ${prompt}`
        };
    }
};

export class GeminiService implements IAiService {
    async generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string> {
        const client = getClient();

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
                model: 'gemini-2.5-flash-image',
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
            logger.error(`Icon Generation Error (${category}):`, error);
            return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        }
    }

    async generateMapTheme(prompt: string, categories: string[], onProgress?: (message: string) => void): Promise<MapStylePreset> {
        onProgress?.("Designing visual language & palette...");
        const visualsPromise = generateMapVisuals(prompt);
        const visuals = await visualsPromise;

        const iconTheme = visuals.iconTheme;
        onProgress?.(`Art Direction: ${iconTheme.substring(0, 50)}...`);

        onProgress?.(`Generating ${categories.length} icons in parallel...`);

        let completedCount = 0;
        const totalCount = categories.length;

        const batchSize = 6;
        const icons: IconDefinition[] = [];

        for (let i = 0; i < categories.length; i += batchSize) {
            const batch = categories.slice(i, i + batchSize);

            const batchPromises = batch.map(async (cat) => {
                try {
                    const imageUrl = await this.generateIconImage(cat, iconTheme, '1K');
                    return {
                        category: cat,
                        prompt: iconTheme,
                        imageUrl,
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
