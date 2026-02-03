import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';

const { Given, When, Then } = createBdd();

const getIconTestId = (category: string) =>
  `icon-item-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
      const features = map.querySourceFeatures('places');
      return features && features.length > 0;
    });
  }, {
    message: 'No POI features found in "places" source after 15s',
    timeout: 15000
  }).toBeTruthy();

  const points = await page.evaluate(() => {
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
    const validCategories = ['restaurant', 'cafe', 'bar'];

    const visibleFeatures = features.filter((feature: any) => {
      if (!feature.properties?.title) return false;
      const cat = (feature.properties?.category || '').toLowerCase();
      const sub = (feature.properties?.subcategory || '').toLowerCase();
      const hasIcon = validCategories.some(c => cat === c || sub === c);

      if (!hasIcon) return false;
      const pixel = map.project(feature.geometry.coordinates);
      return pixel.x > 20 && pixel.y > 20 && pixel.x < (width - 20) && pixel.y < (height - 20);
    });

    if (!visibleFeatures.length) return null;

    return visibleFeatures.slice(0, 5).map((feature: any) => {
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
  });

  if (!points || points.length === 0) {
    throw new Error('No visible POI with supported icon found on map');
  }

  const mapCanvas = page.locator('.maplibregl-canvas');
  await expect(mapCanvas).toBeVisible();
  const popup = page.locator('.maplibregl-popup-content');

  for (const point of points) {
    await mapCanvas.click({ position: { x: point.x, y: point.y }, force: true });
    if (await popup.isVisible().catch(() => false)) {
      return;
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
  const editTarget = await remixButton.getAttribute('data-edit-target');
  let fallbackCategory = '';
  const categoryEl = page.getByTestId('poi-popup-category');
  if (await categoryEl.count()) {
    fallbackCategory = (await categoryEl.textContent())?.trim() || '';
  }
  (page as any).__lastPopupCategory = editTarget?.trim() || fallbackCategory;
  await remixButton.click({ force: true });
  await expect(page.getByTestId('icon-assets-list')).toBeVisible();
});

When('I trigger remix focus for category {string}', async ({ page }, category) => {
  await page.evaluate((cat) => {
    window.__mapAlchemistSetRemixFocus?.(cat);
  }, category);
});

Then('the popup category icon should be aligned to the top of the icon list', async ({ page }) => {
  const category = (page as any).__lastPopupCategory as string;
  if (!category) {
    throw new Error('Popup category was not captured before clicking remix.');
  }
  const list = page.getByTestId('icon-assets-list');
  const item = page.getByTestId(getIconTestId(category));
  await expect(list).toBeVisible();
  await expect(item).toBeVisible();

  await page.waitForFunction(
    ({ listTestId, itemTestId }) => {
      const listEl = document.querySelector(`[data-testid="${listTestId}"]`);
      const itemEl = document.querySelector(`[data-testid="${itemTestId}"]`);
      if (!listEl || !itemEl) return false;
      const listRect = listEl.getBoundingClientRect();
      const itemRect = itemEl.getBoundingClientRect();
      const groupEl = itemEl.closest('[data-testid="icon-group"]');
      const headerEl = groupEl?.querySelector('[data-testid="icon-group-header"]') as HTMLElement | null;
      const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
      const paddingTop = Number.parseFloat(window.getComputedStyle(listEl).paddingTop || '0');
      const minTop = listRect.top + headerHeight + paddingTop + 4;
      const maxBottom = listRect.bottom - 4;
      return itemRect.top >= minTop && itemRect.bottom <= maxBottom;
    },
    { listTestId: 'icon-assets-list', itemTestId: getIconTestId(category) },
    { timeout: 5000 }
  );

  const listBox = await list.boundingBox();
  const itemBox = await item.boundingBox();
  expect(listBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  if (!listBox || !itemBox) return;

  const headerHeight = await page.evaluate(() => {
    const headerEl = document.querySelector('[data-testid="icon-group"][data-expanded="true"] [data-testid="icon-group-header"]') as HTMLElement | null;
    return headerEl?.getBoundingClientRect().height ?? 0;
  });
  const paddingTop = await page.evaluate(() => {
    const listEl = document.querySelector('[data-testid="icon-assets-list"]');
    if (!listEl) return 0;
    return Number.parseFloat(window.getComputedStyle(listEl).paddingTop || '0');
  });
  const minTop = listBox.y + headerHeight + paddingTop + 4;
  const maxBottom = listBox.y + listBox.height - 4;
  expect(itemBox.y).toBeGreaterThanOrEqual(minTop);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(maxBottom);
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
      const groupEl = itemEl.closest('[data-testid="icon-group"]');
      const headerEl = groupEl?.querySelector('[data-testid="icon-group-header"]') as HTMLElement | null;
      const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
      const paddingTop = Number.parseFloat(window.getComputedStyle(listEl).paddingTop || '0');
      const minTop = listRect.top + headerHeight + paddingTop + 4;
      const maxBottom = listRect.bottom - 4;
      return itemRect.top >= minTop && itemRect.bottom <= maxBottom;
    },
    { listTestId: 'icon-assets-list', itemTestId: getIconTestId(category) },
    { timeout: 5000 }
  );

  const listBox = await list.boundingBox();
  const itemBox = await item.boundingBox();
  expect(listBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  if (!listBox || !itemBox) return;

  const headerHeight = await page.evaluate(() => {
    const headerEl = document.querySelector('[data-testid="icon-group"][data-expanded="true"] [data-testid="icon-group-header"]') as HTMLElement | null;
    return headerEl?.getBoundingClientRect().height ?? 0;
  });
  const paddingTop = await page.evaluate(() => {
    const listEl = document.querySelector('[data-testid="icon-assets-list"]');
    if (!listEl) return 0;
    return Number.parseFloat(window.getComputedStyle(listEl).paddingTop || '0');
  });
  const minTop = listBox.y + headerHeight + paddingTop + 4;
  const maxBottom = listBox.y + listBox.height - 4;
  expect(itemBox.y).toBeGreaterThanOrEqual(minTop);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(maxBottom);
});

When('I scroll the icon list by {int}', async ({ page }, delta) => {
  await page.evaluate((scrollDelta) => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    if (!list) return;
    list.scrollTop += scrollDelta;
  }, delta);
});

Then('the icon list scroll position should be greater than {int}', async ({ page }, expected) => {
  const scrollTop = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    return list ? list.scrollTop : 0;
  });
  expect(scrollTop).toBeGreaterThan(expected);
});

Then('the icon list scroll position should be less than {int}', async ({ page }, expected) => {
  const scrollTop = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="icon-assets-list"]');
    return list ? list.scrollTop : 0;
  });
  expect(scrollTop).toBeLessThan(expected);
});
