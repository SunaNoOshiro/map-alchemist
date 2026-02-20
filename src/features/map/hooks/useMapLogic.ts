import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { IMapController, MapEvent } from '@core/interfaces/IMapController';
import { MapLibreAdapter } from '../services/MapLibreAdapter';
import { PopupGenerator } from '../services/PopupGenerator';
import { PaletteService } from '../services/PaletteService';
import { PoiService } from '../services/PoiService';
import { derivePalette } from '@core/services/defaultThemes';
import { DEFAULT_STYLE_URL, MAP_CATEGORIES } from '@/constants';
import { MapStylePreset, IconDefinition, PopupStyle } from '@/types';
import { createLogger } from '@core/logger';
import { isMapLibreStyleJson } from '../services/styleCompiler';

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
const normalizeCategoryToken = (value?: string) =>
    String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CATEGORY_BY_TOKEN = new Map(
    MAP_CATEGORIES.map((category) => [normalizeCategoryToken(category), category] as const)
);
const POI_MOVEEND_REFRESH_DEBOUNCE_MS = 180;

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
    if (hasRenderableStyleContent(mapStyleJson)) {
        return sanitizeMapStyleNumericExpressions(mapStyleJson);
    }
    return sanitizeMapStyleNumericExpressions(baseStyle);
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

