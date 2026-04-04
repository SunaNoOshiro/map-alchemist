import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from '@/features/map/components/MapView';
import { PoiService } from '@/features/map/services/PoiService';
import { buildPopupRenderableIconMap, hasRenderableIconPixels } from '@/features/map/hooks/useMapLogic';

const {
  initializeMock,
  setStyleMock,
  setGeoJsonSourceDataMock,
  disposeMock,
  setFilterMock,
  setLayoutPropertyMock,
  onMock,
  offMock,
  existingLayerIds,
  existingSourceIds,
  viewportState,
  rawMapMock
} = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  setStyleMock: vi.fn(),
  setGeoJsonSourceDataMock: vi.fn(),
  disposeMock: vi.fn(),
  setFilterMock: vi.fn(),
  setLayoutPropertyMock: vi.fn(),
  onMock: vi.fn(),
  offMock: vi.fn(),
  existingLayerIds: new Set<string>(),
  existingSourceIds: new Set<string>(),
  viewportState: {
    west: -122.45,
    south: 37.75,
    east: -122.38,
    north: 37.81,
    zoom: 14
  },
  rawMapMock: {
    getSource: vi.fn((sourceId?: string) => (
      sourceId && existingSourceIds.has(String(sourceId)) ? {} : null
    )),
    addSource: vi.fn((sourceId?: string) => {
      if (sourceId) existingSourceIds.add(String(sourceId));
    }),
    getLayer: vi.fn((layerId?: string) => (
      layerId && existingLayerIds.has(String(layerId)) ? {} : null
    )),
    addLayer: vi.fn((layer: any) => {
      if (layer?.id) existingLayerIds.add(String(layer.id));
    }),
    setFilter: vi.fn(),
    setLayoutProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn((_event: string, callback: () => void) => callback()),
    getCanvas: vi.fn(() => ({ style: {} })),
    getContainer: vi.fn(() => document.createElement('div')),
    getStyle: vi.fn(() => ({ layers: [] })),
    getBounds: vi.fn(() => ({
      getWest: () => viewportState.west,
      getSouth: () => viewportState.south,
      getEast: () => viewportState.east,
      getNorth: () => viewportState.north
    })),
    getZoom: vi.fn(() => viewportState.zoom),
    panBy: vi.fn(),
    fire: vi.fn()
  }
}));

rawMapMock.setLayoutProperty = setLayoutPropertyMock;
rawMapMock.setFilter = setFilterMock;

vi.mock('@/features/map/services/MapLibreAdapter', () => ({
  MapLibreAdapter: class MockMapLibreAdapter {
    initialize(container: HTMLElement, style?: any, onLoad?: () => void): void {
      initializeMock(container, style);
      onLoad?.();
    }

    dispose(): void {
      disposeMock();
    }

    setStyle(styleJson: any): void {
      setStyleMock(styleJson);
    }

    getLayers(): any[] {
      return [];
    }

    setPaintProperty(): void {}
    addImage(): void {}
    removeImage(): void {}
    hasImage(): boolean { return false; }
    setGeoJsonSourceData(): void {
      setGeoJsonSourceDataMock();
    }
    showPopup(): void {}
    removePopup(): void {}
    getPopupElement(): HTMLElement | null { return null; }
    queryRenderedFeatures(): any[] { return []; }
    querySourceFeatures(): any[] { return []; }
    on(...args: any[]): void {
      onMock(...args);
    }
    off(...args: any[]): void {
      offMock(...args);
    }
    getRawMap() {
      return rawMapMock;
    }
  }
}));

const basePopupStyle = {
  backgroundColor: '#ffffff',
  textColor: '#101010',
  borderColor: '#303030',
  borderRadius: '10px',
  fontFamily: 'Noto Sans'
};

const baseStyleJson = {
  version: 8,
  sources: { openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/v1/openfreemap' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#010203' } },
    { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#111111' } },
    { id: 'main-road', type: 'line', paint: { 'line-color': '#222222' } },
    { id: 'city-label', type: 'symbol', paint: { 'text-color': '#333333' } }
  ]
};

const selectedThemeStyleJson = {
  water: '#0a84ff',
  land: '#f4d03f',
  road: '#6b4f2b',
  text: '#1f2937'
};

const baseProps = {
  activeIcons: {},
  popupStyle: basePopupStyle,
  isDefaultTheme: false,
  isThemeSelected: true,
  activeThemeName: 'Selected Theme',
  poiMapVisibilityFilters: {
    hiddenCategories: [],
    hiddenSubcategories: []
  }
};

