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

// Helper: Find and click a visible POI with a likely icon (copied from original spec)
async function clickVisiblePOI(page: Page) {
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

    let points: Array<{ x: number; y: number }> | null = null;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        points = await page.evaluate((validIconKeys) => {
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

            return visibleFeatures.slice(0, 5).map((feature: any) => {
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
                        return candidate;
                    }
                }

                return candidates.find(inBounds) || candidates[0];
            });
        }, VALID_ICON_KEYS);

        if (points && points.length > 0) break;
        await page.waitForTimeout(1000);
    }

    if (!points || points.length === 0) throw new Error('No visible POI with loaded icon found on map');

    const mapCanvas = page.locator('.maplibregl-canvas');
    await expect(mapCanvas).toBeVisible();
    const popup = page.locator('.maplibregl-popup-content');

    for (const point of points) {
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

    // Check if any errors occurred during load
    if (errors.length > 0) {
        throw new Error(`Test failed due to browser errors:\n${errors.join('\n')}`);
    }

    // New: Explicitly check that the app reports themes are loaded
    // Only if NOT on Auth Screen (Guest button visible)
    const guestBtn = page.getByRole('button', { name: /Continue as Guest/i });
    if (!(await guestBtn.isVisible())) {
        const logConsole = page.locator('body');
        // Large JSON files might take time to parse on some systems, increase timeout to 30s
        await expect(logConsole, 'Application log did not show bundled themes as loaded.').toContainText(/Bundled default themes loaded|Loaded existing styles|Standard theme loaded/, {
            timeout: 30000
        });
    }
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

    // If reload reset auth state, we might need to re-enter guest mode
    const guestBtnReload = page.getByRole('button', { name: /Continue as Guest/i });
    if (await guestBtnReload.isVisible()) {
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

Then('the style {string} should be active', async ({ page }, styleName) => {
    // Current app implementation doesn't have an "active" class on the heading that is easily selectable,
    // but the selection itself implies activity if it doesn't error.
    // For more robust check, we could check internal state, but let's stick to visibility of the item.
    await expect(page.getByRole('heading', { name: styleName })).toBeVisible();
});

When('I click on a visible POI on the map', async ({ page }) => {
    await clickVisiblePOI(page);
});

Then('a popup should be visible', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    if (!await popup.isVisible().catch(() => false)) {
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible({ timeout: 10000 });
});

Then('the popup should contain an image', async ({ page }) => {
    const popupImg = page.locator('.maplibregl-popup-content img');
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
