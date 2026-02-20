import { ThemeColorTokens, ThemeLayerOverrideEntry, ThemeSpec, normalizeThemeSpec, toLegacyPalette } from '@features/ai/services/themeSpec';
import { buildStyleCatalog, LayerSemanticRole, MapLibreLayer, MapLibreStyle, StyleCatalog, StyleColorTarget } from './styleCatalog';

export type { MapLibreLayer, MapLibreStyle } from './styleCatalog';

type LayerTargetGroup = {
  role: LayerSemanticRole;
  paint: string[];
  layout: string[];
};

const cloneStyle = (style: MapLibreStyle): MapLibreStyle => {
  if (typeof structuredClone === 'function') {
    return structuredClone(style);
  }
  return JSON.parse(JSON.stringify(style));
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

const applyOverrideMap = (target: Record<string, unknown> | undefined, override: Record<string, string> | undefined) => {
  if (!override) return target;
  const next = { ...(target || {}) };
  Object.entries(override).forEach(([key, value]) => {
    if (typeof value !== 'string' || value.trim().length === 0) return;
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
  section: Record<string, unknown> | undefined,
  targetProperties: string[],
  role: LayerSemanticRole,
  tokens: ThemeColorTokens
): Record<string, unknown> | undefined => {
  if (!section || typeof section !== 'object') return section;
  if (targetProperties.length === 0) return section;

  const next: Record<string, unknown> = { ...section };
  targetProperties.forEach((propertyName) => {
    const resolvedColor = resolveTokenColor(role, propertyName, tokens);
    if (!resolvedColor) return;
    next[propertyName] = resolvedColor;
  });

  return next;
};

const applyLayerTheme = (
  layer: MapLibreLayer,
  tokens: ThemeColorTokens,
  override: ThemeLayerOverrideEntry | undefined,
  targets: LayerTargetGroup | undefined
): MapLibreLayer => {
  const nextLayer: MapLibreLayer = { ...layer };

  if (targets) {
    nextLayer.paint = applySectionTargets(layer.paint as Record<string, unknown> | undefined, targets.paint, targets.role, tokens);
    nextLayer.layout = applySectionTargets(layer.layout as Record<string, unknown> | undefined, targets.layout, targets.role, tokens);
  }

  nextLayer.paint = applyOverrideMap(nextLayer.paint as Record<string, unknown> | undefined, override?.paint);
  nextLayer.layout = applyOverrideMap(nextLayer.layout as Record<string, unknown> | undefined, override?.layout);

  return nextLayer;
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
    return applyLayerTheme(layer, themeSpec.tokens, override, targets);
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

  return compiled;
};
