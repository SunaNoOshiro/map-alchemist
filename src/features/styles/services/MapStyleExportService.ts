import { DEFAULT_STYLE_URL } from '@/constants';
import { MapStyleExportPackage, MapStylePreset, IconDefinition, PopupStyle } from '@/types';
import { derivePalette, normalizePopupStyle } from '@core/services/defaultThemes';
import { createLogger } from '@core/logger';

const logger = createLogger('MapStyleExportService');

const EXPORT_FORMAT_VERSION = '1.0';
const POI_SOURCE_ID = 'places';
const POI_LAYER_ID = 'unclustered-point';

type MapLibreLayer = {
  id: string;
  type: string;
  source?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
};

type MapLibreStyle = {
  version?: number;
  name?: string;
  sources?: Record<string, unknown>;
  layers?: MapLibreLayer[];
  [key: string]: unknown;
};

const cloneStyleJson = (style: MapLibreStyle): MapLibreStyle => {
  if (typeof structuredClone === 'function') {
    return structuredClone(style);
  }
  return JSON.parse(JSON.stringify(style));
};

const ensureStyleShape = (style: MapLibreStyle | null | undefined): MapLibreStyle => {
  const normalized = style && typeof style === 'object' ? style : {};
  if (!normalized.sources) normalized.sources = {};
  if (!Array.isArray(normalized.layers)) normalized.layers = [];
  if (!normalized.version) normalized.version = 8;
  return normalized;
};

const ensurePlacesSource = (style: MapLibreStyle) => {
  if (!style.sources) style.sources = {};
  if (style.sources[POI_SOURCE_ID]) return;

  style.sources[POI_SOURCE_ID] = {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: false
  };
};

const buildPoiLayer = (): MapLibreLayer => ({
  id: POI_LAYER_ID,
  type: 'symbol',
  source: POI_SOURCE_ID,
  minzoom: 13,
  layout: {
    'icon-image': ['get', 'iconKey'],
    'icon-size': [
      'interpolate',
      ['linear'],
      ['zoom'],
      13, 0.15,
      14, 0.25,
      16, 0.35,
      18, 0.45
    ],
    'icon-allow-overlap': false,
    'symbol-spacing': 250,
    'text-field': ['get', 'title'],
    'text-font': ['Noto Sans Regular'],
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
    'text-size': [
      'interpolate',
      ['linear'],
      ['zoom'],
      13, 9,
      15, 11,
      18, 13
    ],
    'text-optional': true,
    'text-allow-overlap': false
  },
  paint: {
    'text-color': ['get', 'textColor'],
    'text-halo-color': ['get', 'haloColor'],
    'text-halo-width': 2
  }
});

const ensurePoiLayer = (style: MapLibreStyle) => {
  if (!Array.isArray(style.layers)) style.layers = [];
  if (style.layers.some((layer) => layer.id === POI_LAYER_ID)) return;
  style.layers.push(buildPoiLayer());
};

const applyPaletteToStyle = (style: MapLibreStyle, palette: Record<string, string>) => {
  if (!Array.isArray(style.layers)) return;

  const applyColor = (predicate: (layerId: string) => boolean, color?: string) => {
    if (!color) return;
    style.layers
      .filter((layer) => predicate(layer.id))
      .forEach((layer) => {
        const paintProp =
          layer.type === 'fill' ? 'fill-color'
            : layer.type === 'line' ? 'line-color'
              : layer.type === 'background' ? 'background-color'
                : layer.type === 'circle' ? 'circle-color'
                  : null;

        if (!paintProp) return;
        if (!layer.paint) layer.paint = {};
        layer.paint[paintProp] = color;
      });
  };

  applyColor((id) => /water/i.test(id), palette.water);
  applyColor((id) => /(land|park|green|nature|background|vegetation)/i.test(id), palette.park || palette.land);
  applyColor((id) => /building/i.test(id), palette.building);
  applyColor((id) => /(road|transport|highway|street|motorway|primary|secondary|tertiary|residential|trunk|path)/i.test(id), palette.road);

  if (palette.text) {
    style.layers
      .filter((layer) => layer.type === 'symbol')
      .forEach((layer) => {
        if (layer.id === POI_LAYER_ID) return;
        if (!layer.paint) layer.paint = {};
        layer.paint['text-color'] = palette.text;
      });
  }
};

const sanitizeIcons = (iconsByCategory: Record<string, IconDefinition>) => {
  return Object.fromEntries(
    Object.entries(iconsByCategory || {})
      .filter(([, icon]) => Boolean(icon?.imageUrl))
      .map(([key, icon]) => [
        key,
        {
          category: icon.category,
          prompt: icon.prompt,
          imageUrl: icon.imageUrl
        }
      ])
  );
};

const fetchBaseStyle = async (url: string): Promise<MapLibreStyle> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch base style: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

export const MapStyleExportService = {
  async buildExportPackage(
    preset: MapStylePreset,
    options: { baseStyleJson?: MapLibreStyle; baseStyleUrl?: string } = {}
  ): Promise<MapStyleExportPackage> {
    const baseStyleUrl = options.baseStyleUrl || DEFAULT_STYLE_URL;
    const baseStyleJson = options.baseStyleJson || await fetchBaseStyle(baseStyleUrl);

    const cloned = ensureStyleShape(cloneStyleJson(baseStyleJson));

    const palette = (preset.palette && Object.keys(preset.palette).length > 0)
      ? preset.palette
      : derivePalette(preset.mapStyleJson);

    applyPaletteToStyle(cloned, palette);
    ensurePlacesSource(cloned);
    ensurePoiLayer(cloned);
    cloned.name = preset.name;

    const mapStylePopup = (preset.mapStyleJson as { popupStyle?: Partial<PopupStyle> | null })?.popupStyle;
    const popupStyle = normalizePopupStyle(preset.popupStyle || mapStylePopup);

    const exportPackage: MapStyleExportPackage = {
      formatVersion: EXPORT_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      styleId: preset.id,
      styleName: preset.name,
      prompt: preset.prompt,
      iconTheme: preset.iconTheme,
      palette,
      popupStyle,
      styleJson: cloned,
      iconsByCategory: sanitizeIcons(preset.iconsByCategory),
      baseStyleUrl,
      placesSourceId: POI_SOURCE_ID,
      poiLayerId: POI_LAYER_ID,
      notes: [
        'Add the icons from iconsByCategory to your MapLibre map using map.addImage().',
        `Provide GeoJSON data to the "${POI_SOURCE_ID}" source to render custom POIs with the "${POI_LAYER_ID}" layer.`,
        'Set feature properties "iconKey", "title", "textColor", and "haloColor" to control POI symbols and labels.'
      ]
    };

    logger.info(`Export package built for style: ${preset.name}`);
    return exportPackage;
  }
};
