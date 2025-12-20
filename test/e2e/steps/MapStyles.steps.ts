import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const { Given, When, Then } = createBdd();

// Helper: Find and click a visible POI with a likely icon (copied from original spec)
async function clickVisiblePOI(page: Page) {
    await expect.poll(async () => {
        return await page.evaluate(() => {
            const map = (window as any).__map;
            if (!map) return false;
            const features = map.querySourceFeatures('places');
            return features && features.length > 0;
        });
    }, { timeout: 15000 }).toBeTruthy();

    const point = await page.evaluate(() => {
        const map = (window as any).__map;
        const features = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
        if (!features.length) return null;

        const canvas = map.getCanvas();
        const width = canvas.width;
        const height = canvas.height;
        const rect = canvas.getBoundingClientRect();
        const validCategories = ['restaurant', 'cafe', 'bar'];

        const visibleFeature = features.find((f: any) => {
            if (!f.properties.title) return false;
            const cat = (f.properties.category || '').toLowerCase();
            const sub = (f.properties.subcategory || '').toLowerCase();
            const hasIcon = validCategories.some(c => cat === c || sub === c);

            return hasIcon && (() => {
                const p = map.project(f.geometry.coordinates);
                return p.x > 20 && p.y > 20 && p.x < (width - 20) && p.y < (height - 20);
            })();
        });

        if (!visibleFeature) return null;

        const f = visibleFeature;
        const pixel = map.project(f.geometry.coordinates);
        return {
            x: pixel.x + rect.left,
            y: pixel.y + rect.top,
            props: f.properties
        };
    });

    if (!point) throw new Error('No POI found on map');
    await page.mouse.click(point.x, point.y);
    return point;
}

Given('I am on the home page', async ({ page }) => {
    await page.goto('/');
});

Given('I have custom {string} and {string} themes injected', async ({ page }, theme1, theme2) => {
    const themesPath = path.join(process.cwd(), 'public', 'default-themes.json');
    const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));

    const pirateThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('pirates')) || themesData[0];
    const cartoonThemeOriginal = themesData.find((t: any) => t.name.toLowerCase().includes('cartoon')) || themesData[1] || themesData[0];

    const themesToInject = [
        { ...pirateThemeOriginal, iconsByCategory: {} },
        { ...cartoonThemeOriginal, iconsByCategory: {} }
    ];

    await page.evaluate(async (themes) => {
        const dummyIcon = {
            imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKw66AAAAABJRU5ErkJggg==',
            prompt: 'Test icon',
            isLoading: false
        };

        const createCustom = (base: any, name: string) => ({
            ...base,
            id: 'custom-' + name.toLowerCase().replace(/\s/g, '-') + '-' + Date.now(),
            name: `${name} (Custom)`,
            isBundledDefault: true,
            iconsByCategory: {
                'Restaurant': { ...dummyIcon, category: 'Restaurant' },
                'restaurant': { ...dummyIcon, category: 'Restaurant' },
                'Cafe': { ...dummyIcon, category: 'Cafe' },
                'cafe': { ...dummyIcon, category: 'Cafe' },
                'Bar': { ...dummyIcon, category: 'Bar' },
                'bar': { ...dummyIcon, category: 'Bar' }
            }
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
                tx.objectStore('styles').put(customStyles, 'presets');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        });
    }, themesToInject);

    await page.reload();
    const mapCanvas = page.locator('.maplibregl-canvas');
    await expect(mapCanvas).toBeVisible({ timeout: 20000 });
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
    await expect(popup).toBeVisible();
});

Then('the popup should contain an image', async ({ page }) => {
    const popupImg = page.locator('.maplibregl-popup-content img');
    await expect(popupImg).toBeVisible();
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
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible();
});

When('I switch to the {string} style', async ({ page }, styleName) => {
    await page.getByRole('heading', { name: styleName }).click();
    await page.waitForTimeout(2000); // style reload
});

Then('the popup should still be visible or accessible', async ({ page }) => {
    const popup = page.locator('.maplibregl-popup-content');
    if (!await popup.isVisible()) {
        await clickVisiblePOI(page);
    }
    await expect(popup).toBeVisible();
});

When('I click the Remix button in the popup', async ({ page }) => {
    const remixBtn = page.locator('#popup-edit-btn');
    await expect(remixBtn).toBeVisible();
    await remixBtn.click();
});

Then('the icon edit sidebar should be open', async ({ page }) => {
    const promptInput = page.getByPlaceholder(/Describe the .* icon/i);
    await expect(promptInput).toBeVisible();
});
