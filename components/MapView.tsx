
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { IconDefinition, PlaceMarker, PopupStyle } from '../types';
import { OSM_MAPPING, FALLBACK_MAPPING, DEFAULT_STYLE_URL, getCategoryColor } from '../constants';
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
const fetchOverpassData = async (bounds: maplibregl.LngLatBounds): Promise<any[]> => {
    const s = bounds.getSouth();
    const w = bounds.getWest();
    const n = bounds.getNorth();
    const e = bounds.getEast();
    
    // Safety check for large areas
    if ((n - s) * (e - w) > 1.0) {
        log.warn("Area too large for Overpass demo");
        return [];
    }

    const query = `
      [out:json][timeout:15];
      (
        node["amenity"](${s},${w},${n},${e});
        node["shop"](${s},${w},${n},${e});
        node["tourism"](${s},${w},${n},${e});
        node["leisure"](${s},${w},${n},${e});
      );
      out center;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        return data.elements || [];
    } catch (err) {
        log.error("Overpass Fetch Error", err);
        return [];
    }
};

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
  const defaultPoiStyleRef = useRef<{
      iconSize?: any;
      textSize?: any;
      textFont?: any;
      textOffset?: any;
      textAnchor?: any;
      iconAllowOverlap?: any;
      textAllowOverlap?: any;
  }>({});
  const placesRef = useRef<any[]>([]);
  const loadedIconUrls = useRef<Record<string, string | null>>({});

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
            try { map.setPaintProperty('clusters', 'circle-color', colors.road || colors.water); log.trace('Cluster fill tinted'); } catch (e) {/* ignore */}
        }
        if (map.getLayer('cluster-count')) {
            try { map.setPaintProperty('cluster-count', 'text-color', colors.text || popupStyle.textColor); log.trace('Cluster count tinted'); } catch (e) {/* ignore */}
        }
        if (map.getLayer('unclustered-point')) {
            try { map.setPaintProperty('unclustered-point', 'text-color', colors.text || popupStyle.textColor); log.trace('POI labels tinted'); } catch (e) {/* ignore */}
        }
    };

    applyPaletteToLayers();
    map.on('styledata', applyPaletteToLayers);
    log.debug('Attached styledata listener for palette synchronization');
    return () => { map.off('styledata', applyPaletteToLayers); };
  }, [palette, loaded, popupStyle]);

  // --- ICON UPDATER ---
  useEffect(() => {
    if (!loaded || !mapInstance.current) return;
    const map = mapInstance.current;

    Object.entries(activeIcons).forEach(([cat, iconDef]) => {
        const incomingUrl = iconDef.imageUrl;
        const previousUrl = loadedIconUrls.current[cat];

        if (!incomingUrl) {
            if (map.hasImage(cat)) map.removeImage(cat);
            delete loadedIconUrls.current[cat];
            return;
        }

        if (previousUrl === incomingUrl && map.hasImage(cat)) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            try {
                if (map.hasImage(cat)) map.removeImage(cat);
                map.addImage(cat, img, { pixelRatio: 2 });
                loadedIconUrls.current[cat] = incomingUrl;
            } catch (e) {
                log.error('Failed to register image', { cat, error: e });
            }
        };
        img.onerror = () => {
            log.warn('Icon failed to load', { cat, url: incomingUrl });
            if (map.hasImage(cat)) map.removeImage(cat);
            delete loadedIconUrls.current[cat];
        };
        img.src = incomingUrl;
    });

    // Remove icons that are no longer present in the active set
    Object.keys(loadedIconUrls.current).forEach((cat) => {
        if (!activeIcons[cat] && map.hasImage(cat)) {
            map.removeImage(cat);
            delete loadedIconUrls.current[cat];
        }
    });

    if (!map.hasImage('fallback-dot')) {
        const canvas = document.createElement('canvas');
        canvas.width = 24; canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.arc(12, 12, 9, 0, Math.PI*2);
            ctx.fillStyle = '#4285F4';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            map.addImage('fallback-dot', ctx.getImageData(0,0,24,24));
        }
    }
  }, [activeIcons, loaded]);

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
              canvas.width = 32; canvas.height = 32;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.beginPath();
                  ctx.arc(16, 16, 12, 0, Math.PI*2);
                  ctx.fillStyle = '#4285F4';
                  ctx.fill();
                  ctx.strokeStyle = 'white';
                  ctx.lineWidth = 2;
                  ctx.stroke();
                  map.addImage('fallback-dot', ctx.getImageData(0,0,32,32));
              }
          };

          map.on('load', () => {
              log.info("Map Loaded");
              setLoaded(true);
              mapReadyRef.current = true;
              if (onMapLoad) onMapLoad(map);

              const styleLayers = map.getStyle()?.layers || [];
              const poiLayer = styleLayers.find(l => l.type === 'symbol' && (l.id.includes('poi') || l.id.includes('amenity') || l.id.includes('place')));
              if (poiLayer?.layout) {
                  defaultPoiStyleRef.current = {
                      iconSize: poiLayer.layout['icon-size'],
                      textSize: poiLayer.layout['text-size'],
                      textFont: poiLayer.layout['text-font'],
                      textOffset: poiLayer.layout['text-offset'],
                      textAnchor: poiLayer.layout['text-anchor'],
                      iconAllowOverlap: poiLayer.layout['icon-allow-overlap'],
                      textAllowOverlap: poiLayer.layout['text-allow-overlap']
                  };
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

              if (!map.getLayer('unclustered-point')) {
                map.addLayer({
                    id: 'unclustered-point',
                    type: 'symbol',
                    source: 'places',
                    layout: {
                        'icon-image': ['coalesce', ['get', 'iconKey'], 'fallback-dot'],
                        'icon-size': defaultPoiStyleRef.current.iconSize ?? [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            8, 0.35,
                            12, 0.55,
                            16, 0.75,
                            20, 0.9
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

              refreshData(map);
          });

          map.on('moveend', () => {
              if (mapReadyRef.current) refreshData(map);
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

  // --- DATA PIPELINE ---
  const refreshData = async (map: maplibregl.Map) => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      if (zoom < 13) {
          log.debug('Skipping Overpass fetch; zoom below threshold', { zoom });
          return;
      }

      const rawElements = await fetchOverpassData(bounds);

      const features = rawElements.map(el => {
          const id = el.id.toString();
          
          let match = FALLBACK_MAPPING;
          if (el.tags) {
              for (const [key, value] of Object.entries(el.tags)) {
                  const combo = `${key}=${value}`;
                  if (OSM_MAPPING[combo]) {
                      match = OSM_MAPPING[combo];
                      break;
                  }
              }
          }
          
          const iconKey = activeIcons[match.subcategory]?.imageUrl ? match.subcategory : (activeIcons[match.category]?.imageUrl ? match.category : 'fallback-dot');
          
          const labelColor = palette.text || popupStyle.textColor || '#202124';
          const haloColor = palette.land || popupStyle.backgroundColor || '#ffffff';

          return {
              type: 'Feature',
              properties: {
                  id,
                  title: el.tags?.name || match.subcategory,
                  category: match.category,
                  subcategory: match.subcategory,
                  description: el.tags?.['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:housenumber']||''}` : '',
                  iconKey,
                  textColor: labelColor,
                  haloColor
              },
              geometry: {
                  type: 'Point',
                  coordinates: [el.lon || el.center?.lon, el.lat || el.center?.lat]
              }
          };
      }).filter(f => f.geometry.coordinates[0]);

      placesRef.current = features as any[];

      const source = map.getSource('places') as maplibregl.GeoJSONSource;
      if (source) {
          source.setData({
              type: 'FeatureCollection',
              features: features as any
          });
          log.debug('Refreshed Overpass features', { count: features.length, zoom });
      }
  };

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
