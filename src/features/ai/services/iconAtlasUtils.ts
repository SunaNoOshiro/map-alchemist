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

export type IconCellValidationReason = 'ok' | 'empty' | 'tiny-subject' | 'too-noisy' | 'text-like';

export type IconCellValidation = {
  isValid: boolean;
  reason: IconCellValidationReason;
  visibleRatio: number;
  bboxFillRatio: number;
  componentCount: number;
  tinyComponentRatio: number;
  largestComponentRatio: number;
  bottomHeavyRatio: number;
};

export type IconCellSlice = {
  imageUrl: string | null;
  validation: IconCellValidation;
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
const MIN_BBOX_FILL_RATIO = 0.035;
const MAX_COMPONENT_COUNT = 46;
const MIN_COMPONENT_COUNT_FOR_NOISE = 14;
const MAX_TINY_COMPONENT_RATIO = 0.34;
const MIN_LARGEST_COMPONENT_RATIO = 0.08;
const MAX_BOTTOM_HEAVY_RATIO = 0.74;
const CHROMA_GREEN_TARGET = { r: 0, g: 255, b: 0 };
const CHROMA_GREEN_MAX_DISTANCE = 170;
const IMAGE_LOAD_TIMEOUT_MS = 2000;

const toUniqueSortedCategories = (categories: string[]) => {
  return [...new Set(categories.map((category) => category.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
};

export const resolveAtlasSize = (size: ImageSize = '1K') => {
  return ATLAS_SIZE_MAP[size] || ATLAS_SIZE_MAP['1K'];
};

export const buildIconAtlasLayout = (
  categories: string[],
  options: { size?: ImageSize; minPadding?: number; fixedColumns?: number; fixedRows?: number } = {}
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

  const fixedColumns = Number.isFinite(options.fixedColumns) && (options.fixedColumns || 0) > 0
    ? Math.floor(options.fixedColumns as number)
    : null;
  const fixedRows = Number.isFinite(options.fixedRows) && (options.fixedRows || 0) > 0
    ? Math.floor(options.fixedRows as number)
    : null;

  const columns = fixedColumns || Math.ceil(Math.sqrt(total));
  let rows = fixedRows || Math.ceil(total / columns);
  if (columns * rows < total) {
    rows = Math.ceil(total / columns);
  }
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
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      resolve(value);
    };
    image.crossOrigin = 'anonymous';
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    timeoutId = setTimeout(() => finish(null), IMAGE_LOAD_TIMEOUT_MS);
    image.src = url;
  });
};

export const isLikelyGreenScreenPixel = (r: number, g: number, b: number): boolean => {
  const distance = Math.sqrt(
    (r - CHROMA_GREEN_TARGET.r) ** 2 +
    (g - CHROMA_GREEN_TARGET.g) ** 2 +
    (b - CHROMA_GREEN_TARGET.b) ** 2
  );
  const dominantGreen = g > 90 && g - r > 30 && g - b > 30;
  return dominantGreen && distance <= CHROMA_GREEN_MAX_DISTANCE;
};

export const applyGreenScreenChromaKey = (data: Uint8ClampedArray): Uint8ClampedArray => {
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < MIN_VISIBLE_ALPHA) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    if (isLikelyGreenScreenPixel(r, g, b)) {
      data[index + 3] = 0;
    }
  }

  return data;
};

const buildVisibleMask = (data: Uint8ClampedArray, width: number, height: number) => {
  const mask = new Uint8Array(width * height);
  let visiblePixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let bottomVisible = 0;
  const bottomStart = Math.floor(height * 0.66);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const alphaIndex = pixelIndex * 4 + 3;
      if (data[alphaIndex] < MIN_VISIBLE_ALPHA) continue;

      mask[pixelIndex] = 1;
      visiblePixels += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y >= bottomStart) bottomVisible += 1;
    }
  }

  return {
    mask,
    visiblePixels,
    minX,
    minY,
    maxX,
    maxY,
    bottomVisible
  };
};

