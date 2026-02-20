import { describe, expect, it } from 'vitest';
import { extractImportableStyles, mergeImportedStyles } from '@/features/styles/hooks/useStyleManager';
import { MapStylePreset } from '@/types';

const createStyle = (id: string, name = `Style ${id}`): MapStylePreset => ({
  id,
  name,
  prompt: 'test',
  createdAt: '2026-02-20T00:00:00.000Z',
  mapStyleJson: { version: 8, sources: {}, layers: [] },
  iconsByCategory: {},
  popupStyle: {
    backgroundColor: '#ffffff',
    textColor: '#111827',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    fontFamily: 'Noto Sans'
  }
});

describe('useStyleManager import helpers', () => {
  it('extracts only valid non-default presets and dedupes by id', () => {
    const payload = [
      createStyle('custom-1'),
      createStyle('default-1'),
      createStyle('custom-1'),
      { id: 'broken-no-map', name: 'Broken' },
      { id: '', name: 'Broken', mapStyleJson: {} },
      'not-an-object'
    ];

    const styles = extractImportableStyles(payload, ['default-1']);
    expect(styles.map((style) => style.id)).toEqual(['custom-1']);
  });

  it('returns empty list when payload is not an array', () => {
    expect(extractImportableStyles({ id: 'x' }, [])).toEqual([]);
  });

  it('merges imports while skipping ids that already exist', () => {
    const existing = [createStyle('a'), createStyle('b')];
    const imported = [createStyle('b'), createStyle('c'), createStyle('d')];

    const merged = mergeImportedStyles(existing, imported);
    expect(merged.mergedStyles.map((style) => style.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.importedCount).toBe(2);
    expect(merged.skippedCount).toBe(1);
  });
});
