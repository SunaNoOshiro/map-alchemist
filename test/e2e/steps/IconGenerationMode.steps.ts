import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

type AtlasBehavior = 'success' | 'error';
type InvocationType = 'visuals' | 'atlas' | 'perIcon' | 'unknown';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ATLAS_SVG_BASE64 = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#00FF00"/>
    <rect x="1" y="1" width="1022" height="1022" fill="#111111"/>
  </svg>`
).toString('base64');

const iconModeByLabel = (label: string): 'auto' | 'atlas' | 'per-icon' => {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'auto (atlas + fallback)') return 'auto';
  if (normalized === 'atlas' || normalized === 'atlas only') return 'atlas';
  if (normalized === 'per-icon' || normalized === 'per icon' || normalized === 'per-icon only') return 'per-icon';
  throw new Error(`Unsupported icon generation mode label: ${label}`);
};

const classifyGenerateContentCall = (payload: string): InvocationType => {
  if (
    payload.includes('Generate map theme for:') ||
    payload.includes('Generate a complete themed map design package for')
  ) return 'visuals';
  if (payload.includes('Create ONE square icon sprite atlas image')) return 'atlas';
  if (payload.includes('Create a single graphical SYMBOL representing:')) return 'perIcon';
  return 'unknown';
};

const createVisualsResponse = () => ({
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              themeSpec: {
                tokens: {
                  water: '#5FA9FF',
                  land: '#1F2937',
                  building: '#374151',
                  primaryRoad: '#9CA3AF',
                  secondaryRoad: '#9CA3AF',
                  localRoad: '#9CA3AF',
                  park: '#16A34A',
                  textPrimary: '#E5E7EB',
                },
              },
              popupStyle: {
                backgroundColor: '#111827',
                textColor: '#E5E7EB',
                borderColor: '#334155',
                borderRadius: '8px',
                fontFamily: 'Inter, sans-serif',
              },
              iconTheme: 'BDD icon theme',
            }),
          },
        ],
      },
    },
  ],
});

const createImageResponse = () => ({
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: TINY_PNG_BASE64,
            },
          },
        ],
      },
    },
  ],
});

const createAtlasResponse = () => ({
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/svg+xml',
              data: ATLAS_SVG_BASE64,
            },
          },
        ],
      },
    },
  ],
});

type InvocationCounters = {
  visuals: number;
  atlas: number;
  perIcon: number;
  unknown: number;
};

let atlasBehavior: AtlasBehavior = 'error';
let invocationCounters: InvocationCounters = {
  visuals: 0,
  atlas: 0,
  perIcon: 0,
  unknown: 0,
};

Given('Gemini API calls are mocked with atlas behavior {string}', async ({ page }, behavior) => {
  const normalized = behavior.trim().toLowerCase();
  if (normalized !== 'error' && normalized !== 'success') {
    throw new Error(`Unsupported atlas behavior: ${behavior}`);
  }

  atlasBehavior = normalized as AtlasBehavior;
  invocationCounters = { visuals: 0, atlas: 0, perIcon: 0, unknown: 0 };

  await page.route('**/models/**:generateContent*', async (route) => {
    const requestPayload = route.request().postData() || '';
    const invocationType = classifyGenerateContentCall(requestPayload);

    if (invocationType === 'visuals') {
      invocationCounters.visuals += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createVisualsResponse()),
      });
      return;
    }

    if (invocationType === 'atlas') {
      invocationCounters.atlas += 1;
      if (atlasBehavior === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Forced atlas failure for BDD test' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createAtlasResponse()),
      });
      return;
    }

    if (invocationType === 'perIcon') {
      invocationCounters.perIcon += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createImageResponse()),
      });
      return;
    }

    invocationCounters.unknown += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createVisualsResponse()),
    });
  });
});

Given('I open the app with icon generation mode {string}', async ({ page }, modeLabel) => {
  const mode = iconModeByLabel(modeLabel);

  await page.addInitScript(({ selectedMode }) => {
    const config = {
      provider: 'google-gemini',
      textModel: 'gemini-2.5-flash',
      imageModel: 'gemini-2.5-flash-image',
      apiKey: 'bdd-test-api-key',
      isCustomKey: true,
      iconGenerationMode: selectedMode,
    };
    localStorage.setItem('mapAlchemistAiConfig', JSON.stringify(config));
  }, { selectedMode: mode });

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Generate Theme/i })).toBeVisible();
});

When('I generate a theme with prompt {string}', async ({ page }, prompt) => {
  const promptInput = page.getByPlaceholder(/e\.g\., Cyberpunk neon night/i).first();
  await expect(promptInput).toBeVisible();
  await promptInput.fill(prompt);

  const generateButton = page.getByRole('button', { name: /Generate Theme/i }).first();
  await generateButton.click();
});

Then('theme generation should complete', async ({ page }) => {
  await expect(page.locator('body')).toContainText('Theme generation complete!', { timeout: 180000 });
  await expect(page.getByRole('button', { name: /Generate Theme/i }).first()).toBeEnabled();
});

Then(
  'Gemini invocations should be visuals {int} atlas {int} per-icon {int} total {int}',
  async ({}, visuals, atlas, perIcon, total) => {
    expect(invocationCounters.visuals).toBe(visuals);
    expect(invocationCounters.atlas).toBe(atlas);
    expect(invocationCounters.perIcon).toBe(perIcon);
    expect(invocationCounters.visuals + invocationCounters.atlas + invocationCounters.perIcon).toBe(total);
  }
);

Then('Gemini per-icon invocations should be at most {int}', async ({}, maxInvocations) => {
  expect(invocationCounters.perIcon).toBeLessThanOrEqual(maxInvocations);
});

Then('Gemini unknown invocations should be {int}', async ({}, expectedUnknownCount) => {
  expect(invocationCounters.unknown).toBe(expectedUnknownCount);
});
