import { ThemeColorTokens, ThemeLayerOverrideEntry, ThemeSpec, normalizeThemeSpec, toLegacyPalette } from '@features/ai/services/themeSpec';
import {
  buildStyleCatalog,
  classifyLayerRole,
  LayerSemanticRole,
  MapLibreLayer,
  MapLibreStyle,
  shouldApplyColorProperty,
  StyleCatalog,
  StyleColorTarget
} from './styleCatalog';

export type { MapLibreLayer, MapLibreStyle } from './styleCatalog';

type LayerTargetGroup = {
  role: LayerSemanticRole;
  paint: string[];
  layout: string[];
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const TOKEN_REFERENCE_PATTERN = /^token\(\s*["']?([^"')]+)["']?\s*\)$/i;

const TOKEN_ALIASES: Record<string, keyof ThemeColorTokens> = {
  background: 'background',
  land: 'land',
  park: 'park',
  industrial: 'industrial',
  residential: 'residential',
  building: 'building',
  water: 'water',
  waterline: 'waterLine',
  motorway: 'motorway',
  primaryroad: 'primaryRoad',
  primary: 'primaryRoad',
  secondaryroad: 'secondaryRoad',
  secondary: 'secondaryRoad',
  localroad: 'localRoad',
  local: 'localRoad',
  roadcasing: 'roadCasing',
  road: 'primaryRoad',
  boundary: 'boundary',
  admin: 'admin',
  poiaccent: 'poiAccent',
  poitext: 'poiText',
  poihalo: 'poiHalo',
  text: 'textPrimary',
  textprimary: 'textPrimary',
  textsecondary: 'textSecondary',
  haloprimary: 'haloPrimary',
  halosecondary: 'haloSecondary'
};

const cloneStyle = (style: MapLibreStyle): MapLibreStyle => {
  if (typeof structuredClone === 'function') {
    return structuredClone(style);
  }
  return JSON.parse(JSON.stringify(style));
};

const normalizeColorHex = (value: string): string | null => {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

const normalizeTokenAlias = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const resolveTokenAlias = (rawToken: string, tokens: ThemeColorTokens): string | null => {
  const normalizedToken = normalizeTokenAlias(rawToken);
  const tokenKey = TOKEN_ALIASES[normalizedToken];
  if (!tokenKey) return null;
  return tokens[tokenKey];
};

const parseTokenReference = (value: string): { tokenName: string; isTokenReference: boolean } => {
  const trimmed = value.trim();
  const tokenMatch = trimmed.match(TOKEN_REFERENCE_PATTERN);
  if (tokenMatch?.[1]) {
    return { tokenName: tokenMatch[1], isTokenReference: true };
  }
  return { tokenName: trimmed, isTokenReference: false };
};

const resolveColorReference = (
  value: string,
  tokens: ThemeColorTokens
): { color: string | null; isTokenReference: boolean } => {
  const normalizedHex = normalizeColorHex(value);
  if (normalizedHex) {
    return { color: normalizedHex, isTokenReference: false };
  }

  const { tokenName, isTokenReference } = parseTokenReference(value);
  const aliasMatch = resolveTokenAlias(tokenName, tokens);
  if (aliasMatch) {
    return { color: aliasMatch, isTokenReference: isTokenReference || normalizeTokenAlias(tokenName) in TOKEN_ALIASES };
  }

  return { color: null, isTokenReference };
};

const toObjectSection = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
};

const resolveTokenColor = (role: LayerSemanticRole, propertyName: string, tokens: ThemeColorTokens): string | null => {
  if (propertyName === 'text-halo-color' || propertyName === 'icon-halo-color') {
    if (role === 'poi') return tokens.poiHalo;
    if (role === 'labelSecondary') return tokens.haloSecondary;
    return tokens.haloPrimary;
  }

  if (propertyName === 'text-color' || propertyName === 'icon-color') {
    if (role === 'poi') return tokens.poiText;
    if (role === 'labelSecondary') return tokens.textSecondary;
    if (role === 'labelPrimary') return tokens.textPrimary;
  }

  if (propertyName === 'line-gradient') {
    if (role === 'motorway') return tokens.motorway;
    if (role === 'primaryRoad') return tokens.primaryRoad;
    if (role === 'secondaryRoad') return tokens.secondaryRoad;
    if (role === 'localRoad') return tokens.localRoad;
    if (role === 'waterLine') return tokens.waterLine;
  }

  switch (role) {
    case 'background':
      return tokens.background;
    case 'water':
      return tokens.water;
    case 'waterLine':
      return tokens.waterLine;
    case 'building':
      return tokens.building;
    case 'park':
      return tokens.park;
    case 'industrial':
      return tokens.industrial;
    case 'residential':
      return tokens.residential;
    case 'motorway':
      return propertyName.includes('outline') ? tokens.roadCasing : tokens.motorway;
    case 'primaryRoad':
      return propertyName.includes('outline') ? tokens.roadCasing : tokens.primaryRoad;
    case 'secondaryRoad':
      return propertyName.includes('outline') ? tokens.roadCasing : tokens.secondaryRoad;
    case 'localRoad':
      return propertyName.includes('outline') ? tokens.roadCasing : tokens.localRoad;
    case 'roadCasing':
      return tokens.roadCasing;
    case 'boundary':
      return tokens.boundary;
    case 'admin':
      return tokens.admin;
    case 'poi':
      return tokens.poiAccent;
    case 'labelPrimary':
      return tokens.textPrimary;
    case 'labelSecondary':
      return tokens.textSecondary;
    case 'land':
      return tokens.land;
    default:
      return null;
  }
};

const applyOverrideMap = (
  target: Record<string, unknown>,
  override: Record<string, string> | undefined,
  section: 'paint' | 'layout',
  role: LayerSemanticRole,
  tokens: ThemeColorTokens
) => {
  if (!override) return target;
  const next = { ...target };
  Object.entries(override).forEach(([key, value]) => {
    if (typeof value !== 'string' || value.trim().length === 0) return;
    if (shouldApplyColorProperty(key)) {
      if (section === 'layout') {
        // Layout properties do not support style colors directly.
        return;
      }

      const { color, isTokenReference } = resolveColorReference(value, tokens);
      if (color) {
        next[key] = color;
        return;
      }

      if (isTokenReference) {
        const fallback = resolveTokenColor(role, key, tokens);
        if (fallback) {
          next[key] = fallback;
        }
      }
      return;
    }

    next[key] = value.trim();
  });
  return next;
};

const buildLayerTargetIndex = (catalog: StyleCatalog): Map<string, LayerTargetGroup> => {
  const grouped = new Map<string, LayerTargetGroup>();

  catalog.colorTargets.forEach((target: StyleColorTarget) => {
    const current = grouped.get(target.layerId) || {
      role: target.role,
      paint: [],
      layout: []
    };

    if (target.section === 'paint') {
      if (!current.paint.includes(target.propertyName)) {
        current.paint.push(target.propertyName);
      }
    } else if (!current.layout.includes(target.propertyName)) {
      current.layout.push(target.propertyName);
    }

    grouped.set(target.layerId, current);
  });

  return grouped;
};

const applySectionTargets = (
  section: Record<string, unknown>,
  targetProperties: string[],
  role: LayerSemanticRole,
  tokens: ThemeColorTokens
): Record<string, unknown> => {
  if (targetProperties.length === 0) return section;

  const next: Record<string, unknown> = { ...section };
  targetProperties.forEach((propertyName) => {
    const resolvedColor = resolveTokenColor(role, propertyName, tokens);
    if (!resolvedColor) return;
    next[propertyName] = resolvedColor;
  });

  return next;
};

const sanitizeSectionColorReferences = (
  section: Record<string, unknown>,
  role: LayerSemanticRole,
  tokens: ThemeColorTokens
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...section };

  Object.entries(next).forEach(([propertyName, propertyValue]) => {
    if (!shouldApplyColorProperty(propertyName) || typeof propertyValue !== 'string') return;

    const { color, isTokenReference } = resolveColorReference(propertyValue, tokens);
    if (color) {
      next[propertyName] = color;
      return;
    }

    if (isTokenReference) {
      const fallback = resolveTokenColor(role, propertyName, tokens);
      if (fallback) {
        next[propertyName] = fallback;
      }
    }
  });

  return next;
};

