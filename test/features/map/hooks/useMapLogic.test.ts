import { describe, expect, it } from 'vitest';
import {
  buildIconSyncPlan,
  resolveRenderStyle,
  sanitizeMapStyleNumericExpressions,
  shouldApplyPaletteOverrides
} from '@/features/map/hooks/useMapLogic';
import { IconDefinition } from '@/types';

describe('buildIconSyncPlan', () => {
  it('removes stale loaded custom icons that are absent in the next style', () => {
    const loadedUrls = {
      bakery: 'https://cdn.example/bakery-old.png',
      health: 'https://cdn.example/health-old.png',
    };

    const activeIcons: Record<string, IconDefinition> = {
      bakery: {
        category: 'bakery',
        prompt: 'bakery icon',
        imageUrl: 'https://cdn.example/bakery-new.png',
      },
    };

    const plan = buildIconSyncPlan(loadedUrls, activeIcons);

    expect(plan.desiredIconUrls).toEqual({
      bakery: 'https://cdn.example/bakery-new.png',
    });
    expect(plan.staleKeys).toEqual(['health']);
  });

  it('treats empty image entries as stale and keeps only valid custom icon URLs', () => {
    const loadedUrls = {
      shopping: 'https://cdn.example/shopping.png',
      transport: 'https://cdn.example/transport.png',
    };

    const activeIcons: Record<string, IconDefinition> = {
      shopping: {
        category: 'shopping',
        prompt: 'shopping icon',
        imageUrl: '',
      },
      transport: {
        category: 'transport',
        prompt: 'transport icon',
        imageUrl: 'https://cdn.example/transport.png',
      },
    };

    const plan = buildIconSyncPlan(loadedUrls, activeIcons);

    expect(plan.desiredIconUrls).toEqual({
      transport: 'https://cdn.example/transport.png',
    });
    expect(plan.staleKeys).toEqual(['shopping']);
  });
});

describe('sanitizeMapStyleNumericExpressions', () => {
  it('wraps nullable numeric get inputs in interpolate expressions', () => {
    const rawStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'poi-label',
          type: 'symbol',
          layout: {
            'text-size': ['interpolate', ['linear'], ['get', 'rank'], 10, 11, 20, 13],
          },
        },
      ],
    };

    const normalized = sanitizeMapStyleNumericExpressions(rawStyle);
    expect(normalized.layers[0].layout['text-size']).toEqual([
      'interpolate',
      ['linear'],
      ['coalesce', ['to-number', ['get', 'rank']], 0],
      10,
      11,
      20,
      13,
    ]);
  });

  it('wraps nullable numeric get inputs in step expressions', () => {
    const rawStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'roads',
          type: 'line',
          paint: {
            'line-width': ['step', ['get', 'class_rank'], 0.4, 4, 0.8, 8, 1.6],
          },
        },
      ],
    };

    const normalized = sanitizeMapStyleNumericExpressions(rawStyle);
    expect(normalized.layers[0].paint['line-width']).toEqual([
      'step',
      ['coalesce', ['to-number', ['get', 'class_rank']], 0],
      0.4,
      4,
      0.8,
      8,
      1.6,
    ]);
  });

  it('normalizes null numeric layout values to stable defaults', () => {
    const rawStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'poi-label',
          type: 'symbol',
          layout: {
            'symbol-spacing': null,
            'text-size': null,
          },
        },
      ],
    };

    const normalized = sanitizeMapStyleNumericExpressions(rawStyle);
    expect(normalized.layers[0].layout['symbol-spacing']).toBe(250);
    expect(normalized.layers[0].layout['text-size']).toBe(0);
  });

  it('guards direct numeric get expressions with to-number/coalesce fallback', () => {
    const rawStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'roads',
          type: 'line',
          paint: {
            'line-width': ['get', 'width'],
          },
        },
      ],
    };

    const normalized = sanitizeMapStyleNumericExpressions(rawStyle);
    expect(normalized.layers[0].paint['line-width']).toEqual([
      'coalesce',
      ['to-number', ['get', 'width']],
      0,
    ]);
  });

  it('normalizes numeric filter comparisons to avoid nullable get warnings', () => {
    const rawStyle = {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'poi-rank',
          type: 'symbol',
          filter: [
            'all',
            ['>=', ['get', 'rank'], 7],
            ['<', ['get', 'rank'], 20],
          ],
        },
      ],
    };

    const normalized = sanitizeMapStyleNumericExpressions(rawStyle);
    expect(normalized.layers[0].filter).toEqual([
      'all',
      ['>=', ['coalesce', ['to-number', ['get', 'rank']], 0], 7],
      ['<', ['coalesce', ['to-number', ['get', 'rank']], 0], 20],
    ]);
  });
});

describe('compiled style render mode', () => {
  it('skips palette overrides when active style is a full MapLibre style JSON', () => {
    const fullStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#010203' } }],
    };

    expect(shouldApplyPaletteOverrides(fullStyle)).toBe(false);
  });

  it('falls back to base style when style JSON is an empty placeholder', () => {
    const emptyPlaceholderStyle = {
      version: 8,
      sources: {},
      layers: [],
    };
    const baseStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#010203' } }],
    };

    expect(shouldApplyPaletteOverrides(emptyPlaceholderStyle)).toBe(true);
    expect(resolveRenderStyle(emptyPlaceholderStyle, baseStyle)).toEqual(baseStyle);
  });

  it('uses base style fallback for legacy palette-style objects', () => {
    const legacyStyle = { water: '#0a84ff', land: '#1c2435' };
    const baseStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#010203' } }],
    };

    expect(shouldApplyPaletteOverrides(legacyStyle)).toBe(true);
    expect(resolveRenderStyle(legacyStyle, baseStyle)).toEqual(baseStyle);
  });
});
