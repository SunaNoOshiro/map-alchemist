import { MapStylePreset, ImageSize } from '../../../types';

export interface IconAtlasEntry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IconAtlasResult {
    atlasImageUrl: string;
    entries: Record<string, IconAtlasEntry>;
}

export interface IAiService {
    /**
     * Generates a complete map theme (colors, popup style, icon theme) from a prompt.
     */
    generateMapTheme(prompt: string, categories: string[], onProgress?: (message: string) => void): Promise<MapStylePreset>;

    /**
     * Generates a single icon image for a given category and theme description.
     */
    generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string>;

    /**
     * Optional batch generation: produces one atlas image with deterministic cell mapping.
     */
    generateIconAtlas?(categories: string[], styleDescription: string, size?: ImageSize): Promise<IconAtlasResult>;
}
