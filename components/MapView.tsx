
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IconDefinition, PlaceMarker, PopupStyle, DisplayMode } from '../types';
import MapConfigError from './map/MapConfigError';
import { storageService } from '../services/storage';
import { TYPE_MAPPING, FALLBACK_MAPPING, VISIBILITY_CONFIG } from '../constants';

interface MapViewProps {
  apiKey: string;
  mapStyleJson: any[];
  activeIcons: Record<string, IconDefinition>;
  popupStyle: PopupStyle;
  onMapLoad?: (map: any) => void;
  isDefaultTheme: boolean;
  onEditIcon?: (category: string) => void; 
}

let googleMapsPromise: Promise<void> | null = null;

// --- CONFIGURATION ---

const CLUSTER_CONFIG = {
    ENABLED: true,
    MAX_ZOOM: 13, // Cluster below this zoom
    GRID_SIZE_PX: 80, // Size of grid cell in pixels
};

const ZOOM_CONFIG = {
    MIN_ZOOM_VISIBLE: 10, // Global hard limit
    MAX_ITEMS: { 
        10: 10,
        11: 15,
        12: 25,
        13: 40,
        14: 60, 
        15: 80,
        16: 120,
        17: 150,
        18: 200
    },
    MIN_REVIEWS: {
        10: 5000,
        11: 3000,
        12: 1000, 
        13: 500,
        14: 100, 
        15: 10,
        16: 0,
        17: 0,
        18: 0
    },
    // Collision radius for ICON placement
    COLLISION_RADIUS_PX: {
        10: 40,
        11: 40,
        12: 50, 
        13: 50,
        14: 60, 
        15: 50, 
        16: 45, 
        17: 40,
        18: 30
    }
};

const CATEGORY_COLORS: Record<string, string> = {
    'Food & Drink': '#E7711B', 
    'Shopping': '#4285F4',
    'Health': '#D93025',
    'Transport': '#1A73E8', 
    'Services': '#757575',
    'Attractions': '#137333',
    'Education': '#137333', 
    'Religious': '#757575', 
    'Cluster': '#333333'
};

