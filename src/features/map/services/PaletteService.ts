import { IMapController } from '@core/interfaces/IMapController';
// We need access to map style layers which might be provider specific...
// But sticking to IMapController abstraction, we need 'getStyle()' or similar.
// Since 'setPaintProperty' is supported, we assume we know layer IDs or the controller handles it.
// To fully support the regex logic, we might need to expose 'getLayers()' in the interface.
// For now, let's assume the Controller can give us the list of layers, OR we pass the standard MapLibre style JSON to iterate over.

export class PaletteService {
    private static applyLayerOverrides(
        layers: any[],
        predicate: (layerId: string) => boolean,
        applyOverride: (layer: any) => any
    ) {
        return layers.map((layer) => {
            if (!layer?.id || !predicate(layer.id)) return layer;
            return applyOverride(layer);
        });
    }

    static buildPaletteStyledStyle(
        styleJson: any,
        palette: Record<string, string>
    ) {
        if (!styleJson || typeof styleJson !== 'object' || !Array.isArray(styleJson.layers)) {
            return styleJson;
        }

        let nextLayers = styleJson.layers.map((layer: any) => ({
            ...layer,
            ...(layer?.paint && typeof layer.paint === 'object'
                ? { paint: { ...layer.paint } }
                : {})
        }));

        const applyColor = (predicate: (layerId: string) => boolean, color?: string) => {
            if (!color) return;
            nextLayers = PaletteService.applyLayerOverrides(nextLayers, predicate, (layer) => {
                const paintProp =
                    layer.type === 'fill' ? 'fill-color'
                        : layer.type === 'line' ? 'line-color'
                            : layer.type === 'background' ? 'background-color'
                                : layer.type === 'circle' ? 'circle-color'
                                    : null;
                if (!paintProp) return layer;
                return {
                    ...layer,
                    paint: {
                        ...(layer.paint || {}),
                        [paintProp]: color
                    }
                };
            });
        };

        applyColor(id => /water/i.test(id), palette.water);
        applyColor(id => /(land|park|green|nature|background|vegetation)/i.test(id), palette.park || palette.land);
        applyColor(id => /building/i.test(id), palette.building);
        applyColor(id => /(road|transport|highway|street|motorway|primary|secondary|tertiary|residential|trunk|path)/i.test(id), palette.road);

        if (palette.text) {
            nextLayers = PaletteService.applyLayerOverrides(
                nextLayers,
                (id) => id !== 'unclustered-point',
                (layer) => {
                    if (layer.type !== 'symbol') return layer;
                    return {
                        ...layer,
                        paint: {
                            ...(layer.paint || {}),
                            'text-color': palette.text
                        }
                    };
                }
            );
        }

        return {
            ...styleJson,
            layers: nextLayers
        };
    }

    static applyPalette(
        map: IMapController,
        palette: Record<string, string>,
        currentStyleLayers: any[] // We pass the layers definition
    ) {
        const colors = palette;

        const applyColor = (predicate: (layerId: string) => boolean, color?: string) => {
            if (!color) return;
            currentStyleLayers
                .filter(l => predicate(l.id))
                .forEach(l => {
                    const paintProp =
                        l.type === 'fill' ? 'fill-color'
                            : l.type === 'line' ? 'line-color'
                                : l.type === 'background' ? 'background-color'
                                    : l.type === 'circle' ? 'circle-color'
                                        : null;
                    if (!paintProp) return;
                    map.setPaintProperty(l.id, paintProp, color);
                });
        };

        applyColor(id => /water/i.test(id), colors.water);
        applyColor(id => /(land|park|green|nature|background|vegetation)/i.test(id), colors.park || colors.land);
        applyColor(id => /building/i.test(id), colors.building);
        applyColor(id => /(road|transport|highway|street|motorway|primary|secondary|tertiary|residential|trunk|path)/i.test(id), colors.road);

        if (colors.text) {
            currentStyleLayers
                .filter(l => l.type === 'symbol')
                .forEach(l => {
                    // Keep data-driven POI label colors from feature properties.
                    if (l.id === 'unclustered-point') return;
                    map.setPaintProperty(l.id, 'text-color', colors.text);
                });
        }
    }
}
