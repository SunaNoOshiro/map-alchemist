import { MapStylePreset } from '@/types';
import { MapStyleExportService } from './MapStyleExportService';
import { SpriteLayout, SpriteLayoutEntry, buildSpriteLayout } from './spriteUtils';
import { createLogger } from '@core/logger';

const logger = createLogger('MaputnikExportService');

const ICON_SIZE_1X = 64;
const ICON_SIZE_2X = 128;
const PADDING_1X = 2;
const PADDING_2X = 4;
const DEMO_CENTER: [number, number] = [30.5238, 50.4547];
const DEMO_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [0.002, 0.001],
  [-0.002, 0.001],
  [0.001, -0.002],
  [-0.001, -0.002],
  [0.003, -0.001]
];

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

export const applySpriteUrl = (styleJson: Record<string, unknown>, spriteBaseUrl: string) => {
  return {
    ...styleJson,
    sprite: spriteBaseUrl
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

  const existingCenter = Array.isArray(styleJson.center) && styleJson.center.length === 2
    ? (styleJson.center as [number, number])
    : null;
  const center = existingCenter ?? DEMO_CENTER;
  const zoomValue = typeof styleJson.zoom === 'number' ? styleJson.zoom : 14;
  const zoom = Math.max(zoomValue, 13);

  const labelColor = palette?.text ?? '#111827';
  const haloColor = palette?.land ?? '#ffffff';
  const features = iconKeys.slice(0, DEMO_OFFSETS.length).map((iconKey, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [center[0] + DEMO_OFFSETS[index][0], center[1] + DEMO_OFFSETS[index][1]]
    },
    properties: {
      iconKey,
      title: iconKey,
      textColor: labelColor,
      haloColor
    }
  }));

  return {
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
};

export const MaputnikExportService = {
  async buildExport(
    preset: MapStylePreset,
    options: { spriteBaseUrl: string; baseStyleJson?: Record<string, unknown> }
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
    const styleJson = injectDemoPois(styleWithSprite, iconIds, exportPackage.palette as Record<string, string>);

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
