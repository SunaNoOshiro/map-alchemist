
import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { IconDefinition, PlaceMarker, PopupStyle } from '../types';
import { OSM_MAPPING, FALLBACK_MAPPING, DEFAULT_STYLE_URL } from '../constants';

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
    console.warn("Failed to set maplibregl.workerUrl", e);
}

interface MapViewProps {
  apiKey: string; 
  mapStyleJson: any; 
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
        console.warn("Area too large for Overpass demo");
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
      out center 50;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        return data.elements || [];
    } catch (err) {
        console.error("Overpass Fetch Error", err);
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
                        console.warn(`TileJSON inline failed for ${key}`, e);
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
        console.error("Style Load Failed", e);
        return { version: 8, sources: {}, layers: [] };
    }
};

const MapView: React.FC<MapViewProps> = ({ 
  mapStyleJson, 
  activeIcons, 
  popupStyle,
  onMapLoad,
  isDefaultTheme,
  onEditIcon
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

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
  useEffect(() => {
    if (!loaded || !mapInstance.current || !mapStyleJson || isDefaultTheme) return;
    const map = mapInstance.current;

    const colors = mapStyleJson;

    const setColor = (layerIds: string[], paintProp: string, color?: string) => {
        if (!color) return;
        layerIds.forEach(id => {
            if (map.getLayer(id)) {
                try {
                    map.setPaintProperty(id, paintProp, color);
                } catch (e) {
                    // ignore coloring failures for optional layers
                }
            }
        });
    };

    setColor(['water', 'waterway', 'waterway-name'], 'line-color', colors.water);
    setColor(['water', 'waterway', 'waterway-area'], 'fill-color', colors.water);

    setColor(['background', 'landcover', 'land'], 'background-color', colors.land);
    setColor(['park', 'landuse', 'landcover_park'], 'fill-color', colors.park || colors.land);

    setColor(['building'], 'fill-color', colors.building);

    const roadLayers = (map.getStyle()?.layers || [])
        .filter(l => l.type === 'line' && /transportation|road/i.test(l.id))
        .map(l => l.id);
    setColor([...roadLayers, 'road-primary'], 'line-color', colors.road);

    if (colors.text) {
        (map.getStyle()?.layers || [])
            .filter(l => l.type === 'symbol')
            .forEach(l => {
                try {
                    map.setPaintProperty(l.id, 'text-color', colors.text);
                } catch (e) {
                    // ignore
                }
            });
    }

    // Sync clusters & labels to the theme so POIs reflect the palette
    if (map.getLayer('clusters')) {
        try { map.setPaintProperty('clusters', 'circle-color', colors.road || colors.water); } catch (e) {/* ignore */}
    }
    if (map.getLayer('cluster-count')) {
        try { map.setPaintProperty('cluster-count', 'text-color', colors.text || popupStyle.textColor); } catch (e) {/* ignore */}
    }
    if (map.getLayer('unclustered-point')) {
        try { map.setPaintProperty('unclustered-point', 'text-color', colors.text || popupStyle.textColor); } catch (e) {/* ignore */}
    }
  }, [mapStyleJson, isDefaultTheme, loaded, popupStyle]);

  // --- ICON UPDATER ---
  useEffect(() => {
    if (!loaded || !mapInstance.current) return;
    const map = mapInstance.current;

    Object.keys(activeIcons).forEach(cat => {
        const iconDef = activeIcons[cat];
        if (iconDef.imageUrl && !map.hasImage(cat)) {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                if (!map.hasImage(cat)) map.addImage(cat, img);
            };
            img.src = iconDef.imageUrl;
        }
    });

    if (!map.hasImage('fallback-dot')) {
        const canvas = document.createElement('canvas');
        canvas.width = 20; canvas.height = 20;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.arc(10, 10, 8, 0, Math.PI*2);
            ctx.fillStyle = '#4285F4';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            map.addImage('fallback-dot', ctx.getImageData(0,0,20,20));
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

      const bg = popupStyle.backgroundColor;
      const text = popupStyle.textColor;
      const border = popupStyle.borderColor;
      
      const html = `
        <div style="font-family: ${popupStyle.fontFamily}; color: ${text}; background: ${bg}; border: 2px solid ${border}; border-radius: ${popupStyle.borderRadius}; padding: 12px; min-width: 240px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="display: flex; gap: 10px;">
                ${headerImg ? `<div style="width: 60px; height: 60px; background: rgba(0,0,0,0.05); border-radius: 6px; padding: 4px; display:flex; align-items:center; justify-content:center;"><img src="${headerImg}" style="max-width:100%; max-height:100%;" /></div>` : ''}
                <div style="flex:1;">
                    <h3 style="margin:0 0 4px; font-size:16px; font-weight:bold; line-height:1.2;">${title}</h3>
                    <div style="font-size:11px; text-transform:uppercase; font-weight:bold; opacity:0.7;">${sub}</div>
                </div>
            </div>
            <div style="margin-top:8px; font-size:13px; opacity:0.9; border-top:1px solid ${border}40; padding-top:8px;">
                ${desc}
            </div>
            ${!isDefaultTheme ? `<button id="popup-edit-btn" style="margin-top:8px; width:100%; padding:4px; background:${border}20; border:none; border-radius:4px; cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; gap:4px; color:${text};">${wandIcon} Remix Icon</button>` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 15, maxWidth: '320px' })
          .setLngLat(coordinates)
          .setHTML(html)
          .addTo(mapInstance.current);

      popupRef.current = popup;
      
      setTimeout(() => {
          const btn = document.getElementById('popup-edit-btn');
          if (btn && onEditIcon) {
              btn.onclick = () => onEditIcon(sub);
          }
      }, 50);

  }, [activeIcons, popupStyle, isDefaultTheme, onEditIcon]);

  // --- INITIALIZATION ---
  useEffect(() => {
      // Wait for safe style to be ready
      if (mapInstance.current || !styleJSON || !mapContainer.current) return;
      
      console.log("[MapAlchemist] Initializing MapLibre 4.6.0");

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
                 console.error("Map Error", e);
             }
          });

          map.on('load', () => {
              console.log("[MapAlchemist] Map Loaded");
              setLoaded(true);
              if (onMapLoad) onMapLoad(map);

              // Add POI Layers...
              if (!map.getSource('places')) {
                map.addSource('places', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                    cluster: true,
                    clusterMaxZoom: 14,
                    clusterRadius: 50
                });
              }

              if (!map.getLayer('clusters')) {
                map.addLayer({
                    id: 'clusters',
                    type: 'circle',
                    source: 'places',
                    filter: ['has', 'point_count'],
                    paint: {
                        'circle-color': '#51bbd6',
                        'circle-radius': 18,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff'
                    }
                });
              }

              if (!map.getLayer('cluster-count')) {
                map.addLayer({
                    id: 'cluster-count',
                    type: 'symbol',
                    source: 'places',
                    filter: ['has', 'point_count'],
                    layout: {
                        'text-field': '{point_count_abbreviated}',
                        'text-font': ['Noto Sans Regular'], 
                        'text-size': 12
                    },
                    paint: {
                        'text-color': '#ffffff'
                    }
                });
              }

              if (!map.getLayer('unclustered-point')) {
                map.addLayer({
                    id: 'unclustered-point',
                    type: 'symbol',
                    source: 'places',
                    filter: ['!', ['has', 'point_count']],
                    layout: {
                        'icon-image': ['get', 'iconKey'], 
                        'icon-size': 0.8, 
                        'icon-allow-overlap': true,
                        'text-field': ['get', 'title'],
                        'text-font': ['Noto Sans Regular'],
                        'text-offset': [0, 1.2],
                        'text-anchor': 'top',
                        'text-size': 11,
                        'text-optional': true 
                    },
                    paint: {
                        'text-color': ['get', 'textColor'],
                        'text-halo-color': ['get', 'haloColor'],
                        'text-halo-width': 2
                    }
                });
              }

              map.on('click', 'clusters', (e) => {
                  const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
                  const clusterId = features[0].properties.cluster_id;
                  (map.getSource('places') as any).getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                      if (err) return;
                      map.easeTo({ center: (features[0].geometry as any).coordinates, zoom: zoom });
                  });
              });

              map.on('click', 'unclustered-point', (e) => {
                  if (!e.features || e.features.length === 0) return;
                  const coordinates = (e.features[0].geometry as any).coordinates.slice();
                  showPopup(e.features[0], coordinates);
                  selectedPlaceId.current = e.features[0].properties.id;
              });

              map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
              map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

              refreshData(map);
          });

          map.on('moveend', () => {
              if (loaded) refreshData(map);
          });

          mapInstance.current = map;
      } catch (e) {
          console.error("Map Init Exception", e);
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
      
      if (zoom < 13) return; 

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
          
          return {
              type: 'Feature',
              properties: {
                  id,
                  title: el.tags?.name || match.subcategory,
                  category: match.category,
                  subcategory: match.subcategory,
                  description: el.tags?.['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:housenumber']||''}` : '',
                  iconKey,
                  textColor: popupStyle.textColor,
                  haloColor: popupStyle.backgroundColor
              },
              geometry: {
                  type: 'Point',
                  coordinates: [el.lon || el.center?.lon, el.lat || el.center?.lat]
              }
          };
      }).filter(f => f.geometry.coordinates[0]);

      const source = map.getSource('places') as maplibregl.GeoJSONSource;
      if (source) {
          source.setData({
              type: 'FeatureCollection',
              features: features as any
          });
      }
  };

  useEffect(() => {
      if (!loaded || !mapInstance.current) return;
      refreshData(mapInstance.current);
  }, [activeIcons, popupStyle, loaded]);

  return (
    <div className="relative w-full h-full bg-gray-200">
       <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};

export default MapView;
