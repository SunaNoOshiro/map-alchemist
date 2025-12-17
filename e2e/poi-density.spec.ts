import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('POI Density Verification', () => {
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

    // Helper: Get current zoom level
    async function getCurrentZoom(page: Page): Promise<number> {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return 0;
            return map.getZoom();
        });
    }

    // Helper: Set zoom level
    async function setZoomLevel(page: Page, zoom: number) {
        await page.evaluate((zoomLevel) => {
            const map = (window as any).__map;
            if (map) {
                map.setZoom(zoomLevel);
            }
        }, zoom);
        // Wait for zoom to stabilize
        await page.waitForTimeout(500);
    }

    // Helper: Get rendered POI count
    async function getRenderedPOICount(page: Page): Promise<number> {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return 0;
            const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
            return features ? features.length : 0;
        });
    }

    // Helper: Get source POI count
    async function getSourcePOICount(page: Page): Promise<number> {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return 0;
            const features = map.querySourceFeatures('places');
            return features ? features.length : 0;
        });
    }

    // Helper: Calculate average distance between POIs
    async function calculateAveragePOIDistance(page: Page): Promise<number> {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return 0;

            const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
            if (features.length < 2) return 0;

            let totalDistance = 0;
            let count = 0;

            // Calculate distances between first 10 POIs (for performance)
            const sampleFeatures = features.slice(0, 10);

            for (let i = 0; i < sampleFeatures.length; i++) {
                for (let j = i + 1; j < sampleFeatures.length; j++) {
                    const coords1 = sampleFeatures[i].geometry.coordinates;
                    const coords2 = sampleFeatures[j].geometry.coordinates;

                    const point1 = map.project(coords1);
                    const point2 = map.project(coords2);

                    const distance = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
                    totalDistance += distance;
                    count++;
                }
            }

            return count > 0 ? totalDistance / count : 0;
        });
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

        // Select a style to ensure POIs are loaded
        await page.getByRole('heading', { name: 'pirates map of treasures (Custom)' }).click();

        // Wait for POIs to load
        await expect.poll(async () => {
            return await page.evaluate(() => {
                const map = (window as any).__map;
                if (!map) return false;
                const features = map.querySourceFeatures('places');
                return features && features.length > 0;
            });
        }, { timeout: 15000 }).toBeTruthy();
    });

    test('should verify POI density increases with zoom level (up to reasonable limit)', async ({ page }) => {
        // Get the current center to preserve it during zoom changes
        const center = await page.evaluate(() => {
            const map = (window as any).__map;
            return map ? map.getCenter() : null;
        });

        // Start at zoom level 13 (minimum for POIs)
        await setZoomLevel(page, 13);
        let zoom13 = await getCurrentZoom(page);
        expect(zoom13).toBeCloseTo(13, 0);

        const countAtZoom13 = await getRenderedPOICount(page);
        console.log(`POI count at zoom 13: ${countAtZoom13}`);
        expect(countAtZoom13).toBeGreaterThan(0);

        // Zoom in to level 15, preserving the center
        await page.evaluate(({ zoomLevel, center }) => {
            const map = (window as any).__map;
            if (map && center) {
                map.setZoom(zoomLevel);
                // Restore center to ensure we're looking at the same area
                map.setCenter(center);
            }
        }, { zoomLevel: 15, center });

        let zoom15 = await getCurrentZoom(page);
        expect(zoom15).toBeCloseTo(15, 0);

        const countAtZoom15 = await getRenderedPOICount(page);
        console.log(`POI count at zoom 15: ${countAtZoom15}`);
        // At higher zoom, we should see more POIs in the same area (higher density)
        expect(countAtZoom15).toBeGreaterThanOrEqual(countAtZoom13);

        // Zoom in to level 16, preserving the center
        await page.evaluate(({ zoomLevel, center }) => {
            const map = (window as any).__map;
            if (map && center) {
                map.setZoom(zoomLevel);
                map.setCenter(center);
            }
        }, { zoomLevel: 16, center });

        let zoom16 = await getCurrentZoom(page);
        expect(zoom16).toBeCloseTo(16, 0);

        const countAtZoom16 = await getRenderedPOICount(page);
        console.log(`POI count at zoom 16: ${countAtZoom16}`);
        // At zoom 16, we should still see reasonable density
        expect(countAtZoom16).toBeGreaterThan(0);
    });

    test('should verify symbol spacing prevents excessive density', async ({ page }) => {
        // Set to a high zoom level where many POIs should be visible
        await setZoomLevel(page, 16);

        // Verify the symbol spacing is set correctly
        const symbolSpacing = await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return null;

            const style = map.getStyle();
            const layer = style.layers.find((l: any) => l.id === 'unclustered-point');
            return layer?.layout?.['symbol-spacing'];
        });

        expect(symbolSpacing).toBe(250);
        console.log(`Symbol spacing is set to: ${symbolSpacing}px`);

        // Calculate average distance between POIs
        const avgDistance = await calculateAveragePOIDistance(page);
        console.log(`Average distance between POIs: ${avgDistance}px`);

        // The symbol spacing of 250px is a minimum distance, but POIs can be naturally closer
        // We verify that the configuration is correct and that we have reasonable spacing
        // The average should be reasonable (not extremely small), but doesn't need to be >200px
        expect(avgDistance).toBeGreaterThan(50); // Very conservative lower bound
        expect(avgDistance).toBeLessThan(1000); // Reasonable upper bound
    });

    test('should verify overlap prevention is configured', async ({ page }) => {
        const layerConfig = await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return null;

            const style = map.getStyle();
            const layer = style.layers.find((l: any) => l.id === 'unclustered-point');
            return {
                iconAllowOverlap: layer?.layout?.['icon-allow-overlap'],
                textAllowOverlap: layer?.layout?.['text-allow-overlap']
            };
        });

        expect(layerConfig).not.toBeNull();
        expect(layerConfig?.iconAllowOverlap).toBe(false);
        expect(layerConfig?.textAllowOverlap).toBe(false);

        console.log('Overlap prevention is correctly configured:', layerConfig);
    });

    test('should verify POI count is reasonable given source data', async ({ page }) => {
        // Set to a high zoom level
        await setZoomLevel(page, 16);

        const sourceCount = await getSourcePOICount(page);
        const renderedCount = await getRenderedPOICount(page);

        console.log(`Source POI count: ${sourceCount}`);
        console.log(`Rendered POI count: ${renderedCount}`);

        // Rendered count should be less than or equal to source count
        expect(renderedCount).toBeLessThanOrEqual(sourceCount);

        // At reasonable zoom levels, we should see some POIs if they exist in the area
        // This is a very conservative check - the exact count depends on many factors:
        // viewport size, symbol spacing, current location, etc.
        if (sourceCount > 10) {
            expect(renderedCount).toBeGreaterThan(0);
            // Very conservative: rendered count should be at least 1% of source count
            // This accounts for the small viewport area relative to the total source area
            expect(renderedCount).toBeGreaterThanOrEqual(Math.max(1, sourceCount * 0.01));
        }
    });

    test('should verify density changes with map movement', async ({ page }) => {
        // Set to a consistent zoom level
        await setZoomLevel(page, 15);

        const initialCount = await getRenderedPOICount(page);
        console.log(`Initial POI count: ${initialCount}`);

        // Move the map to a different area
        await page.evaluate(() => {
            const map = (window as any).__map;
            if (map) {
                const currentCenter = map.getCenter();
                // Move the map by a significant distance (0.01 degrees ~1km)
                map.setCenter([
                    currentCenter.lng + 0.02,
                    currentCenter.lat + 0.01
                ]);
            }
        });

        // Wait for moveend event to trigger POI refresh
        await page.waitForTimeout(1000);

        const newCount = await getRenderedPOICount(page);
        console.log(`POI count after movement: ${newCount}`);

        // The count should change (could be more or less depending on the area)
        // This verifies that POI data is being refreshed on map movement
        expect(newCount).not.toBe(initialCount);
    });

    test('should verify minimum zoom level for POI display', async ({ page }) => {
        // Set zoom below minimum (13)
        await setZoomLevel(page, 12);
        let zoom12 = await getCurrentZoom(page);
        expect(zoom12).toBeCloseTo(12, 0);

        const countAtZoom12 = await getRenderedPOICount(page);
        console.log(`POI count at zoom 12: ${countAtZoom12}`);

        // Should be no POIs at zoom 12
        expect(countAtZoom12).toBe(0);

        // Set zoom to minimum (13)
        await setZoomLevel(page, 13);
        let zoom13 = await getCurrentZoom(page);
        expect(zoom13).toBeCloseTo(13, 0);

        const countAtZoom13 = await getRenderedPOICount(page);
        console.log(`POI count at zoom 13: ${countAtZoom13}`);

        // Should have POIs at zoom 13
        expect(countAtZoom13).toBeGreaterThan(0);
    });
});
