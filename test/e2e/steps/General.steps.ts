import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

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
