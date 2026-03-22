import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { IMapController, MapEvent } from '@core/interfaces/IMapController';
import { MapLibreAdapter } from '../services/MapLibreAdapter';
import { PopupGenerator } from '../services/PopupGenerator';
import { PaletteService } from '../services/PaletteService';
import { PoiService } from '../services/PoiService';
import { PoiDetailsService } from '../services/PoiDetailsService';
import { PoiRegistryService } from '../services/PoiRegistryService';
import { PoiSearchService } from '../services/PoiSearchService';
import { resolvePoiRemixTarget } from '../services/poiIconResolver';
import { derivePalette } from '@core/services/defaultThemes';
import { DEFAULT_STYLE_URL } from '@/constants';
import { getCanonicalCategoryGroups } from '@shared/taxonomy/poiTaxonomy';
import {
    IconDefinition,
    LoadedPoiSearchItem,
    PoiMapVisibilityFilters,
    PoiPopupDetails,
    PopupStyle
} from '@/types';
import { createLogger } from '@core/logger';
import { isMapLibreStyleJson, sanitizeMapLibreStyleForRuntime } from '../services/styleCompiler';

const logger = createLogger('MapLogicHook');
const NUMERIC_LAYOUT_PROPERTIES = new Set([
    'icon-rotate',
    'icon-size',
    'icon-padding',
    'symbol-sort-key',
    'symbol-spacing',
    'text-rotate',
    'text-size',
    'text-max-width',
    'text-line-height',
    'text-letter-spacing',
    'text-max-angle',
    'text-radial-offset',
    'text-padding'
]);
const NUMERIC_PAINT_PROPERTIES = new Set([
    'background-opacity',
    'circle-radius',
    'circle-blur',
    'circle-opacity',
    'circle-stroke-width',
    'circle-stroke-opacity',
    'fill-opacity',
    'fill-extrusion-height',
    'fill-extrusion-base',
    'fill-extrusion-opacity',
    'fill-sort-key',
    'heatmap-radius',
    'heatmap-weight',
    'heatmap-intensity',
    'heatmap-opacity',
    'hillshade-exaggeration',
    'hillshade-illumination-direction',
    'icon-opacity',
    'line-width',
    'line-gap-width',
    'line-offset',
    'line-opacity',
    'line-blur',
    'line-sort-key',
    'raster-opacity',
    'raster-hue-rotate',
    'raster-saturation',
    'raster-brightness-min',
    'raster-brightness-max',
    'raster-contrast',
    'raster-fade-duration',
    'text-opacity',
    'text-halo-width',
    'text-halo-blur'
]);
const NUMERIC_FILTER_COMPARISON_OPERATORS = new Set(['<', '<=', '>', '>=']);
const POI_MOVEEND_REFRESH_DEBOUNCE_MS = 180;
const POI_FACET_WARM_CONCURRENCY = 2;
const POI_FACET_WARM_QUEUE_LIMIT = 60;
const POI_INTERACTION_LAYER_ID = 'unclustered-point';
const POI_SYMBOL_LAYER_PREFIX = 'unclustered-point--';
const POI_FALLBACK_LAYER_PREFIX = 'unclustered-point-fallback--';
const POI_CATEGORY_GROUPS = getCanonicalCategoryGroups();
const POI_VISIBILITY_FEATURE_STATE_KEY = 'mapVisible';
const POI_VIEWPORT_COLLECTION_BUFFER_RATIO = 0.35;
const POI_VIEWPORT_ZOOM_BUCKET_STEP = 0.5;
const POI_VIEWPORT_MIN_LNG_PADDING = 0.003;
const POI_VIEWPORT_MIN_LAT_PADDING = 0.002;
const POI_ICON_VISIBLE_ALPHA_THRESHOLD = 16;
const POI_ICON_MIN_VISIBLE_PIXEL_COUNT = 12;

const toPoiLayerToken = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const getPoiSymbolLayerId = (category: string): string =>
    `${POI_SYMBOL_LAYER_PREFIX}${toPoiLayerToken(category)}`;

const getPoiFallbackLayerId = (category: string): string =>
    `${POI_FALLBACK_LAYER_PREFIX}${toPoiLayerToken(category)}`;

const getPoiVisualLayerIds = (): string[] =>
    POI_CATEGORY_GROUPS.flatMap((category) => [
        getPoiFallbackLayerId(category),
        getPoiSymbolLayerId(category)
    ]);

const POI_FALLBACK_DOT_IMAGE_ID = 'poi-dot-fallback-sdf';

type PoiViewportBounds = {
    west: number;
    south: number;
    east: number;
    north: number;
};

type PoiViewportSnapshot = {
    bounds: PoiViewportBounds;
    bufferedBounds: PoiViewportBounds;
    zoomBucket: number;
};

const normalizePoiViewportBounds = (rawBounds: any): PoiViewportBounds | null => {
    if (!rawBounds) return null;

    const west = Number(rawBounds.getWest?.());
    const south = Number(rawBounds.getSouth?.());
    const east = Number(rawBounds.getEast?.());
    const north = Number(rawBounds.getNorth?.());

    if (![west, south, east, north].every(Number.isFinite)) {
        return null;
    }

    if (east <= west || north <= south) {
        return null;
    }

    return { west, south, east, north };
};

const expandPoiViewportBounds = (
    bounds: PoiViewportBounds,
    bufferRatio = POI_VIEWPORT_COLLECTION_BUFFER_RATIO
): PoiViewportBounds => {
    const lngSpan = Math.max(bounds.east - bounds.west, 0);
    const latSpan = Math.max(bounds.north - bounds.south, 0);
    const lngPad = Math.max(lngSpan * bufferRatio, POI_VIEWPORT_MIN_LNG_PADDING);
    const latPad = Math.max(latSpan * bufferRatio, POI_VIEWPORT_MIN_LAT_PADDING);

    return {
        west: bounds.west - lngPad,
        south: bounds.south - latPad,
        east: bounds.east + lngPad,
        north: bounds.north + latPad
    };
};

const toPoiZoomBucket = (zoom: number): number =>
    Math.round(zoom / POI_VIEWPORT_ZOOM_BUCKET_STEP) * POI_VIEWPORT_ZOOM_BUCKET_STEP;

const capturePoiViewportSnapshot = (rawMap: any): PoiViewportSnapshot | null => {
    if (!rawMap) return null;

    const bounds = normalizePoiViewportBounds(rawMap.getBounds?.());
    const zoom = Number(rawMap.getZoom?.());
    if (!bounds || !Number.isFinite(zoom)) {
        return null;
    }

    return {
        bounds,
        bufferedBounds: expandPoiViewportBounds(bounds),
        zoomBucket: toPoiZoomBucket(zoom)
    };
};

const isPoiViewportWithinBufferedBounds = (
    viewport: PoiViewportBounds,
    bufferedBounds: PoiViewportBounds
): boolean => (
    viewport.west >= bufferedBounds.west &&
    viewport.south >= bufferedBounds.south &&
    viewport.east <= bufferedBounds.east &&
    viewport.north <= bufferedBounds.north
);

const shouldSkipPoiViewportRefresh = (
    rawMap: any,
    lastSnapshot: PoiViewportSnapshot | null
): boolean => {
    if (!rawMap || !lastSnapshot) return false;

    const currentSnapshot = capturePoiViewportSnapshot(rawMap);
    if (!currentSnapshot) return false;

    if (currentSnapshot.zoomBucket !== lastSnapshot.zoomBucket) {
        return false;
    }

    return isPoiViewportWithinBufferedBounds(
        currentSnapshot.bounds,
        lastSnapshot.bufferedBounds
    );
};

const buildPoiFeatureVisibleExpression = () => ([
    'boolean',
    ['feature-state', POI_VISIBILITY_FEATURE_STATE_KEY],
    true
]);

const buildPoiInteractionLayer = () => ({
    id: POI_INTERACTION_LAYER_ID,
    type: 'circle' as const,
    source: 'places',
    minzoom: 13,
    paint: {
        'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 10,
            15, 14,
            18, 18
        ],
        'circle-color': '#000000',
        'circle-opacity': 0
    }
});

const buildPoiVisibilityOpacityExpression = () => ([
    'case',
    buildPoiFeatureVisibleExpression(),
    1,
    0
]);

