import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from '@/features/map/components/MapView';

const {
  initializeMock,
  setStyleMock,
  disposeMock,
  rawMapMock
} = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  setStyleMock: vi.fn(),
  disposeMock: vi.fn(),
  rawMapMock: {
    getSource: vi.fn(() => null),
    addSource: vi.fn(),
    getLayer: vi.fn(() => null),
    addLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn((_event: string, callback: () => void) => callback()),
    getCanvas: vi.fn(() => ({ style: {} })),
    getContainer: vi.fn(() => document.createElement('div')),
    getStyle: vi.fn(() => ({ layers: [] })),
    panBy: vi.fn(),
    fire: vi.fn()
  }
}));

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
    setGeoJsonSourceData(): void {}
    showPopup(): void {}
    removePopup(): void {}
    getPopupElement(): HTMLElement | null { return null; }
    queryRenderedFeatures(): any[] { return []; }
    querySourceFeatures(): any[] { return []; }
    on(): void {}
    off(): void {}
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

const baseProps = {
  apiKey: '',
  activeIcons: {},
  popupStyle: basePopupStyle,
  isDefaultTheme: false,
  isThemeSelected: true,
  activeThemeName: 'Selected Theme'
};

describe('useMapLogic initialization flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.unstubAllGlobals();
  });

  it('initializes the map with the resolved selected style and skips a redundant first setStyle', async () => {
    render(
      <MapView
        {...baseProps}
        styleId="legacy-selected"
        mapStyleJson={{ water: '#0a84ff', land: '#f4d03f', road: '#6b4f2b', text: '#1f2937' }}
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
        mapStyleJson={{ water: '#0a84ff', land: '#f4d03f', road: '#6b4f2b', text: '#1f2937' }}
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
});
