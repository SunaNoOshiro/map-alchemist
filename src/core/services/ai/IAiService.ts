import { MapStylePreset, IconDefinition, PopupStyle, ImageSize } from '../../../types';

export interface IAiService {
    /**
     * Generates a complete map theme (colors, popup style, icon theme) from a prompt.
     */
    generateMapTheme(prompt: string, categories: string[], onProgress?: (message: string) => void): Promise<MapStylePreset>;

    /**
     * Generates a single icon image for a given category and theme description.
     */
    generateIconImage(category: string, styleDescription: string, size?: ImageSize): Promise<string>;
}
