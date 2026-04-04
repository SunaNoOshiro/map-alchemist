import { PopupStyle } from '@/types';

export interface ThemeColorTokens {
  background: string;
  land: string;
  park: string;
  industrial: string;
  residential: string;
  building: string;
  water: string;
  waterLine: string;
  motorway: string;
  primaryRoad: string;
  secondaryRoad: string;
  localRoad: string;
  roadCasing: string;
  boundary: string;
  admin: string;
  poiAccent: string;
  poiText: string;
  poiHalo: string;
  textPrimary: string;
  textSecondary: string;
  haloPrimary: string;
  haloSecondary: string;
}

export interface ThemeLayerOverrideEntry {
  paint?: Record<string, string>;
  layout?: Record<string, string>;
}

export type ThemeLayerOverrides = Record<string, ThemeLayerOverrideEntry>;

export interface ThemeSpec {
  tokens: ThemeColorTokens;
  layerOverrides?: ThemeLayerOverrides;
}

export const DEFAULT_THEME_TOKENS: ThemeColorTokens = {
  background: '#0b1220',
  land: '#1c2435',
  park: '#1f5a3a',
  industrial: '#4a2a2a',
  residential: '#2a334a',
  building: '#2f3b52',
  water: '#0a84ff',
  waterLine: '#4fb6ff',
  motorway: '#ff375f',
  primaryRoad: '#ff6b3d',
  secondaryRoad: '#f59e0b',
  localRoad: '#8ba3c7',
  roadCasing: '#1e293b',
  boundary: '#6b7a99',
  admin: '#95a2c6',
  poiAccent: '#60a5fa',
  poiText: '#f8fbff',
  poiHalo: '#11182b',
  textPrimary: '#f8fbff',
  textSecondary: '#c7d2fe',
  haloPrimary: '#11182b',
  haloSecondary: '#1e293b',
};