const stripUndefinedProperties = <T extends Record<string, unknown>>(value: T): T => {
  const entries = Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined);
  return Object.fromEntries(entries) as T;
};

const getThemeTokensFromStyleMetadata = (style: MapLibreStyle): ThemeColorTokens => {
  const metadata = style.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return normalizeThemeSpec().tokens;
  }

  const mapAlchemist = (metadata as Record<string, unknown>).mapAlchemist;
  if (!mapAlchemist || typeof mapAlchemist !== 'object') {
    return normalizeThemeSpec().tokens;
  }

  const themeTokens = (mapAlchemist as Record<string, unknown>).themeTokens;
  if (!themeTokens || typeof themeTokens !== 'object') {
    return normalizeThemeSpec().tokens;
  }

  return normalizeThemeSpec({ tokens: themeTokens }).tokens;
};

const applyLayerTheme = (
  layer: MapLibreLayer,
  tokens: ThemeColorTokens,
  override: ThemeLayerOverrideEntry | undefined,
  targets: LayerTargetGroup | undefined,
  role: LayerSemanticRole
): MapLibreLayer => {
  const effectiveRole = targets?.role ?? role;
  const paintBase = toObjectSection(layer.paint);
  const layoutBase = toObjectSection(layer.layout);
  const themedPaint = applySectionTargets(paintBase, targets?.paint || [], effectiveRole, tokens);
  const themedLayout = applySectionTargets(layoutBase, targets?.layout || [], effectiveRole, tokens);
  const overridePaint = applyOverrideMap(themedPaint, override?.paint, 'paint', effectiveRole, tokens);
  const overrideLayout = applyOverrideMap(themedLayout, override?.layout, 'layout', effectiveRole, tokens);
  const sanitizedPaint = sanitizeSectionColorReferences(overridePaint, effectiveRole, tokens);
  const sanitizedLayout = sanitizeSectionColorReferences(overrideLayout, effectiveRole, tokens);

  return stripUndefinedProperties({
    ...layer,
    paint: sanitizedPaint,
    layout: sanitizedLayout,
  });
};

