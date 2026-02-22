import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

const ICON_MODE_LABELS = {
    auto: 'Auto (HQ Atlas 4x4 + Repair)',
    'batch-async': 'Batch API (Async, Cheap)',
    atlas: 'Atlas only',
    'per-icon': 'Per-icon only'
} as const;

const resolveIconModeKey = (value: string): keyof typeof ICON_MODE_LABELS => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'auto' || normalized === 'auto (hq atlas 4x4 + repair)' || normalized === 'auto (batch + smart fallback)') return 'auto';
    if (normalized === 'batch' || normalized === 'batch-async' || normalized === 'batch api (async, cheap)') return 'batch-async';
    if (normalized === 'atlas' || normalized === 'atlas only') return 'atlas';
    if (normalized === 'per-icon' || normalized === 'per icon' || normalized === 'per-icon only') return 'per-icon';
    throw new Error(`Unsupported icon generation mode: ${value}`);
};

const getVisibleModeTrigger = async (page: any) => {
    const trigger = page.getByTestId('icon-generation-mode-trigger').first();
    if (await trigger.count()) {
        try {
            await expect(trigger).toBeVisible({ timeout: 1500 });
            return trigger;
        } catch (_error) {
            // Keep falling back to section expansion.
        }
    }

    const aiSectionHeader = page.getByText('AI Configuration', { exact: false }).first();
    if (await aiSectionHeader.count()) {
        await aiSectionHeader.click();
    }

    await expect(trigger).toBeVisible({ timeout: 5000 });
    return trigger;
};

When('I click the "Continue as Guest" button', async ({ page }) => {
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
});

Then('the {string} section should show a "Guest Mode" message', async ({ page }, sectionName) => {
    // Assuming sectionName corresponds to the title, e.g., "Theme Generator"
    // The PromptPanel inside Theme Generator shows "Guest Mode (Read Only)"
    await expect(page.getByText('Guest Mode (Read Only)')).toBeVisible();
});

Then('the "Connect API Key" button should be visible in the prompt panel', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Connect API Key/i })).toBeVisible();
});

When('I click the section header {string}', async ({ page }, sectionName) => {
    // Headers are likely uppercase in the DOM or styled that way, but text match might be case insensitive if using getByText with regex or simple string if valid.
    // The React code renders: {section.title} inside a span.
    await page.getByText(sectionName, { exact: false }).click();
});

Then('the section {string} should be collapsed', async ({ page }, sectionName) => {
    // If collapsed, the content div is not rendered.
    // We need a stable way to identify the section content. 
    // For "Theme Generator", the content contains "New Style Prompt" (label).

    if (sectionName === 'Theme Generator') {
        await expect(page.getByText('New Style Prompt')).not.toBeVisible();
    } else if (sectionName === 'Activity Logs') {
        await expect(page.getByTestId('log-console')).not.toBeVisible(); // Assuming logs have some id or text
        // Fallback: look for log content or just check immediate sibling absence if possible.
        // Simpler: Check if the specific unique elements of that section are hidden.
    }
});

Then('the section {string} should be expanded', async ({ page }, sectionName) => {
    if (sectionName === 'Theme Generator') {
        await expect(page.getByText('New Style Prompt')).toBeVisible();
    }
});

When('I click the category group {string}', async ({ page }, categoryName) => {
    // Right sidebar groups
    await page.getByText(categoryName, { exact: false }).first().click();
});

Then('the category group {string} should be collapsed', async ({ page }, categoryName) => {
    // Implementation depends on what's inside.
    // For "Food & Drink", we have "Restaurant", "Cafe", etc.
    // If collapsed, these should not be visible.
    if (categoryName === 'Food & Drink') {
        await expect(page.getByText('Restaurant', { exact: true })).not.toBeVisible();
    }
});

Then('the category group {string} should be expanded', async ({ page }, categoryName) => {
    if (categoryName === 'Food & Drink') {
        await expect(page.getByText('Restaurant', { exact: true })).toBeVisible();
    }
});

When('I set icon generation mode to {string}', async ({ page }, modeLabel) => {
    const modeKey = resolveIconModeKey(modeLabel);
    const trigger = await getVisibleModeTrigger(page);
    await trigger.click();

    const option = page.getByTestId(`icon-generation-mode-option-${modeKey}`).first();
    await expect(option).toBeVisible();
    await option.click();
});

Then('icon generation mode should be {string}', async ({ page }, modeLabel) => {
    const modeKey = resolveIconModeKey(modeLabel);
    const expectedLabel = ICON_MODE_LABELS[modeKey];
    const trigger = await getVisibleModeTrigger(page);
    await expect(trigger).toContainText(expectedLabel);
});

When('I reload the page', async ({ page }) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
});