const MapView: React.FC<MapViewProps> = ({ 
  apiKey, 
  mapStyleJson, 
  activeIcons, 
  popupStyle,
  onMapLoad,
  isDefaultTheme,
  onEditIcon
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any | null>(null);
  const infoWindowRef = useRef<any | null>(null);
  
  // State refs for map entities
  const markersRef = useRef<Map<string, any>>(new Map());
  const fadingMarkersRef = useRef<Map<string, { marker: any, opacity: number }>>(new Map());
  const isAnimatingRef = useRef<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState<boolean>(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceMarker | null>(null);
  
  const allPlacesCache = useRef<Map<string, PlaceMarker>>(new Map()); 
  const cachedSvgs = useRef<Map<string, string>>(new Map());

  const activeIconsRef = useRef(activeIcons);
  const isDefaultThemeRef = useRef(isDefaultTheme);
  const popupStyleRef = useRef(popupStyle);
  const onEditIconRef = useRef(onEditIcon);

  useEffect(() => {
      activeIconsRef.current = activeIcons;
      isDefaultThemeRef.current = isDefaultTheme;
      popupStyleRef.current = popupStyle;
      onEditIconRef.current = onEditIcon;
  }, [activeIcons, isDefaultTheme, popupStyle, onEditIcon]);

  // --- ANIMATION LOOP ---
  const animate = useCallback(() => {
    let needsUpdate = false;
    fadingMarkersRef.current.forEach((data, id) => {
        if (data.opacity < 1) {
            data.opacity += 0.2; 
            if (data.opacity >= 1) {
                data.opacity = 1;
                data.marker.setOpacity(1);
                fadingMarkersRef.current.delete(id);
            } else {
                data.marker.setOpacity(data.opacity);
                needsUpdate = true;
            }
        } else {
            fadingMarkersRef.current.delete(id);
        }
    });

    if (needsUpdate || fadingMarkersRef.current.size > 0) {
        requestAnimationFrame(animate);
    } else {
        isAnimatingRef.current = false;
    }
  }, []);

  const triggerAnimation = useCallback(() => {
      if (!isAnimatingRef.current) {
          isAnimatingRef.current = true;
          requestAnimationFrame(animate);
      }
  }, [animate]);

  // --- LOGIC: TAXONOMY & RANKING ---
  
  const processGooglePlace = (p: any): PlaceMarker => {
      // 1. Determine Taxonomy
      let bestMatch = FALLBACK_MAPPING;
      
      // Iterate through google types to find highest priority match
      if (p.types && p.types.length > 0) {
          for (const type of p.types) {
              if (TYPE_MAPPING[type]) {
                  // If we don't have a match yet, or if this match has higher baseRank (conceptually, though our map uses mapped rank)
                  // For now, simple first-valid-match or specific priority overrides
                  bestMatch = TYPE_MAPPING[type];
                  break; 
              }
          }
      }

      // 2. Calculate Rank (0-100)
      // Factors: Base Category Rank, Review Count, Rating
      const reviews = p.user_ratings_total || 0;
      const rating = p.rating || 0;
      
      // Logarithmic scale for reviews: 0->0, 10->1, 100->2, 1000->3, 10000->4
      const reviewScore = Math.min(Math.log10(reviews + 1) * 20, 40); // Max 40 points from reviews
      const ratingScore = (rating / 5) * 10; // Max 10 points from rating
      
      // Emergency/Transport Boost
      let emergencyBoost = 0;
      if (['Hospital', 'Police', 'Fire Station', 'Airport'].includes(bestMatch.subcategory)) {
          emergencyBoost = 20;
      }

      const rank = Math.min(bestMatch.baseRank + reviewScore + ratingScore + emergencyBoost, 100);

      return {
          id: p.place_id,
          lat: p.geometry.location.lat(),
          lng: p.geometry.location.lng(),
          title: p.name,
          category: bestMatch.category,
          subcategory: bestMatch.subcategory,
          iconKey: bestMatch.subcategory, // Using subcategory as key for now
          description: p.vicinity,
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          rank: rank,
          googleTypes: p.types,
          displayMode: 'NONE', // Calculated later
          visualState: 'DEFAULT'
      };
  };

  // --- LOGIC: SVG GENERATION ---

  const createPinSvg = (place: PlaceMarker, iconUrl: string | null, isDefault: boolean, themeBg: string) => {
      if (place.isCluster) {
           const count = place.clusterCount || 0;
           const size = 40 + Math.min(count, 20); // Dynamic size
           return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#333333" stroke="white" stroke-width="2" opacity="0.9"/>
                    <text x="50%" y="50%" dy=".3em" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="${size/2.5}px">${count}</text>
                </svg>
           `)}`;
      }

      const color = CATEGORY_COLORS[place.category] || '#4285F4';
      
      if (isDefault) {
          // Fallback to simple circle for default theme if no url
          const size = 32;
          return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>
          `)}`;
      }

      // Custom AI Icon Logic
      if (iconUrl) {
          const size = 64; 
          const imgSize = 58; // Increased size to fill space better without ring
          const offset = (size - imgSize) / 2;
          
          return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <defs>
               <filter id="ds" x="-50%" y="-50%" width="200%" height="200%">
                 <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.5"/>
               </filter>
            </defs>
            <g filter="url(#ds)">
               <image href="${iconUrl}" x="${offset}" y="${offset}" width="${imgSize}" height="${imgSize}" preserveAspectRatio="xMidYMid slice" />
            </g>
          </svg>`)}`;
      }

      // Fallback Dot
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="6" fill="${color}" stroke="white" stroke-width="2"/>
          </svg>`)}`;
  };

  // --- LOGIC: VISIBILITY PIPELINE ---

  const latLngToPixel = (lat: number, lng: number, zoom: number) => {
      const scale = Math.pow(2, zoom);
      const worldCoordinateX = (lng + 180) / 360 * 256 * scale;
      const siny = Math.sin(lat * Math.PI / 180);
      const boundedSiny = Math.min(Math.max(siny, -0.9999), 0.9999);
      const worldCoordinateY = (0.5 - Math.log((1 + boundedSiny) / (1 - boundedSiny)) / (4 * Math.PI)) * 256 * scale;
      return { x: worldCoordinateX, y: worldCoordinateY };
  };

  const recalculateVisibleMarkers = useCallback(() => {
      if (!mapInstanceRef.current) return;
      const map = mapInstanceRef.current;
      const zoom = map.getZoom();
      const bounds = map.getBounds();

      if (!zoom || !bounds || zoom < ZOOM_CONFIG.MIN_ZOOM_VISIBLE) {
          markersRef.current.forEach(m => m.setMap(null));
          markersRef.current.clear();
          fadingMarkersRef.current.clear();
          return;
      }

      // --- PHASE 1: FILTERING & RANKING ---
      
      const visibleCandidates: PlaceMarker[] = [];
      const minReviews = (ZOOM_CONFIG.MIN_REVIEWS as any)[zoom] || 0;
      const maxItems = (ZOOM_CONFIG.MAX_ITEMS as any)[zoom] || 100;

      allPlacesCache.current.forEach((place) => {
          if (!bounds.contains({ lat: place.lat, lng: place.lng })) return;
          
          // MinZoom check (Taxonomy based)
          const visibilityRule = VISIBILITY_CONFIG[place.subcategory] || VISIBILITY_CONFIG['default'];
          if (zoom < visibilityRule.minZoomIcon) return;
          
          // Review threshold check (skip if zoom is low and reviews are low)
          if (place.user_ratings_total && place.user_ratings_total < minReviews) return;

          // Clone to modify runtime props
          const p = { ...place }; 
          
          // Client-side Boosts
          // Intent Boost (if category selected)
          // Viewport Boost (center bias - rudimentary implementation)
          
          // Hysteresis Boost (keep existing)
          if (markersRef.current.has(p.id)) p.rank += 10;
          if (selectedPlace?.id === p.id) p.rank += 100; // Always keep selected

          visibleCandidates.push(p);
      });

      visibleCandidates.sort((a, b) => b.rank - a.rank);
      
      // Top N candidates
      const topCandidates = visibleCandidates.slice(0, maxItems);

      // --- PHASE 2: CLUSTERING (Optional based on zoom) ---
      
      let renderList: PlaceMarker[] = [];
      
      if (CLUSTER_CONFIG.ENABLED && zoom <= CLUSTER_CONFIG.MAX_ZOOM) {
          const clusters: Record<string, PlaceMarker[]> = {};
          
          for (const p of topCandidates) {
              const pixel = latLngToPixel(p.lat, p.lng, zoom);
              const gridX = Math.floor(pixel.x / CLUSTER_CONFIG.GRID_SIZE_PX);
              const gridY = Math.floor(pixel.y / CLUSTER_CONFIG.GRID_SIZE_PX);
              const key = `${gridX}-${gridY}`;
              
              if (!clusters[key]) clusters[key] = [];
              clusters[key].push(p);
          }

          // Convert clusters to markers
          Object.values(clusters).forEach(group => {
              if (group.length === 1) {
                  renderList.push(group[0]);
              } else {
                  // Create cluster representative
                  // Use the highest rank item as the location anchor
                  const leader = group[0]; 
                  renderList.push({
                      ...leader,
                      id: `cluster-${leader.id}`,
                      isCluster: true,
                      clusterCount: group.length,
                      title: `${group.length} Places`,
                      rank: 1000 // Clusters usually stay on top
                  });
              }
          });
      } else {
          renderList = topCandidates;
      }

      // --- PHASE 3: COLLISION & DISPLAY MODE ---
      
      const finalSelection: PlaceMarker[] = [];
      const placedBounds: { x: number, y: number, r: number }[] = [];
      
      let baseCollisionR = (ZOOM_CONFIG.COLLISION_RADIUS_PX as any)[zoom] || 50;
      if (!isDefaultTheme) baseCollisionR *= 1.2;

      for (const p of renderList) {
          const pixel = latLngToPixel(p.lat, p.lng, zoom);
          let collided = false;
          
          for (const existing of placedBounds) {
              const dx = pixel.x - existing.x;
              const dy = pixel.y - existing.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < (baseCollisionR + existing.r) * 0.8) {
                  collided = true;
                  break;
              }
          }

          if (!collided) {
              // Determine Display Mode (Label vs Icon)
              let showLabel = false;
              if (!p.isCluster) {
                  const visibilityRule = VISIBILITY_CONFIG[p.subcategory] || VISIBILITY_CONFIG['default'];
                  if (zoom >= visibilityRule.minZoomLabel) {
                       // Check label collision (stricter)
                       let labelCollided = false;
                       for (const existing of placedBounds) {
                           const dx = pixel.x - existing.x;
                           const dy = pixel.y - existing.y;
                           if (Math.sqrt(dx*dx + dy*dy) < baseCollisionR * 1.5) {
                               labelCollided = true;
                               break;
                           }
                       }
                       if (!labelCollided) showLabel = true;
                  }
              }

              p.displayMode = showLabel ? 'ICON_LABEL' : 'ICON_ONLY';
              finalSelection.push(p);
              placedBounds.push({ x: pixel.x, y: pixel.y, r: baseCollisionR });
          }
      }

      // --- PHASE 4: RENDER UPDATES ---

      // 1. Remove markers not in final selection
      markersRef.current.forEach((marker, id) => {
          const stillVisible = finalSelection.find(p => p.id === id);
          if (!stillVisible) {
              marker.setMap(null);
              markersRef.current.delete(id);
              fadingMarkersRef.current.delete(id);
          }
      });

      // 2. Add/Update markers
      let needsAnim = false;
      finalSelection.forEach(place => {
          const iconDef = activeIcons[place.subcategory]; // Try specific subcategory first
          const fallbackIconDef = activeIcons[place.category]; // Then category
          
          const activeIconDef = iconDef || fallbackIconDef;
          const iconUrl = isDefaultTheme ? null : activeIconDef?.imageUrl;
          const themeBg = popupStyle ? popupStyle.backgroundColor : '#ffffff';

          const urlPart = iconUrl ? `${iconUrl.length}-${iconUrl.slice(0, 10)}-${iconUrl.slice(-10)}` : 'def';
          const cacheKey = `${place.subcategory}-${isDefaultTheme}-${urlPart}-${themeBg}-${place.isCluster ? place.clusterCount : 0}`;

          let svgUrl = cachedSvgs.current.get(cacheKey);
          if (!svgUrl) {
              svgUrl = createPinSvg(place, iconUrl, isDefaultTheme, themeBg);
              cachedSvgs.current.set(cacheKey, svgUrl);
          }

          const anchor = isDefaultTheme 
              ? new window.google.maps.Point(16, 16) 
              : new window.google.maps.Point(32, 32);
          
          const labelOrigin = isDefaultTheme
              ? new window.google.maps.Point(16, 28)
              : new window.google.maps.Point(32, 68);

          const markerOptions = {
              icon: {
                  url: svgUrl,
                  scaledSize: isDefaultTheme ? new window.google.maps.Size(32, 32) : new window.google.maps.Size(64, 64),
                  anchor: anchor,
                  labelOrigin: labelOrigin
              },
              label: (place.displayMode === 'ICON_LABEL') ? {
                  text: place.title,
                  className: isDefaultTheme ? 'map-label-native' : 'map-label-custom'
              } : null,
              zIndex: Math.floor(place.rank) + (place.isCluster ? 1000 : 0)
          };

          if (markersRef.current.has(place.id)) {
              // Update existing
              const marker = markersRef.current.get(place.id);
              marker.setIcon(markerOptions.icon);
              marker.setLabel(markerOptions.label);
              marker.setZIndex(markerOptions.zIndex);
              
              // Force full opacity if not animating
              if (!fadingMarkersRef.current.has(place.id)) {
                  marker.setOpacity(1.0);
              }
          } else {
              // Create new
              const marker = new window.google.maps.Marker({
                  map: mapInstanceRef.current,
                  position: { lat: place.lat, lng: place.lng },
                  title: place.title,
                  ...markerOptions,
                  optimized: false, // Critical for SVG quality
                  opacity: 0.0 // Start invisible for fade-in
              });
              
              if (!place.isCluster) {
                  marker.addListener("click", () => {
                      setSelectedPlace(place);
                      // Open popup logic... (reused from existing)
                      if (infoWindowRef.current) {
                          const content = getPopupContent(place, activeIconsRef.current[place.subcategory] || activeIconsRef.current[place.category], isDefaultThemeRef.current);
                          infoWindowRef.current.setContent(content);
                          infoWindowRef.current.open(mapInstanceRef.current, marker);
                      }
                  });
              } else {
                  // Cluster click -> zoom in
                  marker.addListener("click", () => {
                      map.setCenter({ lat: place.lat, lng: place.lng });
                      map.setZoom(zoom + 2);
                  });
              }

              markersRef.current.set(place.id, marker);
              fadingMarkersRef.current.set(place.id, { marker, opacity: 0.0 });
              needsAnim = true;
          }
      });
      
      if (needsAnim) triggerAnimation();

  }, [activeIcons, isDefaultTheme, popupStyle, triggerAnimation]);

  // --- POPUP CONTENT GENERATOR (Reused & Updated) ---
  const getPopupContent = useCallback((place: PlaceMarker, iconDef: IconDefinition | undefined, isDefault: boolean) => {
      const wandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M10.6 17.4 12 16"/><path d="M12.5 2.5 8 7"/><path d="M17.5 7.5 13 3"/><path d="M7 21l9-9"/><path d="M3 21l9-9"/></svg>`;
      const catColor = CATEGORY_COLORS[place.category] || '#666';

      if (!isDefault) {
          const aiIconSrc = iconDef?.imageUrl;
          // Use SVG fallback if no image
          const headerSrc = aiIconSrc || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="${catColor}"/><circle cx="50" cy="50" r="30" fill="rgba(255,255,255,0.3)"/></svg>`)}`;
          
          return `
              <div class="theme-popup-content">
                  <div class="theme-popup-close" onclick="document.querySelector('.gm-ui-hover-effect').click()">✕</div>
                  <div class="theme-popup-img-container">
                      <img src="${headerSrc}" class="theme-popup-img" />
                      <button class="theme-popup-edit-btn" data-category="${place.subcategory}" title="Edit Icon">
                         ${wandIcon}
                      </button>
                  </div>
                  <div class="theme-popup-header-info">
                      <div class="theme-popup-title">${place.title}</div>
                      <div class="theme-popup-meta" style="background-color: ${catColor};">${place.subcategory}</div>
                  </div>
                  <div class="theme-popup-desc">
                      ${place.description || "No address available."}
                      ${place.rating ? `<br/><span style="opacity:0.7; font-size: 12px; margin-top: 4px; display:inline-block;">★ ${place.rating} (${place.user_ratings_total || 0} reviews)</span>` : ''}
                  </div>
              </div>
          `;
      } else {
          return `
              <div class="theme-popup-content" style="padding: 16px; display: block; min-width: 220px; font-family: Roboto, Arial, sans-serif;">
                  <div class="theme-popup-title" style="border-bottom: none; margin-bottom: 4px; font-size: 16px; color: #202124;">${place.title}</div>
                  <div class="theme-popup-desc" style="color: #5f6368; border: none; padding: 0;">${place.description || place.subcategory}</div>
                  <div style="margin-top: 8px; font-size: 12px; color: ${catColor}; font-weight: 500;">${place.subcategory}</div>
              </div>
          `;
      }
  }, []);

  const fetchPlaces = useCallback((map: any) => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const zoom = map.getZoom();
      if (zoom < ZOOM_CONFIG.MIN_ZOOM_VISIBLE) return; 

      const service = new window.google.maps.places.PlacesService(map);
      const request = { bounds: bounds, type: 'point_of_interest', rankBy: window.google.maps.places.RankBy.PROMINENCE };

      service.nearbySearch(request, (results: any[], status: any, pagination: any) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
              let changed = false;
              results.forEach((p: any) => {
                  if (!allPlacesCache.current.has(p.place_id)) {
                      // PROCESS & MAP TO INTERNAL TYPE
                      const processed = processGooglePlace(p);
                      allPlacesCache.current.set(processed.id, processed);
                      changed = true;
                  }
              });
              if (changed) recalculateVisibleMarkers();
              if (pagination && pagination.hasNextPage) setTimeout(() => pagination.nextPage(), 2000);
          }
      });
  }, [recalculateVisibleMarkers]);

  // --- BOILERPLATE EFFECTS ---
  
  useEffect(() => {
    const handleEditClick = (e: any) => {
        const btn = e.target.closest('.theme-popup-edit-btn');
        if (btn) {
            const category = btn.getAttribute('data-category');
            if (category && onEditIconRef.current) {
                onEditIconRef.current(category);
            }
        }
    };
    document.addEventListener('click', handleEditClick);
    return () => document.removeEventListener('click', handleEditClick);
  }, []);

  useEffect(() => {
    const styleId = 'map-theme-popup-styles';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    const labelColor = popupStyle ? popupStyle.textColor : '#ffffff';
    const labelStroke = popupStyle ? popupStyle.backgroundColor : '#000000';
    const fontFamily = popupStyle ? popupStyle.fontFamily : 'sans-serif';
    const labelCss = !isDefaultTheme ? `
        .map-label-custom {
            color: ${labelColor} !important;
            font-family: ${fontFamily}, sans-serif !important;
            font-weight: 700 !important;
            text-shadow: 
                -2px -2px 0 ${labelStroke}, 
                 2px -2px 0 ${labelStroke}, 
                -2px  2px 0 ${labelStroke}, 
                 2px  2px 0 ${labelStroke},
                 0 2px 4px rgba(0,0,0,0.8) !important;
            font-size: 12px !important;
            white-space: nowrap !important;
            pointer-events: none;
            padding: 2px 4px;
        }
    ` : `
        .map-label-native { 
            color: #202124 !important;
            font-family: Roboto, Arial, sans-serif !important;
            font-weight: 500 !important;
            font-size: 12px !important;
            text-shadow: 0 0 2px #ffffff;
        }
    `;
    if (popupStyle && !isDefaultTheme) {
      styleTag.innerHTML = labelCss + `
        .gm-style .gm-style-iw { padding: 0 !important; overflow: visible !important; }
        .gm-style .gm-style-iw-d { overflow: visible !important; padding: 0 !important; max-height: none !important; }
        button.gm-ui-hover-effect { display: none !important; }
        .gm-style .gm-style-iw-c { background-color: ${popupStyle.backgroundColor} !important; border-radius: ${popupStyle.borderRadius} !important; border: 2px solid ${popupStyle.borderColor} !important; padding: 0 !important; box-shadow: 0 8px 30px rgba(0,0,0,0.5) !important; box-sizing: border-box !important; }
        .gm-style .gm-style-iw-t::after { background: ${popupStyle.backgroundColor} !important; }
        .theme-popup-content { color: ${popupStyle.textColor}; font-family: ${popupStyle.fontFamily}, sans-serif; padding: 16px; min-width: 340px; display: grid; grid-template-columns: 100px 1fr; gap: 16px; box-sizing: border-box; align-items: flex-start; position: relative; }
        .theme-popup-close { position: absolute; top: -12px; right: -12px; width: 32px; height: 32px; background-color: ${popupStyle.backgroundColor}; color: ${popupStyle.textColor}; border: 1px solid ${popupStyle.borderColor}; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 50; font-weight: bold; font-size: 18px; transition: transform 0.2s; }
        .theme-popup-close:hover { transform: scale(1.1); filter: brightness(1.1); }
        .theme-popup-img-container { width: 100px; height: 100px; position: relative; grid-column: 1; grid-row: 1; border-radius: 8px; overflow: hidden; border: 2px solid ${popupStyle.borderColor}; background: ${popupStyle.backgroundColor === '#ffffff' ? '#f3f4f6' : 'rgba(255,255,255,0.1)'}; padding: 12px; box-shadow: inset 0 0 15px rgba(0,0,0,0.15); box-sizing: border-box; }
        .theme-popup-img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
        .theme-popup-header-info { display: flex; flex-direction: column; justify-content: center; grid-column: 2; grid-row: 1; height: 100px; }
        .theme-popup-title { font-weight: 800; font-size: 18px; line-height: 1.25; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .theme-popup-meta { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; align-self: flex-start; padding: 4px 10px; border-radius: 999px; color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .theme-popup-desc { grid-column: 1 / -1; grid-row: 2; margin-top: 4px; padding-top: 12px; border-top: 1px solid ${popupStyle.borderColor}; font-size: 13px; line-height: 1.5; opacity: 0.9; }
        .theme-popup-edit-btn { position: absolute; bottom: 4px; right: 4px; width: 24px; height: 24px; background: ${popupStyle.backgroundColor}; border: 1px solid ${popupStyle.borderColor}; color: ${popupStyle.textColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 10; }
        .theme-popup-edit-btn:hover { transform: scale(1.1); filter: brightness(1.1); }
        .theme-popup-edit-btn svg { width: 12px; height: 12px; }
      `;
    } else {
        styleTag.innerHTML = labelCss; 
    }
  }, [popupStyle, isDefaultTheme]);

  useEffect(() => {
    if (isMapReady) return; 
    const loadScript = () => {
        if (window.google && window.google.maps) {
            setIsMapReady(true);
            return;
        }
        if (!apiKey) {
            setError("Google Maps API Key missing.");
            setNeedsKey(true);
            return;
        }
        window.gm_authFailure = () => {
            setError("Google Maps authentication failed.");
            setNeedsKey(true);
        };
        if (!googleMapsPromise) {
            googleMapsPromise = new Promise((resolve, reject) => {
                const callbackName = `initMap_${Date.now()}`;
                (window as any)[callbackName] = () => { resolve(); delete (window as any)[callbackName]; };
                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&loading=async&callback=${callbackName}&v=weekly`;
                script.async = true;
                script.onerror = () => reject(new Error("Network Error loading Google Maps"));
                document.head.appendChild(script);
            });
        }
        googleMapsPromise.then(() => setIsMapReady(true)).catch((err) => { setError(err.message); setNeedsKey(true); });
    };
    loadScript();
  }, [apiKey, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || mapInstanceRef.current) return;
    try {
        const map = new window.google.maps.Map(mapRef.current, {
            center: { lat: 37.7749, lng: -122.4194 },
            zoom: 14,
            disableDefaultUI: false,
            styles: mapStyleJson, 
            mapTypeControl: false,
            streetViewControl: false,
            gestureHandling: 'greedy',
            clickableIcons: false 
        });
        mapInstanceRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow({ disableAutoPan: false, zIndex: 100 });
        infoWindowRef.current.addListener('closeclick', () => {
            setSelectedPlace(null);
        });
        if (onMapLoad) onMapLoad(map);
    } catch (e) { console.error("Map creation error", e); }
  }, [isMapReady, onMapLoad]); 

  // EFFECT 2: Handle Map Idle/Move Listener
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    let debounceTimer: ReturnType<typeof setTimeout>;
    const onIdle = () => {
       recalculateVisibleMarkers();
       clearTimeout(debounceTimer);
       debounceTimer = setTimeout(() => fetchPlaces(mapInstanceRef.current), 500); 
    };

    window.google.maps.event.clearListeners(mapInstanceRef.current, 'idle');
    mapInstanceRef.current.addListener('idle', onIdle);
    
    // Initial call on mount/ready
    onIdle();

    return () => {
        if (mapInstanceRef.current) window.google.maps.event.clearListeners(mapInstanceRef.current, 'idle');
        clearTimeout(debounceTimer);
    };
  }, [fetchPlaces, recalculateVisibleMarkers, isMapReady]);

  // EFFECT 3: FORCE UPDATE when visual props change (Theme, Icons, Popup)
  useEffect(() => {
      if (isMapReady && mapInstanceRef.current) {
          recalculateVisibleMarkers();
      }
  }, [recalculateVisibleMarkers, isMapReady]);

  const handleSaveKey = (key: string) => {
      if (key.trim()) { storageService.saveMapsApiKey(key.trim()); window.location.reload(); }
  };

  return (
    <div className="relative w-full h-full bg-gray-200">
       {(error || needsKey) && <MapConfigError error={error} onSaveKey={handleSaveKey} />}
       <div ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default MapView;
