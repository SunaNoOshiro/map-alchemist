import React, { useRef } from 'react';
import { IconDefinition, PopupStyle } from '@/types';
import { useMapLogic } from '../hooks/useMapLogic';

interface MapViewProps {
    apiKey: string;
    mapStyleJson: any;
    palette?: Record<string, string>;
    activeIcons: Record<string, IconDefinition>;
    popupStyle: PopupStyle;
    onMapLoad?: (map: any) => void;
    isDefaultTheme: boolean;
    onEditIcon?: (category: string) => void;
    isThemeSelected?: boolean;
    activeThemeName?: string;
}

const MapView: React.FC<MapViewProps> = (props) => {
    const mapContainer = useRef<HTMLDivElement>(null);

    // All logic is delegated to the hook/controller
    useMapLogic({
        containerRef: mapContainer,
        ...props
    });

    return (
        <div className="relative w-full h-full bg-gray-200 group">
            <div ref={mapContainer} className="w-full h-full" />
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
