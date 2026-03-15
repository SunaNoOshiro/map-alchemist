export type MapLibreLayer = {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  filter?: unknown;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MapLibreStyle = {
  version?: number;
  name?: string;
  metadata?: Record<string, unknown>;
  sources?: Record<string, unknown>;
  layers?: MapLibreLayer[];
  [key: string]: unknown;
};

export type LayerSemanticRole =
  | 'background'
  | 'water'
  | 'waterLine'
  | 'building'
  | 'park'
  | 'industrial'
  | 'residential'
  | 'motorway'
  | 'primaryRoad'
  | 'secondaryRoad'
  | 'localRoad'
  | 'roadCasing'
  | 'boundary'
  | 'admin'
  | 'poi'
  | 'labelPrimary'
  | 'labelSecondary'
  | 'land';

export type StyleColorTarget = {
  layerId: string;
  section: 'paint' | 'layout';
  propertyName: string;
  role: LayerSemanticRole;
};

export type PoiSymbolSource = {
  layerId: string;
  source: string;
  sourceLayer: string;
};

export type StyleCatalog = {
  colorTargets: StyleColorTarget[];
  iconKeys: string[];
  poiSymbolSources: PoiSymbolSource[];
  layerRoles: Record<string, LayerSemanticRole>;
};

const COLOR_PROPERTY_ALLOWLIST = new Set([
  'background-color',
  'fill-color',
  'fill-outline-color',
  'fill-extrusion-color',
  'line-color',
  'line-gradient',
  'circle-color',
  'circle-stroke-color',
  'text-color',
  'text-halo-color',
  'icon-color',
  'icon-halo-color',
  'heatmap-color',
  'hillshade-accent-color',
  'hillshade-highlight-color',
  'hillshade-shadow-color',
]);

const ICON_KEY_PATTERN = /^[a-z0-9._:/-]+$/i;

const toSearchBlob = (layer: MapLibreLayer): string => {
  const id = String(layer.id || '').toLowerCase();
  const sourceLayer = String(layer['source-layer'] || '').toLowerCase();
  const source = String(layer.source || '').toLowerCase();
  const filter = JSON.stringify(layer.filter || '').toLowerCase();
  return `${id} ${sourceLayer} ${source} ${filter}`;
};

const isRoadLayer = (blob: string): boolean =>
  /(road|street|highway|motorway|trunk|primary|secondary|tertiary|residential|transport|path|track)/.test(blob);

const toSourceLayerToken = (layer: MapLibreLayer): string =>
  String(layer['source-layer'] || '').toLowerCase();

const isPoiSymbolLayer = (layer: MapLibreLayer): boolean =>
  layer.type === 'symbol' && toSourceLayerToken(layer).includes('poi');

const addUnique = (target: string[], seen: Set<string>, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return;
  const normalized = trimmed.toLowerCase();
  if (seen.has(normalized)) return;
  seen.add(normalized);
  target.push(trimmed);
};

const maybeAddIconKey = (value: unknown, out: string[], seen: Set<string>) => {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || !ICON_KEY_PATTERN.test(trimmed)) return;
  addUnique(out, seen, trimmed);
};