const buildPoiSymbolLayer = (category: string) => ({
    id: getPoiSymbolLayerId(category),
    type: 'symbol' as const,
    source: 'places',
    minzoom: 13,
    filter: [
        'all',
        ['==', ['get', 'category'], category],
        ['==', ['get', 'hasRenderableCustomIconImage'], true]
    ],
    layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.15,
            14, 0.25,
            16, 0.35,
            18, 0.45
        ],
        'icon-allow-overlap': false,
        'icon-optional': false,
        'symbol-spacing': 250,
        'text-field': ['get', 'title'],
        'text-font': ['Noto Sans Regular'],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 9,
            15, 11,
            18, 13
        ],
        'text-optional': false,
        'text-allow-overlap': false
    },
    paint: {
        'icon-opacity': buildPoiVisibilityOpacityExpression(),
        'icon-color': ['coalesce', ['get', 'textColor'], '#6b7280'],
        'icon-halo-color': ['coalesce', ['get', 'haloColor'], '#ffffff'],
        'icon-halo-width': 1,
        'text-color': ['get', 'textColor'],
        'text-opacity': buildPoiVisibilityOpacityExpression(),
        'text-halo-color': ['get', 'haloColor'],
        'text-halo-width': 2
    }
});

const buildPoiFallbackLayer = (category: string) => ({
    id: getPoiFallbackLayerId(category),
    type: 'symbol' as const,
    source: 'places',
    minzoom: 13,
    filter: [
        'all',
        ['==', ['get', 'category'], category],
        ['!=', ['get', 'hasRenderableCustomIconImage'], true]
    ],
    layout: {
        'icon-image': POI_FALLBACK_DOT_IMAGE_ID,
        'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.55,
            15, 0.7,
            18, 0.85
        ],
        'icon-allow-overlap': false,
        'icon-optional': false,
        'symbol-spacing': 250,
        'text-field': ['get', 'title'],
        'text-font': ['Noto Sans Regular'],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 9,
            15, 11,
            18, 13
        ],
        'text-optional': false,
        'text-allow-overlap': false
    },
    paint: {
        'icon-opacity': buildPoiVisibilityOpacityExpression(),
        'icon-color': ['coalesce', ['get', 'textColor'], '#6b7280'],
        'icon-halo-color': ['coalesce', ['get', 'haloColor'], '#ffffff'],
        'icon-halo-width': 1,
        'text-color': ['get', 'textColor'],
        'text-opacity': buildPoiVisibilityOpacityExpression(),
        'text-halo-color': ['get', 'haloColor'],
        'text-halo-width': 2
    }
});

const buildPoiFallbackDotImage = (fillColor = '#000000'): ImageData | null => {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    const size = 20;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.clearRect(0, 0, size, size);
    context.beginPath();
    context.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
    context.fillStyle = fillColor;
    context.fill();

    return context.getImageData(0, 0, size, size);
};

export const hasRenderableIconPixels = (imageData?: ImageData | null): boolean => {
    if (!imageData?.data?.length) return false;

    let visiblePixelCount = 0;
    for (let index = 3; index < imageData.data.length; index += 4) {
        if (imageData.data[index] >= POI_ICON_VISIBLE_ALPHA_THRESHOLD) {
            visiblePixelCount += 1;
            if (visiblePixelCount >= POI_ICON_MIN_VISIBLE_PIXEL_COUNT) {
                return true;
            }
        }
    }

    return false;
};

export const buildPopupRenderableIconMap = (
    feature: any,
    activeIcons: Record<string, IconDefinition>,
    invalidIconKeys: Set<string>
): Record<string, IconDefinition> => {
    const iconKey = String(feature?.properties?.iconKey || '');
    if (!iconKey || !invalidIconKeys.has(iconKey)) {
        return activeIcons;
    }

    const keysToNullify = new Set(
        [iconKey, feature?.properties?.subcategory, feature?.properties?.category]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    );

    let mutated = false;
    const nextIcons: Record<string, IconDefinition> = { ...activeIcons };
    keysToNullify.forEach((key) => {
        const iconDef = nextIcons[key];
        if (!iconDef?.imageUrl) return;
        mutated = true;
        nextIcons[key] = {
            ...iconDef,
            imageUrl: null
        };
    });

    return mutated ? nextIcons : activeIcons;
};

const wrapNumericInputExpression = (input: any) => {
    if (!Array.isArray(input) || input.length === 0) return input;
    const operator = input[0];
    if (operator === 'coalesce' || operator === 'to-number') return input;
    if (operator === 'get' || operator === 'feature-state') {
        return ['coalesce', ['to-number', input], 0];
    }
    return input;
};

const sanitizeExpressionTree = (value: any): any => {
    if (!Array.isArray(value) || value.length === 0) return value;

    const operator = value[0];
    if (operator === 'interpolate') {
        const next = [...value];
        if (next.length > 2) {
            next[2] = wrapNumericInputExpression(sanitizeExpressionTree(next[2]));
        }
        for (let index = 3; index < next.length; index += 1) {
            next[index] = sanitizeExpressionTree(next[index]);
        }
        return next;
    }

    if (operator === 'step') {
        const next = [...value];
        if (next.length > 1) {
            next[1] = wrapNumericInputExpression(sanitizeExpressionTree(next[1]));
        }
        for (let index = 2; index < next.length; index += 1) {
            next[index] = sanitizeExpressionTree(next[index]);
        }
        return next;
    }

    return value.map((item, index) => (index === 0 ? item : sanitizeExpressionTree(item)));
};

const getNumericPropertyFallback = (propertyName: string): number => {
    if (propertyName === 'symbol-spacing') return 250;
    return 0;
};

const normalizeNumericProperty = (value: any, propertyName: string): any => {
    const fallback = getNumericPropertyFallback(propertyName);
    if (value === null || value === undefined) return fallback;

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    if (!Array.isArray(value)) {
        return fallback;
    }

    if (value.length === 0 || typeof value[0] !== 'string') {
        return fallback;
    }

    const sanitizedExpression = sanitizeExpressionTree(value);
    if (!Array.isArray(sanitizedExpression) || sanitizedExpression.length === 0) {
        return fallback;
    }

    const operator = sanitizedExpression[0];
    // Direct numeric fetches are the most common source of runtime null warnings.
    if (operator === 'get' || operator === 'feature-state') {
        return ['coalesce', ['to-number', sanitizedExpression], fallback];
    }

    // Preserve already-normalized expressions and keep other expression forms intact.
    if (
        operator === 'coalesce' &&
        Array.isArray(sanitizedExpression[1]) &&
        sanitizedExpression[1][0] === 'to-number'
    ) {
        return sanitizedExpression;
    }

    return sanitizedExpression;
};

const sanitizeLayerProperties = (
    properties: Record<string, any> | undefined,
    numericProperties: Set<string>
) => {
    if (!properties || typeof properties !== 'object') return properties;
    const normalized: Record<string, any> = { ...properties };
    Object.keys(normalized).forEach((key) => {
        if (numericProperties.has(key)) {
            normalized[key] = normalizeNumericProperty(normalized[key], key);
        } else {
            normalized[key] = sanitizeExpressionTree(normalized[key]);
        }
    });
    return normalized;
};

const isToNumberCoalesceExpression = (value: any): boolean =>
    Array.isArray(value) &&
    value[0] === 'coalesce' &&
    Array.isArray(value[1]) &&
    value[1][0] === 'to-number';

const normalizeFilterNumericOperand = (value: any): any => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    }

    if (!Array.isArray(value) || value.length === 0) return value;
    if (isToNumberCoalesceExpression(value)) return value;

    if (value[0] === 'get' || value[0] === 'feature-state' || value[0] === 'to-number') {
        return ['coalesce', ['to-number', value], 0];
    }

    return value;
};

const sanitizeLayerFilter = (filter: any): any => {
    if (!Array.isArray(filter) || filter.length === 0) return filter;

    const operator = filter[0];
    if (NUMERIC_FILTER_COMPARISON_OPERATORS.has(operator) && filter.length >= 3) {
        const left = normalizeFilterNumericOperand(sanitizeLayerFilter(filter[1]));
        const right = normalizeFilterNumericOperand(sanitizeLayerFilter(filter[2]));
        const next = [operator, left, right];
        for (let index = 3; index < filter.length; index += 1) {
            next.push(sanitizeLayerFilter(filter[index]));
        }
        return next;
    }

    return filter.map((item, index) => (index === 0 ? item : sanitizeLayerFilter(item)));
};