export const DEFAULT_THEME_POPUP_STYLE: PopupStyle = {
  backgroundColor: '#ffffff',
  textColor: '#111827',
  borderColor: '#d1d5db',
  borderRadius: '8px',
  fontFamily: 'Noto Sans',
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

const sanitizeColorMap = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .flatMap(([key, color]) => {
      if (key.trim().length === 0 || typeof color !== 'string') return [];
      const trimmedColor = color.trim();
      if (!trimmedColor) return [];
      return [[key, trimmedColor] as const];
    });
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const normalizeLayerOverrides = (value: unknown): ThemeLayerOverrides | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const normalized: ThemeLayerOverrides = {};

  Object.entries(value as Record<string, unknown>).forEach(([layerId, entry]) => {
    if (!layerId.trim() || !entry || typeof entry !== 'object') return;
    const paint = sanitizeColorMap((entry as ThemeLayerOverrideEntry).paint);
    const layout = sanitizeColorMap((entry as ThemeLayerOverrideEntry).layout);
    if (!paint && !layout) return;
    normalized[layerId] = {
      ...(paint ? { paint } : {}),
      ...(layout ? { layout } : {}),
    };
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const toTokenSource = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const tokens = source.tokens;
  if (tokens && typeof tokens === 'object') {
    return tokens as Record<string, unknown>;
  }
  return source;
};

export const convertLegacyMapColorsToTokens = (mapColors: Record<string, unknown> | null | undefined): Partial<ThemeColorTokens> => {
  if (!mapColors) return {};
  return {
    water: typeof mapColors.water === 'string' ? mapColors.water : undefined,
    waterLine: typeof mapColors.water === 'string' ? mapColors.water : undefined,
    land: typeof mapColors.land === 'string' ? mapColors.land : undefined,
    park: typeof mapColors.park === 'string' ? mapColors.park : undefined,
    building: typeof mapColors.building === 'string' ? mapColors.building : undefined,
    motorway: typeof mapColors.road === 'string' ? mapColors.road : undefined,
    primaryRoad: typeof mapColors.road === 'string' ? mapColors.road : undefined,
    secondaryRoad: typeof mapColors.road === 'string' ? mapColors.road : undefined,
    localRoad: typeof mapColors.road === 'string' ? mapColors.road : undefined,
    roadCasing: typeof mapColors.road === 'string' ? mapColors.road : undefined,
    textPrimary: typeof mapColors.text === 'string' ? mapColors.text : undefined,
    textSecondary: typeof mapColors.text === 'string' ? mapColors.text : undefined,
    poiText: typeof mapColors.text === 'string' ? mapColors.text : undefined,
  };
};

export const normalizeThemeSpec = (raw?: unknown): ThemeSpec => {
  const tokenSource = toTokenSource(raw);
  const tokens: ThemeColorTokens = {
    background: normalizeHexColor(tokenSource.background, DEFAULT_THEME_TOKENS.background),
    land: normalizeHexColor(tokenSource.land, DEFAULT_THEME_TOKENS.land),
    park: normalizeHexColor(tokenSource.park, DEFAULT_THEME_TOKENS.park),
    industrial: normalizeHexColor(tokenSource.industrial, DEFAULT_THEME_TOKENS.industrial),
    residential: normalizeHexColor(tokenSource.residential, DEFAULT_THEME_TOKENS.residential),
    building: normalizeHexColor(tokenSource.building, DEFAULT_THEME_TOKENS.building),
    water: normalizeHexColor(tokenSource.water, DEFAULT_THEME_TOKENS.water),
    waterLine: normalizeHexColor(tokenSource.waterLine, DEFAULT_THEME_TOKENS.waterLine),
    motorway: normalizeHexColor(tokenSource.motorway, DEFAULT_THEME_TOKENS.motorway),
    primaryRoad: normalizeHexColor(tokenSource.primaryRoad, DEFAULT_THEME_TOKENS.primaryRoad),
    secondaryRoad: normalizeHexColor(tokenSource.secondaryRoad, DEFAULT_THEME_TOKENS.secondaryRoad),
    localRoad: normalizeHexColor(tokenSource.localRoad, DEFAULT_THEME_TOKENS.localRoad),
    roadCasing: normalizeHexColor(tokenSource.roadCasing, DEFAULT_THEME_TOKENS.roadCasing),
    boundary: normalizeHexColor(tokenSource.boundary, DEFAULT_THEME_TOKENS.boundary),
    admin: normalizeHexColor(tokenSource.admin, DEFAULT_THEME_TOKENS.admin),
    poiAccent: normalizeHexColor(tokenSource.poiAccent, DEFAULT_THEME_TOKENS.poiAccent),
    poiText: normalizeHexColor(tokenSource.poiText, DEFAULT_THEME_TOKENS.poiText),
    poiHalo: normalizeHexColor(tokenSource.poiHalo, DEFAULT_THEME_TOKENS.poiHalo),
    textPrimary: normalizeHexColor(tokenSource.textPrimary, DEFAULT_THEME_TOKENS.textPrimary),
    textSecondary: normalizeHexColor(tokenSource.textSecondary, DEFAULT_THEME_TOKENS.textSecondary),
    haloPrimary: normalizeHexColor(tokenSource.haloPrimary, DEFAULT_THEME_TOKENS.haloPrimary),
    haloSecondary: normalizeHexColor(tokenSource.haloSecondary, DEFAULT_THEME_TOKENS.haloSecondary),
  };

  const source = (raw && typeof raw === 'object' ? raw as Record<string, unknown> : {});
  const layerOverrides = normalizeLayerOverrides(source.layerOverrides);

  return {
    tokens,
    ...(layerOverrides ? { layerOverrides } : {}),
  };
};

export const normalizeThemePopupStyle = (raw?: Partial<PopupStyle> | null): PopupStyle => {
  return {
    backgroundColor: normalizeHexColor(raw?.backgroundColor, DEFAULT_THEME_POPUP_STYLE.backgroundColor),
    textColor: normalizeHexColor(raw?.textColor, DEFAULT_THEME_POPUP_STYLE.textColor),
    borderColor: normalizeHexColor(raw?.borderColor, DEFAULT_THEME_POPUP_STYLE.borderColor),
    borderRadius: typeof raw?.borderRadius === 'string' && raw.borderRadius.trim()
      ? raw.borderRadius.trim()
      : DEFAULT_THEME_POPUP_STYLE.borderRadius,
    fontFamily: typeof raw?.fontFamily === 'string' && raw.fontFamily.trim()
      ? raw.fontFamily.trim()
      : DEFAULT_THEME_POPUP_STYLE.fontFamily,
  };
};

export const toLegacyPalette = (tokens: ThemeColorTokens): Record<string, string> => ({
  water: tokens.water,
  land: tokens.land,
  building: tokens.building,
  road: tokens.primaryRoad,
  park: tokens.park,
  text: tokens.textPrimary,
});
