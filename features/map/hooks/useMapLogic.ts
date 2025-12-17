import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { IMapController, MapEvent } from '../../../core/interfaces/IMapController';
import { MapLibreAdapter } from '../services/MapLibreAdapter';
import { PopupGenerator } from '../services/PopupGenerator';
import { PaletteService } from '../services/PaletteService';
import { PoiService } from '../services/PoiService';
import { derivePalette } from '../../../services/defaultThemes';
import { DEFAULT_STYLE_URL, OSM_MAPPING } from '../../../constants';
import { MapStylePreset, IconDefinition, PopupStyle } from '../../../types';

// Helper for safe style loading (moved from MapView)
const loadSafeStyle = async (styleUrl: string) => {
    try {
        const res = await fetch(styleUrl);
        if (!res.ok) throw new Error("Failed to fetch style");
        return await res.json();
    } catch (e) {
        console.error("Style Load Failed", e);
        return { version: 8, sources: {}, layers: [] };
    }
};

interface UseMapLogicProps {
    containerRef: React.RefObject<HTMLElement>;
    mapStyleJson: any;
    palette?: Record<string, string>;
    activeIcons: Record<string, IconDefinition>;
    popupStyle: PopupStyle;
    isDefaultTheme: boolean;
    onEditIcon?: (category: string) => void;
    onMapLoad?: (map: any) => void;
}

export const useMapLogic = ({
    containerRef,
    mapStyleJson,
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

                // Create POI source and layer ONCE on map load (critical timing!)
                const rawMap = controller.getRawMap?.();
                if (rawMap) {
                    if (!rawMap.getSource('places')) {
                        rawMap.addSource('places', {
                            type: 'geojson',
                            data: { type: 'FeatureCollection', features: [] },
                            cluster: false
                        });
                        console.log('[useMapLogic] Created "places" source on map load');
                    }

                    if (!rawMap.getLayer('unclustered-point')) {
                        rawMap.addLayer({
                            id: 'unclustered-point',
                            type: 'symbol',
                            source: 'places',
                                minzoom: 13, // Show POIs starting at zoom 13 (street level)
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
                                'icon-allow-overlap': false, // Prevent icon overlap
                                'symbol-spacing': 250, // Minimum distance in pixels between symbols
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
                                'text-allow-overlap': false // Prevent text overlap
                            },
                            paint: {
                                'text-color': ['get', 'textColor'],
                                'text-halo-color': ['get', 'haloColor'],
                                'text-halo-width': 2
                            }
                        });
                        console.log('[useMapLogic] Created "unclustered-point" layer on map load');
                    }

                    // Hide base map POI layers - our custom layer handles all POIs
                    PoiService.hideBaseMapPOILayers(controller);
                }

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
    }, []);

    // 2. Derive Palette
    const palette = useMemo(() => {
        if (paletteProp) return paletteProp;
        return derivePalette(mapStyleJson);
    }, [mapStyleJson, paletteProp]);

    // 3. Apply Palette Logic
    useEffect(() => {
        if (!loaded || !mapController.current || !palette) return;
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

    }, [loaded, palette, popupStyle]); // Re-run when palette changes

    // 4. Icon Management
    useEffect(() => {
        if (!loaded || !mapController.current) return;
        const controller = mapController.current;

        console.log('[useMapLogic] Icon loading effect triggered. Active icons:', Object.keys(activeIcons));

        Object.entries(activeIcons).forEach(([cat, iconDef]) => {
            const url = iconDef.imageUrl;
            if (!url) {
                if (controller.hasImage(cat)) controller.removeImage(cat);
                return;
            }

            // Simple cache check
            if (loadedIconUrls.current[cat] === url && controller.hasImage(cat)) {
                console.log(`[useMapLogic] Icon "${cat}" already loaded, skipping`);
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
                        console.log(`[useMapLogic] Loaded and resized icon "${cat}" to ${targetSize}x${targetSize}`);
                    }
                } catch (e) {
                    console.error(`[useMapLogic] Failed to resize icon "${cat}":`, e);
                }
            };
            img.onerror = (e) => {
                console.error(`[useMapLogic] Failed to load icon "${cat}":`, e);
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

        const onPointClick = (e: MapEvent) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const coords = (feature.geometry as any).coordinates.slice();
            const state = latestState.current;

            const html = PopupGenerator.generateHtml(
                feature,
                state.popupStyle,
                state.palette,
                state.activeIcons,
                state.isDefaultTheme
            );

            controller.showPopup(coords, html);

            // Re-bind the edit button (DOM hack, but needed for HTML popups)
            setTimeout(() => {
                const btn = document.getElementById('popup-edit-btn');
                if (btn && state.onEditIcon) {
                    btn.onclick = () => state.onEditIcon?.(feature.properties.subcategory);
                }
                const closeBtn = document.getElementById('popup-close-btn');
                if (closeBtn) {
                    closeBtn.onclick = () => controller.removePopup();
                }
            }, 50);
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
            if (!mapController.current) return;
            PoiService.refreshData(mapController.current, activeIcons, palette, popupStyle);
        };

        controller.on('moveend', moveendHandler);

        // Initial POI load
        PoiService.refreshData(controller, activeIcons, palette, popupStyle);

        return () => {
            if (mapController.current) {
                mapController.current.off('moveend', moveendHandler);

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