// Exported for tests and for pre-loading style hardening against remote styles
// that use numeric expressions over nullable feature properties.
export const sanitizeMapStyleNumericExpressions = (styleJson: any): any => {
    if (!styleJson || typeof styleJson !== 'object' || !Array.isArray(styleJson.layers)) {
        return styleJson;
    }

    return {
        ...styleJson,
        layers: styleJson.layers.map((layer: any) => {
            const normalizedLayout = sanitizeLayerProperties(layer.layout, NUMERIC_LAYOUT_PROPERTIES);
            const normalizedPaint = sanitizeLayerProperties(layer.paint, NUMERIC_PAINT_PROPERTIES);
            const normalizedFilter = sanitizeLayerFilter(layer.filter);

            return {
                ...layer,
                ...(normalizedLayout ? { layout: normalizedLayout } : {}),
                ...(normalizedPaint ? { paint: normalizedPaint } : {}),
                ...(normalizedFilter !== undefined ? { filter: normalizedFilter } : {})
            };
        })
    };
};

const hasRenderableStyleContent = (styleJson: any): boolean => {
    if (!isMapLibreStyleJson(styleJson)) return false;
    const hasLayers = Array.isArray(styleJson.layers) && styleJson.layers.length > 0;
    const hasSources = !!styleJson.sources
        && typeof styleJson.sources === 'object'
        && Object.keys(styleJson.sources).length > 0;
    return hasLayers && hasSources;
};

export const shouldApplyPaletteOverrides = (mapStyleJson: any): boolean => !hasRenderableStyleContent(mapStyleJson);

export const resolveRenderStyle = (mapStyleJson: any, baseStyle: any): any => {
    const sanitizeForRender = (style: any) => {
        const runtimeSanitized = sanitizeMapLibreStyleForRuntime(style) || style;
        return sanitizeMapStyleNumericExpressions(runtimeSanitized);
    };

    if (hasRenderableStyleContent(mapStyleJson)) {
        return sanitizeForRender(mapStyleJson);
    }
    return sanitizeForRender(baseStyle);
};

export const resolveRenderStyleForDisplay = (
    mapStyleJson: any,
    baseStyle: any,
    palette?: Record<string, string>
): any => {
    const resolvedStyle = resolveRenderStyle(mapStyleJson, baseStyle);
    if (!shouldApplyPaletteOverrides(mapStyleJson) || !palette) {
        return resolvedStyle;
    }

    return PaletteService.buildPaletteStyledStyle(resolvedStyle, palette);
};

// Helper for safe style loading (moved from MapView)
const loadSafeStyle = async (styleUrl: string) => {
    try {
        const res = await fetch(styleUrl);
        if (!res.ok) throw new Error("Failed to fetch style");
        const styleJson = await res.json();
        return sanitizeMapStyleNumericExpressions(styleJson);
    } catch (e) {
        logger.error("Style Load Failed", e);
        return { version: 8, sources: {}, layers: [] };
    }
};

interface UseMapLogicProps {
    containerRef: React.RefObject<HTMLElement>;
    mapStyleJson: any;
    styleId?: string | null;
    palette?: Record<string, string>;
    activeIcons: Record<string, IconDefinition>;
    popupStyle: PopupStyle;
    isDefaultTheme: boolean;
    onEditIcon?: (category: string) => void;
    onMapLoad?: (map: any) => void;
    onLoadedPoisChange?: (pois: LoadedPoiSearchItem[]) => void;
    poiFocusRequest?: { id: string; nonce: number } | null;
    poiMapVisibilityFilters: PoiMapVisibilityFilters;
}

// Exported for unit tests: identifies which custom icons must be removed/loaded
// when active style icon set changes.
export const buildIconSyncPlan = (
    loadedUrls: Record<string, string>,
    icons: Record<string, IconDefinition>
): { desiredIconUrls: Record<string, string>; staleKeys: string[] } => {
    const desiredIconUrls: Record<string, string> = {};
    Object.entries(icons).forEach(([category, iconDef]) => {
        if (iconDef?.imageUrl) {
            desiredIconUrls[category] = iconDef.imageUrl;
        }
    });

    const staleKeys = Object.keys(loadedUrls).filter((category) => !desiredIconUrls[category]);

    return { desiredIconUrls, staleKeys };
};

type RectLike = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

type PopupViewportConstraints = {
    maxPopupWidth: number;
    maxContentHeight: number;
};

const POPUP_VIEWPORT_MARGIN = 10;
const POPUP_CLOSE_BUTTON_OVERHANG = 14;
const POPUP_ARROW_HEIGHT = 12;

export const computePopupViewportPanDelta = (
    popupRect: RectLike,
    viewportRect: RectLike,
    margin = 20
): [number, number] => {
    const safeLeft = viewportRect.left + margin;
    const safeTop = viewportRect.top + margin;
    const safeRight = viewportRect.right - margin;
    const safeBottom = viewportRect.bottom - margin;
    const popupWidth = popupRect.right - popupRect.left;
    const popupHeight = popupRect.bottom - popupRect.top;
    const safeWidth = Math.max(0, safeRight - safeLeft);
    const safeHeight = Math.max(0, safeBottom - safeTop);

    let deltaX = 0;
    if (popupWidth > safeWidth) {
        deltaX = Math.round(((popupRect.left + popupRect.right) / 2) - ((safeLeft + safeRight) / 2));
    } else if (popupRect.left < safeLeft) {
        deltaX = -Math.round(safeLeft - popupRect.left);
    } else if (popupRect.right > safeRight) {
        deltaX = Math.round(popupRect.right - safeRight);
    }

    let deltaY = 0;
    if (popupHeight > safeHeight) {
        deltaY = Math.round(((popupRect.top + popupRect.bottom) / 2) - ((safeTop + safeBottom) / 2));
    } else if (popupRect.top < safeTop) {
        deltaY = -Math.round(safeTop - popupRect.top);
    } else if (popupRect.bottom > safeBottom) {
        deltaY = Math.round(popupRect.bottom - safeBottom);
    }

    const maxDeltaX = Math.max(0, Math.round(safeWidth || (viewportRect.right - viewportRect.left)));
    const maxDeltaY = Math.max(0, Math.round(safeHeight || (viewportRect.bottom - viewportRect.top)));

    return [
        Math.max(-maxDeltaX, Math.min(maxDeltaX, deltaX)),
        Math.max(-maxDeltaY, Math.min(maxDeltaY, deltaY))
    ];
};

export const computePopupViewportConstraints = (
    viewportRect: RectLike,
    margin = POPUP_VIEWPORT_MARGIN
): PopupViewportConstraints => {
    const viewportWidth = Math.max(0, viewportRect.right - viewportRect.left);
    const viewportHeight = Math.max(0, viewportRect.bottom - viewportRect.top);
    const isNarrowViewport = viewportWidth <= 640;
    const availableWidth = Math.max(180, Math.floor(viewportWidth - (margin * 2) - POPUP_CLOSE_BUTTON_OVERHANG));
    const availableContentHeight = Math.max(
        160,
        Math.floor(viewportHeight - (margin * 2) - POPUP_CLOSE_BUTTON_OVERHANG - POPUP_ARROW_HEIGHT)
    );

    return {
        maxPopupWidth: Math.min(isNarrowViewport ? 344 : 400, availableWidth),
        maxContentHeight: isNarrowViewport ? Math.min(availableContentHeight, 308) : availableContentHeight
    };
};

export const shouldDeferPopupViewportFit = (
    popupRect: RectLike,
    viewportRect: RectLike
): boolean => {
    const popupWidth = popupRect.right - popupRect.left;
    const popupHeight = popupRect.bottom - popupRect.top;
    if (!Number.isFinite(popupWidth) || !Number.isFinite(popupHeight) || popupWidth <= 0 || popupHeight <= 0) {
        return true;
    }

    const viewportWidth = Math.max(0, viewportRect.right - viewportRect.left);
    const viewportHeight = Math.max(0, viewportRect.bottom - viewportRect.top);

    return (
        popupRect.right < viewportRect.left - viewportWidth ||
        popupRect.left > viewportRect.right + viewportWidth ||
        popupRect.bottom < viewportRect.top - viewportHeight ||
        popupRect.top > viewportRect.bottom + viewportHeight
    );
};

