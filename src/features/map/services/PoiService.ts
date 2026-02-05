import { IMapController } from '@core/interfaces/IMapController';
import { OSM_MAPPING, CATEGORY_COLORS, getCategoryColor } from '@/constants';
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

const DEFAULT_CATEGORY_GROUP_COLOR = getCategoryColor('__unknown_category__');

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (color?: string): string | null => {
    if (!color) return null;

    const trimmed = color.trim();
    if (!HEX_COLOR_PATTERN.test(trimmed)) return null;

    if (trimmed.length === 4) {
        const [, r, g, b] = trimmed;
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }

    return trimmed.toLowerCase();
};

const toLinearSrgb = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const getRelativeLuminance = (color: string): number => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return 0;

    const colorValue = parseInt(normalized.slice(1), 16);
    const r = toLinearSrgb((colorValue >> 16) & 255);
    const g = toLinearSrgb((colorValue >> 8) & 255);
    const b = toLinearSrgb(colorValue & 255);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getContrastRatio = (foreground: string, background: string): number => {
    const foregroundLuminance = getRelativeLuminance(foreground);
    const backgroundLuminance = getRelativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
};

const getMostContrastingColor = (textColor: string, candidates: Array<string | undefined>): string => {
    const normalizedText = normalizeHexColor(textColor);
    const normalizedCandidates = candidates
        .map(normalizeHexColor)
        .filter((candidate): candidate is string => Boolean(candidate));

    if (normalizedCandidates.length === 0) {
        return '#ffffff';
    }

    if (!normalizedText) {
        return normalizedCandidates[0];
    }

    return normalizedCandidates.reduce((bestCandidate, currentCandidate) =>
        getContrastRatio(normalizedText, currentCandidate) > getContrastRatio(normalizedText, bestCandidate)
            ? currentCandidate
            : bestCandidate
    );
};

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

                const fallbackTextColor = palette.text || popupStyle.textColor || '#202124';
                const categoryColor = resolveCategoryGroupColor(subcategory, category);
                const labelColor = categoryColor || fallbackTextColor;
                const haloColor = getMostContrastingColor(labelColor, [
                    palette.land,
                    popupStyle.backgroundColor,
                    '#ffffff'
                ]);

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
