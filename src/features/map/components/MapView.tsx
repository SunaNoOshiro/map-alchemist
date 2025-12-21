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
}

const MapView: React.FC<MapViewProps> = (props) => {
    const mapContainer = useRef<HTMLDivElement>(null);

    // All logic is delegated to the hook/controller
    useMapLogic({
        containerRef: mapContainer,
        ...props
    });

    return (
        <div className="relative w-full h-full bg-gray-200">
            <div ref={mapContainer} className="w-full h-full" />
        </div>
    );
};

export default MapView;