export const useMapLogic = ({
    containerRef,
    mapStyleJson,
    styleId,
    palette: paletteProp,
    activeIcons,
    popupStyle,
    isDefaultTheme,
    onEditIcon,
    onMapLoad,
    onLoadedPoisChange,
    poiFocusRequest,
    poiMapVisibilityFilters
}: UseMapLogicProps) => {
    const mapController = useRef<IMapController | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [isInitialVisualReady, setIsInitialVisualReady] = useState(false);
    const [baseStyle, setBaseStyle] = useState<any>(null);
    const loadedIconUrls = useRef<Record<string, string>>({});
    const activeStyleRef = useRef<string | null | undefined>(styleId);
    const popupRequestSequence = useRef(0);
    const suppressedMoveendRefreshCount = useRef(0);
    const skipNextStyleApplyRef = useRef(false);
    const loadedPoiFeaturesRef = useRef<Map<string, any>>(new Map());
    const viewportPoiIdsRef = useRef<Set<string>>(new Set());
    const lastPublishedPoiSnapshotRef = useRef('');
    const openPoiFeatureRef = useRef<((feature: any, anchorCoords?: [number, number]) => void) | null>(null);
    const invalidIconKeysRef = useRef<Set<string>>(new Set());
    const renderableCustomIconKeysRef = useRef<Set<string>>(new Set());
    const handledPoiFocusRequestRef = useRef<number | null>(null);
    const latestLoadedPoisCallbackRef = useRef(onLoadedPoisChange);
    const latestPoiCollectionInputsRef = useRef({ activeIcons, palette: paletteProp, popupStyle });
    const poiMapVisibilityFiltersRef = useRef(poiMapVisibilityFilters);
    const poiFacetWarmQueueRef = useRef<string[]>([]);
    const poiFacetWarmPendingRef = useRef<Set<string>>(new Set());
    const poiFacetWarmActiveCountRef = useRef(0);
    const scheduledPoiSnapshotTimeoutRef = useRef<number | null>(null);
    const popupLayoutObserverRef = useRef<ResizeObserver | null>(null);
    const popupObservedElementRef = useRef<HTMLElement | null>(null);
    const lastAppliedPoiFeatureVisibilityRef = useRef<Map<string, boolean>>(new Map());
    const lastPoiCollectionViewportRef = useRef<PoiViewportSnapshot | null>(null);

    const palette = useMemo(() => {
        if (paletteProp) return paletteProp;
        return derivePalette(mapStyleJson);
    }, [mapStyleJson, paletteProp]);

    useEffect(() => {
        latestLoadedPoisCallbackRef.current = onLoadedPoisChange;
    }, [onLoadedPoisChange]);

    useEffect(() => {
        latestPoiCollectionInputsRef.current = {
            activeIcons,
            palette,
            popupStyle
        };
    }, [activeIcons, palette, popupStyle]);

    useEffect(() => {
        poiMapVisibilityFiltersRef.current = poiMapVisibilityFilters;
    }, [poiMapVisibilityFilters]);

    const clearScheduledPoiSnapshot = useCallback(() => {
        if (scheduledPoiSnapshotTimeoutRef.current !== null) {
            window.clearTimeout(scheduledPoiSnapshotTimeoutRef.current);
            scheduledPoiSnapshotTimeoutRef.current = null;
        }
    }, []);

    const publishLoadedPoisSnapshot = useCallback((controller: IMapController) => {
        const rawMap = controller.getRawMap?.();
        if (!rawMap) {
            loadedPoiFeaturesRef.current = new Map();
            viewportPoiIdsRef.current = new Set();
            if (lastPublishedPoiSnapshotRef.current !== '__empty__') {
                lastPublishedPoiSnapshotRef.current = '__empty__';
                latestLoadedPoisCallbackRef.current?.([]);
            }
            return;
        }

        const registryFeatures = Array.from(loadedPoiFeaturesRef.current.values());
        if (registryFeatures.length === 0) {
            if (lastPublishedPoiSnapshotRef.current !== '__empty__') {
                lastPublishedPoiSnapshotRef.current = '__empty__';
                latestLoadedPoisCallbackRef.current?.([]);
            }
            return;
        }

        const shownIds = new Set<string>();
        registryFeatures.forEach((feature) => {
            const id = PoiRegistryService.resolveFeatureId(feature);
            if (!id) return;
            if (PoiSearchService.matchesMapVisibilityFilters(feature, poiMapVisibilityFiltersRef.current)) {
                shownIds.add(id);
            }
        });

        const nextItems = PoiSearchService.buildLoadedPoiItems(registryFeatures, shownIds);
        const snapshotSignature = nextItems
            .map((item) =>
                [
                    item.id,
                    item.shownOnMap ? '1' : '0',
                    item.hasPhoto ? '1' : '0',
                    item.hasWebsite ? '1' : '0',
                    item.isOpenNow ? '1' : '0',
                    item.address || '',
                    item.website || '',
                    item.openingHours || ''
                ].join(':')
            )
            .join('|');

        if (snapshotSignature === lastPublishedPoiSnapshotRef.current) {
            return;
        }

        lastPublishedPoiSnapshotRef.current = snapshotSignature;
        latestLoadedPoisCallbackRef.current?.(nextItems);
    }, []);

    const scheduleLoadedPoisSnapshotPublish = useCallback((controller: IMapController, delay = 0) => {
        clearScheduledPoiSnapshot();

        if (delay <= 0) {
            publishLoadedPoisSnapshot(controller);
            return;
        }

        scheduledPoiSnapshotTimeoutRef.current = window.setTimeout(() => {
            scheduledPoiSnapshotTimeoutRef.current = null;
            publishLoadedPoisSnapshot(controller);
        }, delay);
    }, [clearScheduledPoiSnapshot, publishLoadedPoisSnapshot]);

    const syncPoiRegistryToMap = useCallback((controller: IMapController) => {
        controller.setGeoJsonSourceData(
            'places',
            PoiRegistryService.toFeatureCollection(loadedPoiFeaturesRef.current)
        );
    }, []);

    const applyPoiFeatureVisibilityStates = useCallback((controller: IMapController) => {
        const rawMap = controller.getRawMap?.();
        if (!rawMap?.setFeatureState) return;

        Array.from(loadedPoiFeaturesRef.current.values()).forEach((feature) => {
            const id = PoiRegistryService.resolveFeatureId(feature);
            if (!id) return;

            const nextVisible = PoiSearchService.matchesMapVisibilityFilters(
                feature,
                poiMapVisibilityFiltersRef.current
            );
            if (lastAppliedPoiFeatureVisibilityRef.current.get(id) === nextVisible) {
                return;
            }

            rawMap.setFeatureState(
                { source: 'places', id },
                { [POI_VISIBILITY_FEATURE_STATE_KEY]: nextVisible }
            );
            lastAppliedPoiFeatureVisibilityRef.current.set(id, nextVisible);
        });
    }, []);

    const applyPoiRenderableCustomIconState = useCallback(() => {
        let changed = false;

        loadedPoiFeaturesRef.current.forEach((feature) => {
            const properties = feature?.properties || {};
            const iconKey = String(properties.iconKey || '').trim();
            const hasCustomIconImage = properties.hasCustomIconImage === true;
            const nextRenderable = hasCustomIconImage && iconKey.length > 0 && renderableCustomIconKeysRef.current.has(iconKey);

            if (properties.hasRenderableCustomIconImage === nextRenderable) {
                return;
            }

            feature.properties = {
                ...properties,
                hasRenderableCustomIconImage: nextRenderable
            };
            changed = true;
        });

        return changed;
    }, []);

    const pumpPoiFacetWarmQueue = useCallback(() => {
        if (!mapController.current) return;

        while (
            poiFacetWarmActiveCountRef.current < POI_FACET_WARM_CONCURRENCY &&
            poiFacetWarmQueueRef.current.length > 0
        ) {
            const nextId = poiFacetWarmQueueRef.current.shift();
            if (!nextId) continue;

            const feature = loadedPoiFeaturesRef.current.get(nextId);
            if (!feature) continue;

            poiFacetWarmActiveCountRef.current += 1;
            void PoiDetailsService.getDetails(feature)
                .catch(() => undefined)
                .finally(() => {
                    poiFacetWarmActiveCountRef.current = Math.max(0, poiFacetWarmActiveCountRef.current - 1);
                    if (mapController.current) {
                        scheduleLoadedPoisSnapshotPublish(mapController.current, 90);
                    }
                    pumpPoiFacetWarmQueue();
                });
        }
    }, [scheduleLoadedPoisSnapshotPublish]);

    const schedulePoiFacetWarmup = useCallback((features: any[]) => {
        features.forEach((feature) => {
            if ((poiFacetWarmQueueRef.current.length + poiFacetWarmActiveCountRef.current) >= POI_FACET_WARM_QUEUE_LIMIT) return;
            const id = PoiRegistryService.resolveFeatureId(feature);
            if (!id) return;
            if (poiFacetWarmPendingRef.current.has(id)) return;
            if (PoiDetailsService.peekCachedDetails(feature)) return;

            poiFacetWarmPendingRef.current.add(id);
            poiFacetWarmQueueRef.current.push(id);
        });

        pumpPoiFacetWarmQueue();
    }, [pumpPoiFacetWarmQueue]);

    const refreshPoisFromViewport = useCallback((
        controller: IMapController,
        options: { force?: boolean } = {}
    ) => {
        const rawMap = controller.getRawMap?.();
        if (!options.force && shouldSkipPoiViewportRefresh(rawMap, lastPoiCollectionViewportRef.current)) {
            return false;
        }

        const latestInputs = latestPoiCollectionInputsRef.current;
        const discoveredFeatures = PoiService.collectData(
            controller,
            latestInputs.activeIcons,
            latestInputs.palette || {},
            latestInputs.popupStyle
        );
        viewportPoiIdsRef.current = new Set(
            discoveredFeatures
                .map((feature) => PoiRegistryService.resolveFeatureId(feature))
                .filter((id): id is string => Boolean(id))
        );
        const mergeResult = PoiRegistryService.mergeDiscoveredFeatures(
            loadedPoiFeaturesRef.current,
            discoveredFeatures,
            Date.now()
        );
        lastPoiCollectionViewportRef.current = capturePoiViewportSnapshot(rawMap);

        loadedPoiFeaturesRef.current = mergeResult.registry;
        const renderabilityChanged = applyPoiRenderableCustomIconState();

        if (mergeResult.changed || renderabilityChanged) {
            syncPoiRegistryToMap(controller);
            lastAppliedPoiFeatureVisibilityRef.current = new Map();
            window.setTimeout(() => {
                if (!mapController.current || mapController.current !== controller) return;
                applyPoiFeatureVisibilityStates(controller);
            }, 0);
        }

        schedulePoiFacetWarmup(discoveredFeatures);
        if (mergeResult.changed || mergeResult.addedIds.length > 0) {
            publishLoadedPoisSnapshot(controller);
        }
        return true;
    }, [applyPoiFeatureVisibilityStates, applyPoiRenderableCustomIconState, publishLoadedPoisSnapshot, schedulePoiFacetWarmup, syncPoiRegistryToMap]);

    const applyPoiMapVisibilityFilters = useCallback((controller: IMapController) => {
        const rawMap = controller.getRawMap?.();
        if (!rawMap?.getLayer?.(POI_INTERACTION_LAYER_ID)) return;

        const interactionFilterExpression = PoiRegistryService.buildLayerVisibilityFilter(
            poiMapVisibilityFiltersRef.current
        );
        rawMap.setFilter?.(POI_INTERACTION_LAYER_ID, interactionFilterExpression);
        applyPoiFeatureVisibilityStates(controller);
        // Defer the expensive sidebar snapshot publish so the map visibility toggle
        // can land first without competing with a full loaded-POI recalculation.
        scheduleLoadedPoisSnapshotPublish(controller, 96);
    }, [applyPoiFeatureVisibilityStates, scheduleLoadedPoisSnapshotPublish]);

    const ensurePoiInfrastructure = useCallback((controller: IMapController) => {
        const rawMap = controller.getRawMap?.();
        if (!rawMap) return;

        if (!rawMap.getSource('places')) {
            rawMap.addSource('places', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                promoteId: 'id',
                cluster: false
            });
            logger.info('Created "places" source on map load');
        }

        if (!rawMap.getLayer(POI_INTERACTION_LAYER_ID)) {
            rawMap.addLayer(buildPoiInteractionLayer());
            logger.info('Created "unclustered-point" interaction layer on map load');
        }

        if (!controller.hasImage(POI_FALLBACK_DOT_IMAGE_ID)) {
            const dotImage = buildPoiFallbackDotImage();
            if (dotImage) {
                controller.addImage(POI_FALLBACK_DOT_IMAGE_ID, dotImage, { sdf: true });
            }
        }

        POI_CATEGORY_GROUPS.forEach((category) => {

            const layerId = getPoiSymbolLayerId(category);
            if (!rawMap.getLayer(layerId)) {
                rawMap.addLayer(buildPoiSymbolLayer(category));
            }

            const fallbackLayerId = getPoiFallbackLayerId(category);
            if (!rawMap.getLayer(fallbackLayerId)) {
                rawMap.addLayer(buildPoiFallbackLayer(category), layerId);
            }
        });

        if (POI_CATEGORY_GROUPS.some((category) => rawMap.getLayer(getPoiSymbolLayerId(category)))) {
            logger.info('Created category-specific POI symbol layers on map load');
        }

        PoiService.hideBaseMapPOILayers(controller);
    }, []);

    // 1. Initialize Map
    useEffect(() => {
        if (!containerRef.current) return;

        let active = true;
        setIsInitialVisualReady(false);

        const init = async () => {
            // In a real DI system, we'd get this from a context/provider
            const controller = new MapLibreAdapter();
            // We assign it immediately so cleanup can access it, but we strictly control init
            mapController.current = controller;

            const safeBase = await loadSafeStyle(DEFAULT_STYLE_URL);

            if (!active) {
                controller.dispose();
                return;
            }

            setBaseStyle(safeBase);

            const initialRenderStyle = resolveRenderStyleForDisplay(mapStyleJson, safeBase, palette);
            skipNextStyleApplyRef.current = true;

            controller.initialize(containerRef.current!, initialRenderStyle, () => {
                if (!active) return;
                ensurePoiInfrastructure(controller);

                setLoaded(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (active) {
                            setIsInitialVisualReady(true);
                        }
                    });
                });
                // Expose for testing
                (window as any).__map = controller.getRawMap?.();

                if (onMapLoad) {
                    // @ts-ignore - Adapter exposes raw map if needed, or we pass controller
                    onMapLoad(controller.getRawMap?.() || controller);
                }
            });
        };
        init();

        return () => {
            active = false;
            loadedPoiFeaturesRef.current = new Map();
            lastPublishedPoiSnapshotRef.current = '__empty__';
            poiFacetWarmQueueRef.current = [];
            poiFacetWarmPendingRef.current = new Set();
            poiFacetWarmActiveCountRef.current = 0;
            clearScheduledPoiSnapshot();
            lastAppliedPoiFeatureVisibilityRef.current = new Map();
            lastPoiCollectionViewportRef.current = null;
            popupLayoutObserverRef.current?.disconnect();
            popupLayoutObserverRef.current = null;
            popupObservedElementRef.current = null;
            latestLoadedPoisCallbackRef.current?.([]);
            mapController.current?.dispose();
        };
    }, [clearScheduledPoiSnapshot, ensurePoiInfrastructure]);

    useEffect(() => {
        if (!loaded || !mapController.current || !containerRef.current) return;
        const map = mapController.current.getRawMap?.();
        if (!map) return;
        const observer = new ResizeObserver(() => {
            map.resize();
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [loaded, containerRef]);

    const paletteOverrideMode = useMemo(
        () => shouldApplyPaletteOverrides(mapStyleJson),
        [mapStyleJson]
    );

    useEffect(() => {
        if (!loaded || !mapController.current || !baseStyle) return;
        if (!styleId && styleId !== null) return;

        const controller = mapController.current;
        const rawMap = controller.getRawMap?.();
        if (!rawMap) return;

        const styleToApply = resolveRenderStyleForDisplay(mapStyleJson, baseStyle, palette);
        if (skipNextStyleApplyRef.current) {
            skipNextStyleApplyRef.current = false;
            return;
        }

        try {
            controller.setStyle(styleToApply);
        } catch (error) {
            logger.error('Failed to apply generated style. Keeping current map style.', error);
            return;
        }

        const onStyleData = () => {
            const nextMap = controller.getRawMap?.();
            if (!nextMap) return;
            loadedPoiFeaturesRef.current = new Map();
            lastPublishedPoiSnapshotRef.current = '__empty__';
            poiFacetWarmQueueRef.current = [];
            poiFacetWarmPendingRef.current = new Set();
            poiFacetWarmActiveCountRef.current = 0;
            lastAppliedPoiFeatureVisibilityRef.current = new Map();
            lastPoiCollectionViewportRef.current = null;
            ensurePoiInfrastructure(controller);
            refreshPoisFromViewport(controller, { force: true });
            applyPoiMapVisibilityFilters(controller);

            const onIdleRefresh = () => {
                refreshPoisFromViewport(controller, { force: true });
                nextMap.off?.('idle', onIdleRefresh);
            };

            nextMap.on?.('idle', onIdleRefresh);
        };

        rawMap.once('styledata', onStyleData);
    }, [
        loaded,
        styleId,
        mapStyleJson,
        baseStyle,
        palette,
        ensurePoiInfrastructure,
        applyPoiMapVisibilityFilters,
        refreshPoisFromViewport
    ]);

    useEffect(() => {
        if (!loaded || !mapController.current) return;
        applyPoiMapVisibilityFilters(mapController.current);
    }, [loaded, poiMapVisibilityFilters, applyPoiMapVisibilityFilters]);

    // 3. Apply Palette Logic
    useEffect(() => {
        if (!loaded || !mapController.current || !palette || !paletteOverrideMode) return;
        const controller = mapController.current;

        // We apply palette when style matches or layers exist
        // For the adapter, we can fetch layers
        const apply = () => {
            PaletteService.applyPalette(controller, palette, controller.getLayers());
        };

        // Initial application
        apply();

        // Listen for style load (if adapter supported it fully)
        // For now, we rely on the React effect re-running when dependencies change

    }, [loaded, palette, popupStyle, paletteOverrideMode]); // Re-run when palette changes

    // Close stale popup UI when switching between themes/styles.
    useEffect(() => {
        if (!loaded || !mapController.current) {
            activeStyleRef.current = styleId;
            return;
        }

        if (activeStyleRef.current !== styleId) {
            popupRequestSequence.current += 1;
            mapController.current.removePopup();
            activeStyleRef.current = styleId;
        }
    }, [loaded, styleId]);

    // 4. Icon Management
    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;

        logger.debug('Icon loading effect triggered. Active icons:', Object.keys(activeIcons));

        const { desiredIconUrls, staleKeys } = buildIconSyncPlan(loadedIconUrls.current, activeIcons);

        staleKeys.forEach((category) => {
            if (controller.hasImage(category)) {
                controller.removeImage(category);
            }
            delete loadedIconUrls.current[category];
            invalidIconKeysRef.current.delete(category);
            renderableCustomIconKeysRef.current.delete(category);
            logger.debug(`Removed stale custom icon "${category}" after style change`);
        });

        if (applyPoiRenderableCustomIconState()) {
            syncPoiRegistryToMap(controller);
        }

        Object.entries(desiredIconUrls).forEach(([cat, url]) => {
            // Simple cache check
            if (
                loadedIconUrls.current[cat] === url
                && renderableCustomIconKeysRef.current.has(cat)
                && controller.hasImage(cat)
            ) {
                if (applyPoiRenderableCustomIconState()) {
                    syncPoiRegistryToMap(controller);
                }
                logger.trace(`Icon "${cat}" already loaded, skipping`);
                return;
            }

            // Load and resize image to 64x64 for proper scaling
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            img.onload = () => {
                try {
                    // Resize to 64x64 for consistent sizing
                    const targetSize = 64;
                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');

                    if (ctx) {
                        ctx.drawImage(img, 0, 0, targetSize, targetSize);

                        // Convert canvas to ImageData for MapLibre
                        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
                        loadedIconUrls.current[cat] = url;

                        if (!hasRenderableIconPixels(imageData)) {
                            invalidIconKeysRef.current.add(cat);
                            renderableCustomIconKeysRef.current.delete(cat);
                            if (applyPoiRenderableCustomIconState()) {
                                syncPoiRegistryToMap(controller);
                            }
                            logger.warn(`Loaded icon "${cat}" is blank/transparent; keeping fallback dot placeholder`);
                            return;
                        }

                        invalidIconKeysRef.current.delete(cat);
                        renderableCustomIconKeysRef.current.add(cat);
                        controller.addImage(cat, imageData);
                        if (applyPoiRenderableCustomIconState()) {
                            syncPoiRegistryToMap(controller);
                        }
                        logger.info(`Loaded and resized icon "${cat}" to ${targetSize}x${targetSize}`);
                    }
                } catch (e) {
                    invalidIconKeysRef.current.add(cat);
                    renderableCustomIconKeysRef.current.delete(cat);
                    loadedIconUrls.current[cat] = url;
                    if (applyPoiRenderableCustomIconState()) {
                        syncPoiRegistryToMap(controller);
                    }
                    logger.error(`Failed to resize icon "${cat}":`, e);
                }
            };
            img.onerror = (e) => {
                loadedIconUrls.current[cat] = url;
                invalidIconKeysRef.current.add(cat);
                renderableCustomIconKeysRef.current.delete(cat);
                if (applyPoiRenderableCustomIconState()) {
                    syncPoiRegistryToMap(controller);
                }
                logger.error(`Failed to load icon "${cat}":`, e);
            };
        });
    }, [activeIcons, applyPoiRenderableCustomIconState, loaded, syncPoiRegistryToMap]);

    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;

        const hideBasePoiLayers = () => {
            PoiService.hideBaseMapPOILayers(controller);
        };

        hideBasePoiLayers();
        controller.on('styledata', hideBasePoiLayers);

        return () => {
            controller.off('styledata', hideBasePoiLayers);
        };
    }, [loaded]);

    // 5. Popup Interaction
    // We bind the click listener ONCE
    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;

        const handleClick = (e: MapEvent) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const coords = feature.geometry.coordinates.slice() as [number, number];

            // Dynamic generation using the service
            // Need to capture the LATEST values of props (closure problem solved by refs in original, or dependencies here)
            // But 'on' is bound once. WE need to use a Ref for the current "ShowPopup" logic?
            // Or just re-bind listener? Re-binding is cleaner for this hook structure.
        };

        // Actually, to correctly access the latest 'popupStyle' and 'palette' inside the callback without re-binding constantly:
        // We can store them in a ref that the callback reads.
    }, [loaded]);

    // Ref-based accessors for event listener
    const latestState = useRef({ popupStyle, palette, activeIcons, isDefaultTheme, onEditIcon });
    useEffect(() => {
        latestState.current = { popupStyle, palette, activeIcons, isDefaultTheme, onEditIcon };
    }, [popupStyle, palette, activeIcons, isDefaultTheme, onEditIcon]);

    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;

        const resolveEditCategory = (
            icons: Record<string, IconDefinition>,
            feature?: any
        ) => resolvePoiRemixTarget(icons, {
            category: feature?.properties?.category,
            subcategory: feature?.properties?.subcategory,
            subclass: feature?.properties?.subclass,
            className: feature?.properties?.class,
            iconKey: feature?.properties?.iconKey
        });

        const openPoiFeature = (rawFeature: any, anchorCoords?: [number, number]) => {
            if (!rawFeature) return;
            const feature = [rawFeature].find((candidate) =>
                Boolean(resolveEditCategory(
                    latestState.current.activeIcons,
                    candidate
                ))
            ) || rawFeature;
            const featureCoords = (feature.geometry as any).coordinates.slice() as [number, number];
            const coords = anchorCoords || featureCoords;
            const state = latestState.current;
            const editTarget = resolveEditCategory(
                state.activeIcons,
                feature
            );
            const editDisabledReason = 'This POI does not map to a regeneratable icon in the current theme.';
            const popupRequestId = ++popupRequestSequence.current;
            const rawMap = controller.getRawMap?.();

            const bindPopupActions = (
                detailStatus: PoiPopupDetails = PoiDetailsService.buildInitialDetails(feature),
                attempt = 0
            ) => {
                const popupElement = controller.getPopupElement?.();
                const popupRoot = popupElement?.querySelector('[data-testid="poi-popup"]') as HTMLElement | null;
                const mapContainer = rawMap?.getContainer?.() as HTMLElement | null;

                if (!popupElement?.isConnected || !popupRoot?.isConnected) {
                    if (attempt < 10) {
                        window.setTimeout(() => bindPopupActions(detailStatus, attempt + 1), 30);
                    }
                    return;
                }

                if (mapContainer) {
                    const containerRect = mapContainer.getBoundingClientRect();
                    const popupRect = popupRoot.getBoundingClientRect();
                    if (shouldDeferPopupViewportFit(popupRect, containerRect)) {
                        if (attempt < 10) {
                            window.setTimeout(() => bindPopupActions(detailStatus, attempt + 1), 30);
                        }
                        return;
                    }
                }

                const fitPopupIntoViewport = () => {
                    if (!rawMap || !mapContainer || typeof rawMap.panBy !== 'function') return;

                    const containerRect = mapContainer.getBoundingClientRect();
                    const viewportWidth = Math.max(0, containerRect.right - containerRect.left);
                    const viewportMargin = viewportWidth <= 640 ? 16 : POPUP_VIEWPORT_MARGIN;
                    const popupContent = popupRoot.querySelector('[data-mapalchemist-popup-content="true"]') as HTMLDivElement | null;
                    const { maxPopupWidth, maxContentHeight } = computePopupViewportConstraints(
                        containerRect,
                        viewportMargin
                    );

                    popupRoot.style.width = `${maxPopupWidth}px`;
                    popupRoot.style.maxWidth = `${maxPopupWidth}px`;
                    popupRoot.style.minWidth = `${Math.min(260, maxPopupWidth)}px`;
                    if (popupContent) {
                        popupContent.style.maxHeight = `${maxContentHeight}px`;
                    }

                    PopupGenerator.syncFrameGeometry(popupRoot);
                    const popupRect = popupRoot.getBoundingClientRect();
                    if (shouldDeferPopupViewportFit(popupRect, containerRect)) {
                        if (attempt < 10) {
                            window.setTimeout(() => bindPopupActions(detailStatus, attempt + 1), 30);
                        }
                        return;
                    }
                    const closeButton = popupRoot.querySelector('#popup-close-btn') as HTMLButtonElement | null;
                    const closeRect = closeButton?.getBoundingClientRect();
                    const popupChromeRect = closeRect
                        ? {
                            top: Math.min(popupRect.top, closeRect.top),
                            right: Math.max(popupRect.right, closeRect.right),
                            bottom: Math.max(popupRect.bottom, closeRect.bottom),
                            left: Math.min(popupRect.left, closeRect.left)
                        }
                        : popupRect;
                    const [deltaX, deltaY] = computePopupViewportPanDelta(
                        popupChromeRect,
                        containerRect,
                        viewportMargin
                    );

                    if (deltaX !== 0 || deltaY !== 0) {
                        suppressedMoveendRefreshCount.current += 1;
                        rawMap.panBy([deltaX, deltaY], { duration: 0, animate: false });
                    }
                };
                const syncFrameAndViewport = () => {
                    PopupGenerator.syncFrameGeometry(popupRoot);
                    requestAnimationFrame(() => {
                        fitPopupIntoViewport();
                    });
                };

                const popupContent = popupRoot.querySelector('[data-mapalchemist-popup-content="true"]') as HTMLElement | null;
                if (typeof ResizeObserver !== 'undefined' && popupObservedElementRef.current !== popupRoot) {
                    popupLayoutObserverRef.current?.disconnect();
                    popupLayoutObserverRef.current = null;
                    popupObservedElementRef.current = popupRoot;

                    let resizeScheduled = false;
                    let lastObservedSize = '';
                    const observedElement = popupContent || popupRoot;
                    const observer = new ResizeObserver((entries) => {
                        const nextRect = entries[0]?.contentRect;
                        if (nextRect) {
                            const nextSize = `${Math.round(nextRect.width)}x${Math.round(nextRect.height)}`;
                            if (nextSize === lastObservedSize) {
                                return;
                            }
                            lastObservedSize = nextSize;
                        }
                        if (resizeScheduled) return;
                        resizeScheduled = true;
                        window.setTimeout(() => {
                            resizeScheduled = false;
                            if (!popupRoot.isConnected) return;
                            syncFrameAndViewport();
                        }, 48);
                    });
                    observer.observe(observedElement);
                    popupLayoutObserverRef.current = observer;
                }

                syncFrameAndViewport();
                const btn = popupRoot.querySelector('#popup-edit-btn') as HTMLButtonElement | null;
                if (!btn && attempt < 10) {
                    window.setTimeout(() => bindPopupActions(detailStatus, attempt + 1), 30);
                    return;
                }

                if (btn && state.onEditIcon) {
                    btn.setAttribute('data-edit-target', editTarget);
                    btn.disabled = !editTarget;
                    btn.style.opacity = editTarget ? '1' : '0.55';
                    btn.style.cursor = editTarget ? 'pointer' : 'not-allowed';
                    btn.title = editTarget ? 'Open this icon in the editor' : editDisabledReason;
                    btn.setAttribute('aria-label', editTarget ? 'Remix Icon' : editDisabledReason);
                    btn.onclick = () => {
                        if (!editTarget) return;
                        state.onEditIcon?.(editTarget);
                    };
                }

                const closeBtn = popupRoot.querySelector('#popup-close-btn') as HTMLButtonElement | null;
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        popupRequestSequence.current += 1;
                        popupLayoutObserverRef.current?.disconnect();
                        popupLayoutObserverRef.current = null;
                        popupObservedElementRef.current = null;
                        controller.removePopup();
                    };
                }

                const photoCandidates = detailStatus.photoCandidates || [];
                const photoBlock = popupRoot.querySelector('#poi-popup-photo-block') as HTMLDivElement | null;
                const photoImg = popupRoot.querySelector('#poi-popup-photo-img') as HTMLImageElement | null;
                const photoAttribution = popupRoot.querySelector('#poi-popup-photo-attribution') as HTMLDivElement | null;
                const photoAttributionLink = popupRoot.querySelector('#poi-popup-photo-attribution-link') as HTMLAnchorElement | null;

                if (photoBlock && photoImg && photoCandidates.length > 0) {
                    const initialIndex = Math.max(
                        0,
                        photoCandidates.findIndex((candidate) => candidate.url === detailStatus.photoUrl)
                    );
                    let activeIndex = initialIndex;

                    const syncPhotoFrame = () => {
                        syncFrameAndViewport();
                    };

                    const applyResolvedPhotoPresentation = (candidate = photoCandidates[activeIndex]) => {
                        const presentation = PopupGenerator.derivePhotoPresentation(
                            feature,
                            {
                                ...detailStatus,
                                photoUrl: candidate?.url || detailStatus.photoUrl,
                                photoCandidates
                            },
                            {
                                naturalWidth: photoImg.naturalWidth || candidate?.width,
                                naturalHeight: photoImg.naturalHeight || candidate?.height,
                                popupWidth: popupRoot.getBoundingClientRect().width
                            }
                        );

                        photoBlock.dataset.photoCategoryProfile = presentation.categoryProfile;
                        photoBlock.dataset.photoResolutionBand = presentation.resolutionBand;
                        photoImg.style.height = `${presentation.frameHeight}px`;
                        photoImg.style.objectFit = presentation.objectFit;
                        photoImg.style.objectPosition = presentation.objectPosition;
                        photoImg.style.background = presentation.surfaceColor;
                        syncPhotoFrame();
                    };

                    const applyPhotoCandidate = (index: number) => {
                        const candidate = photoCandidates[index];
                        if (!candidate) {
                            photoBlock.remove();
                            syncPhotoFrame();
                            return false;
                        }

                        activeIndex = index;
                        photoImg.src = candidate.url;
                        photoImg.alt = `${feature.properties?.title || 'Place'} photo`;

                        if (photoAttribution && photoAttributionLink && candidate.attributionText && candidate.attributionUrl) {
                            photoAttribution.style.display = '';
                            photoAttributionLink.textContent = candidate.attributionText;
                            photoAttributionLink.href = candidate.attributionUrl;
                        } else if (photoAttribution) {
                            photoAttribution.style.display = 'none';
                        }

                        if (candidate.width && candidate.height) {
                            applyResolvedPhotoPresentation(candidate);
                        } else {
                            syncPhotoFrame();
                        }
                        return true;
                    };

                    const advancePhotoCandidate = () => {
                        for (let nextIndex = activeIndex + 1; nextIndex < photoCandidates.length; nextIndex += 1) {
                            if (applyPhotoCandidate(nextIndex)) {
                                return;
                            }
                        }

                        photoBlock.remove();
                        syncPhotoFrame();
                    };

                    photoImg.onerror = () => {
                        advancePhotoCandidate();
                    };
                    photoImg.onload = () => {
                        applyResolvedPhotoPresentation(photoCandidates[activeIndex]);
                    };

                    if (!photoImg.getAttribute('src') && photoCandidates[initialIndex]) {
                        applyPhotoCandidate(initialIndex);
                    } else if (photoImg.complete && photoImg.naturalWidth > 0) {
                        applyResolvedPhotoPresentation(photoCandidates[activeIndex]);
                    } else if (photoImg.complete && photoImg.naturalWidth === 0) {
                        advancePhotoCandidate();
                    }
                }
            };

            const renderPopup = (detailStatus = PoiDetailsService.buildInitialDetails(feature)) => {
                const popupIcons = buildPopupRenderableIconMap(
                    feature,
                    state.activeIcons,
                    invalidIconKeysRef.current
                );
                const html = PopupGenerator.generateHtml(
                    feature,
                    state.popupStyle,
                    state.palette,
                    popupIcons,
                    state.isDefaultTheme,
                    detailStatus
                );

                controller.showPopup(coords, html);
                window.setTimeout(() => bindPopupActions(detailStatus), 0);
            };

            renderPopup({
                ...PoiDetailsService.buildInitialDetails(feature),
                status: 'loading'
            });

            void PoiDetailsService.getDetails(feature)
                .then((details) => {
                    if (popupRequestId !== popupRequestSequence.current) return;
                    renderPopup(details);
                    publishLoadedPoisSnapshot(controller);
                })
                .catch((error) => {
                    logger.warn('Failed to load popup details', error);
                    if (popupRequestId !== popupRequestSequence.current) return;
                    renderPopup({
                        ...PoiDetailsService.buildInitialDetails(feature),
                        status: 'error'
                    });
                    publishLoadedPoisSnapshot(controller);
                });
        };

        openPoiFeatureRef.current = openPoiFeature;

        const setPoiCursor = (cursor: string) => {
            const rawMap = controller.getRawMap?.();
            const canvas = rawMap?.getCanvas?.();
            if (canvas?.style) {
                canvas.style.cursor = cursor;
                return;
            }
            if (typeof document !== 'undefined') {
                document.body.style.cursor = cursor;
            }
        };

        const onVisiblePoiLayerClick = (e: MapEvent) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const clickedLng = Number(e.lngLat?.lng);
            const clickedLat = Number(e.lngLat?.lat);
            const featureCoords = (feature.geometry as any).coordinates.slice() as [number, number];
            const coords: [number, number] = Number.isFinite(clickedLng) && Number.isFinite(clickedLat)
                ? [clickedLng, clickedLat]
                : featureCoords;
            openPoiFeature(feature, coords);
        };

        const clearPoiCursor = () => {
            setPoiCursor('');
        };

        const showPoiCursor = () => {
            setPoiCursor('pointer');
        };

        const dismissPopupOnZoomStart = () => {
            popupRequestSequence.current += 1;
            popupLayoutObserverRef.current?.disconnect();
            popupLayoutObserverRef.current = null;
            popupObservedElementRef.current = null;
            controller.removePopup();
        };

        const rawMap = controller.getRawMap?.();
        const visualLayerIds = getPoiVisualLayerIds().filter((layerId) => rawMap?.getLayer?.(layerId));

        visualLayerIds.forEach((layerId) => {
            controller.on('click', onVisiblePoiLayerClick, layerId);
            controller.on('mouseenter', showPoiCursor, layerId);
            controller.on('mouseleave', clearPoiCursor, layerId);
        });

        controller.on('zoomstart', dismissPopupOnZoomStart);
        controller.on('mouseleave', clearPoiCursor);

        return () => {
            openPoiFeatureRef.current = null;
            popupLayoutObserverRef.current?.disconnect();
            popupLayoutObserverRef.current = null;
            popupObservedElementRef.current = null;
            visualLayerIds.forEach((layerId) => {
                controller.off('click', onVisiblePoiLayerClick, layerId);
                controller.off('mouseenter', showPoiCursor, layerId);
                controller.off('mouseleave', clearPoiCursor, layerId);
            });
            controller.off('zoomstart', dismissPopupOnZoomStart);
            controller.off('mouseleave', clearPoiCursor);
        };

    }, [loaded, publishLoadedPoisSnapshot]);

    useEffect(() => {
        if (!loaded || !mapController.current || !poiFocusRequest) return;
        if (handledPoiFocusRequestRef.current === poiFocusRequest.nonce) return;
        handledPoiFocusRequestRef.current = poiFocusRequest.nonce;

        const controller = mapController.current;
        const rawMap = controller.getRawMap?.();
        const feature = loadedPoiFeaturesRef.current.get(poiFocusRequest.id);
        if (!rawMap || !feature || !openPoiFeatureRef.current) return;

        const coordinates = (feature.geometry as any)?.coordinates?.slice?.(0, 2) as [number, number] | undefined;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;

        let didOpen = false;
        let fallbackTimer: number | null = null;
        const handleMoveEnd = () => {
            if (didOpen) return;
            didOpen = true;
            rawMap.off?.('moveend', handleMoveEnd);
            if (fallbackTimer !== null) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            openPoiFeatureRef.current?.(feature, coordinates);
        };

        rawMap.on?.('moveend', handleMoveEnd);

        if (typeof rawMap.easeTo === 'function') {
            rawMap.easeTo({
                center: coordinates,
                zoom: Math.max(typeof rawMap.getZoom === 'function' ? rawMap.getZoom() : 14, 16),
                duration: 650
            });
        } else {
            handleMoveEnd();
            return;
        }

        fallbackTimer = window.setTimeout(() => {
            handleMoveEnd();
        }, 800);

        return () => {
            rawMap.off?.('moveend', handleMoveEnd);
            if (fallbackTimer !== null) {
                window.clearTimeout(fallbackTimer);
            }
        };
    }, [loaded, poiFocusRequest]);

    // 5. POI & Click Handlers
    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;
        let moveendRefreshTimer: number | null = null;
        let removedInitialIdleListener = false;

        // Map click handler (removed undefined handleMapClick)

        const rawMap = controller.getRawMap?.();

        // Set up moveend listener for POI refresh
        const moveendHandler = () => {
            if (suppressedMoveendRefreshCount.current > 0) {
                suppressedMoveendRefreshCount.current -= 1;
                return;
            }

            if (moveendRefreshTimer !== null) {
                window.clearTimeout(moveendRefreshTimer);
            }

            moveendRefreshTimer = window.setTimeout(() => {
                moveendRefreshTimer = null;
                if (!mapController.current) return;
                refreshPoisFromViewport(mapController.current);
            }, POI_MOVEEND_REFRESH_DEBOUNCE_MS);
        };

        controller.on('moveend', moveendHandler);

        // Initial POI load
        refreshPoisFromViewport(controller, { force: true });

        const initialIdleRefresh = () => {
            refreshPoisFromViewport(controller, { force: true });
            if (!removedInitialIdleListener) {
                rawMap?.off?.('idle', initialIdleRefresh);
                removedInitialIdleListener = true;
            }
        };

        rawMap?.on?.('idle', initialIdleRefresh);

        return () => {
            if (mapController.current) {
                // mapController.current.off('click', handleClick); // Removed undefined handleClick
                mapController.current.off('moveend', moveendHandler);
                if (moveendRefreshTimer !== null) {
                    window.clearTimeout(moveendRefreshTimer);
                    moveendRefreshTimer = null;
                }

                const rawMap = mapController.current.getRawMap?.();
                if (rawMap) {
                    rawMap.off('idle', initialIdleRefresh);
                }
            }
        };
    }, [loaded, refreshPoisFromViewport]);

    return { loaded, isInitialVisualReady };
};
