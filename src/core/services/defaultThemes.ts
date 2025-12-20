import { DEFAULT_STYLE_PRESET } from '@/constants';
import { MapStylePreset, PopupStyle } from '@/types';
import { createLogger } from '@/core/logger';

const logger = createLogger('DefaultThemesService');

const BASE_URL = import.meta.env.BASE_URL || '/';
const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const DEFAULT_THEMES_URL = `${normalizedBase}default-themes.json`;
const DEFAULT_THEMES_GZ_URL = `${normalizedBase}default-themes.json.gz`;

export const normalizePopupStyle = (raw?: Partial<PopupStyle> | null): PopupStyle => ({
  backgroundColor: raw?.backgroundColor || DEFAULT_STYLE_PRESET.popupStyle.backgroundColor,
  textColor: raw?.textColor || DEFAULT_STYLE_PRESET.popupStyle.textColor,
  borderColor: raw?.borderColor || DEFAULT_STYLE_PRESET.popupStyle.borderColor,
  borderRadius: raw?.borderRadius || DEFAULT_STYLE_PRESET.popupStyle.borderRadius,
  fontFamily: raw?.fontFamily || DEFAULT_STYLE_PRESET.popupStyle.fontFamily
});

const parseMaybeGzipJson = async (response: Response): Promise<any> => {
  // If the server already decoded it for us, just return JSON
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    return response.json();
  }

  // Otherwise, try to decompress the gzipped body in the browser
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream as
    | undefined
    | (new (format: string) => { readable: ReadableStream<Uint8Array> });

  if (DecompressionStreamCtor && response.body) {
    const decompressed = response.body.pipeThrough(new DecompressionStreamCtor('gzip') as any);
    const decompressedResponse = new Response(decompressed);
    return decompressedResponse.json();
  }

  // Last resort: attempt to decode the buffer directly (works if server
  // transparently ungzipped but mislabeled the content type)
  const buffer = await response.arrayBuffer();
  const asText = new TextDecoder().decode(buffer);
  return JSON.parse(asText);
};

const extractColor = (
  styles: any[],
  featureType: string,
  elementTypes: string[]
): string | undefined => {
  for (const elementType of elementTypes) {
    const match = styles.find(
      (s) => s.featureType === featureType && s.elementType === elementType && Array.isArray(s.stylers)
    );
    if (!match?.stylers) continue;
    const colorStyler = match.stylers.find((s: any) => s.color || s.hue);
    if (colorStyler?.color) return colorStyler.color;
    if (colorStyler?.hue) return colorStyler.hue;
  }
  return undefined;
};

export const derivePalette = (mapStyleJson: any): Record<string, string> => {
  if (mapStyleJson?.colors) return mapStyleJson.colors;
  if (!mapStyleJson) return {};

  if (Array.isArray(mapStyleJson)) {
    const land =
      extractColor(mapStyleJson, 'landscape', ['geometry', 'geometry.fill']) ||
      extractColor(mapStyleJson, 'landscape.natural', ['geometry', 'geometry.fill']);
    const water = extractColor(mapStyleJson, 'water', ['geometry', 'geometry.fill']);
    const road =
      extractColor(mapStyleJson, 'road', ['geometry.stroke', 'geometry.fill']) ||
      extractColor(mapStyleJson, 'road.highway', ['geometry.stroke', 'geometry.fill']);
    const building =
      extractColor(mapStyleJson, 'poi', ['geometry.fill', 'geometry']) ||
      extractColor(mapStyleJson, 'poi.business', ['geometry.fill', 'geometry']);
    const text =
      extractColor(mapStyleJson, 'all', ['labels.text.fill']) ||
      extractColor(mapStyleJson, 'poi', ['labels.text.fill']) ||
      extractColor(mapStyleJson, 'road', ['labels.text.fill']);

    return {
      ...(land ? { land } : {}),
      ...(water ? { water } : {}),
      ...(road ? { road } : {}),
      ...(building ? { building } : {}),
      ...(text ? { text } : {})
    };
  }

  if (typeof mapStyleJson === 'object') {
    return Object.fromEntries(
      Object.entries(mapStyleJson).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>;
  }

  return {};
};

export const fetchDefaultThemes = async (): Promise<{ themes: MapStylePreset[]; defaultIds: string[] }> => {
  try {
    const loadThemes = async (url: string, isCompressed = false) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch default themes: ${res.statusText}`);
      }
      return isCompressed ? parseMaybeGzipJson(res) : res.json();
    };

    let raw: any;
    try {
      raw = await loadThemes(DEFAULT_THEMES_URL);
    } catch (jsonError) {
      // If the plain JSON is missing, attempt to read the gzipped bundle
      raw = await loadThemes(DEFAULT_THEMES_GZ_URL, true);
    }

    if (!Array.isArray(raw)) return { themes: [], defaultIds: [] };

    const normalized = raw.map((theme: MapStylePreset) => {
      const palette = derivePalette(theme.mapStyleJson);
      const popupStyle = normalizePopupStyle(
        (theme as any).popupStyle || (theme as any).mapStyleJson?.popupStyle
      );
      return {
        ...theme,
        popupStyle,
        palette,
        isBundledDefault: true
      };
    });

    return {
      themes: normalized,
      defaultIds: normalized.map((t) => t.id)
    };
  } catch (error) {
    logger.error('Failed to load default themes', error);
    return { themes: [], defaultIds: [] };
  }
};
