export type SpriteLayoutEntry = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
};

export type SpriteLayout = {
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellSize: number;
  iconSize: number;
  padding: number;
  entries: Record<string, SpriteLayoutEntry>;
};

export const buildSpriteLayout = (
  iconIds: string[],
  options: { iconSize: number; padding: number; pixelRatio: number }
): SpriteLayout => {
  const sortedIds = [...iconIds].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const total = sortedIds.length;
  const iconSize = options.iconSize;
  const padding = options.padding;
  const cellSize = iconSize + padding * 2;

  if (total === 0) {
    return {
      width: 1,
      height: 1,
      columns: 1,
      rows: 1,
      cellSize,
      iconSize,
      padding,
      entries: {}
    };
  }

  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const width = columns * cellSize;
  const height = rows * cellSize;

  const entries: Record<string, SpriteLayoutEntry> = {};

  sortedIds.forEach((id, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellSize + padding;
    const y = row * cellSize + padding;

    entries[id] = {
      x,
      y,
      width: iconSize,
      height: iconSize,
      pixelRatio: options.pixelRatio
    };
  });

  return {
    width,
    height,
    columns,
    rows,
    cellSize,
    iconSize,
    padding,
    entries
  };
};
