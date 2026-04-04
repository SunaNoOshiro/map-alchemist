import React, { useRef } from 'react';
import { IconDefinition, LoadedPoiSearchItem, PoiMapVisibilityFilters, PopupStyle } from '@/types';
import { useMapLogic } from '../hooks/useMapLogic';

interface MapViewProps {
    mapStyleJson: any;
    styleId?: string | null;
    palette?: Record<string, string>;
    activeIcons: Record<string, IconDefinition>;
    popupStyle: PopupStyle;
    onMapLoad?: (map: any) => void;
    isDefaultTheme: boolean;
    onEditIcon?: (category: string) => void;
    isThemeSelected?: boolean;
    activeThemeName?: string;
    onLoadedPoisChange?: (pois: LoadedPoiSearchItem[]) => void;
    poiFocusRequest?: { id: string; nonce: number } | null;
    poiMapVisibilityFilters: PoiMapVisibilityFilters;
}

const MapView: React.FC<MapViewProps> = (props) => {
    const mapContainer = useRef<HTMLDivElement>(null);

    // All logic is delegated to the hook/controller
    const { isInitialVisualReady } = useMapLogic({
        containerRef: mapContainer,
        ...props
    });

    return (
        <div
            className="relative w-full h-full bg-gray-200 group overflow-hidden"
            data-testid="map-visual-shell"
            data-map-visual-ready={isInitialVisualReady ? 'true' : 'false'}
        >
            <div
                ref={mapContainer}
                className={`w-full h-full transition-opacity duration-300 ${isInitialVisualReady ? 'opacity-100' : 'opacity-0'}`}
                data-testid="map-container"
            />
            <div
                data-testid="map-initial-veil"
                data-visible={isInitialVisualReady ? 'false' : 'true'}
                aria-hidden={isInitialVisualReady ? 'true' : 'false'}
                className={`absolute inset-0 z-10 transition-opacity duration-300 ${isInitialVisualReady ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
                style={{
                    background: 'radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 40%), linear-gradient(180deg, rgba(15,23,42,0.16) 0%, rgba(15,23,42,0.24) 100%)'
                }}
            >
                <div className="absolute inset-x-0 top-6 flex justify-center px-4">
                    <div className="rounded-full border border-white/20 bg-slate-950/55 px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-slate-100 shadow-lg backdrop-blur-sm">
                        Preparing {props.activeThemeName || 'selected theme'}...
                    </div>
                </div>
            </div>
            {props.isThemeSelected && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 shadow-lg transition-all opacity-0 group-hover:opacity-100">
                    <span className="text-blue-400 font-medium">Active Theme:</span>
                    <span className="ml-1 font-mono">{props.activeThemeName || 'Default'}</span>
                </div>
            )}
        </div>
    );
};

export default MapView;
