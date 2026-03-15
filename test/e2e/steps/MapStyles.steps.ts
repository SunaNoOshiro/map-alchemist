import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { MAP_CATEGORIES } from '../../../src/constants';

const { Given, When, Then } = createBdd();

const normalizeCategoryKey = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const VALID_ICON_KEYS = Array.from(
    new Set(
        MAP_CATEGORIES.map((category) => normalizeCategoryKey(category))
    )
);
let lastClickedPoiTitle: string | null = null;
let rememberedMapView: { lng: number; lat: number; zoom: number } | null = null;

async function waitForGuestOrMap(page: Page): Promise<'guest' | 'map'> {
    await expect.poll(async () => {
        const guestVisible = await page.getByRole('button', { name: /Continue as Guest/i }).isVisible().catch(() => false);
        if (guestVisible) return 'guest';

        const mapVisible = await page.locator('.maplibregl-canvas').isVisible().catch(() => false);
        if (mapVisible) return 'map';

        return 'boot';
    }, {
        timeout: 30000,
        message: 'Application did not finish bootstrapping into either auth screen or map view.'
    }).not.toBe('boot');

    const guestVisible = await page.getByRole('button', { name: /Continue as Guest/i }).isVisible().catch(() => false);
    return guestVisible ? 'guest' : 'map';
}