const collectIconImageOutputLiterals = (value: unknown, out: string[], seen: Set<string>) => {
  if (typeof value === 'string') {
    maybeAddIconKey(value, out, seen);
    return;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  const operator = typeof value[0] === 'string' ? value[0] : null;

  if (!operator) {
    value.forEach((item) => collectIconImageOutputLiterals(item, out, seen));
    return;
  }

  if (operator === 'get' || operator === 'feature-state' || operator === 'zoom') {
    return;
  }

  if (operator === 'literal') {
    collectIconImageOutputLiterals(value[1], out, seen);
    return;
  }

  if (operator === 'match') {
    // ['match', input, label1, output1, label2, output2, fallback]
    for (let index = 3; index < value.length - 1; index += 2) {
      collectIconImageOutputLiterals(value[index], out, seen);
    }
    collectIconImageOutputLiterals(value[value.length - 1], out, seen);
    return;
  }

  if (operator === 'case') {
    // ['case', cond1, output1, cond2, output2, fallback]
    for (let index = 2; index < value.length - 1; index += 2) {
      collectIconImageOutputLiterals(value[index], out, seen);
    }
    collectIconImageOutputLiterals(value[value.length - 1], out, seen);
    return;
  }

  if (operator === 'step') {
    // ['step', input, output0, stop1, output1, ...]
    if (value.length >= 3) {
      collectIconImageOutputLiterals(value[2], out, seen);
    }
    for (let index = 4; index < value.length; index += 2) {
      collectIconImageOutputLiterals(value[index], out, seen);
    }
    return;
  }

  if (operator === 'interpolate') {
    // ['interpolate', interpolation, input, stop1, output1, stop2, output2, ...]
    for (let index = 4; index < value.length; index += 2) {
      collectIconImageOutputLiterals(value[index], out, seen);
    }
    return;
  }

  if (operator === 'coalesce') {
    for (let index = 1; index < value.length; index += 1) {
      collectIconImageOutputLiterals(value[index], out, seen);
    }
    return;
  }

  for (let index = 1; index < value.length; index += 1) {
    collectIconImageOutputLiterals(value[index], out, seen);
  }
};

export const shouldApplyColorProperty = (propertyName: string): boolean => {
  if (propertyName === 'raster-color-mix') return false;
  if (COLOR_PROPERTY_ALLOWLIST.has(propertyName)) return true;
  return propertyName.endsWith('-color');
};

export const classifyLayerRole = (layer: MapLibreLayer): LayerSemanticRole => {
  const blob = toSearchBlob(layer);

  if (layer.type === 'background') return 'background';
  if (/(waterway|river|stream|canal)/.test(blob) && layer.type === 'line') return 'waterLine';
  if (/(water|ocean|lake|sea|reservoir|wetland)/.test(blob)) return 'water';
  if (/building/.test(blob)) return 'building';

  if (isRoadLayer(blob)) {
    if (/(casing|outline|case)/.test(blob)) return 'roadCasing';
    if (/(motorway|trunk)/.test(blob)) return 'motorway';
    if (/primary/.test(blob)) return 'primaryRoad';
    if (/(secondary|tertiary)/.test(blob)) return 'secondaryRoad';
    return 'localRoad';
  }

  if (/industrial/.test(blob)) return 'industrial';
  if (/(residential|suburb|neighbourhood)/.test(blob)) return 'residential';
  if (/(park|forest|wood|grass|garden|nature|green|recreation|landuse|landcover)/.test(blob)) return 'park';

  if (/(boundary|border)/.test(blob)) {
    if (/(admin|country|state|province|city)/.test(blob)) return 'admin';
    return 'boundary';
  }

  if (/poi/.test(blob)) return 'poi';

  if (layer.type === 'symbol') {
    if (/(country|state|capital|city|town|village|place|settlement|admin)/.test(blob)) {
      return 'labelPrimary';
    }
    return 'labelSecondary';
  }

  return 'land';
};

export const extractIconImageKeys = (style: MapLibreStyle): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const layers = Array.isArray(style.layers) ? style.layers : [];

  layers.forEach((layer) => {
    if (layer.type !== 'symbol') return;
    const layout = layer.layout;
    if (!layout || typeof layout !== 'object') return;
    const iconImage = (layout as Record<string, unknown>)['icon-image'];
    collectIconImageOutputLiterals(iconImage, out, seen);
  });

  return out;
};

export const extractPoiSymbolSources = (style: MapLibreStyle): PoiSymbolSource[] => {
  const out: PoiSymbolSource[] = [];
  const dedupe = new Set<string>();
  const layers = Array.isArray(style.layers) ? style.layers : [];

  layers.forEach((layer) => {
    if (!isPoiSymbolLayer(layer)) return;
    if (!layer.id || !layer.source || !layer['source-layer']) return;
    const source = String(layer.source);
    const sourceLayer = String(layer['source-layer']);
    const key = `${source}::${sourceLayer}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    out.push({
      layerId: layer.id,
      source,
      sourceLayer
    });
  });

  return out;
};

export const buildStyleCatalog = (style: MapLibreStyle): StyleCatalog => {
  const layers = Array.isArray(style.layers) ? style.layers : [];
  const colorTargets: StyleColorTarget[] = [];
  const layerRoles: Record<string, LayerSemanticRole> = {};

  layers.forEach((layer) => {
    if (!layer?.id) return;
    const role = classifyLayerRole(layer);
    layerRoles[layer.id] = role;

    const registerTargets = (sectionName: 'paint' | 'layout', props: Record<string, unknown> | undefined) => {
      if (!props || typeof props !== 'object') return;
      Object.keys(props).forEach((propertyName) => {
        if (!shouldApplyColorProperty(propertyName)) return;
        colorTargets.push({
          layerId: layer.id,
          section: sectionName,
          propertyName,
          role
        });
      });
    };

    registerTargets('paint', layer.paint);
    registerTargets('layout', layer.layout);
  });

  return {
    colorTargets,
    iconKeys: extractIconImageKeys(style),
    poiSymbolSources: extractPoiSymbolSources(style),
    layerRoles
  };
};
