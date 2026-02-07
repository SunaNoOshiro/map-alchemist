import { MapStylePreset } from '@/types';
import { MapStyleExportService } from './MapStyleExportService';
import { SpriteLayout, SpriteLayoutEntry, buildSpriteLayout } from './spriteUtils';
import { createLogger } from '@core/logger';
import { getCategoryColor } from '@/constants';

const logger = createLogger('MaputnikExportService');

const ICON_SIZE_1X = 64;
const ICON_SIZE_2X = 128;
const PADDING_1X = 2;
const PADDING_2X = 4;
const DEMO_CENTER: [number, number] = [30.5238, 50.4547];
const GRID_SPACING_LON = 0.002;
const GRID_SPACING_LAT = 0.0015;
const POI_LAYER_ID = 'unclustered-point';
const PLACES_SOURCE_ID = 'places';
const MIN_SYMBOL_SPACING = 1;

const getRecommendedZoom = (span: number) => {
  if (span <= 0.01) return 15;
  if (span <= 0.03) return 14;
  if (span <= 0.06) return 13;
  if (span <= 0.12) return 12;
  return 11;
};

const relaxPoiLayer = (styleJson: Record<string, unknown>) => {
  const layers = Array.isArray((styleJson as any).layers) ? (styleJson as any).layers : [];
  if (layers.length === 0) return styleJson;

  const updatedLayers = layers.map((layer: any) => {
    if (layer?.id !== POI_LAYER_ID) return layer;
    const layout = {
      ...(layer.layout ?? {}),
      'icon-allow-overlap': true,
      'text-allow-overlap': true,
      'symbol-spacing': MIN_SYMBOL_SPACING
    };

    return { ...layer, layout };
  });

  return { ...styleJson, layers: updatedLayers };
};

const loadImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob());
    }, 'image/png');
  });
};

const drawSpriteSheet = async (
  layout: SpriteLayout,
  iconsById: Record<string, string>
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new Blob();
  }

  const entries = Object.entries(layout.entries);
  const images = await Promise.all(
    entries.map(async ([id]) => ({ id, img: await loadImage(iconsById[id]) }))
  );

  images.forEach(({ id, img }) => {
    if (!img) return;
    const entry = layout.entries[id];
    ctx.drawImage(img, entry.x, entry.y, entry.width, entry.height);
  });

  return canvasToBlob(canvas);
};

const normalizeDemoLabel = (value: string): string => {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveDemoTextColor = (iconKey: string, fallbackColor: string): string => {
  const categoryColor = getCategoryColor(normalizeDemoLabel(iconKey));
  if (!categoryColor || categoryColor.toLowerCase() === '#6b7280') {
    return fallbackColor;
  }
  return categoryColor;
};

export const applySpriteUrl = (styleJson: Record<string, unknown>, spriteBaseUrl: string) => {
  return {
    ...styleJson,
    sprite: spriteBaseUrl
  };
};

export const applyMapAlchemistMetadata = (
  styleJson: Record<string, unknown>,
  payload: {
    palette?: Record<string, string>;
    popupStyle?: Record<string, string>;
    placesSourceId?: string;
    poiLayerId?: string;
    iconUrls?: Record<string, string>;
  }
) => {
  const existingMetadata = ((styleJson as any).metadata as Record<string, unknown> | undefined) ?? {};
  const existingMapAlchemist = (existingMetadata.mapAlchemist as Record<string, unknown> | undefined) ?? {};

  return {
    ...styleJson,
    metadata: {
      ...existingMetadata,
      mapAlchemist: {
        ...existingMapAlchemist,
        version: '1.0',
        placesSourceId: payload.placesSourceId || PLACES_SOURCE_ID,
        poiLayerId: payload.poiLayerId || POI_LAYER_ID,
        palette: payload.palette || {},
        popupStyle: payload.popupStyle || {},
        iconUrls: payload.iconUrls || {}
      }
    }
  };
};

export const injectDemoPois = (
  styleJson: Record<string, unknown>,
  iconKeys: string[],
  palette?: Record<string, string>
) => {
  if (iconKeys.length === 0) return styleJson;

  const sources = (styleJson.sources as Record<string, any> | undefined) ?? {};
  const placesSource = sources.places as { data?: any } | undefined;
  const existingData = placesSource?.data as { features?: unknown[] } | undefined;
  const hasFeatures = Array.isArray(existingData?.features) && existingData!.features!.length > 0;

  if (hasFeatures) return styleJson;

  const existingCenter = Array.isArray((styleJson as any).center) && (styleJson as any).center.length === 2
    ? (styleJson.center as [number, number])
    : null;
  const center = existingCenter ?? DEMO_CENTER;

  const total = iconKeys.length;
  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const spanLon = Math.max(0, (columns - 1) * GRID_SPACING_LON);
  const spanLat = Math.max(0, (rows - 1) * GRID_SPACING_LAT);
  const maxSpan = Math.max(spanLon, spanLat);
  const recommendedZoom = Math.max(getRecommendedZoom(maxSpan), 13);
  const zoom = recommendedZoom;

  const fallbackLabelColor = palette?.text ?? '#111827';
  const haloColor = palette?.land ?? '#ffffff';
  const halfColumns = (columns - 1) / 2;
  const halfRows = (rows - 1) / 2;

  const features = iconKeys.map((iconKey, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const offsetLon = (col - halfColumns) * GRID_SPACING_LON;
    const offsetLat = (row - halfRows) * GRID_SPACING_LAT;
    const label = normalizeDemoLabel(iconKey);
    const color = resolveDemoTextColor(iconKey, fallbackLabelColor);

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [center[0] + offsetLon, center[1] + offsetLat]
      },
      properties: {
        iconKey,
        title: label,
        category: label,
        subcategory: label,
        description: `Demo POI for ${label}`,
        address: `${100 + index} Demo Street`,
        city: 'Map Alchemist City',
        textColor: color,
        haloColor,
        isDemo: true
      }
    };
  });

  const withDemo = {
    ...styleJson,
    center,
    zoom,
    sources: {
      ...sources,
      places: {
        ...(placesSource ?? { type: 'geojson', cluster: false }),
        data: {
          type: 'FeatureCollection',
          features
        }
      }
    }
  };

  return relaxPoiLayer(withDemo);
};