// Helper: Find and click a visible POI with a likely icon (copied from original spec)
async function clickVisiblePOI(page: Page, preference: 'default' | 'top-edge' = 'default') {
    console.log('[E2E] Waiting for POI features to be available in source...');
    // Ensure we are at street level zoom where POIs are rendered
    await page.evaluate(() => {
        const map = (window as any).__map;
        if (map && map.getZoom() < 13) {
            map.setZoom(14);
        }
    });

    await expect.poll(async () => {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return false;
            const placesSource = map.getSource?.('places');
            if (!placesSource) return false;

            const sourceData = (placesSource as any)?._data;
            const sourceFeatures = Array.isArray(sourceData?.features) ? sourceData.features.length : 0;
            if (sourceFeatures > 0) return true;

            const queriedFeatures = map.querySourceFeatures('places') || [];
            if (queriedFeatures.length > 0) return true;

            if (sourceFeatures === 0 && queriedFeatures.length === 0) {
                try {
                    map.fire('moveend');
                } catch (_error) {
                    // no-op: best effort refresh
                }
            }
            return false;
        });
    }, {
        message: 'No POI features found in "places" source after 30s',
        timeout: 30000
    }).toBeTruthy();

    let points: Array<{ x: number; y: number; title: string }> | null = null;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        points = await page.evaluate(({ validIconKeys, pointPreference }) => {
            const map = (window as any).__map;
            if (!map) return null;
            const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
            if (!features.length) return null;

            const canvas = map.getCanvas();
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const ratioX = canvas.width / rect.width;
            const ratioY = canvas.height / rect.height;
            const allowedKeys = new Set(validIconKeys);

            const hasDisplayIcon = (feature: any) => {
                const iconKey = feature?.properties?.iconKey;
                if (typeof iconKey !== 'string' || iconKey.length === 0) return false;
                const normalizedIconKey = iconKey.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                return allowedKeys.has(normalizedIconKey);
            };

            const visibleFeatures = features.filter((f: any) => {
                if (!f.properties?.title) return false;
                if (!hasDisplayIcon(f)) return false;
                const p = map.project(f.geometry.coordinates);
                return p.x > 20 && p.y > 20 && p.x < (width - 20) && p.y < (height - 20);
            });

            if (visibleFeatures.length === 0) {
                const placesSource = map.getSource?.('places') as any;
                const sourceFeatures = Array.isArray(placesSource?._data?.features)
                    ? placesSource._data.features
                    : [];
                const preferred = sourceFeatures.find((f: any) => {
                    if (f?.geometry?.type !== 'Point') return false;
                    if (!Array.isArray(f?.geometry?.coordinates) || f.geometry.coordinates.length < 2) return false;
                    return hasDisplayIcon(f);
                });

                if (preferred?.geometry?.coordinates) {
                    map.easeTo({
                        center: preferred.geometry.coordinates,
                        zoom: Math.max(14, map.getZoom()),
                        duration: 0
                    });
                }
                return [];
            }

            const rankedVisibleFeatures = [...visibleFeatures].sort((left: any, right: any) => {
                const leftPixel = map.project(left.geometry.coordinates);
                const rightPixel = map.project(right.geometry.coordinates);
                if (pointPreference === 'top-edge') {
                    if (leftPixel.y !== rightPixel.y) return leftPixel.y - rightPixel.y;
                    return Math.abs(leftPixel.x - width / 2) - Math.abs(rightPixel.x - width / 2);
                }
                const leftCenterDistance = Math.abs(leftPixel.x - width / 2) + Math.abs(leftPixel.y - height / 2);
                const rightCenterDistance = Math.abs(rightPixel.x - width / 2) + Math.abs(rightPixel.y - height / 2);
                return leftCenterDistance - rightCenterDistance;
            });

            return rankedVisibleFeatures.slice(0, 5).map((feature: any) => {
                const pixel = map.project(feature.geometry.coordinates);
                const candidates = [
                    { x: pixel.x, y: pixel.y },
                    ratioX > 0 && ratioY > 0 ? { x: pixel.x / ratioX, y: pixel.y / ratioY } : null
                ].filter(Boolean) as Array<{ x: number; y: number }>;

                const inBounds = (point: { x: number; y: number }) =>
                    point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;

                for (const candidate of candidates) {
                    if (!inBounds(candidate)) continue;
                    const hits = map.queryRenderedFeatures([candidate.x, candidate.y], { layers: ['unclustered-point'] });
                    if (hits && hits.length > 0) {
                        return {
                            ...candidate,
                            title: String(feature.properties?.title || '')
                        };
                    }
                }

                return {
                    ...(candidates.find(inBounds) || candidates[0]),
                    title: String(feature.properties?.title || '')
                };
            });
        }, { validIconKeys: VALID_ICON_KEYS, pointPreference: preference });

        if (points && points.length > 0) break;
        await page.waitForTimeout(1000);
    }

    if (!points || points.length === 0) throw new Error('No visible POI with loaded icon found on map');

    const mapCanvas = page.locator('.maplibregl-canvas');
    await expect(mapCanvas).toBeVisible();
    const popup = page.locator('.maplibregl-popup-content');

    for (const point of points) {
        lastClickedPoiTitle = point.title || null;
        const triggeredViaMapEvent = await page.evaluate((candidate) => {
            const map = (window as any).__map;
            if (!map) return false;
            const hits = map.queryRenderedFeatures([candidate.x, candidate.y], { layers: ['unclustered-point'] });
            if (!hits || hits.length === 0) return false;
            const firstFeature = hits[0] as any;
            const coordinates = firstFeature?.geometry?.coordinates;
            const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number.NaN;
            const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number.NaN;

            try {
                map.fire('click', {
                    point: { x: candidate.x, y: candidate.y },
                    lngLat: Number.isFinite(lng) && Number.isFinite(lat)
                        ? { lng, lat }
                        : map.unproject([candidate.x, candidate.y]),
                    features: hits
                });
                return true;
            } catch (_error) {
                return false;
            }
        }, point);

        if (!triggeredViaMapEvent) {
            await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });
        }

        if (await popup.isVisible().catch(() => false)) {
            return point;
        }
        if (triggeredViaMapEvent) {
            await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });
            if (await popup.isVisible().catch(() => false)) {
                return point;
            }
        }
        await page.waitForTimeout(200);
    }

    throw new Error('POI popup did not appear after clicking visible candidates.');
}

