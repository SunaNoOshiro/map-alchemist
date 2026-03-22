import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';
import { getStyleSeedPoiCategories } from '../../../src/features/map/services/poiIconResolver';

const { Given, When, Then } = createBdd();

const getIconTestId = (category: string) =>
  `icon-item-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const normalizeCategoryKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const VALID_ICON_KEYS = Array.from(
  new Set(
    getStyleSeedPoiCategories().map((category) => normalizeCategoryKey(category))
  )
);

const clickVisiblePoi = async (page: Page) => {
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
      const rankByKey = new Map(validIconKeys.map((key: string, index: number) => [key, index] as const));

      const hasDisplayIcon = (feature: any) => {
        const iconKey = feature?.properties?.iconKey;
        if (typeof iconKey !== 'string' || iconKey.length === 0) return false;
        const normalizedIconKey = iconKey.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        return allowedKeys.has(normalizedIconKey);
      };

      const visibleFeatures = features.filter((feature: any) => {
        if (!feature.properties?.title) return false;
        if (!hasDisplayIcon(feature)) return false;
        const pixel = map.project(feature.geometry.coordinates);
        return pixel.x > 20 && pixel.y > 20 && pixel.x < (width - 20) && pixel.y < (height - 20);
      });

      if (!visibleFeatures.length) {
        const placesSource = map.getSource?.('places') as any;
        const sourceFeatures = Array.isArray(placesSource?._data?.features)
          ? placesSource._data.features
          : [];
        const preferred = sourceFeatures.find((feature: any) => {
          if (feature?.geometry?.type !== 'Point') return false;
          if (!Array.isArray(feature?.geometry?.coordinates) || feature.geometry.coordinates.length < 2) return false;
          return hasDisplayIcon(feature);
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

      const prioritizedFeatures = visibleFeatures
        .map((feature: any) => {
          const iconKey = feature?.properties?.iconKey;
          const normalizedIconKey = typeof iconKey === 'string'
            ? iconKey.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            : '';
          return {
            feature,
            rank: rankByKey.get(normalizedIconKey) ?? Number.MAX_SAFE_INTEGER
          };
        })
        .sort((a: any, b: any) => a.rank - b.rank)
        .slice(0, 8)
        .map((entry: any) => entry.feature);

      return prioritizedFeatures.map((feature: any) => {
        const pixel = map.project(feature.geometry.coordinates);
        const candidates = [
          { x: pixel.x, y: pixel.y },
          ratioX > 0 && ratioY > 0 ? { x: pixel.x / ratioX, y: pixel.y / ratioY } : null
        ].filter(Boolean) as Array<{ x: number; y: number }>;

        const inBounds = (p: { x: number; y: number }) =>
          p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;

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

  if (!points || points.length === 0) {
    throw new Error('No visible POI with loaded icon found on map');
  }

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
      return;
    }
    if (triggeredViaMapEvent) {
      await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });
      if (await popup.isVisible().catch(() => false)) {
        return;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error('POI popup did not appear after clicking visible candidates.');
};

Given('I set the viewport to {string}', async ({ page }, viewport) => {
  if (viewport === 'mobile') {
    await page.setViewportSize({ width: 375, height: 812 });
  } else {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

Given('I open the icon assets sidebar', async ({ page }) => {
  const list = page.getByTestId('icon-assets-list');
  if (await list.isVisible()) {
    return;
  }
  const testIdButton = page.getByTestId('open-icons-sidebar');
  if (await testIdButton.count()) {
    await testIdButton.first().scrollIntoViewIfNeeded();
    await expect(testIdButton.first()).toBeVisible();
    await testIdButton.first().click();
    await expect(list).toBeVisible();
    return;
  }
  const roleButton = page.getByRole('button', { name: /icons/i });
  if (await roleButton.count()) {
    await roleButton.first().scrollIntoViewIfNeeded();
    await expect(roleButton.first()).toBeVisible();
    await roleButton.first().click();
    await expect(list).toBeVisible();
    return;
  }
  await page.evaluate(() => {
    window.__mapAlchemistSetRemixFocus?.('Cafe');
  });
  await expect(list).toBeVisible();
});

When('I click a visible POI on the map', async ({ page }) => {
  await clickVisiblePoi(page);
});

Then('I should see the POI popup', async ({ page }) => {
  const popup = page.locator('.maplibregl-popup-content');
  await expect(popup).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#popup-edit-btn')).toBeVisible();
});

When('I click remix in the POI popup', async ({ page }) => {
  const remixButton = page.locator('#popup-edit-btn');
  await expect(remixButton).toBeVisible();
  await expect
    .poll(async () => ((await remixButton.getAttribute('data-edit-target')) || '').trim(), {
      timeout: 5000,
      message: 'Remix button did not receive a valid edit target'
    })
    .not.toBe('');
  await expect(remixButton).toBeEnabled();
  const editTarget = ((await remixButton.getAttribute('data-edit-target')) || '').trim();
  await remixButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  const list = page.getByTestId('icon-assets-list');
  await expect(list).toBeVisible();
  (page as any).__lastPopupCategory = editTarget;
  const selectedItemTestId = await page.evaluate(() => {
    const selectedItem = Array.from(document.querySelectorAll('[data-testid^="icon-item-"]')).find((node) =>
      node.querySelector('button[title="Close"]')
    ) as HTMLElement | undefined;
    return selectedItem?.dataset.testid || '';
  });
  (page as any).__lastSelectedIconTestId = selectedItemTestId;
});

When('I trigger remix focus for category {string}', async ({ page }, category) => {
  await page.evaluate((cat) => {
    window.__mapAlchemistSetRemixFocus?.(cat);
  }, category);
});

Then('the popup category icon should be aligned to the top of the icon list', async ({ page }) => {
  const list = page.getByTestId('icon-assets-list');
  await expect(list).toBeVisible();

  const category = (page as any).__lastPopupCategory as string;
  const directItem = category ? page.getByTestId(getIconTestId(category)) : null;
  const directItemVisible = directItem ? await directItem.isVisible().catch(() => false) : false;
  let itemTestId = '';

  if (directItem && directItemVisible) {
    itemTestId = getIconTestId(category);
  } else {
    itemTestId = ((page as any).__lastSelectedIconTestId as string) || '';
    if (!itemTestId) {
      itemTestId = await page.evaluate(() => {
        const selectedItem = Array.from(document.querySelectorAll('[data-testid^="icon-item-"]')).find((node) =>
          node.querySelector('button[title="Close"]')
        ) as HTMLElement | undefined;
        if (selectedItem?.dataset.testid) return selectedItem.dataset.testid;
        const firstVisibleInExpanded = document.querySelector(
          '[data-testid="icon-group"][data-expanded="true"] [data-testid^="icon-item-"]'
        ) as HTMLElement | null;
        return firstVisibleInExpanded?.dataset.testid || '';
      });
    }
  }

  if (!itemTestId) {
    throw new Error('Could not determine selected icon item after remix action.');
  }

  const item = page.getByTestId(itemTestId);
  await expect(item).toBeVisible();

  await page.waitForFunction(
    ({ listTestId, itemTestId }) => {
      const listEl = document.querySelector(`[data-testid="${listTestId}"]`);
      const itemEl = document.querySelector(`[data-testid="${itemTestId}"]`);
      if (!listEl || !itemEl) return false;
      const listRect = listEl.getBoundingClientRect();
      const itemRect = itemEl.getBoundingClientRect();
      const minTop = listRect.top - 120;
      const nearTopThreshold = listRect.top + Math.max(100, listRect.height * 0.65);
      const overlap = Math.min(itemRect.bottom, listRect.bottom) - Math.max(itemRect.top, listRect.top);
      const minOverlap = Math.min(48, Math.max(16, itemRect.height * 0.2));
      return itemRect.top >= minTop && itemRect.top <= nearTopThreshold && overlap >= minOverlap;
    },
    { listTestId: 'icon-assets-list', itemTestId },
    { timeout: 10000 }
  );

  const listBox = await list.boundingBox();
  const itemBox = await item.boundingBox();
  expect(listBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  if (!listBox || !itemBox) return;

  const nearTopThreshold = listBox.y + Math.max(100, listBox.height * 0.65);
  const minTop = listBox.y - 120;
  const visibleBottom = Math.min(itemBox.y + itemBox.height, listBox.y + listBox.height);
  expect(itemBox.y).toBeGreaterThanOrEqual(minTop);
  expect(itemBox.y).toBeLessThanOrEqual(nearTopThreshold);
  expect(visibleBottom).toBeGreaterThan(listBox.y + 12);
});

Then('only the selected icon group should be expanded', async ({ page }) => {
  const expandedCount = await page.evaluate(() => {
    return document.querySelectorAll('[data-testid="icon-group"][data-expanded="true"]').length;
  });
  expect(expandedCount).toBe(1);
});

Then('the icon item {string} should be aligned to the top of the icon list', async ({ page }, category) => {
  const list = page.getByTestId('icon-assets-list');
  const item = page.getByTestId(getIconTestId(category));
  await expect(item).toBeVisible();

  await page.waitForFunction(
    ({ listTestId, itemTestId }) => {
      const listEl = document.querySelector(`[data-testid="${listTestId}"]`);
      const itemEl = document.querySelector(`[data-testid="${itemTestId}"]`);
      if (!listEl || !itemEl) return false;
      const listRect = listEl.getBoundingClientRect();
      const itemRect = itemEl.getBoundingClientRect();
      const minTop = listRect.top - 120;
      const nearTopThreshold = listRect.top + Math.max(100, listRect.height * 0.65);
      const overlap = Math.min(itemRect.bottom, listRect.bottom) - Math.max(itemRect.top, listRect.top);
      const minOverlap = Math.min(48, Math.max(16, itemRect.height * 0.2));
      return itemRect.top >= minTop && itemRect.top <= nearTopThreshold && overlap >= minOverlap;
    },
    { listTestId: 'icon-assets-list', itemTestId: getIconTestId(category) },
    { timeout: 10000 }
  );

  const listBox = await list.boundingBox();
  const itemBox = await item.boundingBox();
  expect(listBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  if (!listBox || !itemBox) return;

  const minTop = listBox.y - 120;
  const nearTopThreshold = listBox.y + Math.max(100, listBox.height * 0.65);
  const visibleBottom = Math.min(itemBox.y + itemBox.height, listBox.y + listBox.height);
  expect(itemBox.y).toBeGreaterThanOrEqual(minTop);
  expect(itemBox.y).toBeLessThanOrEqual(nearTopThreshold);
  expect(visibleBottom).toBeGreaterThan(listBox.y + 12);
});

When('I click the icon item {string}', async ({ page }, category) => {
  const item = page.getByTestId(getIconTestId(category));
  await expect(item).toBeVisible();
  await item.click();
});

Then('the icon item {string} should be selected for editing', async ({ page }, category) => {
  const item = page.getByTestId(getIconTestId(category));
  await expect(item).toBeVisible();
  await expect(item.getByRole('button', { name: /close/i })).toBeVisible();
  await expect(item).toContainText('Art Direction Prompt');
});

Then('the icon item {string} should no longer be selected for editing', async ({ page }, category) => {
  const item = page.getByTestId(getIconTestId(category));
  await expect(item).toBeVisible();
  await expect(item.getByRole('button', { name: /close/i })).toHaveCount(0);
});

When('I scroll the icon list by {int}', async ({ page }, delta) => {
  const { before, after } = await page.evaluate((scrollDelta) => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    if (!list) return { before: 0, after: 0 };
    const beforeScroll = list.scrollTop;
    list.scrollTop += scrollDelta;
    return { before: beforeScroll, after: list.scrollTop };
  }, delta);
  (page as any).__lastIconListScrollBefore = before;
  (page as any).__lastIconListScrollAfter = after;
});

Then('the icon list scroll position should be greater than {int}', async ({ page }, expected) => {
  await page.waitForTimeout(350);
  const scrollTop = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    return list ? list.scrollTop : 0;
  });
  expect(scrollTop).toBeGreaterThan(expected);
});

Then('the icon list scroll position should be less than {int}', async ({ page }, expected) => {
  await page.waitForTimeout(350);
  const scrollTop = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    return list ? list.scrollTop : 0;
  });
  expect(scrollTop).toBeLessThan(expected);
});

Then('the icon list scroll position should be lower than before', async ({ page }) => {
  const before = Number((page as any).__lastIconListScrollBefore ?? 0);
  const after = Number((page as any).__lastIconListScrollAfter ?? 0);
  expect(after).toBeLessThan(before);
});
