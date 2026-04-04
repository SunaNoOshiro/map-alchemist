import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getStyleSeedPoiCategories } from '../../../src/features/map/services/poiIconResolver';

const { Given, When, Then } = createBdd();

const normalizeCategoryKey = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const toTestToken = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const buildTaxonomyKey = (category: string, subcategory: string) =>
    `${normalizeCategoryKey(category)}::${normalizeCategoryKey(subcategory)}`;

const VALID_ICON_KEYS = Array.from(
    new Set(
        getStyleSeedPoiCategories().map((category) => normalizeCategoryKey(category))
    )
);
let lastClickedPoiTitle: string | null = null;
let lastClickedPoiId: string | null = null;
let lastClickedPoiCategory: string | null = null;
let lastClickedPoiSubcategory: string | null = null;
let selectedPoiCategoryFilter: string | null = null;
let selectedPoiSubcategoryFilter: string | null = null;
let rememberedMapView: { lng: number; lat: number; zoom: number } | null = null;
let rememberedLoadedPoiCount: number | null = null;

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

async function selectPoiFilterOption(page: Page, triggerTestId: string, value: string): Promise<void> {
    await page.getByTestId(triggerTestId).click();
    await page.getByTestId(`${triggerTestId}-option-${toTestToken(value)}`).click();
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

    let points: Array<{
        x: number;
        y: number;
        title: string;
        id: string;
        category: string;
        subcategory: string;
    }> | null = null;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        points = await page.evaluate(({ validIconKeys, pointPreference }) => {
            const map = (window as any).__map;
            if (!map) return null;
            const visualLayerIds = (map.getStyle?.()?.layers || [])
                .map((layer: any) => String(layer?.id || ''))
                .filter((layerId: string) =>
                    layerId.startsWith('unclustered-point--') ||
                    layerId.startsWith('unclustered-point-fallback--')
                );
            if (visualLayerIds.length === 0) return null;

            const features = map.queryRenderedFeatures({ layers: visualLayerIds });
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
                    const hits = map.queryRenderedFeatures([candidate.x, candidate.y], { layers: visualLayerIds });
                    if (hits && hits.length > 0) {
                        return {
                            ...candidate,
                            id: String(feature.properties?.id || ''),
                            title: String(feature.properties?.title || ''),
                            category: String(feature.properties?.category || ''),
                            subcategory: String(feature.properties?.subcategory || '')
                        };
                    }
                }

                return {
                    ...(candidates.find(inBounds) || candidates[0]),
                    id: String(feature.properties?.id || ''),
                    title: String(feature.properties?.title || ''),
                    category: String(feature.properties?.category || ''),
                    subcategory: String(feature.properties?.subcategory || '')
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
        lastClickedPoiId = point.id || null;
        lastClickedPoiTitle = point.title || null;
        lastClickedPoiCategory = point.category || null;
        lastClickedPoiSubcategory = point.subcategory || null;
        await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });

        if (await popup.isVisible().catch(() => false)) {
            return point;
        }
        await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });
        if (await popup.isVisible().catch(() => false)) {
            return point;
        }
        await page.waitForTimeout(200);
    }

    throw new Error('POI popup did not appear after clicking visible candidates.');
}

