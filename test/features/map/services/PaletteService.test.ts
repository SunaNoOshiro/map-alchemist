import { describe, expect, it, vi } from 'vitest';
import { IMapController } from '@core/interfaces/IMapController';
import { PaletteService } from '@/features/map/services/PaletteService';

const createMockMap = () => {
    const setPaintProperty = vi.fn();
    const map = {
        setPaintProperty
    } as unknown as IMapController;

    return { map, setPaintProperty };
};

describe('PaletteService.applyPalette', () => {
    it('does not override text-color on custom POI symbol layer', () => {
        const { map, setPaintProperty } = createMockMap();
        const layers = [
            { id: 'country-label', type: 'symbol' },
            { id: 'unclustered-point', type: 'symbol' },
            { id: 'road-primary', type: 'line' }
        ];

        PaletteService.applyPalette(
            map,
            {
                text: '#111827',
                road: '#9ca3af'
            },
            layers
        );

        const hasPoiTextOverride = setPaintProperty.mock.calls.some(
            ([layerId, paintProp]) => layerId === 'unclustered-point' && paintProp === 'text-color'
        );

        expect(hasPoiTextOverride).toBe(false);
        expect(setPaintProperty).toHaveBeenCalledWith('country-label', 'text-color', '#111827');
    });
});