Given('I am on the home page', async ({ page }) => {
    lastClickedPoiTitle = null;
    rememberedMapView = null;
    const errors: string[] = [];

    // Capture console logs and collect errors to fail the test later
    page.on('console', msg => {
        const text = msg.text();
        const type = msg.type();
        console.log(`[BROWSER] ${type}: ${text}`);

        // Filter out tailwind warnings which are expected in dev/preview
        if (type === 'error' && !text.includes('cdn.tailwindcss.com')) {
            errors.push(`Console error [${type}]: ${text}`);
        }
    });

    page.on('pageerror', exception => {
        errors.push(`Uncaught exception: ${exception.message}`);
    });

    page.on('requestfailed', request => {
        const url = request.url();
        // Ignore optional/external resources if needed, but fail on internal assets
        if (url.includes(process.env.VITE_BASE_PATH || '') || url.includes('localhost')) {
            errors.push(`Request failed: ${url} (${request.failure()?.errorText})`);
        }
    });

    page.on('response', response => {
        if (response.status() === 404) {
            const url = response.url();
            // Critical assets that should never 404
            if (url.includes('.json') || url.includes('.js') || url.includes('.css')) {
                errors.push(`Critical 404: ${url}`);
            }
        }
    });

    await page.goto('/');

    const landingState = await waitForGuestOrMap(page);

    // Check if any errors occurred during load
    if (errors.length > 0) {
        throw new Error(`Test failed due to browser errors:\n${errors.join('\n')}`);
    }

    // New: Explicitly check that the app reports themes are loaded
    if (landingState === 'map') {
        const logConsole = page.locator('body');
        // Large JSON files might take time to parse on some systems, increase timeout to 30s
        await expect(logConsole, 'Application log did not show bundled themes as loaded.').toContainText(/Bundled default themes loaded|Loaded existing styles|Standard theme loaded/, {
            timeout: 30000
        });
    }
});

