
import { GoogleGenAI, Type } from "@google/genai";
import { ImageSize, PlaceMarker, MapStylePreset, IconDefinition, PopupStyle } from "../types";
import { v4 as uuidv4 } from 'uuid';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found in environment.");
  return new GoogleGenAI({ apiKey });
};

const tryParseJSON = (jsonString: string) => {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn("JSON Parse failed, attempting repair...");
    try {
        let trimmed = jsonString.trim();
        if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
        const lastBrace = trimmed.lastIndexOf('}');
        const lastBracket = trimmed.lastIndexOf(']');
        if (lastBrace > lastBracket) {
             return JSON.parse(trimmed.substring(0, lastBrace + 1));
        } else if (lastBracket > -1) {
             return JSON.parse(trimmed.substring(0, lastBracket + 1) + "}");
        }
    } catch (repairError) {
        console.error("JSON Repair failed", repairError);
    }
    return { mapStyle: [], popupStyle: null };
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
            console.error("Image processing failed", e);
            resolve(base64Image); 
        };
        img.src = base64Image;
    });
};

export const generateMapVisuals = async (prompt: string): Promise<{ mapStyle: any[], popupStyle: PopupStyle, iconTheme: string }> => {
  const client = getClient();
  
  const systemInstruction = `You are a JSON-only API. Output MINIFIED JSON.
  Task: Create a Google Maps Style JSON based on: "${prompt}".

  CRITICAL RULES:
  1. **MAX 50 STYLE RULES**. Be concise. Use inheritance.
  2. **VALID FEATURE TYPES ONLY**:
     - YES: water, landscape, road, transit, administrative, poi.
     - **FORBIDDEN**: 'terrain', 'geometry.fill'.
     - NEVER use composite keys like 'road.highway.geometry'.
  3. **MANDATORY VISIBILITY**:
     - 'poi': OFF.
     - 'transit': OFF.
     - 'landscape': ON.
     - 'water': ON.
  4. **ROADS**: Style 'road' geometry to be distinct and visible.
  5. **POPUP STYLE**:
     - **Background**: Match map theme.
     - **Border**: ESSENTIAL. Contrast color. Width 2px.
     - **Text**: High contrast.
  6. **ICON THEME**: Write a specific art direction guide. 
     - **MATERIALITY**: Specify what the icons look made of (e.g. "Glowing Neon Glass", "Rough Parchment Ink", "Pixelated Green Code", "Carved Stone").
     - **STYLE**: "Vibrant Colors", "Thick Outlines", "Glowing".

  Response Format:
  {
    "mapStyle": [ ... ],
    "popupStyle": { "backgroundColor": "#...", "textColor": "#...", "borderColor": "#...", "borderRadius": "...", "fontFamily": "..." },
    "iconTheme": "A string describing the icon style..."
  }`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate theme for: "${prompt}".`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      }
    });
    
    let result;
    if (response.text) {
      try {
          result = JSON.parse(response.text);
      } catch (e) {
          result = tryParseJSON(response.text);
      }
    } else {
        throw new Error("No text returned from model");
    }
      
    const safetyStyles = [
      {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ visibility: "on" }]
      },
      {
          featureType: "landscape",
          elementType: "geometry",
          stylers: [{ visibility: "on" }]
      },
      {
          featureType: "poi",
          stylers: [{ visibility: "off" }]
      },
      {
          featureType: "transit",
          elementType: "labels.icon",
          stylers: [{ visibility: "off" }]
      }
    ];

    const cleanStyles = (result.mapStyle || []).filter((rule: any) => {
        if (!rule.featureType) return false;
        if (rule.featureType === 'terrain') return false; 
        if (rule.featureType.includes('.')) {
             const parts = rule.featureType.split('.');
             if (parts.length > 2) return false; 
        }
        return true;
    });

    return {
        mapStyle: [...cleanStyles, ...safetyStyles],
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
    console.error("Style Generation Error:", error);
    return {
        mapStyle: [],
        popupStyle: { backgroundColor: '#fff', textColor: '#000', borderColor: '#ccc', borderRadius: '4px', fontFamily: 'Arial' },
        iconTheme: `Simple icons for ${prompt}`
    };
  }
};

export const generateIconImage = async (
  category: string, 
  styleDescription: string, 
  size: ImageSize = '1K'
): Promise<string> => {
  const client = getClient();
  
  const prompt = `Create a single graphical SYMBOL representing: "${category}".
  
  ART DIRECTION / THEME: ${styleDescription}
  
  CRITICAL INSTRUCTIONS:
  1. **SUBJECT**: 
     - Draw an OBJECT, ITEM, or CHARACTER FACE that visually explains "${category}".
     - **THEME INTEGRATION**: The object MUST look like it belongs in the world of the theme.
       - If theme is "Matrix": The object should be made of falling green code or wireframe.
       - If theme is "Cyberpunk": The object should be neon, glowing, tech-infused.
       - If theme is "Paper": The object should look like an ink drawing or paper cutout.
     - **Franchise Specifics**: If theme is known (Simpsons, Star Wars), use specific items/faces.

  2. **VISUAL STYLE**:
     - **VIBRANT**: Use bold, saturated colors suitable for the theme.
     - **FLAT / VECTOR / STICKER**: Clean lines, no noise.
     - **ICONOGRAPHY**: Must be readable at 32px. Big shapes.

  3. **COMPOSITION**:
     - **FILL THE FRAME**: The subject must occupy 90% of the image canvas. **ZOOM IN.**
     - **CENTERED**: The object must be perfectly centered.
     - **BACKGROUND**: SOLID BRIGHT GREEN (Hex #00FF00) for chroma keying. NO gradients, NO shadows on background.

  4. **NEGATIVE CONSTRAINTS (STRICT)**:
     - **NO TEXT, NO WORDS, NO LETTERS.** Do not write the name of the category.
     - NO tiny details.
     - NO complex scenery.
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
    console.error(`Icon Generation Error (${category}):`, error);
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
};

export const generateMapTheme = async (
  prompt: string, 
  categories: string[],
  onProgress?: (message: string) => void
): Promise<MapStylePreset> => {
  
  onProgress?.("Designing visual language & palette...");
  const visualsPromise = generateMapVisuals(prompt);
  const visuals = await visualsPromise; 
  
  const iconTheme = visuals.iconTheme;
  onProgress?.(`Art Direction: ${iconTheme.substring(0, 50)}...`);

  onProgress?.(`Generating ${categories.length} icons in parallel...`);
  
  let completedCount = 0;
  const totalCount = categories.length;

  const batchSize = 8; 
  const icons: IconDefinition[] = [];
  
  for (let i = 0; i < categories.length; i += batchSize) {
      const batch = categories.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (cat) => {
        try {
            const imageUrl = await generateIconImage(cat, iconTheme, '1K');
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
};

export const findPlacesWithGrounding = async (center: { lat: number; lng: number }): Promise<PlaceMarker[]> => {
    return []; 
};