Given('I am on the home page', async ({ page }) => {
    lastClickedPoiTitle = null;
    lastClickedPoiId = null;
    lastClickedPoiCategory = null;
    lastClickedPoiSubcategory = null;
    selectedPoiCategoryFilter = null;
    selectedPoiSubcategoryFilter = null;
    rememberedMapView = null;
    rememberedLoadedPoiCount = null;
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
    const iconSeedKeys = getStyleSeedPoiCategories();

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

const selectStyleFromToolbar = async (page: import('@playwright/test').Page, styleName: string) => {
    const trigger = page.getByTestId('active-style-trigger');
    await expect(trigger).toBeVisible({ timeout: 10000 });

    if (!await trigger.textContent().then((text) => text?.includes(styleName) ?? false)) {
        await trigger.click();
        const menuOption = page
            .locator('button')
            .filter({ hasText: styleName })
            .filter({ hasNot: page.getByTestId('active-style-trigger') })
            .first();
        await expect(menuOption).toBeVisible({ timeout: 10000 });
        await menuOption.click();
    }

    await expect(trigger).toContainText(styleName, { timeout: 15000 });
};

When('I select the {string} style', async ({ page }, styleName) => {
    await selectStyleFromToolbar(page, styleName);
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

When('I switch the right sidebar to Places', async ({ page }) => {
    await page.getByTestId('right-sidebar-tab-places').click();
    await expect(page.getByTestId('poi-search-input')).toBeVisible();
});

When('I switch the right sidebar to Icons', async ({ page }) => {
    await page.getByTestId('right-sidebar-tab-icons').click();
    await expect(page.getByTestId('icon-assets-list')).toBeVisible();
});

When('I freeze POI search time to {string}', async ({ page }, isoTimestamp) => {
    await page.evaluate((value) => {
        (window as any).__mapAlchemistPoiSearchNow = value;
    }, isoTimestamp);
});

When('I search loaded POIs for the last clicked POI title', async ({ page }) => {
    if (!lastClickedPoiTitle) {
        throw new Error('No POI title was captured from the last map click.');
    }

    await page.getByTestId('poi-search-input').fill(lastClickedPoiTitle);
});

When('I select the category filter matching the last clicked POI', async ({ page }) => {
    if (!lastClickedPoiCategory) {
        throw new Error('No POI category was captured from the last map click.');
    }

    await selectPoiFilterOption(page, 'poi-category-filter', lastClickedPoiCategory);
});

When('I select the subcategory filter matching the last clicked POI', async ({ page }) => {
    if (!lastClickedPoiSubcategory || !lastClickedPoiCategory) {
        throw new Error('No POI subcategory was captured from the last map click.');
    }

    await selectPoiFilterOption(page, 'poi-subcategory-filter', buildTaxonomyKey(lastClickedPoiCategory, lastClickedPoiSubcategory));
});

When('I select the first available specific POI category filter', async ({ page }) => {
    const categoryFilter = page.getByTestId('poi-category-filter');
    await expect(categoryFilter).toBeVisible();
    await categoryFilter.click();

    const options = page.locator('[data-testid^="poi-category-filter-option-"]');
    const count = await options.count();
    selectedPoiCategoryFilter = null;

    for (let index = 0; index < count; index += 1) {
        const option = options.nth(index);
        const text = (await option.getAttribute('data-option-label'))?.trim() || '';
        if (!text || /All categories/i.test(text)) continue;
        selectedPoiCategoryFilter = text;
        await option.click();
        break;
    }

    if (!selectedPoiCategoryFilter) {
        throw new Error('No specific POI category filter is available.');
    }
});

When('I enable the {string} POI filter', async ({ page }, filterLabel) => {
    const filterMap: Record<string, string> = {
        'Has photo': 'poi-filter-has-photo',
        'Has website': 'poi-filter-has-website',
        'Open now': 'poi-filter-open-now'
    };
    const testId = filterMap[filterLabel];
    if (!testId) {
        throw new Error(`Unsupported POI filter label: ${filterLabel}`);
    }

    await page.getByTestId(testId).click();
});

Then('POI search results should contain the last clicked POI title', async ({ page }) => {
    if (!lastClickedPoiTitle) {
        throw new Error('No POI title was captured from the last map click.');
    }

    await expect(page.getByTestId('poi-search-results')).toContainText(lastClickedPoiTitle);
});

Then('POI search results should all match the selected category filter', async ({ page }) => {
    if (!selectedPoiCategoryFilter) {
        throw new Error('No POI category filter was selected.');
    }

    const results = page.getByTestId('poi-search-result');
    await expect(results.first()).toBeVisible();
    const texts = await results.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => {
        expect(text).toContain(selectedPoiCategoryFilter as string);
    });
});

When('I reset POI search filters', async ({ page }) => {
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.getByTestId('poi-search-input')).toHaveValue('');
    await expect(page.getByTestId('poi-category-filter')).toContainText('All categories');
    await expect(page.getByTestId('poi-subcategory-filter')).toContainText('All subcategories');
});

Then('POI search results should satisfy the {string} filter', async ({ page }, filterLabel) => {
    const expectations: Record<string, { required: string; rejected: string }> = {
        'Has photo': { required: 'Photo', rejected: 'No photo' },
        'Has website': { required: 'Website', rejected: 'No website' },
        'Open now': { required: 'Open now', rejected: 'Closed / unknown' }
    };

    const expectation = expectations[filterLabel];
    if (!expectation) {
        throw new Error(`Unsupported POI filter expectation: ${filterLabel}`);
    }

    await expect.poll(async () => {
        const emptyState = await page.getByTestId('poi-search-results').textContent();
        if (emptyState?.includes('No loaded POIs match the current search and filters.')) {
            return 'empty';
        }

        const texts = await page.getByTestId('poi-search-result').allTextContents();
        if (texts.length === 0) {
            return 'pending';
        }

        const everyMatches = texts.every((text) =>
            text.includes(expectation.required) && !text.includes(expectation.rejected)
        );

        return everyMatches ? 'matched' : 'pending';
    }, {
        timeout: 10000,
        message: `POI search results did not settle into the expected "${filterLabel}" filtered state.`
    }).toMatch(/^(empty|matched)$/);
});

When('I remember the current loaded POI count', async ({ page }) => {
    await expect.poll(async () => {
        const text = await page.getByTestId('poi-search-results-count').textContent();
        const match = text?.match(/^(\d+)\s*\/\s*(\d+)/);
        return match ? Number(match[2]) : 0;
    }).toBeGreaterThan(0);

    rememberedLoadedPoiCount = await page.evaluate(() => {
        const countNode = document.querySelector('[data-testid="poi-search-results-count"]');
        const text = countNode?.textContent || '';
        const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
        return match ? Number(match[2]) : null;
    });

    if (rememberedLoadedPoiCount === null) {
        throw new Error('Unable to capture the loaded POI count.');
    }
});

When('I pan the map far away', async ({ page }) => {
    await page.evaluate(() => {
        const map = (window as any).__map;
        if (!map) return;
        const center = map.getCenter();
        map.easeTo({
            center: [Number(center.lng) + 0.12, Number(center.lat) + 0.08],
            duration: 350
        });
    });
    await page.waitForTimeout(800);
});

Then('the loaded POI count should not shrink', async ({ page }) => {
    if (rememberedLoadedPoiCount === null) {
        throw new Error('No remembered loaded POI count is available.');
    }

    await expect.poll(async () => {
        const text = await page.getByTestId('poi-search-results-count').textContent();
        const match = text?.match(/^(\d+)\s*\/\s*(\d+)/);
        return match ? Number(match[2]) : 0;
    }).toBeGreaterThanOrEqual(rememberedLoadedPoiCount);
});

When('I hide the category matching the last clicked POI from the map', async ({ page }) => {
    if (!lastClickedPoiCategory) {
        throw new Error('No POI category was captured from the last map click.');
    }

    const toggle = page.getByTestId('poi-map-visibility-toggle');
    if (!(await page.getByTestId(`poi-map-category-checkbox-${toTestToken(lastClickedPoiCategory)}`).count())) {
        await toggle.click();
    }

    const checkbox = page.getByTestId(`poi-map-category-checkbox-${toTestToken(lastClickedPoiCategory)}`);
    await expect.poll(async () => await checkbox.count(), {
        timeout: 15000,
        message: `Category checkbox for ${lastClickedPoiCategory} did not appear in the Places panel.`
    }).toBeGreaterThan(0);
    await checkbox.scrollIntoViewIfNeeded();
    if ((await checkbox.getAttribute('aria-checked')) !== 'false') {
        await checkbox.click();
    }
});

When('I show the category matching the last clicked POI on the map', async ({ page }) => {
    if (!lastClickedPoiCategory) {
        throw new Error('No POI category was captured from the last map click.');
    }

    const toggle = page.getByTestId('poi-map-visibility-toggle');
    if (!(await page.getByTestId(`poi-map-category-checkbox-${toTestToken(lastClickedPoiCategory)}`).count())) {
        await toggle.click();
    }

    const checkbox = page.getByTestId(`poi-map-category-checkbox-${toTestToken(lastClickedPoiCategory)}`);
    await expect.poll(async () => await checkbox.count(), {
        timeout: 15000,
        message: `Category checkbox for ${lastClickedPoiCategory} did not reappear in the Places panel.`
    }).toBeGreaterThan(0);
    await checkbox.scrollIntoViewIfNeeded();
    if ((await checkbox.getAttribute('aria-checked')) !== 'true') {
        await checkbox.click();
    }
});

When('I hide the category matching the last clicked POI from the map using the Icons panel', async ({ page }) => {
    if (!lastClickedPoiCategory) {
        throw new Error('No POI category was captured from the last map click.');
    }

    const eyeButton = page.getByTestId(`icon-map-category-eye-${toTestToken(lastClickedPoiCategory)}`);
    await expect(eyeButton).toBeVisible();
    await eyeButton.click();
});

When('I show only the category matching the last clicked POI from the map using the Icons panel', async ({ page }) => {
    if (!lastClickedPoiCategory) {
        throw new Error('No POI category was captured from the last map click.');
    }

    const isolateButton = page.getByTestId(`icon-map-category-only-${toTestToken(lastClickedPoiCategory)}`);
    await expect(isolateButton).toBeVisible();
    await isolateButton.click();
});

When('I reset map visibility from the Icons panel', async ({ page }) => {
    const resetButton = page.getByTestId('icon-map-reset-visibility');
    await expect(resetButton).toBeVisible();
    await resetButton.click();
});

Then('the matching POI search result should be loaded but not visible', async ({ page }) => {
    if (!lastClickedPoiTitle) {
        throw new Error('No POI title was captured from the last map click.');
    }

    const matchingResult = page.getByTestId('poi-search-result').filter({ hasText: lastClickedPoiTitle }).first();
    await expect(matchingResult).toBeVisible();
    await expect(matchingResult).toContainText('Hidden');
    await expect(matchingResult).not.toContainText('Shown');
});

Then('the matching POI search result should be visible again', async ({ page }) => {
    if (!lastClickedPoiTitle) {
        throw new Error('No POI title was captured from the last map click.');
    }

    const matchingResult = page.getByTestId('poi-search-result').filter({ hasText: lastClickedPoiTitle }).first();
    await expect(matchingResult).toBeVisible();
    await expect(matchingResult).toContainText('Shown');
});

When('I close the popup', async ({ page }) => {
    await page.locator('#popup-close-btn').click();
    await expect(page.locator('.maplibregl-popup-content')).not.toBeVisible();
});

When('I emulate a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
});

When('I click the first POI search result', async ({ page }) => {
    if (lastClickedPoiId) {
        const exactResult = page.locator(`[data-testid="poi-search-result"][data-poi-id="${lastClickedPoiId}"]`).first();
        if (await exactResult.count()) {
            await exactResult.click();
            return;
        }
    }

    if (lastClickedPoiTitle) {
        const matchingResult = page.getByTestId('poi-search-result').filter({ hasText: lastClickedPoiTitle }).first();
        if (await matchingResult.count()) {
            await matchingResult.click();
            return;
        }
    }

    await page.getByTestId('poi-search-result').first().click();
});

Then('the popup should mention the last clicked POI title', async ({ page }) => {
    if (!lastClickedPoiTitle) {
        throw new Error('No POI title was captured from the last map click.');
    }

    await expect(page.locator('.maplibregl-popup:visible [data-testid="poi-popup"]').last()).toContainText(lastClickedPoiTitle);
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

Then('the popup close button should remain tappable on mobile', async ({ page }) => {
    const closeButton = page.locator('#popup-close-btn');
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(page.locator('.maplibregl-popup-content')).not.toBeVisible();
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
        const layer = map.getStyle()?.layers?.find((candidate: any) =>
            typeof candidate?.id === 'string' && candidate.id.startsWith('unclustered-point--')
        );
        return layer ? map.getPaintProperty(layer.id, 'text-color') : null;
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
            return !!map.getStyle()?.layers?.find((l: any) =>
                typeof l?.id === 'string' && l.id.startsWith('unclustered-point--')
            );
        });
    }, { timeout: 15000 }).toBeTruthy();

    const iconSizeConfig = await page.evaluate(() => {
        const map = (window as any).__map;
        const layer = map.getStyle().layers.find((l: any) =>
            typeof l?.id === 'string' && l.id.startsWith('unclustered-point--')
        );
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
    await selectStyleFromToolbar(page, styleName);
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