Given('external POI detail APIs are mocked', async ({ page }) => {
    const delayedFulfill = async (route: any, payload: unknown, contentType = 'application/json') => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
            status: 200,
            contentType,
            body: contentType.startsWith('image/')
                ? payload as Buffer
                : JSON.stringify(payload)
        });
    };

    await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
        const url = route.request().url();
        const payload = url.includes('/lookup?')
            ? [{
                osm_id: 42,
                osm_type: 'node',
                display_name: 'Cafe Aurora, 123 Market St, San Francisco, California, 94103, United States',
                address: {
                    house_number: '123',
                    road: 'Market St',
                    city: 'San Francisco',
                    state: 'California',
                    postcode: '94103',
                    country: 'United States'
                },
                extratags: {
                    website: 'https://aurora.example',
                    phone: '+1 415 555 0100',
                    opening_hours: 'Mo-Su 07:00-20:00',
                    image: 'https://images.example.com/broken-cafe-aurora.jpg',
                    wikipedia: 'en:Cafe_Aurora'
                }
            }]
            : {
                display_name: 'Cafe Aurora, 123 Market St, San Francisco, California, 94103, United States',
                address: {
                    house_number: '123',
                    road: 'Market St',
                    city: 'San Francisco',
                    state: 'California',
                    postcode: '94103',
                    country: 'United States'
                },
                extratags: {
                    website: 'https://aurora.example',
                    phone: '+1 415 555 0100',
                    opening_hours: 'Mo-Su 07:00-20:00',
                    image: 'https://images.example.com/broken-cafe-aurora.jpg',
                    wikipedia: 'en:Cafe_Aurora'
                }
            };

        await delayedFulfill(route, payload);
    });

    await page.route('https://en.wikipedia.org/api/rest_v1/page/summary/**', async (route) => {
        await delayedFulfill(route, {
            extract: 'Cafe Aurora is a historic cafe with an all-day menu, community events, seasonal drinks, long-running neighborhood traditions, and a beloved corner patio that attracts visitors throughout the day.'
        });
    });

    await page.route('https://en.wikipedia.org/w/api.php**', async (route) => {
        const url = route.request().url();
        const payload = url.includes('list=geosearch')
            ? {
                query: {
                    geosearch: []
                }
            }
            : {
                query: {
                    pages: [
                        {
                            title: 'Cafe Aurora'
                        }
                    ]
                }
            };

        await delayedFulfill(route, payload);
    });

    await page.route('https://commons.wikimedia.org/w/api.php**', async (route) => {
        const url = route.request().url();
        const matchedTitle = (lastClickedPoiTitle || 'Cafe Aurora').replace(/[_]+/g, ' ').trim();
        const fileTitle = `File:${matchedTitle} San Francisco.jpg`;
        const payload = url.includes('list=geosearch')
            ? {
                query: {
                    geosearch: [
                        {
                            pageid: 201,
                            title: fileTitle,
                            dist: 18
                        }
                    ]
                }
            }
            : {
                query: {
                    pages: [
                        {
                            title: fileTitle,
                            imageinfo: [
                                {
                                    thumburl: 'https://upload.wikimedia.org/fake-cafe-aurora-commons-thumb.jpg',
                                    url: 'https://upload.wikimedia.org/fake-cafe-aurora-commons.jpg',
                                    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle).replace(/%3A/g, ':').replace(/%20/g, '_')}`,
                                    mime: 'image/jpeg'
                                }
                            ]
                        }
                    ]
                }
            };

        await delayedFulfill(route, payload);
    });

    await page.route('https://images.example.com/**', async (route) => {
        await route.fulfill({
            status: 404,
            contentType: 'text/plain',
            body: 'missing'
        });
    });

    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKw66AAAAABJRU5ErkJggg==';
    await page.route('https://upload.wikimedia.org/**', async (route) => {
        await delayedFulfill(route, Buffer.from(tinyPng, 'base64'), 'image/png');
    });
});

Given('I have custom {string} and {string} themes injected', async ({ page }, theme1, theme2) => {
    // Check if we are stuck at Auth Screen
    const guestBtn = page.getByRole('button', { name: /Continue as Guest/i });
    if (await guestBtn.isVisible()) {
        await guestBtn.click();
    }

    const themesPath = path.join(process.cwd(), 'public', 'default-themes.json');
    const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));

    const pirateThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('pirates')) || themesData[0];
    const cartoonThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('cartoon')) || themesData[1] || themesData[0];

    const stripThemeIcons = (theme: any) => ({
        ...theme,
        iconsByCategory: {}
    });

    const themesToInject = [
        stripThemeIcons(pirateThemeOriginal),
        stripThemeIcons(cartoonThemeOriginal)
    ];
    const iconSeedKeys = [...MAP_CATEGORIES];

    await page.evaluate(async ({ themes, iconKeys }) => {
        const dummyIcon = {
            imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKw66AAAAABJRU5ErkJggg==',
            prompt: 'Test icon',
            isLoading: false
        };

        const buildIconMap = () =>
            iconKeys.reduce((acc: Record<string, any>, key: string) => {
                acc[key] = { ...dummyIcon, category: key };
                return acc;
            }, {} as Record<string, any>);

        const createCustom = (base: any, name: string) => ({
            ...base,
            id: 'custom-' + name.toLowerCase().replace(/\s/g, '-') + '-' + Date.now(),
            name: `${name} (Custom)`,
            isBundledDefault: true,
            iconsByCategory: buildIconMap()
        });

        const customStyles = [
            createCustom(themes[0], 'pirates map of treasures'),
            createCustom(themes[1], 'in style of cartoon')
        ];

        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('MapAlchemistDB', 1);
            request.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('styles')) db.createObjectStore('styles');
            };
            request.onsuccess = (e: any) => {
                const db = e.target.result;
                const tx = db.transaction('styles', 'readwrite');
                const store = tx.objectStore('styles');

                // Clear existing the re-put to ensure fresh state
                store.clear();
                store.put(customStyles, 'presets');

                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            };
            request.onblocked = () => {
                console.warn('IndexedDB injection BLOCKED');
                reject(new Error('IndexedDB injection blocked'));
            };
            request.onerror = () => reject(request.error);
        });
    }, { themes: themesToInject, iconKeys: iconSeedKeys });

    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('[E2E] Page reloaded (DOM loaded), waiting for map canvas...');

    const reloadState = await waitForGuestOrMap(page);
    if (reloadState === 'guest') {
        const guestBtnReload = page.getByRole('button', { name: /Continue as Guest/i });
        console.log('[E2E] Auth screen detected after reload, re-clicking Guest Mode...');
        await guestBtnReload.click();
    }

    // Give a small buffer for MapLibre to start initializing after DOM is ready
    await page.waitForTimeout(1000);

    const mapCanvas = page.locator('.maplibregl-canvas');
    await expect(mapCanvas, 'Map canvas (.maplibregl-canvas) did not appear after IndexedDB injection and reload.').toBeVisible({
        timeout: 30000
    });
    console.log('[E2E] Map canvas is visible');
});

When('I select the {string} style', async ({ page }, styleName) => {
    await page.getByRole('heading', { name: styleName }).click();
});

Then('the map should be visible', async ({ page }) => {
    const mapCanvas = page.locator('.maplibregl-canvas');
    await expect(mapCanvas).toBeVisible();
});

Then('POIs should appear without zooming after load', async ({ page }) => {
    await expect.poll(async () => {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return false;

            const placesSource = map.getSource?.('places');
            const sourceData = (placesSource as any)?._data;
            const sourceCount = Array.isArray(sourceData?.features) ? sourceData.features.length : 0;
            const renderedCount = map.queryRenderedFeatures({ layers: ['unclustered-point'] })?.length || 0;

            return sourceCount > 0 && renderedCount > 0;
        });
    }, {
        timeout: 15000,
        message: 'POIs did not appear after initial load without zooming.'
    }).toBe(true);

    const counts = await page.evaluate(() => {
        const map = (window as any).__map;
        if (!map) return { sourceCount: 0, renderedCount: 0 };

        const placesSource = map.getSource?.('places');
        const sourceData = (placesSource as any)?._data;
        return {
            sourceCount: Array.isArray(sourceData?.features) ? sourceData.features.length : 0,
            renderedCount: map.queryRenderedFeatures({ layers: ['unclustered-point'] })?.length || 0
        };
    });

    expect(counts.sourceCount).toBeGreaterThan(0);
    expect(counts.renderedCount).toBeGreaterThan(0);
});

Then('the style {string} should be active', async ({ page }, styleName) => {
    await expect(page.getByTestId('active-style-trigger')).toContainText(styleName);
});

When('I click on a visible POI on the map', async ({ page }) => {
    await clickVisiblePOI(page);
});

When('I click on a visible POI near the top edge of the map', async ({ page }) => {
    await clickVisiblePOI(page, 'top-edge');
});

When('I remember the current map view', async ({ page }) => {
    rememberedMapView = await page.evaluate(() => {
        const map = (window as any).__map;
        if (!map) return null;
        const center = map.getCenter();
        return {
            lng: Number(center.lng),
            lat: Number(center.lat),
            zoom: Number(map.getZoom())
        };
    });

    if (!rememberedMapView) {
        throw new Error('Unable to capture the current map view.');
    }
});

Then('a popup should be visible', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    if (!await popup.isVisible().catch(() => false)) {
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible({ timeout: 10000 });
});

Then('the popup should stay compact', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup:visible [data-testid="poi-popup"]').last();
    await expect(popup).toBeVisible({ timeout: 10000 });

    const box = await popup.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    });

    expect(box.width).toBeLessThanOrEqual(440);
    expect(box.height).toBeLessThanOrEqual(480);
});

Then('the popup should remain inside the map viewport', async ({ page }) => {
    await expect.poll(async () => {
        const metrics = await page.evaluate(() => {
            const mapContainer = document.querySelector('[data-testid="map-container"]') as HTMLElement | null;
            const containerRect = mapContainer?.getBoundingClientRect();
            if (!containerRect) {
                return { isWithin: false, reason: 'missing-container' };
            }

            const activePopup = Array.from(document.querySelectorAll('.maplibregl-popup'))
                .map((element) => {
                    const popupRoot = element.querySelector('[data-testid="poi-popup"]') as HTMLElement | null;
                    if (!popupRoot) return null;

                    const popupRect = popupRoot.getBoundingClientRect();
                    const closeButton = popupRoot.querySelector('#popup-close-btn') as HTMLElement | null;
                    const closeRect = closeButton?.getBoundingClientRect();
                    const combined = closeRect
                        ? {
                            top: Math.min(popupRect.top, closeRect.top),
                            right: Math.max(popupRect.right, closeRect.right),
                            bottom: Math.max(popupRect.bottom, closeRect.bottom),
                            left: Math.min(popupRect.left, closeRect.left)
                        }
                        : popupRect;
                    const intersectionWidth = Math.max(
                        0,
                        Math.min(combined.right, containerRect.right) - Math.max(combined.left, containerRect.left)
                    );
                    const intersectionHeight = Math.max(
                        0,
                        Math.min(combined.bottom, containerRect.bottom) - Math.max(combined.top, containerRect.top)
                    );
                    const intersectionArea = intersectionWidth * intersectionHeight;
                    const style = window.getComputedStyle(element as Element);

                    return {
                        popupRect,
                        combined,
                        intersectionArea,
                        isRendered:
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            popupRect.width > 0 &&
                            popupRect.height > 0
                    };
                })
                .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
                .filter((candidate) => candidate.isRendered)
                .sort((left, right) => right.intersectionArea - left.intersectionArea)[0];

            if (!activePopup) {
                return { isWithin: false, reason: 'missing-popup' };
            }

            const margin = 10;
            const epsilon = 1.5;
            const intersectionWidth = Math.max(
                0,
                Math.min(activePopup.combined.right, containerRect.right) - Math.max(activePopup.combined.left, containerRect.left)
            );
            const intersectionHeight = Math.max(
                0,
                Math.min(activePopup.combined.bottom, containerRect.bottom) - Math.max(activePopup.combined.top, containerRect.top)
            );
            const intersectionArea = intersectionWidth * intersectionHeight;

            return {
                isWithin: (
                    intersectionArea > 0 &&
                    activePopup.combined.left >= containerRect.left + margin - epsilon &&
                    activePopup.combined.right <= containerRect.right - margin + epsilon &&
                    activePopup.combined.top >= containerRect.top + margin - epsilon &&
                    activePopup.combined.bottom <= containerRect.bottom - margin + epsilon
                ),
                popupRect: {
                    top: Math.round(activePopup.popupRect.top),
                    right: Math.round(activePopup.popupRect.right),
                    bottom: Math.round(activePopup.popupRect.bottom),
                    left: Math.round(activePopup.popupRect.left)
                },
                combinedRect: {
                    top: Math.round(activePopup.combined.top),
                    right: Math.round(activePopup.combined.right),
                    bottom: Math.round(activePopup.combined.bottom),
                    left: Math.round(activePopup.combined.left)
                },
                containerRect: {
                    top: Math.round(containerRect.top),
                    right: Math.round(containerRect.right),
                    bottom: Math.round(containerRect.bottom),
                    left: Math.round(containerRect.left)
                },
                intersectionArea: Math.round(intersectionArea)
            };
        });
        return metrics.isWithin;
    }, { timeout: 10000 }).toBe(true);
});

Then('the map view should remain stable after opening the popup', async ({ page }) => {
    if (!rememberedMapView) {
        throw new Error('No remembered map view is available for comparison.');
    }

    const currentMapView = await page.evaluate(() => {
        const map = (window as any).__map;
        if (!map) return null;
        const center = map.getCenter();
        return {
            lng: Number(center.lng),
            lat: Number(center.lat),
            zoom: Number(map.getZoom())
        };
    });

    if (!currentMapView) {
        throw new Error('Unable to read the current map view.');
    }

    expect(Math.abs(currentMapView.zoom - rememberedMapView.zoom)).toBeLessThan(0.01);
    expect(Math.abs(currentMapView.lng - rememberedMapView.lng)).toBeLessThan(0.01);
    expect(Math.abs(currentMapView.lat - rememberedMapView.lat)).toBeLessThan(0.01);
});

Then('the popup should show a themed loading state before enriched details arrive', async ({ page }) => {
    const loadingBlock = page.locator('[data-testid="poi-popup-loading"]');
    await expect(loadingBlock).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="poi-popup-loading-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="poi-popup-loading-line-primary"]')).toBeVisible();
    await expect(page.locator('[data-testid="poi-popup-loading-line-secondary"]')).toBeVisible();
});

Then('the popup should contain an image', async ({ page }) => {
    const popupImg = page.locator('.maplibregl-popup-content img').first();
    await expect(popupImg).toBeVisible();
});

Then('the popup should contain a close button', async ({ page }) => {
    const closeButton = page.locator('#popup-close-btn');
    await expect(closeButton).toBeVisible();
});

Then('the popup should contain location details text', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    await expect(popup).toBeVisible();
    const popupText = (await popup.textContent()) || '';
    expect(popupText.trim().length).toBeGreaterThan(10);
});

Then('the popup should contain enriched place details', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    await expect(popup).toContainText('Market St 123', { timeout: 10000 });
    await expect(popup).toContainText('Mo-Su 07:00-20:00');
});

Then('the popup should contain a Google Maps search link', async ({ page }) => {
    const googleLink = page.locator('#popup-google-maps-link');
    await expect(googleLink).toBeVisible({ timeout: 10000 });
    await expect(googleLink).toHaveAttribute('href', /google\.com\/maps\/search/);

    const href = await googleLink.getAttribute('href');
    const query = decodeURIComponent(new URL(href || '').searchParams.get('query') || '');
    expect(query).toContain('123 Market St');
    expect(query).not.toMatch(/-?\d+\.\d{6},-?\d+\.\d{6}/);
});

Then('the popup should contain an exact location link', async ({ page }) => {
    const exactLink = page.locator('#popup-google-maps-exact-link');
    await expect(exactLink).toBeVisible({ timeout: 10000 });
    await expect(exactLink).toHaveAttribute('href', /google\.com\/maps\/search/);

    const href = await exactLink.getAttribute('href');
    const url = new URL(href || '');
    const query = decodeURIComponent(url.searchParams.get('query') || '');
    expect(query).toMatch(/-?\d+\.\d{6},-?\d+\.\d{6}/);
    expect(query).not.toContain('Market St');
});

Then('the popup should contain an OpenStreetMap link', async ({ page }) => {
    const osmLink = page.locator('#popup-osm-link');
    await expect(osmLink).toBeVisible({ timeout: 10000 });
    await expect(osmLink).toHaveAttribute('href', /openstreetmap\.org/);
});

Then('the popup should contain a Wikipedia link', async ({ page }) => {
    const wikiLink = page.locator('#popup-wikipedia-link');
    await expect(wikiLink).toBeVisible({ timeout: 10000 });
    await expect(wikiLink).toHaveAttribute('href', /wikipedia\.org/);
});

Then('the popup photo should fall back to the next available source', async ({ page }) => {
    const photo = page.locator('#poi-popup-photo-img');
    await expect(photo).toBeVisible({ timeout: 10000 });
    await expect(photo).toHaveAttribute('src', /fake-cafe-aurora-commons-thumb\.jpg/);
    await expect(photo).not.toHaveAttribute('src', /broken-cafe-aurora\.jpg/);
});

Then('the popup action buttons should use balanced sizing', async ({ page }) => {
    const metrics = await page.locator('[data-testid="poi-popup-actions"]').evaluate((element) => {
        const links = Array.from(element.querySelectorAll('a')) as HTMLAnchorElement[];
        const boxes = links.map((link) => link.getBoundingClientRect());
        return {
            count: links.length,
            heights: boxes.map((box) => Math.round(box.height)),
            widths: boxes.map((box) => Math.round(box.width))
        };
    });

    expect(metrics.count).toBeGreaterThanOrEqual(3);
    metrics.heights.forEach((height) => {
        expect(height).toBeGreaterThanOrEqual(38);
        expect(height).toBeLessThanOrEqual(50);
    });
    metrics.widths.forEach((width) => {
        expect(width).toBeGreaterThanOrEqual(145);
    });
});

When('I start tracking bootstrap behavior across a reload', async ({ page }) => {
    await page.addInitScript(() => {
        const win = window as typeof window & {
            __mapAlchemistReloadTelemetry?: {
                authSeen: boolean;
                styleTriggerTexts: string[];
            };
            __mapAlchemistReloadTrackerInstalled?: boolean;
        };

        win.__mapAlchemistReloadTelemetry = {
            authSeen: false,
            styleTriggerTexts: []
        };

        const capture = () => {
            const telemetry = win.__mapAlchemistReloadTelemetry;
            if (!telemetry) return;

            const guestButton = Array.from(document.querySelectorAll('button')).find((button) =>
                /continue as guest/i.test(button.textContent || '')
            ) as HTMLElement | undefined;

            if (guestButton) {
                const computed = window.getComputedStyle(guestButton);
                const isVisible =
                    computed.display !== 'none' &&
                    computed.visibility !== 'hidden' &&
                    guestButton.offsetParent !== null;

                if (isVisible) {
                    telemetry.authSeen = true;
                }
            }

            const styleTrigger = document.querySelector('[data-testid="active-style-trigger"]') as HTMLElement | null;
            const styleText = styleTrigger?.textContent?.trim();
            if (styleText && telemetry.styleTriggerTexts[telemetry.styleTriggerTexts.length - 1] !== styleText) {
                telemetry.styleTriggerTexts.push(styleText);
            }
        };

        if (!win.__mapAlchemistReloadTrackerInstalled) {
            win.__mapAlchemistReloadTrackerInstalled = true;
            new MutationObserver(capture).observe(document.documentElement, {
                subtree: true,
                childList: true,
                characterData: true
            });
        }

        window.addEventListener('DOMContentLoaded', () => {
            capture();
            window.requestAnimationFrame(capture);
            window.setTimeout(capture, 60);
            window.setTimeout(capture, 240);
            window.setTimeout(capture, 650);
        });
    });
});

Then('the auth start screen should not flash during reload', async ({ page }) => {
    const telemetry = await page.evaluate(() => {
        return (window as any).__mapAlchemistReloadTelemetry || null;
    });

    expect(telemetry).not.toBeNull();
    expect(telemetry.authSeen).toBe(false);
});

Then('the active map theme should restore directly to {string}', async ({ page }, styleName) => {
    const trigger = page.getByTestId('active-style-trigger');
    await expect(trigger).toContainText(styleName);
    await expect(trigger).not.toContainText('Select a style');
    await expect(trigger).not.toContainText('Standard Light');
});

Then('the initial map reveal veil should be dismissed', async ({ page }) => {
    await expect(page.getByTestId('map-initial-veil')).toHaveAttribute('data-visible', 'false', { timeout: 10000 });
    await expect(page.getByTestId('map-visual-shell')).toHaveAttribute('data-map-visual-ready', 'true', { timeout: 10000 });
});

Then('POI labels should read text color from feature properties', async ({ page }) => {
    const textColorExpression = await page.evaluate(() => {
        const map = (window as any).__map;
        if (!map) return null;
        return map.getPaintProperty('unclustered-point', 'text-color');
    });

    expect(textColorExpression).not.toBeNull();
    if (Array.isArray(textColorExpression)) {
        expect(textColorExpression.join('|')).toContain('textColor');
    } else {
        expect(String(textColorExpression)).toContain('textColor');
    }
});

Then('POI icons should scale correctly with zoom level', async ({ page }) => {
    await expect.poll(async () => {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return false;
            return !!map.getStyle()?.layers?.find((l: any) => l.id === 'unclustered-point');
        });
    }, { timeout: 15000 }).toBeTruthy();

    const iconSizeConfig = await page.evaluate(() => {
        const map = (window as any).__map;
        const layer = map.getStyle().layers.find((l: any) => l.id === 'unclustered-point');
        return layer.layout['icon-size'];
    });

    expect(Array.isArray(iconSizeConfig)).toBe(true);
    expect(iconSizeConfig[0]).toBe('interpolate');
});

When('I have a popup open for a POI', async ({ page }) => {
    // Re-use clicking logic if not already open
    const popup = page.locator('.maplibregl-popup-content');
    if (!await popup.isVisible()) {
        console.log('[E2E] Popup not visible, searching for POI to click...');
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible({ timeout: 10000 });
});

When('I zoom the map', async ({ page }) => {
    await page.evaluate(async () => {
        const map = (window as any).__map;
        if (!map) return;

        await new Promise<void>((resolve) => {
            const handleZoomEnd = () => {
                map.off('zoomend', handleZoomEnd);
                resolve();
            };

            map.on('zoomend', handleZoomEnd);
            map.zoomTo(map.getZoom() + 1, { duration: 0 });
        });
    });
});

When('I switch to the {string} style', async ({ page }, styleName) => {
    console.log(`[E2E] Switching to style: ${styleName}`);
    await page.getByRole('heading', { name: styleName }).click();
    // Wait for the status indicator or map canvas to settle
    await page.waitForTimeout(3000);
});

Then('the popup should still be visible or accessible', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    if (!await popup.isVisible()) {
        console.log('[E2E] Popup closed after style switch, attempting to re-open...');
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible({ timeout: 10000 });
});

Then('the popup should be dismissed', async ({ page }) => {
    await expect(page.locator('.maplibregl-popup')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('.maplibregl-popup-content')).toHaveCount(0, { timeout: 10000 });
});

When('I click the Remix button in the popup', async ({ page }) => {
    const remixBtn = page.locator('#popup-edit-btn');
    // Ensure it's not just visible but ready for interaction
    await expect(remixBtn).toBeVisible({ timeout: 10000 });
    await remixBtn.scrollIntoViewIfNeeded();
    await remixBtn.click({ force: true });
});

Then('the icon edit sidebar should be open', async ({ page }) => {
    const iconAssetsList = page.getByTestId('icon-assets-list');
    await expect(iconAssetsList).toBeVisible();

    const hasRemixUi = await Promise.all([
        page.getByText(/Art Direction Prompt/i).first().isVisible().catch(() => false),
        page.getByRole('button', { name: /Regenerate Icon|Quick Magic Regenerate/i }).first().isVisible().catch(() => false),
        page.getByRole('heading', { name: /Icon Assets/i }).isVisible().catch(() => false)
    ]);

    expect(hasRemixUi.some(Boolean)).toBe(true);
});
