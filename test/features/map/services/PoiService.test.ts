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

const getOutputFeatures = (setGeoJsonSourceData: ReturnType<typeof vi.fn>) => {
    expect(setGeoJsonSourceData).toHaveBeenCalledTimes(1);
    const [, payload] = setGeoJsonSourceData.mock.calls[0] as [string, { features: Array<{ properties: Record<string, string> }> }];
    return payload.features;
};

describe('PoiService.refreshData label colors', () => {
    it('prefers mapped category group color for textColor', () => {
        const palette = { text: '#123456', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'cafe' })]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe(getCategoryColor('Cafe'));
        expect(outputFeature.properties.haloColor).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('falls back to palette text color when no category group color is found', () => {
        const palette = { text: '#345678', land: '#111827' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'unknown_poi_kind' })]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.textColor).toBe(palette.text);
    });

    it('uses one harmonized halo color for all POI labels in a refresh pass', () => {
        const palette = { text: '#345678', land: '#f97316' };
        const popupStyle = { ...DEFAULT_POPUP_STYLE, backgroundColor: '#ffffff' };
        const { map, setGeoJsonSourceData } = createMockMap([
            createPoiFeature({ id: 1, subclass: 'cafe' }),
            createPoiFeature({ id: 2, subclass: 'unknown_poi_kind', name: 'Other Place' })
        ]);

        PoiService.refreshData(map, {}, palette, popupStyle);

        const outputFeatures = getOutputFeatures(setGeoJsonSourceData);
        expect(outputFeatures).toHaveLength(2);
        const uniqueHalos = new Set(outputFeatures.map((feature) => feature.properties.haloColor));
        expect(uniqueHalos.size).toBe(1);
        expect([...uniqueHalos][0]).toMatch(/^#[0-9a-f]{6}$/);
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

    it('filters out features with invalid point coordinates before updating GeoJSON source', () => {
        const palette = { text: '#334155', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([
            createPoiFeature({
                id: 10,
                name: 'Valid POI'
            }),
            {
                ...createPoiFeature({
                    id: 11,
                    name: 'Invalid POI'
                }),
                geometry: {
                    type: 'Point',
                    coordinates: [null, 35.681]
                }
            }
        ]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        expect(setGeoJsonSourceData).toHaveBeenCalledTimes(1);
        const [, payload] = setGeoJsonSourceData.mock.calls[0] as [string, { features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> }];
        expect(payload.features).toHaveLength(1);
        expect(payload.features[0].properties.title).toBe('Valid POI');
        expect(payload.features[0].geometry.coordinates).toEqual([139.767, 35.681]);
    });

    it('skips places source update when the computed POI payload is unchanged', () => {
        const palette = { text: '#123456', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([createPoiFeature({ subclass: 'cafe' })]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);
        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        expect(setGeoJsonSourceData).toHaveBeenCalledTimes(1);
    });

    it('updates places source again when refresh inputs change rendered POI properties', () => {
        const basePalette = { text: '#334155', land: '#0f172a' };
        const changedPalette = { text: '#ef4444', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([
            createPoiFeature({
                subclass: 'unknown_poi_kind'
            })
        ]);

        PoiService.refreshData(map, {}, basePalette, DEFAULT_POPUP_STYLE);
        PoiService.refreshData(map, {}, changedPalette, DEFAULT_POPUP_STYLE);

        expect(setGeoJsonSourceData).toHaveBeenCalledTimes(2);
        const [, firstPayload] = setGeoJsonSourceData.mock.calls[0] as [string, { features: Array<{ properties: Record<string, string> }> }];
        const [, secondPayload] = setGeoJsonSourceData.mock.calls[1] as [string, { features: Array<{ properties: Record<string, string> }> }];
        expect(firstPayload.features[0].properties.textColor).toBe(basePalette.text);
        expect(secondPayload.features[0].properties.textColor).toBe(changedPalette.text);
    });

    it('preserves OSM identifiers and free-detail source tags for popup enrichment', () => {
        const palette = { text: '#123456', land: '#0f172a' };
        const { map, setGeoJsonSourceData } = createMockMap([
            createPoiFeature({
                osm_id: 4242,
                osm_type: 'node',
                website: 'example.com',
                phone: '+1 415 555 0100',
                opening_hours: 'Mo-Fr 08:00-18:00',
                wikipedia: 'en:Test_Place',
                wikidata: 'Q42',
                image: 'https://images.example/test-place.jpg',
                'addr:street': 'Main St',
                'addr:housenumber': '12',
                'addr:city': 'San Francisco'
            })
        ]);

        PoiService.refreshData(map, {}, palette, DEFAULT_POPUP_STYLE);

        const outputFeature = getFirstOutputFeature(setGeoJsonSourceData);
        expect(outputFeature.properties.osm_id).toBe(4242);
        expect(outputFeature.properties.osm_type).toBe('node');
        expect(outputFeature.properties.address).toBe('Main St 12, San Francisco');
        expect(outputFeature.properties.website).toBe('example.com');
        expect(outputFeature.properties.phone).toBe('+1 415 555 0100');
        expect(outputFeature.properties.opening_hours).toBe('Mo-Fr 08:00-18:00');
        expect(outputFeature.properties.wikipedia).toBe('en:Test_Place');
        expect(outputFeature.properties.wikidata).toBe('Q42');
        expect(outputFeature.properties.image).toBe('https://images.example/test-place.jpg');
    });
});
