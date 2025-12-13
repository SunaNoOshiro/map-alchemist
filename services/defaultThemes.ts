import { MapStylePreset } from '../types';

const DEFAULT_THEMES_URL = '/default-themes.json';
const DEFAULT_THEMES_GZ_URL = '/default-themes.json.gz';

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
    const decompressed = response.body.pipeThrough(new DecompressionStreamCtor('gzip'));
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
    const colorStyler = match?.stylers?.find((s: any) => s.color);
    if (colorStyler?.color) return colorStyler.color;
  }
  return undefined;
};

export const normalizeMapStyle = (mapStyleJson: any): any => {
  if (Array.isArray(mapStyleJson)) {
    const land = extractColor(mapStyleJson, 'landscape', ['geometry', 'geometry.fill']);
    const water = extractColor(mapStyleJson, 'water', ['geometry', 'geometry.fill']);
    const road = extractColor(mapStyleJson, 'road', ['geometry', 'geometry.stroke']);
    const building = extractColor(mapStyleJson, 'poi', ['geometry.fill', 'geometry']);
    const text = extractColor(mapStyleJson, 'all', ['labels.text.fill']);

    return {
      ...(land ? { land } : {}),
      ...(water ? { water } : {}),
      ...(road ? { road } : {}),
      ...(building ? { building } : {}),
      ...(text ? { text } : {})
    };
  }
  return mapStyleJson;
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

    const normalized = raw.map((theme: MapStylePreset) => ({
      ...theme,
      mapStyleJson: normalizeMapStyle(theme.mapStyleJson),
      isBundledDefault: true
    }));

    return {
      themes: normalized,
      defaultIds: normalized.map((t) => t.id)
    };
  } catch (error) {
    console.error('Failed to load default themes', error);
    return { themes: [], defaultIds: [] };
  }
};
