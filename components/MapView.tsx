
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { IconDefinition, PopupStyle } from '../types';
import { OSM_MAPPING, DEFAULT_STYLE_URL, getCategoryColor } from '../constants';
import { derivePalette } from '../services/defaultThemes';
import { createLogger } from '../services/logger';

const log = createLogger('map-view');

// --- SAFE BASE URL HELPER ---
const safeBaseHref = () => {
    try {
        if (typeof document !== "undefined" && document.baseURI) return document.baseURI;
        if (typeof window !== "undefined" && window.location?.href) return window.location.href;
    } catch (e) {
        // Ignore errors accessing location in strict sandboxes
    }
    return "https://example.com/";
};

const absolutizeUrl = (url: string, base?: string) => {
    if (!url || typeof url !== "string") return url;
    if (/^[a-z]+:/i.test(url)) return url; // Already absolute
    if (url.startsWith("//")) return "https:" + url;

    const b = base ?? safeBaseHref();
    try {
        return new URL(url, b).href.replace(/%7B/g, "{").replace(/%7D/g, "}");
    } catch (e) {
        return url;
    }
};

// --- WORKER CONFIG ---
try {
    // Explicitly set worker to a remote CDN URL to avoid local blob/worker resolution
    // which triggers 'window.parent' access in some MapLibre versions.
    // @ts-ignore
    maplibregl.workerUrl = "https://unpkg.com/maplibre-gl@4.6.0/dist/maplibre-gl-csp-worker.js";
} catch (e) {
    log.warn("Failed to set maplibregl.workerUrl", e);
}

interface MapViewProps {
    apiKey: string;
    mapStyleJson: any;
    palette?: Record<string, string>;
    activeIcons: Record<string, IconDefinition>;
    popupStyle: PopupStyle;
    onMapLoad?: (map: any) => void;
    isDefaultTheme: boolean;
    onEditIcon?: (category: string) => void;
}

// --- OVERPASS SERVICE ---
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

// --- SAFE STYLE LOADER ---
const loadSafeStyle = async (styleUrl: string) => {
    try {
        // Resolve the style URL itself first
        const absStyleUrl = absolutizeUrl(styleUrl);
        const res = await fetch(absStyleUrl);
        if (!res.ok) throw new Error(`Failed to fetch style: ${res.statusText}`);
        const style = await res.json();

        // Recursively absolutize all internal URLs
        if (style.sprite) style.sprite = absolutizeUrl(style.sprite, absStyleUrl);
        if (style.glyphs) style.glyphs = absolutizeUrl(style.glyphs, absStyleUrl);

        if (style.sources) {
            await Promise.all(Object.keys(style.sources).map(async (key) => {
                const source = style.sources[key];
                // Handle Source URLs (TileJSON)
                if (source.url && (source.type === 'vector' || source.type === 'raster')) {
                    try {
                        const sourceUrl = absolutizeUrl(source.url, absStyleUrl);
                        const tileJsonRes = await fetch(sourceUrl);
                        if (tileJsonRes.ok) {
                            const tileJson = await tileJsonRes.json();
                            delete source.url; // Inline it
                            if (tileJson.tiles) source.tiles = tileJson.tiles.map((t: string) => absolutizeUrl(t, sourceUrl));
                            if (tileJson.minzoom !== undefined) source.minzoom = tileJson.minzoom;
                            if (tileJson.maxzoom !== undefined) source.maxzoom = tileJson.maxzoom;
                            if (tileJson.attribution) source.attribution = tileJson.attribution;
                            if (tileJson.bounds) source.bounds = tileJson.bounds;
                        }
                    } catch (e) {
                        log.warn(`TileJSON inline failed for ${key}`, e);
                    }
                }
                // Handle direct tiles
                else if (source.tiles) {
                    source.tiles = source.tiles.map((t: string) => absolutizeUrl(t, absStyleUrl));
                }
            }));
        }
        return style;
    } catch (e) {
        log.error("Style Load Failed", e);
        return { version: 8, sources: {}, layers: [] };
    }
};

