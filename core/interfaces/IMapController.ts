
export interface MapEvent<T = any> {
    originalEvent: any;
    features?: any[];
    point: { x: number, y: number };
    lngLat: { lng: number, lat: number };
}

export type MapEventHandler = (event: MapEvent) => void;

export interface IMapController {
    /**
     * Mounts the map to a container.
     */
    initialize(container: HTMLElement, style?: any, onLoad?: () => void): void;

    /**
     * Clean up resources.
     */
    dispose(): void;

    /**
     * Updates the style JSON of the map.
     */
    setStyle(styleJson: any): void;

    /**
     * Get all current layers (for palette application).
     */
    getLayers(): any[];

    /**
     * Sets a paint property on a specific layer.
     */
    setPaintProperty(layerId: string, property: string, value: any): void;

    /**
     * Adds an image to the map's sprite sheet.
     */
    addImage(id: string, image: ImageBitmap | HTMLImageElement | ImageData): void;
    removeImage(id: string): void;
    hasImage(id: string): boolean;

    /**
     * Updates GeoJSON data for a source.
     */
    setGeoJsonSourceData(sourceId: string, data: any): void;

    /**
     * Adds a simple popup at the given coordinates.
     */
    showPopup(coordinates: [number, number], htmlContent: string, options?: any): void;
    removePopup(): void;

    /**
     * Query rendered features from the map.
     */
    queryRenderedFeatures(point: [number, number], options?: any): any[];
    querySourceFeatures(sourceId: string, options?: any): any[];

    /**
     * Event Listeners
     */
    on(event: string, callback: MapEventHandler, layerId?: string): void;
    off(event: string, callback: MapEventHandler, layerId?: string): void;
}
