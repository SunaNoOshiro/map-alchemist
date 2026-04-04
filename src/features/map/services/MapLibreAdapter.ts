import maplibregl from 'maplibre-gl';
import { IMapController, MapEventHandler } from '@core/interfaces/IMapController';
import { DEFAULT_STYLE_URL } from '@/constants';
import { createLogger } from '@core/logger';

const logger = createLogger('MapLibreAdapter');
const APP_POPUP_CLASS = 'mapalchemist-app-popup';
const APP_POPUP_STYLE_TAG_ID = 'mapalchemist-app-popup-style';
const MAPLIBRE_NUMERIC_NULL_WARNING = 'Expected value to be of type number, but found null instead.';

const installConsoleWarnFilter = () => {
    if (typeof window === 'undefined' || typeof console === 'undefined') return;
    const patchedFlag = '__mapAlchemistWarnFilterInstalled';
    if ((window as any)[patchedFlag]) return;

    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
        const firstArg = typeof args[0] === 'string' ? args[0] : '';
        // Some third-party base styles emit this warning frequently for nullable
        // feature properties. It is noisy and not actionable in app runtime.
        if (firstArg.includes(MAPLIBRE_NUMERIC_NULL_WARNING)) return;
        originalWarn(...args as any[]);
    };

    (window as any)[patchedFlag] = true;
};

// --- WORKER CONFIG ---
try {
    // Keep MapLibre warnings out of user-facing console.
    // External base styles can emit noisy non-actionable warnings (e.g. nullable numeric features).
    if (typeof (maplibregl as any).setLogLevel === 'function') {
        (maplibregl as any).setLogLevel('error');
    }
    // @ts-ignore
    maplibregl.workerUrl = "https://unpkg.com/maplibre-gl@4.6.0/dist/maplibre-gl-csp-worker.js";
} catch (e) {
    logger.warn("Failed to set maplibregl.workerUrl", e);
}

// Helper: Absolutize URL (moved from MapView)
const safeBaseHref = () => {
    try {
        if (typeof document !== "undefined" && document.baseURI) return document.baseURI;
        if (typeof window !== "undefined" && window.location?.href) return window.location.href;
    } catch (e) { }
    return "https://example.com/";
};

const absolutizeUrl = (url: string, base?: string) => {
    if (!url || typeof url !== "string") return url;
    if (/^[a-z]+:/i.test(url)) return url;
    if (url.startsWith("//")) return "https:" + url;

    const b = base ?? safeBaseHref();
    try {
        return new URL(url, b).href.replace(/%7B/g, "{").replace(/%7D/g, "}");
    } catch (e) {
        return url;
    }
};

const ensureAppPopupStyles = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(APP_POPUP_STYLE_TAG_ID)) return;

    const styleTag = document.createElement('style');
    styleTag.id = APP_POPUP_STYLE_TAG_ID;
    styleTag.textContent = [
        `.${APP_POPUP_CLASS}.maplibregl-popup {`,
        '  max-width: none !important;',
        '  overflow: visible !important;',
        '  z-index: 4 !important;',
        '}',
        `.${APP_POPUP_CLASS}.maplibregl-popup .maplibregl-popup-content {`,
        '  background: transparent !important;',
        '  border: 0 !important;',
        '  box-shadow: none !important;',
        '  padding: 0 !important;',
        '  overflow: visible !important;',
        '}',
        `.${APP_POPUP_CLASS}.maplibregl-popup .maplibregl-popup-tip {`,
        '  display: none !important;',
        '}',
        '@media (max-width: 639px) {',
        '  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left {',
        '    bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;',
        '  }',
        '}'
    ].join('\n');

    document.head.appendChild(styleTag);
};

export class MapLibreAdapter implements IMapController {
    private map: maplibregl.Map | null = null;
    private popup: maplibregl.Popup | null = null;
    private listenerRegistry = new WeakMap<MapEventHandler, Array<{
        event: string;
        layerId?: string;
        wrapper: (event: any) => void;
    }>>();

    initialize(container: HTMLElement, style?: any, onLoad?: () => void): void {
        installConsoleWarnFilter();

        const isMobileViewport = typeof window !== 'undefined'
            && window.matchMedia?.('(max-width: 639px)').matches;

        this.map = new maplibregl.Map({
            container,
            style: style || { version: 8, sources: {}, layers: [] },
            center: [-122.4194, 37.7749],
            zoom: 14,
            attributionControl: false,
            refreshExpiredTiles: false,
            transformRequest: (url) => {
                const absUrl = absolutizeUrl(url, DEFAULT_STYLE_URL);
                return { url: absUrl };
            }
        });

        this.map.addControl(
            new maplibregl.AttributionControl({ compact: true }),
            isMobileViewport ? 'bottom-left' : 'bottom-right'
        );
        this.map.addControl(
            new maplibregl.NavigationControl({ showCompass: true }),
            isMobileViewport ? 'bottom-right' : 'top-right'
        );

        let didNotifyReady = false;
        const notifyReady = () => {
            if (didNotifyReady) return;
            didNotifyReady = true;
            if (onLoad) onLoad();
        };

        // `load` can lag behind the first correct style paint for remote styles.
        // `styledata` lets the app reveal the selected theme sooner while `load`
        // still acts as a safety net if the style pipeline behaves differently.
        this.map.once('styledata', notifyReady);
        this.map.once('load', notifyReady);

        // Fallback image handler
        this.map.on('styleimagemissing', (e) => {
            if (this.map?.hasImage(e.id)) return;
            try {
                const empty = { width: 1, height: 1, data: new Uint8Array(4) } as any;
                this.map?.addImage(e.id, empty, { pixelRatio: 1 });
            } catch (err) {
                logger.warn('Failed to supply fallback image', e.id, err);
            }
        });
    }