describe('useMapLogic initialization flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existingLayerIds.clear();
    existingSourceIds.clear();
    viewportState.west = -122.45;
    viewportState.south = 37.75;
    viewportState.east = -122.38;
    viewportState.north = 37.81;
    viewportState.zoom = 14;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => baseStyleJson
    })));
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initializes the map with the resolved selected style and skips a redundant first setStyle', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    const initialStyle = initializeMock.mock.calls[0][1];
    expect(initialStyle.layers[0].paint['background-color']).toBe('#f4d03f');
    expect(initialStyle.layers[1].paint['fill-color']).toBe('#0a84ff');
    expect(initialStyle.layers[2].paint['line-color']).toBe('#6b4f2b');
    expect(setStyleMock).not.toHaveBeenCalled();
  });

  it('still applies setStyle when the selected theme changes after mount', async () => {
    const { rerender } = render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <MapView
        {...baseProps}
        styleId="next-style"
        activeThemeName="Next Theme"
        mapStyleJson={{ water: '#1d4ed8', land: '#c084fc', road: '#4338ca', text: '#f8fafc' }}
      />
    );

    await waitFor(() => {
      expect(setStyleMock).toHaveBeenCalledTimes(1);
    });

    const nextStyle = setStyleMock.mock.calls[0][0];
    expect(nextStyle.layers[0].paint['background-color']).toBe('#c084fc');
    expect(nextStyle.layers[1].paint['fill-color']).toBe('#1d4ed8');
  });

  it('does not reinitialize the map when POI visibility filters change', async () => {
    const { rerender } = render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
        poiMapVisibilityFilters={{
          hiddenCategories: ['Entertainment'],
          hiddenSubcategories: []
        }}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    expect(disposeMock).not.toHaveBeenCalled();
  });

  it('applies map visibility through a layer filter without rebuilding the POI source', async () => {
    const { rerender } = render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    setGeoJsonSourceDataMock.mockClear();
    setFilterMock.mockClear();
    setLayoutPropertyMock.mockClear();

    rerender(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
        poiMapVisibilityFilters={{
          hiddenCategories: ['Entertainment'],
          hiddenSubcategories: [],
          isolation: null
        }}
      />
    );

    await waitFor(() => {
      expect(setFilterMock).toHaveBeenCalledWith(
        'unclustered-point',
        ['all', ['match', ['get', 'category'], ['Entertainment'], false, true]]
      );
    });

    expect(setLayoutPropertyMock).not.toHaveBeenCalled();
    expect(setGeoJsonSourceDataMock).not.toHaveBeenCalled();
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('does not recollect viewport POIs when only visibility filters change', async () => {
    const collectDataSpy = vi.spyOn(PoiService, 'collectData').mockReturnValue([]);

    const { rerender } = render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(collectDataSpy).toHaveBeenCalledTimes(1);
    });

    collectDataSpy.mockClear();

    rerender(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
        poiMapVisibilityFilters={{
          hiddenCategories: ['Shopping'],
          hiddenSubcategories: [],
          isolation: null
        }}
      />
    );

    await waitFor(() => {
      expect(setFilterMock).toHaveBeenCalledWith(
        'unclustered-point',
        ['all', ['match', ['get', 'category'], ['Shopping'], false, true]]
      );
    });

    expect(collectDataSpy).not.toHaveBeenCalled();
    collectDataSpy.mockRestore();
  });

  it('adds fallback dot layers for POIs that do not have a custom icon image', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    const fallbackLayerCalls = rawMapMock.addLayer.mock.calls
      .map((call) => call[0])
      .filter((layer: any) => String(layer?.id || '').startsWith('unclustered-point-fallback--'));

    expect(fallbackLayerCalls.length).toBeGreaterThan(0);
    expect(fallbackLayerCalls[0]).toMatchObject({
      type: 'symbol',
      source: 'places'
    });
    expect(fallbackLayerCalls[0].filter).toEqual(expect.arrayContaining([
      'all',
      ['!=', ['get', 'hasRenderableCustomIconImage'], true]
    ]));
    expect(fallbackLayerCalls[0].layout['icon-image']).toBe('poi-dot-fallback-sdf');
    expect(fallbackLayerCalls[0].layout['icon-optional']).toBe(false);
    expect(fallbackLayerCalls[0].layout['text-optional']).toBe(false);
    expect(fallbackLayerCalls[0].paint['icon-color']).toEqual([
      'coalesce',
      ['get', 'textColor'],
      '#6b7280'
    ]);
    expect(fallbackLayerCalls[0].paint['text-color']).toEqual(['get', 'textColor']);
  });

  it('keeps custom icon labels coupled to the icon placement contract', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    const symbolLayerCalls = rawMapMock.addLayer.mock.calls
      .map((call) => call[0])
      .filter((layer: any) => String(layer?.id || '').startsWith('unclustered-point--'));

    expect(symbolLayerCalls.length).toBeGreaterThan(0);
    expect(symbolLayerCalls[0].filter).toEqual(expect.arrayContaining([
      'all',
      ['==', ['get', 'hasRenderableCustomIconImage'], true]
    ]));
    expect(symbolLayerCalls[0].layout['icon-optional']).toBe(false);
    expect(symbolLayerCalls[0].layout['text-optional']).toBe(false);
    expect(symbolLayerCalls[0].paint['icon-color']).toEqual([
      'coalesce',
      ['get', 'textColor'],
      '#6b7280'
    ]);
  });

  it('re-registers base-map POI suppression on styledata so late style layers stay hidden', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    expect(onMock).toHaveBeenCalledWith('styledata', expect.any(Function));
  });

  it('registers layer-specific POI hover and click listeners instead of global mousemove hit-testing', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    const registeredEvents = onMock.mock.calls.map((call) => ({
      event: call[0],
      layerId: call[2]
    }));

    expect(registeredEvents.some((entry) =>
      entry.event === 'click' && String(entry.layerId || '').startsWith('unclustered-point--')
    )).toBe(true);

    expect(registeredEvents.some((entry) =>
      entry.event === 'click' && String(entry.layerId || '').startsWith('unclustered-point-fallback--')
    )).toBe(true);

    expect(registeredEvents.some((entry) =>
      entry.event === 'mouseenter' && String(entry.layerId || '').startsWith('unclustered-point--')
    )).toBe(true);

    expect(registeredEvents.some((entry) =>
      entry.event === 'mouseenter' && String(entry.layerId || '').startsWith('unclustered-point-fallback--')
    )).toBe(true);

    expect(registeredEvents.some((entry) =>
      entry.event === 'click' && entry.layerId === 'unclustered-point'
    )).toBe(false);
    expect(registeredEvents.some((entry) => entry.event === 'mousemove')).toBe(false);
    expect(rawMapMock.on).not.toHaveBeenCalledWith('mouseenter', 'unclustered-point', expect.any(Function));
    expect(rawMapMock.on).not.toHaveBeenCalledWith('mouseleave', 'unclustered-point', expect.any(Function));
  });

  it('skips redundant viewport recollection on moveend when bounds stay inside the buffered area', async () => {
    const collectDataSpy = vi.spyOn(PoiService, 'collectData').mockReturnValue([]);

    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(collectDataSpy).toHaveBeenCalledTimes(1);
    });

    const moveendHandler = onMock.mock.calls.find((call) => call[0] === 'moveend')?.[1];
    expect(moveendHandler).toBeTypeOf('function');

    vi.useFakeTimers();

    viewportState.west = -122.44;
    viewportState.south = 37.755;
    viewportState.east = -122.385;
    viewportState.north = 37.805;
    viewportState.zoom = 14.2;

    act(() => {
      moveendHandler?.();
      vi.advanceTimersByTime(220);
    });

    expect(collectDataSpy).toHaveBeenCalledTimes(1);

    viewportState.west = -122.33;
    viewportState.south = 37.74;
    viewportState.east = -122.26;
    viewportState.north = 37.8;

    act(() => {
      moveendHandler?.();
      vi.advanceTimersByTime(220);
    });

    expect(collectDataSpy).toHaveBeenCalledTimes(2);

    collectDataSpy.mockRestore();
    vi.useRealTimers();
  });

  it('recollects viewport POIs when the zoom bucket changes meaningfully', async () => {
    const collectDataSpy = vi.spyOn(PoiService, 'collectData').mockReturnValue([]);

    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={selectedThemeStyleJson}
      />
    );

    await waitFor(() => {
      expect(collectDataSpy).toHaveBeenCalledTimes(1);
    });

    const moveendHandler = onMock.mock.calls.find((call) => call[0] === 'moveend')?.[1];
    expect(moveendHandler).toBeTypeOf('function');

    vi.useFakeTimers();

    viewportState.zoom = 15.2;

    act(() => {
      moveendHandler?.();
      vi.advanceTimersByTime(220);
    });

    expect(collectDataSpy).toHaveBeenCalledTimes(2);

    collectDataSpy.mockRestore();
    vi.useRealTimers();
  });

  it('treats a fully transparent icon bitmap as invalid so fallback markers can stay visible', () => {
    const transparentIcon = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4)
    } as ImageData;
    expect(hasRenderableIconPixels(transparentIcon)).toBe(false);

    const visibleIcon = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4)
    } as ImageData;
    for (let index = 3; index < (12 * 4); index += 4) {
      visibleIcon.data[index] = 255;
    }
    expect(hasRenderableIconPixels(visibleIcon)).toBe(true);
  });

  it('forces popup icon fallback when the resolved POI icon key is known to be invalid', () => {
    const feature = {
      properties: {
        category: 'Food & Drink',
        subcategory: 'Night Club',
        iconKey: 'Night Club'
      }
    };

    const nextIcons = buildPopupRenderableIconMap(
      feature,
      {
        'Night Club': {
          category: 'Food & Drink',
          prompt: 'Night Club icon',
          imageUrl: 'https://example.com/night-club.png'
        },
        'Food & Drink': {
          category: 'Food & Drink',
          prompt: 'Food icon',
          imageUrl: 'https://example.com/food.png'
        }
      },
      new Set(['Night Club'])
    );

    expect(nextIcons['Night Club']?.imageUrl).toBeNull();
    expect(nextIcons['Food & Drink']?.imageUrl).toBeNull();
  });
});
