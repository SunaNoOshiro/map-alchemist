import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock MapLibre GL
vi.mock('maplibre-gl', () => ({
    default: {
        Map: vi.fn(() => ({
            addControl: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            remove: vi.fn(),
            setPaintProperty: vi.fn(),
            addSource: vi.fn(),
            getSource: vi.fn(() => ({
                setData: vi.fn(),
            })),
            addLayer: vi.fn(),
            getLayer: vi.fn(),
            getStyle: vi.fn(() => ({ layers: [] })),
            querySourceFeatures: vi.fn(() => []),
            queryRenderedFeatures: vi.fn(() => []),
            getCanvas: vi.fn(() => ({
                style: { cursor: '' }
            })),
        })),
        NavigationControl: vi.fn(),
        AttributionControl: vi.fn(),
        Popup: vi.fn(() => ({
            setLngLat: vi.fn().mockReturnThis(),
            setHTML: vi.fn().mockReturnThis(),
            addTo: vi.fn().mockReturnThis(),
            remove: vi.fn(),
        })),
    }
}));

// Mock IndexedDB if needed or use a polyfill
import 'fake-indexeddb/auto';
