import { describe, expect, it } from 'vitest';
import {
  buildIconSyncPlan,
  computePopupViewportConstraints,
  computePopupViewportPanDelta,
  resolveRenderStyle,
  resolveRenderStyleForDisplay,
  sanitizeMapStyleNumericExpressions,
  shouldDeferPopupViewportFit,
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

describe('computePopupViewportPanDelta', () => {
  it('returns a negative left-up pan when the popup overflows the top-left viewport edge', () => {
    const delta = computePopupViewportPanDelta(
      { top: 60, left: 40, right: 300, bottom: 260 },
      { top: 100, left: 100, right: 700, bottom: 700 },
      20
    );

    expect(delta).toEqual([-80, -60]);
  });

  it('returns a positive down-right pan when the popup overflows the bottom-right viewport edge', () => {
    const delta = computePopupViewportPanDelta(
      { top: 180, left: 420, right: 760, bottom: 760 },
      { top: 100, left: 100, right: 700, bottom: 700 },
      20
    );

    expect(delta).toEqual([80, 70]);
  });

  it('centers an oversized popup inside the safe viewport band', () => {
    const delta = computePopupViewportPanDelta(
      { top: 90, left: 120, right: 760, bottom: 760 },
      { top: 100, left: 100, right: 700, bottom: 700 },
      20
    );

    expect(delta).toEqual([40, 25]);
  });

  it('clamps absurd pan requests to the current viewport span', () => {
    const delta = computePopupViewportPanDelta(
      { top: -50000, left: -32000, right: -31700, bottom: -49700 },
      { top: 100, left: 100, right: 700, bottom: 700 },
      20
    );

    expect(delta).toEqual([-560, -560]);
  });
});

describe('computePopupViewportConstraints', () => {
  it('caps popup width to the safe space inside the map viewport', () => {
    const constraints = computePopupViewportConstraints(
      { top: 100, left: 50, right: 430, bottom: 620 },
      10
    );

    expect(constraints.maxPopupWidth).toBe(344);
    expect(constraints.maxContentHeight).toBe(308);
  });

  it('keeps popup sizing usable inside narrower map containers', () => {
    const constraints = computePopupViewportConstraints(
      { top: 0, left: 0, right: 280, bottom: 300 },
      10
    );

    expect(constraints.maxPopupWidth).toBe(246);
    expect(constraints.maxContentHeight).toBe(254);
  });

  it('applies a tighter width cap for narrow mobile-sized viewports', () => {
    const constraints = computePopupViewportConstraints(
      { top: 0, left: 0, right: 390, bottom: 760 },
      16
    );

    expect(constraints.maxPopupWidth).toBe(344);
    expect(constraints.maxContentHeight).toBe(308);
  });
});

describe('shouldDeferPopupViewportFit', () => {
  it('defers viewport fitting while MapLibre still reports an offscreen placeholder rect', () => {
    const shouldDefer = shouldDeferPopupViewportFit(
      { top: -1204, left: -522, right: -122, bottom: -869 },
      { top: 65, left: 320, right: 960, bottom: 720 }
    );

    expect(shouldDefer).toBe(true);
  });

  it('accepts a popup rect that is only slightly outside the current safe band', () => {
    const shouldDefer = shouldDeferPopupViewportFit(
      { top: 48, left: 332, right: 728, bottom: 438 },
      { top: 65, left: 320, right: 960, bottom: 720 }
    );

    expect(shouldDefer).toBe(false);
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
    const resolved = resolveRenderStyle(emptyPlaceholderStyle, baseStyle);
    expect(resolved.version).toBe(8);
    expect(resolved.sources).toEqual(baseStyle.sources);
    expect(resolved.layers[0].id).toBe('background');
    expect(resolved.layers[0].paint['background-color']).toBe('#010203');
  });

  it('uses base style fallback for legacy palette-style objects', () => {
    const legacyStyle = { water: '#0a84ff', land: '#1c2435' };
    const baseStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#010203' } }],
    };

    expect(shouldApplyPaletteOverrides(legacyStyle)).toBe(true);
    const resolved = resolveRenderStyle(legacyStyle, baseStyle);
    expect(resolved.version).toBe(8);
    expect(resolved.sources).toEqual(baseStyle.sources);
    expect(resolved.layers[0].id).toBe('background');
    expect(resolved.layers[0].paint['background-color']).toBe('#010203');
  });

  it('bakes palette overrides into the initial render style for legacy themes', () => {
    const legacyStyle = { water: '#0a84ff', land: '#f4d03f', road: '#6b4f2b', text: '#1f2937' };
    const baseStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#010203' } },
        { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#111111' } },
        { id: 'main-road', type: 'line', paint: { 'line-color': '#222222' } },
        { id: 'city-label', type: 'symbol', paint: { 'text-color': '#333333' } }
      ]
    };

    const resolved = resolveRenderStyleForDisplay(legacyStyle, baseStyle, legacyStyle);

    expect(resolved.layers[0].paint['background-color']).toBe('#f4d03f');
    expect(resolved.layers[1].paint['fill-color']).toBe('#0a84ff');
    expect(resolved.layers[2].paint['line-color']).toBe('#6b4f2b');
    expect(resolved.layers[3].paint['text-color']).toBe('#1f2937');
  });

  it('sanitizes unresolved token colors and sparse sections before render apply', () => {
    const styleWithTokens = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      metadata: {
        mapAlchemist: {
          themeTokens: {
            water: '#0a84ff',
            textPrimary: '#f8fbff',
            haloPrimary: '#11182b',
          }
        }
      },
      layers: [
        {
          id: 'water',
          type: 'fill',
          source: 'openfreemap',
          'source-layer': 'water',
          paint: { 'fill-color': "token('water')" },
          layout: undefined,
        },
      ],
    };
    const fallbackBaseStyle = {
      version: 8,
      sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#010203' } }],
    };

    const resolved = resolveRenderStyle(styleWithTokens, fallbackBaseStyle);

    expect(resolved.layers[0].paint['fill-color']).toBe('#0a84ff');
    expect(typeof resolved.layers[0].layout).toBe('object');
    expect(typeof resolved.layers[0].paint).toBe('object');
  });
});
