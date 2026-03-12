import { IMapController } from '@core/interfaces/IMapController';
import { CATEGORY_COLORS, getCategoryColor } from '@/constants';
import { IconDefinition, PopupStyle } from '@/types';
import { createLogger } from '@core/logger';
import { resolvePoiIconKey, resolvePoiTaxonomy } from './poiIconResolver';
import { extractPoiSymbolSources } from './styleCatalog';
import { deriveHarmonizedHaloFromPalette, normalizeHexColor } from './colorHarmony';

const logger = createLogger('PoiService');

const DEFAULT_CATEGORY_GROUP_COLOR = getCategoryColor('__unknown_category__');
const POI_REFRESH_SIGNATURE_BY_MAP = new WeakMap<IMapController, string>();

const toDisplayCase = (value?: string): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    return trimmed
        .replace(/[_-]+/g, ' ')
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

const resolveCategoryGroupColor = (subcategory?: string, category?: string): string | null => {
    const candidates = [
        subcategory,
        category,
        toDisplayCase(subcategory || ''),
        toDisplayCase(category || '')
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
        // Handles direct group names, e.g. "Entertainment".
        if (CATEGORY_COLORS[candidate]) {
            return CATEGORY_COLORS[candidate];
        }

        const groupColor = getCategoryColor(candidate);
        if (groupColor !== DEFAULT_CATEGORY_GROUP_COLOR) {
            return groupColor;
        }
    }

    return null;
};

const isValidLngLat = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const extractPointCoordinates = (feature: any): [number, number] | null => {
    const geometry = feature?.geometry;
    if (!geometry) return null;

    const normalizeCoordinates = (candidate: unknown): [number, number] | null => {
        if (!Array.isArray(candidate) || candidate.length < 2) return null;
        const rawLng = candidate[0];
        const rawLat = candidate[1];
        if (!isValidLngLat(rawLng) || !isValidLngLat(rawLat)) return null;
        const lng = rawLng;
        const lat = rawLat;

        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
        return [lng, lat];
    };

    if (geometry.type === 'Point') {
        return normalizeCoordinates(geometry.coordinates);
    }

    if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
        for (const point of geometry.coordinates) {
            const normalized = normalizeCoordinates(point);
            if (normalized) return normalized;
        }
    }

    return null;
};

const fnv1aUpdate = (hash: number, value: string): number => {
    let next = hash;
    for (let index = 0; index < value.length; index += 1) {
        next ^= value.charCodeAt(index);
        next = Math.imul(next, 16777619);
    }
    return next >>> 0;
};

const buildPoiRefreshSignature = (features: any[], sourceCount: number): string => {
    let hash = 2166136261;
    hash = fnv1aUpdate(hash, String(sourceCount));
    hash = fnv1aUpdate(hash, String(features.length));

    features.forEach((feature) => {
        const properties = feature?.properties || {};
        const coordinates = feature?.geometry?.coordinates;
        const lng = Array.isArray(coordinates) && typeof coordinates[0] === 'number'
            ? coordinates[0].toFixed(5)
            : '0';
        const lat = Array.isArray(coordinates) && typeof coordinates[1] === 'number'
            ? coordinates[1].toFixed(5)
            : '0';

        hash = fnv1aUpdate(hash, String(properties.id || ''));
        hash = fnv1aUpdate(hash, String(properties.iconKey || ''));
        hash = fnv1aUpdate(hash, String(properties.textColor || ''));
        hash = fnv1aUpdate(hash, String(properties.haloColor || ''));
        hash = fnv1aUpdate(hash, `${lng},${lat}`);
    });

    return `${sourceCount}:${features.length}:${hash >>> 0}`;
};

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
        const layers = map.getLayers();
        const poiSources = extractPoiSymbolSources({ layers: layers as any[] })
            .map((entry) => ({ source: entry.source, sourceLayer: entry.sourceLayer }));

        const byId = new Map<string, any>();
        poiSources.forEach(({ source, sourceLayer }) => {
            const rendered = map.querySourceFeatures(source, { sourceLayer });
            const harmonizedHaloColor = deriveHarmonizedLabelHaloColor(palette, popupStyle);
            rendered.forEach((feature) => {
                const props = feature.properties || {} as any;
                const name = props.name || props['name:en'];
                if (!name) return;

                const subclass = (props.subclass || props.class || props.amenity || props.shop || props.tourism || props.leisure || '').toLowerCase();
                const { category, subcategory } = resolvePoiTaxonomy(subclass, props.class);

                const fid = props.id?.toString() || props.osm_id?.toString() || `${subclass || 'poi'}-${name}-${feature.id}`;
                if (byId.has(fid)) return;

                const coords = extractPointCoordinates(feature);
                if (!coords) return;

                const iconKey = resolvePoiIconKey(activeIcons, {
                    category,
                    subcategory,
                    subclass
                });

                const fallbackTextColor = palette.text || popupStyle.textColor || '#202124';
                const categoryColor = resolveCategoryGroupColor(subcategory, category);
                const labelColor = categoryColor || fallbackTextColor;
                const haloColor = harmonizedHaloColor;

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

        const features = Array
            .from(byId.values())
            .sort((left, right) => String(left?.properties?.id || '').localeCompare(String(right?.properties?.id || '')));
        logger.debug(`Found ${features.length} POI features from ${poiSources.length} sources`);

        const refreshSignature = buildPoiRefreshSignature(features, poiSources.length);
        const previousSignature = POI_REFRESH_SIGNATURE_BY_MAP.get(map);
        if (previousSignature === refreshSignature) {
            logger.debug(`Skipped POI source update (unchanged payload, ${features.length} features)`);
            return;
        }

        // Update the places source with new data
        // Note: Source and layer are created during map initialization in useMapLogic
        map.setGeoJsonSourceData('places', {
            type: 'FeatureCollection',
            features: features
        });
        POI_REFRESH_SIGNATURE_BY_MAP.set(map, refreshSignature);
        logger.debug(`Updated places source with ${features.length} features`);
    }
}

const deriveHarmonizedLabelHaloColor = (
    palette: Record<string, string>,
    popupStyle: PopupStyle
): string => {
    const normalizedPalette: Record<string, string> = {};
    Object.entries(palette || {}).forEach(([key, value]) => {
        const normalized = normalizeHexColor(value);
        if (normalized) {
            normalizedPalette[key] = normalized;
        }
    });

    return deriveHarmonizedHaloFromPalette(normalizedPalette, popupStyle);
};