export const isMapLibreStyleJson = (value: unknown): value is MapLibreStyle => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const style = value as MapLibreStyle;
  return Array.isArray(style.layers) && !!style.sources && typeof style.sources === 'object';
};

export const extractPaletteFromCompiledStyle = (style: unknown): Record<string, string> | null => {
  if (!isMapLibreStyleJson(style)) return null;
  const metadata = style.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const mapAlchemist = (metadata as Record<string, unknown>).mapAlchemist;
  if (!mapAlchemist || typeof mapAlchemist !== 'object') return null;
  const palette = (mapAlchemist as Record<string, unknown>).palette;
  if (palette && typeof palette === 'object') {
    const entries = Object.entries(palette as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string] as const);
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  const themeTokens = (mapAlchemist as Record<string, unknown>).themeTokens;
  if (themeTokens && typeof themeTokens === 'object') {
    return toLegacyPalette(normalizeThemeSpec({ tokens: themeTokens }).tokens);
  }
  return null;
};

export const compileThemeStyle = (
  baseStyle: MapLibreStyle,
  themeSpecInput: ThemeSpec | Partial<ThemeSpec> | Record<string, unknown>
): MapLibreStyle => {
  const themeSpec = normalizeThemeSpec(themeSpecInput);
  const compiled = cloneStyle(baseStyle);

  if (!Array.isArray(compiled.layers)) compiled.layers = [];
  if (!compiled.sources || typeof compiled.sources !== 'object') compiled.sources = {};
  if (!compiled.version) compiled.version = 8;

  const catalog = buildStyleCatalog(compiled);
  const layerTargets = buildLayerTargetIndex(catalog);

  compiled.layers = compiled.layers.map((layer) => {
    const override = themeSpec.layerOverrides?.[layer.id];
    const targets = layerTargets.get(layer.id);
    const role = catalog.layerRoles[layer.id] || classifyLayerRole(layer);
    return applyLayerTheme(layer, themeSpec.tokens, override, targets, role);
  });

  const palette = toLegacyPalette(themeSpec.tokens);
  const existingMetadata = (compiled.metadata && typeof compiled.metadata === 'object')
    ? compiled.metadata
    : {};
  const existingMapAlchemist = (existingMetadata.mapAlchemist && typeof existingMetadata.mapAlchemist === 'object')
    ? existingMetadata.mapAlchemist as Record<string, unknown>
    : {};

  compiled.metadata = {
    ...existingMetadata,
    mapAlchemist: {
      ...existingMapAlchemist,
      compilerVersion: 'theme-spec-v1',
      palette,
      themeTokens: themeSpec.tokens,
      catalog: {
        version: 'style-catalog-v1',
        colorTargetCount: catalog.colorTargets.length,
        iconKeyCount: catalog.iconKeys.length,
        iconKeys: catalog.iconKeys,
        poiSourceCount: catalog.poiSymbolSources.length,
      },
      ...(themeSpec.layerOverrides ? { layerOverrides: themeSpec.layerOverrides } : {}),
    },
  };

  return sanitizeMapLibreStyleForRuntime(compiled) || compiled;
};

export const sanitizeMapLibreStyleForRuntime = (styleInput: unknown): MapLibreStyle | null => {
  if (!isMapLibreStyleJson(styleInput)) return null;

  const style = cloneStyle(styleInput);
  if (!Array.isArray(style.layers)) style.layers = [];
  if (!style.sources || typeof style.sources !== 'object') style.sources = {};
  if (!style.version) style.version = 8;

  const tokens = getThemeTokensFromStyleMetadata(style);
  const catalog = buildStyleCatalog(style);

  style.layers = style.layers.map((layer) => {
    const role = catalog.layerRoles[layer.id] || classifyLayerRole(layer);
    const paint = sanitizeSectionColorReferences(toObjectSection(layer.paint), role, tokens);
    const layout = sanitizeSectionColorReferences(toObjectSection(layer.layout), role, tokens);
    return stripUndefinedProperties({
      ...layer,
      paint,
      layout
    });
  });

  return style;
};