export const applyDemoPois = (
  styleJson: Record<string, unknown>,
  iconKeys: string[],
  palette: Record<string, string> | undefined,
  includeDemoPois: boolean
) => {
  if (!includeDemoPois) return styleJson;
  return injectDemoPois(styleJson, iconKeys, palette);
};

export const MaputnikExportService = {
  async buildExport(
    preset: MapStylePreset,
    options: { spriteBaseUrl: string; baseStyleJson?: Record<string, unknown>; includeDemoPois?: boolean }
  ) {
    const exportPackage = await MapStyleExportService.buildExportPackage(preset, {
      baseStyleJson: options.baseStyleJson
    });

    const iconsByCategory = Object.fromEntries(
      Object.entries(exportPackage.iconsByCategory || {})
        .filter(([, icon]) => Boolean(icon?.imageUrl))
        .map(([key, icon]) => [key, icon.imageUrl as string])
    );

    const iconIds = Object.keys(iconsByCategory);

    const layout1x = buildSpriteLayout(iconIds, {
      iconSize: ICON_SIZE_1X,
      padding: PADDING_1X,
      pixelRatio: 1
    });

    const layout2x = buildSpriteLayout(iconIds, {
      iconSize: ICON_SIZE_2X,
      padding: PADDING_2X,
      pixelRatio: 2
    });

    const [spritePng, sprite2xPng] = await Promise.all([
      drawSpriteSheet(layout1x, iconsByCategory),
      drawSpriteSheet(layout2x, iconsByCategory)
    ]);

    const styleWithSprite = applySpriteUrl(exportPackage.styleJson as Record<string, unknown>, options.spriteBaseUrl);
    const styleWithDemoPois = applyDemoPois(
      styleWithSprite,
      iconIds,
      exportPackage.palette as Record<string, string>,
      options.includeDemoPois !== false
    );
    const styleJson = applyMapAlchemistMetadata(styleWithDemoPois, {
      palette: exportPackage.palette,
      popupStyle: exportPackage.popupStyle as Record<string, string>,
      placesSourceId: exportPackage.placesSourceId,
      poiLayerId: exportPackage.poiLayerId,
      iconUrls: iconsByCategory
    });

    logger.info(`Maputnik export built for style: ${preset.name}`);

    return {
      styleJson,
      spriteJson: layout1x.entries as Record<string, SpriteLayoutEntry>,
      spritePng,
      sprite2xJson: layout2x.entries as Record<string, SpriteLayoutEntry>,
      sprite2xPng
    };
  }
};
