import { ImageSize } from '@/types';

export type IconAtlasEntry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IconAtlasLayout = {
  atlasSize: number;
  columns: number;
  rows: number;
  cellSize: number;
  iconSize: number;
  padding: number;
  orderedCategories: string[];
  entries: Record<string, IconAtlasEntry>;
};

const ATLAS_SIZE_MAP: Record<ImageSize, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096
};

const MIN_ICON_SIZE = 16;
const MIN_PADDING = 2;
const MIN_VISIBLE_ALPHA = 10;
const MIN_FILLED_RATIO = 0.004;

const toUniqueSortedCategories = (categories: string[]) => {
  return [...new Set(categories.map((category) => category.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
};

export const resolveAtlasSize = (size: ImageSize = '1K') => {
  return ATLAS_SIZE_MAP[size] || ATLAS_SIZE_MAP['1K'];
};

export const buildIconAtlasLayout = (
  categories: string[],
  options: { size?: ImageSize; minPadding?: number } = {}
): IconAtlasLayout => {
  const orderedCategories = toUniqueSortedCategories(categories);
  const total = orderedCategories.length;
  const atlasSize = resolveAtlasSize(options.size || '1K');

  if (total === 0) {
    return {
      atlasSize: 1,
      columns: 1,
      rows: 1,
      cellSize: 1,
      iconSize: 1,
      padding: 0,
      orderedCategories: [],
      entries: {}
    };
  }

  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const cellWidth = Math.max(1, Math.floor(atlasSize / columns));
  const cellHeight = Math.max(1, Math.floor(atlasSize / rows));
  const cellSize = Math.max(1, Math.min(cellWidth, cellHeight));
  const dynamicPadding = Math.floor(cellSize * 0.08);
  const padding = Math.max(options.minPadding ?? MIN_PADDING, dynamicPadding);
  const iconSize = Math.max(MIN_ICON_SIZE, cellSize - padding * 2);
  const gridWidth = columns * cellSize;
  const gridHeight = rows * cellSize;
  const xOffset = Math.floor((atlasSize - gridWidth) / 2);
  const yOffset = Math.floor((atlasSize - gridHeight) / 2);

  const entries: Record<string, IconAtlasEntry> = {};

  orderedCategories.forEach((category, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = xOffset + col * cellSize + padding;
    const y = yOffset + row * cellSize + padding;

    entries[category] = {
      x,
      y,
      width: iconSize,
      height: iconSize
    };
  });

  return {
    atlasSize,
    columns,
    rows,
    cellSize,
    iconSize,
    padding,
    orderedCategories,
    entries
  };
};

const loadImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
};

const hasVisiblePixels = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const data = ctx.getImageData(0, 0, width, height).data;
  let visible = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] >= MIN_VISIBLE_ALPHA) {
      visible += 1;
    }
  }

  return visible / (width * height) >= MIN_FILLED_RATIO;
};

export const sliceAtlasIntoIcons = async (
  atlasImageUrl: string,
  entries: Record<string, IconAtlasEntry>
): Promise<Record<string, string | null>> => {
  const atlasImage = await loadImage(atlasImageUrl);
  if (!atlasImage) {
    return Object.fromEntries(Object.keys(entries).map((category) => [category, null]));
  }

  const iconUrls: Record<string, string | null> = {};

  for (const [category, entry] of Object.entries(entries)) {
    const canvas = document.createElement('canvas');
    canvas.width = entry.width;
    canvas.height = entry.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      iconUrls[category] = null;
      continue;
    }

    ctx.clearRect(0, 0, entry.width, entry.height);
    ctx.drawImage(
      atlasImage,
      entry.x,
      entry.y,
      entry.width,
      entry.height,
      0,
      0,
      entry.width,
      entry.height
    );

    iconUrls[category] = hasVisiblePixels(ctx, entry.width, entry.height)
      ? canvas.toDataURL('image/png')
      : null;
  }

  return iconUrls;
};