const collectConnectedComponentAreas = (mask: Uint8Array, width: number, height: number): number[] => {
  const visited = new Uint8Array(mask.length);
  const areas: number[] = [];
  const stack: number[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;

    let area = 0;
    visited[index] = 1;
    stack.push(index);

    while (stack.length > 0) {
      const current = stack.pop() as number;
      area += 1;

      const x = current % width;
      const y = Math.floor(current / width);

      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1
      ];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length) continue;
        if (!mask[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    areas.push(area);
  }

  return areas;
};

const validateIconCell = (data: Uint8ClampedArray, width: number, height: number): IconCellValidation => {
  const totalPixels = Math.max(1, width * height);
  const visible = buildVisibleMask(data, width, height);
  const visibleRatio = visible.visiblePixels / totalPixels;

  if (visibleRatio < MIN_FILLED_RATIO) {
    return {
      isValid: false,
      reason: 'empty',
      visibleRatio,
      bboxFillRatio: 0,
      componentCount: 0,
      tinyComponentRatio: 0,
      largestComponentRatio: 0,
      bottomHeavyRatio: 0
    };
  }

  const bboxWidth = visible.maxX - visible.minX + 1;
  const bboxHeight = visible.maxY - visible.minY + 1;
  const bboxFillRatio = (bboxWidth * bboxHeight) / totalPixels;

  if (bboxFillRatio < MIN_BBOX_FILL_RATIO) {
    return {
      isValid: false,
      reason: 'tiny-subject',
      visibleRatio,
      bboxFillRatio,
      componentCount: 0,
      tinyComponentRatio: 0,
      largestComponentRatio: 0,
      bottomHeavyRatio: 0
    };
  }

  const componentAreas = collectConnectedComponentAreas(visible.mask, width, height);
  const componentCount = componentAreas.length;
  const largestArea = componentAreas.length > 0 ? Math.max(...componentAreas) : 0;
  const tinyAreaSum = componentAreas
    .filter((area) => area <= 2)
    .reduce((sum, area) => sum + area, 0);
  const tinyComponentRatio = visible.visiblePixels > 0 ? tinyAreaSum / visible.visiblePixels : 0;
  const largestComponentRatio = visible.visiblePixels > 0 ? largestArea / visible.visiblePixels : 0;
  const bottomHeavyRatio = visible.visiblePixels > 0 ? visible.bottomVisible / visible.visiblePixels : 0;

  const noisyByCount = componentCount > MAX_COMPONENT_COUNT;
  const noisyBySpeckles = componentCount >= MIN_COMPONENT_COUNT_FOR_NOISE && tinyComponentRatio > MAX_TINY_COMPONENT_RATIO;
  const fragmented = componentCount >= 10 && largestComponentRatio < MIN_LARGEST_COMPONENT_RATIO;
  if (noisyByCount || noisyBySpeckles || fragmented) {
    return {
      isValid: false,
      reason: 'too-noisy',
      visibleRatio,
      bboxFillRatio,
      componentCount,
      tinyComponentRatio,
      largestComponentRatio,
      bottomHeavyRatio
    };
  }

  const textLike = bottomHeavyRatio > MAX_BOTTOM_HEAVY_RATIO && componentCount >= 8 && largestComponentRatio < 0.45;
  if (textLike) {
    return {
      isValid: false,
      reason: 'text-like',
      visibleRatio,
      bboxFillRatio,
      componentCount,
      tinyComponentRatio,
      largestComponentRatio,
      bottomHeavyRatio
    };
  }

  return {
    isValid: true,
    reason: 'ok',
    visibleRatio,
    bboxFillRatio,
    componentCount,
    tinyComponentRatio,
    largestComponentRatio,
    bottomHeavyRatio
  };
};

export const sliceAtlasIntoIconsWithValidation = async (
  atlasImageUrl: string,
  entries: Record<string, IconAtlasEntry>
): Promise<Record<string, IconCellSlice>> => {
  const atlasImage = await loadImage(atlasImageUrl);
  if (!atlasImage) {
    return Object.fromEntries(
      Object.keys(entries).map((category) => [
        category,
        {
          imageUrl: null,
          validation: {
            isValid: false,
            reason: 'empty',
            visibleRatio: 0,
            bboxFillRatio: 0,
            componentCount: 0,
            tinyComponentRatio: 0,
            largestComponentRatio: 0,
            bottomHeavyRatio: 0
          }
        }
      ])
    );
  }

  const iconUrls: Record<string, IconCellSlice> = {};

  for (const [category, entry] of Object.entries(entries)) {
    const canvas = document.createElement('canvas');
    canvas.width = entry.width;
    canvas.height = entry.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      iconUrls[category] = {
        imageUrl: null,
        validation: {
          isValid: false,
          reason: 'empty',
          visibleRatio: 0,
          bboxFillRatio: 0,
          componentCount: 0,
          tinyComponentRatio: 0,
          largestComponentRatio: 0,
          bottomHeavyRatio: 0
        }
      };
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

    const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
    applyGreenScreenChromaKey(imageData.data);
    ctx.putImageData(imageData, 0, 0);

    const validation = validateIconCell(imageData.data, entry.width, entry.height);
    iconUrls[category] = {
      imageUrl: validation.isValid ? canvas.toDataURL('image/png') : null,
      validation
    };
  }

  return iconUrls;
};

export const sliceAtlasIntoIcons = async (
  atlasImageUrl: string,
  entries: Record<string, IconAtlasEntry>
): Promise<Record<string, string | null>> => {
  const sliced = await sliceAtlasIntoIconsWithValidation(atlasImageUrl, entries);
  return Object.fromEntries(
    Object.entries(sliced).map(([category, cell]) => [category, cell.imageUrl || null])
  );
};