    dispose(): void {
        this.listenerRegistry = new WeakMap();
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }

    setStyle(styleJson: any): void {
        this.map?.setStyle(styleJson);
    }

    getLayers(): any[] {
        return this.map?.getStyle()?.layers || [];
    }

    setPaintProperty(layerId: string, property: string, value: any): void {
        if (!this.map?.getLayer(layerId)) return;
        try {
            this.map.setPaintProperty(layerId, property, value);
        } catch (e) {
            // Ignore errors for missing layers/properties
        }
    }

    addImage(
        id: string,
        image: ImageBitmap | HTMLImageElement | ImageData,
        options?: { sdf?: boolean; pixelRatio?: number }
    ): void {
        if (this.map?.hasImage(id)) this.map.removeImage(id);
        this.map?.addImage(id, image as any, {
            pixelRatio: 1,
            ...(options || {})
        });
    }

    removeImage(id: string): void {
        if (this.map?.hasImage(id)) this.map.removeImage(id);
    }

    hasImage(id: string): boolean {
        return !!this.map?.hasImage(id);
    }

    setGeoJsonSourceData(sourceId: string, data: any): void {
        const source = this.map?.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) {
            source.setData(data);
        } else {
            // If source doesn't exist, create it (simplified for POI use case)
            if (this.map && !this.map.getSource(sourceId)) {
                this.map.addSource(sourceId, {
                    type: 'geojson',
                    data: data,
                    cluster: false
                });
            }
        }
    }

    showPopup(coordinates: [number, number], htmlContent: string, options?: any): void {
        if (!this.map) return;
        this.removePopup();
        ensureAppPopupStyles();
        this.popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: true,
            anchor: 'bottom',
            className: APP_POPUP_CLASS,
            ...(options || {})
        })
            .setLngLat(coordinates)
            .setHTML(htmlContent)
            .addTo(this.map);
    }

    removePopup(): void {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
    }

    getPopupElement(): HTMLElement | null {
        return this.popup?.getElement() || null;
    }

    on(event: string, callback: MapEventHandler, layerId?: string): void {
        if (!this.map) return;

        const wrapper = (e: any) => {
            callback({
                originalEvent: e,
                features: e.features,
                point: e.point,
                lngLat: e.lngLat
            });
        };
        // @ts-ignore - maplibregl types are weird with layerId optionality
        if (layerId) {
            // @ts-ignore
            this.map.on(event, layerId, wrapper);
        } else {
            this.map.on(event, wrapper);
        }

        const registered = this.listenerRegistry.get(callback) || [];
        registered.push({ event, layerId, wrapper });
        this.listenerRegistry.set(callback, registered);
    }

    off(event: string, callback: MapEventHandler, layerId?: string): void {
        if (!this.map) return;

        const registered = this.listenerRegistry.get(callback);
        if (!registered?.length) return;

        const remaining: typeof registered = [];
        registered.forEach((entry) => {
            const matches = entry.event === event && entry.layerId === layerId;
            if (!matches) {
                remaining.push(entry);
                return;
            }

            try {
                if (entry.layerId) {
                    // @ts-ignore
                    this.map?.off(entry.event, entry.layerId, entry.wrapper);
                } else {
                    this.map?.off(entry.event, entry.wrapper);
                }
            } catch (error) {
                logger.warn('Failed to remove map listener', { event: entry.event, layerId: entry.layerId, error });
            }
        });

        if (remaining.length > 0) {
            this.listenerRegistry.set(callback, remaining);
        } else {
            this.listenerRegistry.delete(callback);
        }
    }

    queryRenderedFeatures(point: [number, number], options?: any): any[] {
        if (!this.map) return [];
        // MapLibre uses pixels for queryRenderedFeatures
        // But the interface might imply coords? 
        // Standard MapLibre queryRenderedFeatures takes [x,y] or geometry.
        // Let's assume the caller passes what MapLibre expects for now or we adapt.
        // For POI logic in MapView, it used 'querySourceFeatures', not rendered.
        return this.map.queryRenderedFeatures(point as any, options);
    }

    querySourceFeatures(sourceId: string, options?: any): any[] {
        return this.map?.querySourceFeatures(sourceId, options) || [];
    }

    // Direct access for things we haven't abstracted yet (Pragmatism)
    getRawMap(): maplibregl.Map | null {
        return this.map;
    }
}
