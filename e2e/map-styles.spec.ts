import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Map Style interaction and Theme Switching', () => {
    test.setTimeout(120000); // Increase timeout for slow CI/local environments

    // Read default themes from disk to ensure valid data structure
    const themesPath = path.join(process.cwd(), 'public', 'default-themes.json');
    const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));

    // Filter themes to only valid ones we need and STRIP huge icon data
    const pirateThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('pirates')) || themesData[0];
    const cartoonThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('cartoon')) || themesData[1] || themesData[0];

    // Create lightweight versions for injection (stripping 40MB+ of icons)
    const pirateTheme = { ...pirateThemeOriginal, iconsByCategory: {} };
    const cartoonTheme = { ...cartoonThemeOriginal, iconsByCategory: {} };

    // We only pass these two to the browser
    const themesToInject = [pirateTheme, cartoonTheme];

    // Helper: Find and click a visible POI with a likely icon
    async function clickVisiblePOI(page: Page) {
        // Wait for features to be loaded and rendered
        await expect.poll(async () => {
            return await page.evaluate(() => {
                const map = (window as any).__map;
                if (!map) return false;
                const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
                return features.length > 0;
            });
        }, { timeout: 10000 }).toBeTruthy();

        // Calculate click coordinates
        const point = await page.evaluate(() => {
            const map = (window as any).__map;
            const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
            if (!features.length) return null;

            // Get canvas offset
            const canvas = map.getCanvas();
            const width = canvas.width;
            const height = canvas.height;
            const rect = canvas.getBoundingClientRect();

            // Find a feature that is actually visible on screen (positive coordinates) AND has a likely icon
            // We strictly match the categories we injected dummy icons for
            const validCategories = ['restaurant', 'cafe', 'bar'];

            const visibleFeature = features.find((f: any) => {
                if (!f.properties.title) return false;

                const cat = (f.properties.category || '').toLowerCase();
                const sub = (f.properties.subcategory || '').toLowerCase();

                // Strict check: One of the properties must BE one of our keys.
                // Partial matches (includes) are dangerous because MapView looks up exact keys for icons.
                // If we select 'japanese_restaurant' because it includes 'restaurant', but we only injected 'restaurant',
                // MapView won't find the icon and the image assertion will fail.
                const hasIcon = validCategories.some(c => cat === c || sub === c);

                return hasIcon && (() => {
                    const p = map.project(f.geometry.coordinates);
                    return p.x > 20 && p.y > 20 && p.x < (width - 20) && p.y < (height - 20);
                })();
            });

            if (!visibleFeature) {
                console.log("No visible feature found");
                return null;
            }

            const f = visibleFeature;
            const coords = f.geometry.coordinates; // [lng, lat]
            const pixel = map.project(coords);

            const x = pixel.x + rect.left;
            const y = pixel.y + rect.top;

            console.log(`Found POI: ${f.properties.title} at ${coords} -> Pixel: ${pixel.x},${pixel.y} -> Screen: ${x},${y} `);

            return {
                x,
                y,
                props: f.properties
            };
        });

        if (!point) throw new Error('No POI found on map');

        // Click the point
        await page.mouse.click(point.x, point.y);

        return point;
    }

    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()} `));

        // --- SETUP: Inject Custom Styles based on Defaults ---
        // We need "custom" styles to verify the Remix button (which is hidden for defaults).
        await page.goto('/');

        await page.evaluate(async (themes) => {
            // 1. Clear localStorage
            localStorage.clear();

            // 2. Use passed themes data (which are already filtered to just the 2 we need)
            if (!themes || !themes.length) {
                console.error("No themes passed to setup!");
                return;
            }

            const pirateDetails = themes[0];
            const cartoonDetails = themes[1];

            // 3. Create "Custom" versions with minimal icon data to pass visibility checks
            const dummyIcon = {
                imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKw66AAAAABJRU5ErkJggg==',
                prompt: 'Test icon',
                isLoading: false
            };

            const customPirates = {
                ...pirateDetails,
                id: 'custom-pirates-' + Date.now(),
                name: 'pirates map of treasures (Custom)',
                isBundledDefault: true, // We now allow defaults to be remixed!
                iconsByCategory: {
                    'Restaurant': { ...dummyIcon, category: 'Restaurant' },
                    'restaurant': { ...dummyIcon, category: 'Restaurant' },
                    'Cafe': { ...dummyIcon, category: 'Cafe' },
                    'cafe': { ...dummyIcon, category: 'Cafe' },
                    'Bar': { ...dummyIcon, category: 'Bar' },
                    'bar': { ...dummyIcon, category: 'Bar' }
                }
            };

            const customCartoon = {
                ...cartoonDetails,
                id: 'custom-cartoon-' + Date.now(),
                name: 'in style of cartoon (Custom)',
                isBundledDefault: true, // We now allow defaults to be remixed!
                iconsByCategory: {
                    'Restaurant': { ...dummyIcon, category: 'Restaurant' },
                    'restaurant': { ...dummyIcon, category: 'Restaurant' },
                    'Cafe': { ...dummyIcon, category: 'Cafe' },
                    'cafe': { ...dummyIcon, category: 'Cafe' },
                    'Bar': { ...dummyIcon, category: 'Bar' },
                    'bar': { ...dummyIcon, category: 'Bar' }
                }
            };

            // 4. Save to IndexedDB directly
            const newStyles = [customPirates, customCartoon];

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
                    store.put(newStyles, 'presets');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                };
                request.onerror = () => reject(request.error);
            });
            console.log("Injected styles into IndexedDB");
        }, themesToInject); // Pass filtered themes here

        // Reload to trigger migration and loading
        await page.reload();

        // Wait for map
        const mapCanvas = page.locator('.maplibregl-canvas');
        await expect(mapCanvas).toBeVisible({ timeout: 20000 });
    });

    test('should select map style', async ({ page }) => {
        // Check for our custom styles in the sidebar
        await expect(page.getByRole('heading', { name: 'pirates map of treasures (Custom)' })).toBeVisible();

        // Select "pirates map of treasures (Custom)" style
        await page.getByRole('heading', { name: 'pirates map of treasures (Custom)' }).click();
    });

    test('should interact with popup', async ({ page }) => {
        // Select style first
        await page.getByRole('heading', { name: 'pirates map of treasures (Custom)' }).click();

        // Click a POI
        await clickVisiblePOI(page);

        // Check for popup container
        const popup = page.locator('.maplibregl-popup-content');
        await expect(popup).toBeVisible();

        // Verify Popup content
        const popupTitle = popup.locator('h3').first();
        await expect(popupTitle).toBeVisible();

        const popupImg = popup.locator('img');
        await expect(popupImg).toBeVisible();
    });

    test('should switch themes and verify popup update', async ({ page }) => {
        // Select initial style
        await page.getByRole('heading', { name: 'pirates map of treasures (Custom)' }).click();

        // Open popup
        await clickVisiblePOI(page);
        await expect(page.locator('.maplibregl-popup-content')).toBeVisible();

        // Switch to "in style of cartoon (Custom)"
        await page.getByRole('heading', { name: 'in style of cartoon (Custom)' }).click();

        // Wait for style reload
        await page.waitForTimeout(2000);

        // Verify Popup is still visible (or re-opened)
        // Note: Changing style might close popup depending on implementation.
        // If it closes, we need to click again. The current app behavior typically preserves or re-opens if state is kept.
        // But map style switch usually resets the map instance so popups might disappear.
        // Let's check if it's there, if not click again.

        const popup = page.locator('.maplibregl-popup-content');
        if (!await popup.isVisible()) {
            console.log("Popup closed on style switch, reopening...");
            await clickVisiblePOI(page);
        }
        await expect(popup).toBeVisible();
        await expect(popup.locator('img')).toBeVisible();
    });

    test('should verify Remix Icon functionality', async ({ page }) => {
        // Select custom style
        await page.getByRole('heading', { name: 'pirates map of treasures (Custom)' }).click();

        // Open popup to get the "Remix" button
        await clickVisiblePOI(page);

        // Verify Remix button is visible (since we are on a custom theme)
        const remixBtn = page.locator('#popup-edit-btn');
        await expect(remixBtn).toBeVisible();

        await remixBtn.click();

        // Verify Right Sidebar opens (checking for a unique element in the edit sidebar)
        // usually the placeholder is "Describe the [category] icon..."
        const promptInput = page.getByPlaceholder(/Describe the .* icon/i);
        await expect(promptInput).toBeVisible();
    });

});