const MapView: React.FC<MapViewProps> = ({
    mapStyleJson,
    palette: paletteProp,
    activeIcons,
    popupStyle,
    onMapLoad,
    isDefaultTheme,
    onEditIcon
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const showPopupRef = useRef<(feature: any, coordinates: [number, number]) => void>();
    const lastPopupFeature = useRef<any | null>(null);
    const lastPopupCoords = useRef<[number, number] | null>(null);
    const mapReadyRef = useRef(false);
    const idleRefreshPendingRef = useRef(false);
    const defaultPoiStyleRef = useRef<{
        iconImage?: any;
        iconSize?: any;
        textSize?: any;
        textFont?: any;
        textOffset?: any;
        textAnchor?: any;
        iconAllowOverlap?: any;
        textAllowOverlap?: any;
    }>({});
    const defaultPoiMinZoomRef = useRef<number>(10);
    const poiSourcesRef = useRef<{ source: string; sourceLayer: string }[]>([]);
    const placesRef = useRef<any[]>([]);
    const loadedIconUrls = useRef<Record<string, string | null>>({});
    const iconCacheRef = useRef<Record<string, ImageBitmap | HTMLImageElement>>({});
    const iconLoadPromisesRef = useRef<Record<string, Promise<ImageBitmap | HTMLImageElement>>>({});
    const poiLayerIdsRef = useRef<string[]>([]);

    const [loaded, setLoaded] = useState(false);
    const [styleJSON, setStyleJSON] = useState<any>(null);
    const selectedPlaceId = useRef<string | null>(null);

    // 1. Fetch Style Manually
    useEffect(() => {
        const initStyle = async () => {
            const safeStyle = await loadSafeStyle(DEFAULT_STYLE_URL);
            setStyleJSON(safeStyle);
        };
        initStyle();
    }, []);

    // --- STYLE UPDATER ---
    const palette = useMemo(() => {
        if (paletteProp) return paletteProp;
        return derivePalette(mapStyleJson);
    }, [mapStyleJson, paletteProp]);

    useEffect(() => {
        if (!loaded || !mapInstance.current || !palette) return;
        const map = mapInstance.current;

        const applyPaletteToLayers = () => {
            const colors = palette;
            const styleLayers = map.getStyle()?.layers || [];
            log.debug('Applying palette to style', { palette: colors, layerCount: styleLayers.length });

            const applyColor = (predicate: (layerId: string) => boolean, color?: string, label?: string) => {
                if (!color) return;
                let touched = 0;
                (map.getStyle()?.layers || styleLayers)
                    .filter(l => predicate(l.id))
                    .forEach(l => {
                        const paintProp =
                            l.type === 'fill' ? 'fill-color'
                                : l.type === 'line' ? 'line-color'
                                    : l.type === 'background' ? 'background-color'
                                        : l.type === 'circle' ? 'circle-color'
                                            : null;
                        if (!paintProp) return;
                        try {
                            map.setPaintProperty(l.id, paintProp, color);
                            touched += 1;
                        } catch (e) {
                            // ignore coloring failures for optional layers
                        }
                    });
                if (touched > 0) {
                    log.trace(`Applied ${label || 'color'} to ${touched} layers`);
                }
            };

            applyColor(id => /water/i.test(id), colors.water, 'water');
            applyColor(id => /(land|park|green|nature|background|vegetation)/i.test(id), colors.park || colors.land, 'land/park');
            applyColor(id => /building/i.test(id), colors.building, 'building');
            applyColor(id => /(road|transport|highway|street|motorway|primary|secondary|tertiary|residential|trunk|path)/i.test(id), colors.road, 'road');

            if (colors.text) {
                (map.getStyle()?.layers || styleLayers)
                    .filter(l => l.type === 'symbol')
                    .forEach(l => {
                        try {
                            map.setPaintProperty(l.id, 'text-color', colors.text);
                        } catch (e) {
                            // ignore
                        }
                    });
                log.trace('Applied text color to symbol layers');
            }

            // Sync clusters & labels to the theme so POIs reflect the palette
            if (map.getLayer('clusters')) {
                try { map.setPaintProperty('clusters', 'circle-color', colors.road || colors.water); log.trace('Cluster fill tinted'); } catch (e) {/* ignore */ }
            }
            if (map.getLayer('cluster-count')) {
                try { map.setPaintProperty('cluster-count', 'text-color', colors.text || popupStyle.textColor); log.trace('Cluster count tinted'); } catch (e) {/* ignore */ }
            }
            if (map.getLayer('unclustered-point')) {
                try { map.setPaintProperty('unclustered-point', 'text-color', colors.text || popupStyle.textColor); log.trace('POI labels tinted'); } catch (e) {/* ignore */ }
            }
        };

        applyPaletteToLayers();
        map.on('style.load', applyPaletteToLayers);
        log.debug('Attached style.load listener for palette synchronization');
        return () => { map.off('style.load', applyPaletteToLayers); };
    }, [palette, loaded, popupStyle]);

    // --- ICON UPDATER ---
    const registerIcon = useCallback(async (map: maplibregl.Map, cat: string, incomingUrl?: string | null) => {
        if (!incomingUrl) {
            if (map.hasImage(cat)) map.removeImage(cat);
            delete loadedIconUrls.current[cat];
            return;
        }

        const previousUrl = loadedIconUrls.current[cat];
        if (previousUrl === incomingUrl && map.hasImage(cat)) return;

        // Reuse cached bitmaps across theme switches to avoid refetching
        const cached = iconCacheRef.current[incomingUrl];
        if (cached) {
            try {
                if (map.hasImage(cat)) map.removeImage(cat);
                map.addImage(cat, cached, { pixelRatio: 1 });
                loadedIconUrls.current[cat] = incomingUrl;
                return;
            } catch (e) {
                log.error('Failed to re-register cached image', { cat, error: e });
                // fall through to reload
            }
        }

        const loadIcon = () => {
            if (iconLoadPromisesRef.current[incomingUrl]) return iconLoadPromisesRef.current[incomingUrl];

            const promise = new Promise<ImageBitmap | HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";

                img.onload = async () => {
                    try {
                        const maxSize = 64;
                        let bitmap: ImageBitmap | HTMLImageElement;

                        if (typeof createImageBitmap === 'function') {
                            bitmap = await createImageBitmap(img, {
                                resizeWidth: maxSize,
                                resizeHeight: maxSize,
                                resizeQuality: 'high'
                            } as any);
                        } else {
                            const canvas = document.createElement('canvas');
                            canvas.width = maxSize;
                            canvas.height = maxSize;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) throw new Error('Canvas unavailable');
                            ctx.drawImage(img, 0, 0, maxSize, maxSize);
                            const tmp = new Image();
                            tmp.src = canvas.toDataURL();
                            bitmap = tmp;
                        }

                        resolve(bitmap);
                    } catch (e) {
                        reject(e);
                    }
                };

                img.onerror = () => reject(new Error('Icon failed to load'));
                img.src = incomingUrl;
            })
                .catch((e) => {
                    delete iconLoadPromisesRef.current[incomingUrl];
                    throw e;
                });

            iconLoadPromisesRef.current[incomingUrl] = promise;
            return promise;
        };

        try {
            const bitmap = await loadIcon();
            iconCacheRef.current[incomingUrl] = bitmap;
            if (map.hasImage(cat)) map.removeImage(cat);
            map.addImage(cat, bitmap, { pixelRatio: 1 });
            loadedIconUrls.current[cat] = incomingUrl;
        } catch (e) {
            log.warn('Icon failed to load', { cat, url: incomingUrl, error: e });
            if (map.hasImage(cat)) map.removeImage(cat);
            delete loadedIconUrls.current[cat];
        }
    }, []);

    const ensureAllIcons = useCallback((map?: maplibregl.Map) => {
        const m = map || mapInstance.current;
        if (!loaded || !m) return;

        Object.entries(activeIcons).forEach(([cat, iconDef]) => {
            registerIcon(m, cat, iconDef.imageUrl);
        });

        // Remove icons that are no longer present in the active set
        Object.keys(loadedIconUrls.current).forEach((cat) => {
            if (!activeIcons[cat] && m.hasImage(cat)) {
                m.removeImage(cat);
                delete loadedIconUrls.current[cat];
            }
        });

        if (!m.hasImage('fallback-dot')) {
            const canvas = document.createElement('canvas');
            canvas.width = 20; canvas.height = 20;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.arc(10, 10, 7, 0, Math.PI * 2);
                ctx.fillStyle = '#4285F4';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                m.addImage('fallback-dot', ctx.getImageData(0, 0, 20, 20));
            }
        }
    }, [activeIcons, loaded, registerIcon]);

    useEffect(() => {
        ensureAllIcons();
    }, [activeIcons, loaded, ensureAllIcons]);

    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;
        const handler = () => ensureAllIcons(map);
        map.on('style.load', handler);
        return () => { map.off('style.load', handler); };
    }, [ensureAllIcons]);

    // --- POPUP HANDLER ---
    const showPopup = useCallback((feature: any, coordinates: [number, number]) => {
        if (!mapInstance.current) return;

        if (popupRef.current) popupRef.current.remove();

        const props = feature.properties;
        const cat = props.category;
        const sub = props.subcategory;
        const title = props.title;
        const desc = props.description || sub;
        const iconDef = activeIcons[sub] || activeIcons[cat];
        const headerImg = iconDef?.imageUrl || '';

        const wandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M10.6 17.4 12 16"/><path d="M12.5 2.5 8 7"/><path d="M17.5 7.5 13 3"/><path d="M7 21l9-9"/><path d="M3 21l9-9"/></svg>`;

        const bg = popupStyle.backgroundColor || palette.land || '#ffffff';
        const text = popupStyle.textColor || palette.text || '#202124';
        const border = popupStyle.borderColor || palette.road || '#dadce0';

        const html = `
        <div style="position:relative; font-family: ${popupStyle.fontFamily}; min-width: 240px;">
            <button id="popup-close-btn" aria-label="Close" style="position:absolute; top:-14px; right:-14px; background: ${bg}; border: 2px solid ${border}; color:${text}; width:28px; height:28px; border-radius: 999px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; line-height:1; box-shadow: 0 6px 12px rgba(0,0,0,0.2);">
                ×
            </button>
            <div style="color: ${text}; background: ${bg}; border: 2px solid ${border}; border-radius: ${popupStyle.borderRadius}; padding: 14px 14px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                <div style="display: flex; gap: 10px; align-items:center;">
                    ${headerImg ? `<div style=\"width: 60px; height: 60px; background: rgba(0,0,0,0.05); border-radius: 10px; padding: 6px; display:flex; align-items:center; justify-content:center; box-shadow: inset 0 0 0 2px ${border}40;\"><img src=\"${headerImg}\" style=\"max-width:100%; max-height:100%; object-fit:contain;\" /></div>` : ''}
                    <div style="flex:1; padding-right: 12px;">
                        <h3 style="margin:0 0 4px; font-size:16px; font-weight:bold; line-height:1.2;">${title}</h3>
                        <div style="font-size:11px; text-transform:uppercase; font-weight:bold; opacity:0.7;">${sub}</div>
                    </div>
                </div>
                <div style="margin-top:10px; font-size:13px; opacity:0.92; border-top:1px solid ${border}40; padding-top:8px;">
                    ${desc}
                </div>
                ${!isDefaultTheme ? `<button id=\"popup-edit-btn\" style=\"margin-top:10px; width:100%; padding:6px 8px; background:${border}20; border:1px solid ${border}; border-radius:6px; cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; gap:6px; color:${text};\">${wandIcon} Remix Icon</button>` : ''}
            </div>
        </div>
      `;

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 15, maxWidth: '320px' })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(mapInstance.current);

        popupRef.current = popup;
        lastPopupFeature.current = feature;
        lastPopupCoords.current = coordinates;

        setTimeout(() => {
            const btn = document.getElementById('popup-edit-btn');
            if (btn && onEditIcon) {
                btn.onclick = () => onEditIcon(sub);
            }
            const closeBtn = document.getElementById('popup-close-btn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    popup.remove();
                    popupRef.current = null;
                    lastPopupFeature.current = null;
                    lastPopupCoords.current = null;
                };
            }
        }, 50);

    }, [activeIcons, popupStyle, palette, isDefaultTheme, onEditIcon]);

    useEffect(() => {
        showPopupRef.current = showPopup;
    }, [showPopup]);

    // Refresh any open popup when the theme palette or popup styles change
    useEffect(() => {
        if (!popupRef.current || !lastPopupFeature.current || !lastPopupCoords.current) return;
        showPopup(lastPopupFeature.current, lastPopupCoords.current);
    }, [showPopup, popupStyle, palette]);

    // --- DATA PIPELINE ---
    const refreshData = async (map: maplibregl.Map) => {
        const zoom = map.getZoom();
        // Removed manual zoom threshold check effectively delegating visibility to the map's vector tiles.
        // If the feature exists in the tile, we show it.

        const layerIds = poiLayerIdsRef.current;
        if (!layerIds.length) {
            log.debug('No base POI layers discovered; skipping refresh');
            return;
        }

        const poiSources = poiSourcesRef.current;
        if (!poiSources.length) {
            log.debug('No POI sources discovered; skipping refresh');
            return;
        }

        const pendingSource = poiSources.find(({ source }) => !map.isSourceLoaded(source));
        if (pendingSource) {
            const onData = (e: any) => {
                if (!e.isSourceLoaded || e.sourceId !== pendingSource.source) return;
                map.off('sourcedata', onData);
                refreshData(map);
            };
            map.on('sourcedata', onData);
            return;
        }

        if (typeof map.areTilesLoaded === 'function' && !map.areTilesLoaded()) {
            if (!idleRefreshPendingRef.current) {
                idleRefreshPendingRef.current = true;
                map.once('idle', () => {
                    idleRefreshPendingRef.current = false;
                    refreshData(map);
                });
            }
            log.debug('Deferring POI refresh until tiles finish loading');
            return;
        }

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
                const iconKey = activeIcons[subcategory]?.imageUrl ? subcategory
                    : (activeIcons[category]?.imageUrl ? category : null);

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

        if (features.length === 0 && placesRef.current.length > 0) {
            log.debug('Skipping POI source clear while tiles load; keeping previous features', { zoom });
            return;
        }

        placesRef.current = features as any[];

        const source = map.getSource('places') as maplibregl.GeoJSONSource;
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features: features as any
            });
            log.debug('Refreshed POI features', { count: features.length, zoom });
        }
    };

    // --- REFS FOR STALE CLOSURE FIX ---
    const refreshDataRef = useRef<(map: maplibregl.Map) => void>();
    useEffect(() => {
        refreshDataRef.current = refreshData;
    }, [refreshData]);

    // --- INITIALIZATION ---
    useEffect(() => {
        // Wait for safe style to be ready
        if (mapInstance.current || !styleJSON || !mapContainer.current) return;

        log.info("Initializing MapLibre 4.6.0");

        try {
            const map = new maplibregl.Map({
                container: mapContainer.current,
                // Start with empty style to separate init issues from style loading issues
                style: { version: 8, sources: {}, layers: [] },
                center: [-122.4194, 37.7749],
                zoom: 14,
                attributionControl: false,
                refreshExpiredTiles: false,
                transformRequest: (url) => {
                    // Ensure all URLs are absolute before MapLibre touches them
                    const absUrl = absolutizeUrl(url, DEFAULT_STYLE_URL);
                    return { url: absUrl };
                }
            });

            // Set the real style immediately after construction
            // This sometimes helps bypassing initial validation logic that checks location
            map.setStyle(styleJSON);

            map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

            map.on('error', (e) => {
                if (e.error?.message !== 'The user aborted a request.') {
                    log.error("Map Error", e);
                }
            });

            map.on('styleimagemissing', (e) => {
                if (map.hasImage(e.id)) return;
                try {
                    const empty = { width: 1, height: 1, data: new Uint8Array(4) } as any;
                    map.addImage(e.id, empty, { pixelRatio: 1 });
                } catch (err) {
                    log.warn('Failed to supply fallback image for', e.id, err);
                }
            });


            const ensureFallbackDot = () => {
                if (map.hasImage('fallback-dot')) return;
                const canvas = document.createElement('canvas');
                canvas.width = 20; canvas.height = 20;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.beginPath();
                    ctx.arc(10, 10, 7, 0, Math.PI * 2);
                    ctx.fillStyle = '#4285F4';
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    map.addImage('fallback-dot', ctx.getImageData(0, 0, 20, 20));
                }
            };

            map.on('load', () => {
                log.info("Map Loaded");
                setLoaded(true);
                mapReadyRef.current = true;
                if (onMapLoad) onMapLoad(map);

                const styleLayers = map.getStyle()?.layers || [];
                const poiLayers = styleLayers
                    .filter(l => l.type === 'symbol' && typeof (l as any)['source-layer'] === 'string' && (l as any)['source-layer'].toLowerCase().includes('poi'));

                const poiLayer = poiLayers.find(l => (l.id.includes('poi') || l.id.includes('amenity') || l.id.includes('place')));
                if (poiLayer?.layout) {
                    defaultPoiStyleRef.current = {
                        iconImage: poiLayer.layout['icon-image'],
                        iconSize: poiLayer.layout['icon-size'],
                        textSize: poiLayer.layout['text-size'],
                        textFont: poiLayer.layout['text-font'],
                        textOffset: poiLayer.layout['text-offset'],
                        textAnchor: poiLayer.layout['text-anchor'],
                        iconAllowOverlap: poiLayer.layout['icon-allow-overlap'],
                        textAllowOverlap: poiLayer.layout['text-allow-overlap']
                    };
                }

                poiLayerIdsRef.current = poiLayers.map(l => l.id);
                const seenSources = new Set<string>();
                poiSourcesRef.current = poiLayers.reduce<{ source: string; sourceLayer: string }[]>((acc, layer) => {
                    const source = (layer as any).source as string | undefined;
                    const sourceLayer = (layer as any)['source-layer'] as string | undefined;
                    if (!source || !sourceLayer) return acc;
                    const key = `${source}|${sourceLayer}`;
                    if (seenSources.has(key)) return acc;
                    seenSources.add(key);
                    acc.push({ source, sourceLayer });
                    return acc;
                }, []);

                const minZooms = poiLayers
                    .map((layer) => typeof (layer as any).minzoom === 'number' ? (layer as any).minzoom : null)
                    .filter((z): z is number => z !== null);
                if (minZooms.length) {
                    defaultPoiMinZoomRef.current = Math.min(...minZooms);
                }

                // Add POI Layers...
                if (!map.getSource('places')) {
                    map.addSource('places', {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] },
                        cluster: false
                    });
                }

                ensureFallbackDot();

                ensureAllIcons(map);

                if (!map.getLayer('unclustered-point')) {
                    map.addLayer({
                        id: 'unclustered-point',
                        type: 'symbol',
                        source: 'places',
                        layout: {
                            'icon-image': ['coalesce', ['get', 'iconKey'], defaultPoiStyleRef.current.iconImage ?? 'fallback-dot'],
                            'icon-size': defaultPoiStyleRef.current.iconSize ?? [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                8, 0.18,
                                12, 0.3,
                                16, 0.45,
                                20, 0.6
                            ],
                            'icon-allow-overlap': defaultPoiStyleRef.current.iconAllowOverlap ?? false,
                            'text-allow-overlap': defaultPoiStyleRef.current.textAllowOverlap ?? false,
                            'text-field': ['get', 'title'],
                            'text-font': defaultPoiStyleRef.current.textFont ?? ['Noto Sans Regular'],
                            'text-offset': defaultPoiStyleRef.current.textOffset ?? [0, 1.1],
                            'text-anchor': defaultPoiStyleRef.current.textAnchor ?? 'top',
                            'text-size': defaultPoiStyleRef.current.textSize ?? 11,
                            'text-optional': true
                        },
                        paint: {
                            'text-color': ['coalesce', ['get', 'textColor'], '#202124'],
                            'text-halo-color': ['coalesce', ['get', 'haloColor'], '#ffffff'],
                            'text-halo-width': 2
                        }
                    });
                }

                map.on('click', 'unclustered-point', (e) => {
                    if (!e.features || e.features.length === 0) return;
                    const coordinates = (e.features[0].geometry as any).coordinates.slice();
                    if (showPopupRef.current) {
                        showPopupRef.current(e.features[0], coordinates);
                        selectedPlaceId.current = e.features[0].properties.id;
                    }
                });

                map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

                refreshDataRef.current?.(map);
            });

            map.on('moveend', () => {
                if (mapReadyRef.current) refreshDataRef.current?.(map);
            });

            mapInstance.current = map;
        } catch (e) {
            log.error("Map Init Exception", e);
        }

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, [styleJSON]);

    useEffect(() => {
        if (!loaded || !mapInstance.current) return;
        refreshData(mapInstance.current);
    }, [activeIcons, popupStyle, loaded, palette]);

    return (
        <div className="relative w-full h-full bg-gray-200">
            <div ref={mapContainer} className="w-full h-full" />
        </div>
    );
};

export default MapView;
