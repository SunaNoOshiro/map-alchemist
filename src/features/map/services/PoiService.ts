import { IMapController } from '@core/interfaces/IMapController';
import { OSM_MAPPING } from '@/constants';
import { IconDefinition, PopupStyle } from '@/types';
import { createLogger } from '@core/logger';

const logger = createLogger('PoiService');

const SUBCLASS_MAPPING: Record<string, { category: string; subcategory: string }> = Object.entries(OSM_MAPPING).reduce(
    (acc, [combo, value]) => {
        const [, rawSubclass] = combo.split('=');
        if (rawSubclass) {
            acc[rawSubclass.toLowerCase()] = { category: value.category, subcategory: value.subcategory };
        }
        return acc;
    },
    {} as Record<string, { category: string; subcategory: string }>
);

export class PoiService {
    /**
     * Hides base map POI layers since our custom layer handles all POI rendering
     */
    static hideBaseMapPOILayers(map: IMapController) {
        const layers = map.getLayers();
        const poiLayers = layers
            .filter(l => l.type === 'symbol' && typeof (l as any)['source-layer'] === 'string' && (l as any)['source-layer'].toLowerCase().includes('poi'));

        const rawMap = (map as any).getRawMap?.();
        if (!rawMap) return;

        poiLayers.forEach(layer => {
            if (layer.id && layer.id !== 'unclustered-point') {
                try {
                    if (rawMap.getLayer(layer.id)) {
                        // Hide base map POI layer - our custom layer will show styled POIs
                        rawMap.setLayoutProperty(layer.id, 'visibility', 'none');
                        logger.debug(`Hidden base map POI layer: ${layer.id}`);
                    }
                } catch (e) {
                    logger.warn(`Failed to hide layer ${layer.id}:`, e);
                }
            }
        });
    }

    static refreshData(
        map: IMapController,
        activeIcons: Record<string, IconDefinition>,
        palette: Record<string, string>,
        popupStyle: PopupStyle
    ) {
        // Discovery logic derived from MapView.tsx
        // In the original, it scanned layers to find 'poi' layers.
        // This requires access to style layers.
        const layers = map.getLayers();
        const poiLayers = layers
            .filter(l => l.type === 'symbol' && typeof (l as any)['source-layer'] === 'string' && (l as any)['source-layer'].toLowerCase().includes('poi'));

        const poiSources = poiLayers.reduce<{ source: string; sourceLayer: string }[]>((acc, layer) => {
            const source = (layer as any).source as string | undefined;
            const sourceLayer = (layer as any)['source-layer'] as string | undefined;
            if (!source || !sourceLayer) return acc;
            // Simple dedupe
            if (!acc.find(item => item.source === source && item.sourceLayer === sourceLayer)) {
                acc.push({ source, sourceLayer });
            }
            return acc;
        }, []);

        const byId = new Map<string, any>();
        poiSources.forEach(({ source, sourceLayer }) => {
            const rendered = map.querySourceFeatures(source, { sourceLayer });
            rendered.forEach((feature) => {
                const props = feature.properties || {} as any;
                const name = props.name || props['name:en'];
                if (!name) return;

                const subclass = (props.subclass || props.class || props.amenity || props.shop || props.tourism || props.leisure || '').toLowerCase();
                const match = SUBCLASS_MAPPING[subclass];

                const fid = props.id?.toString() || props.osm_id?.toString() || `${subclass || 'poi'}-${name}-${feature.id}`;
                if (byId.has(fid)) return;

                const coords = (feature.geometry as any)?.coordinates;
                if (!coords || !coords.length) return;

                const category = match?.category || subclass || 'poi';
                const subcategory = match?.subcategory || subclass || category;
                // Use subcategory/category as iconKey if we have an icon for it, otherwise use category as fallback
                const iconKey = (activeIcons[subcategory]?.imageUrl) ? subcategory
                    : (activeIcons[category]?.imageUrl) ? category
                        : subcategory; // Fallback to subcategory name even if no image yet

                const labelColor = palette.text || popupStyle.textColor || '#202124';
                const haloColor = palette.land || popupStyle.backgroundColor || '#ffffff';

                byId.set(fid, {
                    type: 'Feature',
                    properties: {
                        id: fid,
                        title: name,
                        category,
                        subcategory,
                        class: props.class,
                        subclass,
                        maki: (props as any).maki,
                        description: props['addr:street'] ? `${props['addr:street']} ${props['addr:housenumber'] || ''}` : '',
                        iconKey,
                        textColor: labelColor,
                        haloColor
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: coords
                    }
                });
            });
        });

        const features = Array.from(byId.values());
        logger.info(`Found ${features.length} POI features from ${poiSources.length} sources`);

        // Update the places source with new data
        // Note: Source and layer are created during map initialization in useMapLogic
        map.setGeoJsonSourceData('places', {
            type: 'FeatureCollection',
            features: features
        });
        logger.info(`Updated places source with ${features.length} features`);
    }
}
