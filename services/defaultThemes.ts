import { MapStylePreset } from '../types';

const DEFAULT_THEMES_URL = '/default-themes.json';

const extractColor = (
  styles: any[],
  featureType: string,
  elementType: string
): string | undefined => {
  const match = styles.find(
    (s) => s.featureType === featureType && s.elementType === elementType && Array.isArray(s.stylers)
  );
  const colorStyler = match?.stylers?.find((s: any) => s.color);
  return colorStyler?.color;
};

export const normalizeMapStyle = (mapStyleJson: any): any => {
  if (Array.isArray(mapStyleJson)) {
    const land = extractColor(mapStyleJson, 'landscape', 'geometry');
    const water = extractColor(mapStyleJson, 'water', 'geometry');
    const road = extractColor(mapStyleJson, 'road', 'geometry');
    const building = extractColor(mapStyleJson, 'poi', 'geometry.fill');

    return {
      ...(land ? { land } : {}),
      ...(water ? { water } : {}),
      ...(road ? { road } : {}),
      ...(building ? { building } : {})
    };
  }
  return mapStyleJson;
};

export const fetchDefaultThemes = async (): Promise<{ themes: MapStylePreset[]; defaultIds: string[] }> => {
  try {
    const res = await fetch(DEFAULT_THEMES_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch default themes: ${res.statusText}`);
    }

    const raw = await res.json();
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
