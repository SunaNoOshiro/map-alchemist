import { describe, expect, it, vi } from 'vitest';
import { IMapController } from '@core/interfaces/IMapController';
import { PoiService } from '@/features/map/services/PoiService';
import { PopupStyle } from '@/types';
import { getCategoryColor } from '@/constants';

const DEFAULT_POPUP_STYLE: PopupStyle = {
    backgroundColor: '#ffffff',
    textColor: '#202124',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    fontFamily: 'Noto Sans'
};

const createPoiFeature = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    properties: {
        id: 1,
        name: 'Test Place',
        subclass: 'cafe',
        class: 'amenity',
        ...overrides
    },
    geometry: {
        type: 'Point',
        coordinates: [139.767, 35.681]
    }
});

const createMockMap = (features: unknown[]) => {
    const setGeoJsonSourceData = vi.fn();
    const map = {
        getLayers: vi.fn(() => [
            {
                id: 'poi-layer',
                type: 'symbol',
                source: 'openmaptiles',
                'source-layer': 'poi_label'
            }
        ]),
        querySourceFeatures: vi.fn(() => features),
        setGeoJsonSourceData
    } as unknown as IMapController;

    return { map, setGeoJsonSourceData };
};

const getFirstOutputFeature = (setGeoJsonSourceData: ReturnType<typeof vi.fn>) => {
    expect(setGeoJsonSourceData).toHaveBeenCalledTimes(1);
    const [, payload] = setGeoJsonSourceData.mock.calls[0] as [string, { features: Array<{ properties: Record<string, string> }> }];
    expect(payload.features).toHaveLength(1);
    return payload.features[0];
};

describe('PoiService.refreshData label colors', () => {
    it('prefers mapped category group color for textColor', () => {
        const palette = { text: '#123456', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'cafe' })]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe(getCategoryColor('Cafe'));
        expect([palette.land, DEFAULT_POPUP_STYLE.backgroundColor]).toContain(outputFeature.properties.haloColor);
    });

    it('falls back to palette text color when no category group color is found', () => {
        const palette = { text: '#345678', land: '#111827' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'unknown_poi_kind' })]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe(palette.text);
    });

    it('uses the more contrasting palette/background color for haloColor', () => {
        const palette = { text: '#345678', land: '#f97316' };
        const popupStyle = { ...DEFAULT_POPUP_STYLE, backgroundColor: '#ffffff' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'cafe' })]);

        PoiService.refreshData(map, {}, palette, popupStyle);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe('#f97316');
        expect(outputFeature.properties.haloColor).toBe(popupStyle.backgroundColor);
    });

    it('uses normalized raw subcategory names to resolve a group color before palette fallback', () => {
        const palette = { text: '#334155', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([
            createPoiFeature({
                subclass: 'fast_food',
                class: undefined
            })
        ]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe(getCategoryColor('Fast Food'));
    });
});