export const useMapLogic = ({
    containerRef,
    mapStyleJson,
    styleId,
    palette: paletteProp,
    activeIcons,
    popupStyle,
    isDefaultTheme,
    onEditIcon,
    onMapLoad
}: UseMapLogicProps) => {
    const mapController = useRef<IMapController | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [baseStyle, setBaseStyle] = useState<any>(null);
    const loadedIconUrls = useRef<Record<string, string>>({});
    const activeStyleRef = useRef<string | null | undefined>(styleId);

    const ensurePoiInfrastructure = useCallback((controller: IMapController) => {
        const rawMap = controller.getRawMap?.();
        if (!rawMap) return;

        if (!rawMap.getSource('places')) {
            rawMap.addSource('places', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                cluster: false
            });
            logger.info('Created "places" source on map load');
        }

        if (!rawMap.getLayer('unclustered-point')) {
            rawMap.addLayer({
                id: 'unclustered-point',
                type: 'symbol',
                source: 'places',
                minzoom: 13,
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
                    'text-optional': true,
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': ['get', 'textColor'],
                    'text-halo-color': ['get', 'haloColor'],
                    'text-halo-width': 2
                }
            });
            logger.info('Created "unclustered-point" layer on map load');
        }

        PoiService.hideBaseMapPOILayers(controller);
    }, []);

    // 1. Initialize Map
    useEffect(() => {
        if (!containerRef.current) return;

        let active = true;

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

            controller.initialize(containerRef.current!, safeBase, () => {
                if (!active) return;
                ensurePoiInfrastructure(controller);

                setLoaded(true);
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
            mapController.current?.dispose();
        };
    }, [ensurePoiInfrastructure]);

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

        const styleToApply = resolveRenderStyle(mapStyleJson, baseStyle);
        controller.setStyle(styleToApply);

        const onStyleData = () => {
            if (!controller.getRawMap?.()) return;
            ensurePoiInfrastructure(controller);
            PoiService.refreshData(controller, activeIcons, paletteProp || derivePalette(mapStyleJson), popupStyle);
        };

        rawMap.once('styledata', onStyleData);
    }, [
        loaded,
        styleId,
        mapStyleJson,
        baseStyle,
        ensurePoiInfrastructure
    ]);

    // 2. Derive Palette
    const palette = useMemo(() => {
        if (paletteProp) return paletteProp;
        return derivePalette(mapStyleJson);
    }, [mapStyleJson, paletteProp]);

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
            logger.debug(`Removed stale custom icon "${category}" after style change`);
        });

        Object.entries(desiredIconUrls).forEach(([cat, url]) => {
            // Simple cache check
            if (loadedIconUrls.current[cat] === url && controller.hasImage(cat)) {
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

                        controller.addImage(cat, imageData);
                        loadedIconUrls.current[cat] = url;
                        logger.info(`Loaded and resized icon "${cat}" to ${targetSize}x${targetSize}`);
                    }
                } catch (e) {
                    logger.error(`Failed to resize icon "${cat}":`, e);
                }
            };
            img.onerror = (e) => {
                logger.error(`Failed to load icon "${cat}":`, e);
            };
        });
    }, [loaded, activeIcons]);

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

        const resolveEditCategory = (...candidates: Array<string | undefined>) => {
            for (const candidate of candidates) {
                const normalized = normalizeCategoryToken(candidate);
                if (!normalized) continue;
                const mapped = CATEGORY_BY_TOKEN.get(normalized);
                if (mapped) return mapped;
            }
            return '';
        };

        const onPointClick = (e: MapEvent) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features.find((candidate) =>
                Boolean(resolveEditCategory(
                    candidate.properties?.iconKey,
                    candidate.properties?.subcategory,
                    candidate.properties?.category
                ))
            ) || e.features[0];
            const coords = (feature.geometry as any).coordinates.slice();
            const state = latestState.current;
            const editTarget = resolveEditCategory(
                feature.properties?.iconKey,
                feature.properties?.subcategory,
                feature.properties?.category
            );

            const html = PopupGenerator.generateHtml(
                feature,
                state.popupStyle,
                state.palette,
                state.activeIcons,
                state.isDefaultTheme
            );

            controller.showPopup(coords, html);

            const bindPopupActions = (attempt = 0) => {
                const popupRoot = document.querySelector(
                    '.maplibregl-popup .maplibregl-popup-content [data-testid="poi-popup"]'
                ) as HTMLElement | null;

                if (!popupRoot) {
                    if (attempt < 10) {
                        window.setTimeout(() => bindPopupActions(attempt + 1), 30);
                    }
                    return;
                }

                PopupGenerator.syncFrameGeometry(popupRoot);
                requestAnimationFrame(() => PopupGenerator.syncFrameGeometry(popupRoot));

                const btn = popupRoot.querySelector('#popup-edit-btn') as HTMLButtonElement | null;
                if (!btn && attempt < 10) {
                    window.setTimeout(() => bindPopupActions(attempt + 1), 30);
                    return;
                }

                if (btn && state.onEditIcon) {
                    btn.setAttribute('data-edit-target', editTarget);
                    btn.disabled = !editTarget;
                    btn.style.opacity = editTarget ? '1' : '0.55';
                    btn.style.cursor = editTarget ? 'pointer' : 'not-allowed';
                    btn.onclick = () => {
                        if (!editTarget) return;
                        state.onEditIcon?.(editTarget);
                    };
                }

                const closeBtn = popupRoot.querySelector('#popup-close-btn') as HTMLButtonElement | null;
                if (closeBtn) {
                    closeBtn.onclick = () => controller.removePopup();
                }
            };

            // Re-bind popup actions after DOM insertion
            window.setTimeout(() => bindPopupActions(), 0);
        };

        controller.on('click', onPointClick, 'unclustered-point');
        // Mouse cursor logic
        controller.on('mouseenter', () => { document.body.style.cursor = 'pointer'; }, 'unclustered-point');
        controller.on('mouseleave', () => { document.body.style.cursor = ''; }, 'unclustered-point');

        return () => {
            controller.off('click', onPointClick, 'unclustered-point');
        };

    }, [loaded]);

    // 5. POI & Click Handlers
    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;
        let moveendRefreshTimer: number | null = null;

        // Map click handler (removed undefined handleMapClick)

        // Change cursor to pointer when hovering over POI icons
        const rawMap = controller.getRawMap?.();
        if (rawMap) {
            rawMap.on('mouseenter', 'unclustered-point', () => {
                rawMap.getCanvas().style.cursor = 'pointer';
            });

            rawMap.on('mouseleave', 'unclustered-point', () => {
                rawMap.getCanvas().style.cursor = '';
            });
        }

        // Set up moveend listener for POI refresh
        const moveendHandler = () => {
            if (moveendRefreshTimer !== null) {
                window.clearTimeout(moveendRefreshTimer);
            }

            moveendRefreshTimer = window.setTimeout(() => {
                moveendRefreshTimer = null;
                if (!mapController.current) return;
                PoiService.refreshData(mapController.current, activeIcons, palette, popupStyle);
            }, POI_MOVEEND_REFRESH_DEBOUNCE_MS);
        };

        controller.on('moveend', moveendHandler);

        // Initial POI load
        PoiService.refreshData(controller, activeIcons, palette, popupStyle);

        return () => {
            if (mapController.current) {
                // mapController.current.off('click', handleClick); // Removed undefined handleClick
                mapController.current.off('moveend', moveendHandler);
                if (moveendRefreshTimer !== null) {
                    window.clearTimeout(moveendRefreshTimer);
                    moveendRefreshTimer = null;
                }

                // Clean up cursor event listeners
                const rawMap = mapController.current.getRawMap?.();
                if (rawMap) {
                    rawMap.off('mouseenter', 'unclustered-point');
                    rawMap.off('mouseleave', 'unclustered-point');
                }
            }
        };
    }, [loaded, activeIcons, palette, popupStyle]);

    return { loaded };
};
