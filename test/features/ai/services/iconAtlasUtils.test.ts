import { describe, expect, it } from 'vitest';
import {
  applyGreenScreenChromaKey,
  buildIconAtlasLayout,
  isLikelyGreenScreenPixel,
  resolveAtlasSize,
  sliceAtlasIntoIconsWithValidation
} from '@features/ai/services/iconAtlasUtils';

describe('iconAtlasUtils', () => {
  it('resolves atlas dimensions by declared size', () => {
    expect(resolveAtlasSize('1K')).toBe(1024);
    expect(resolveAtlasSize('2K')).toBe(2048);
    expect(resolveAtlasSize('4K')).toBe(4096);
  });

  it('builds deterministic sorted category mapping', () => {
    const layout = buildIconAtlasLayout(['Zoo', 'Airport', 'Bakery'], { size: '1K', minPadding: 4 });

    expect(layout.orderedCategories).toEqual(['Airport', 'Bakery', 'Zoo']);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.entries.Airport.y).toBe(layout.entries.Bakery.y);
    expect(layout.entries.Zoo.y).toBeGreaterThan(layout.entries.Airport.y);
  });

  it('supports fixed 4x4 atlas grid for chunked generation', () => {
    const layout = buildIconAtlasLayout(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      { size: '1K', fixedColumns: 4, fixedRows: 4 }
    );

    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.orderedCategories).toHaveLength(7);
  });

  it('keeps all icon entry bounds inside atlas dimensions', () => {
    const layout = buildIconAtlasLayout(
      ['Restaurant', 'Cafe', 'Hospital', 'Airport', 'Library', 'Cinema', 'Park', 'Beach', 'Museum'],
      { size: '1K', minPadding: 4 }
    );

    Object.values(layout.entries).forEach((entry) => {
      expect(entry.x).toBeGreaterThanOrEqual(0);
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.width).toBeGreaterThan(0);
      expect(entry.height).toBeGreaterThan(0);
      expect(entry.x + entry.width).toBeLessThanOrEqual(layout.atlasSize);
      expect(entry.y + entry.height).toBeLessThanOrEqual(layout.atlasSize);
    });
  });

  it('returns empty entries for empty category list', () => {
    const layout = buildIconAtlasLayout([]);
    expect(layout.entries).toEqual({});
    expect(layout.orderedCategories).toEqual([]);
  });

  it('detects likely greenscreen pixels while preserving non-greens', () => {
    expect(isLikelyGreenScreenPixel(0, 255, 0)).toBe(true);
    expect(isLikelyGreenScreenPixel(25, 230, 40)).toBe(true);
    expect(isLikelyGreenScreenPixel(180, 220, 180)).toBe(false);
    expect(isLikelyGreenScreenPixel(30, 30, 220)).toBe(false);
  });

  it('removes greenscreen pixels via chroma key and keeps icon pixels opaque', () => {
    const data = new Uint8ClampedArray([
      // bright green background pixel
      0, 255, 0, 255,
      // icon-like dark pixel
      20, 20, 20, 255
    ]);

    const keyed = applyGreenScreenChromaKey(data);

    expect(keyed[3]).toBe(0);
    expect(keyed[7]).toBe(255);
  });

  it('returns invalid empty slices when atlas image cannot be loaded', async () => {
    const result = await sliceAtlasIntoIconsWithValidation('data:image/png;base64,broken', {
      Cafe: { x: 0, y: 0, width: 64, height: 64 },
      Bar: { x: 64, y: 0, width: 64, height: 64 }
    });

    expect(result.Cafe.imageUrl).toBeNull();
    expect(result.Bar.imageUrl).toBeNull();
    expect(result.Cafe.validation.isValid).toBe(false);
    expect(result.Cafe.validation.reason).toBe('empty');
  });
});
