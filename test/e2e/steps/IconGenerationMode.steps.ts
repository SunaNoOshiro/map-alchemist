import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

type AtlasBehavior =
  | 'success'
  | 'error'
  | 'primary-pass-error'
  | 'primary-pass-partial'
  | 'primary-pass-partial-repair-error'
  | 'rate-limit-once';
type InvocationType = 'visuals' | 'atlas' | 'perIcon' | 'unknown';

type MockBatchJobResponse = { response: any } | { error: { message: string } };

type MockBatchJob = {
  name: string;
  responses: MockBatchJobResponse[];
  pollCount: number;
};

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ATLAS_SVG_BASE64 = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#00FF00"/>
    <rect x="1" y="1" width="1022" height="1022" fill="#111111"/>
  </svg>`
).toString('base64');
const BAD_ATLAS_SVG_BASE64 = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#00FF00"/>
  </svg>`
).toString('base64');
const PRIMARY_ATLAS_CHUNK_COUNT = 9;
const PRIMARY_PARTIAL_FAILED_CHUNKS = 4;

const iconModeByLabel = (label: string): 'auto' | 'batch-async' | 'atlas' | 'per-icon' => {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'auto (hq atlas 4x4 + repair)' || normalized === 'auto (batch + smart fallback)') return 'auto';
  if (normalized === 'batch-async' || normalized === 'batch api (async, cheap)' || normalized === 'batch') return 'batch-async';
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
  if (
    payload.includes('Create a single graphical SYMBOL representing:') ||
    payload.includes('Create one flat vector map icon for category')
  ) return 'perIcon';
  return 'unknown';
};

const extractBatchRequestsFromPayload = (payload: any): any[] => {
  const directRequests = payload?.batch?.inputConfig?.requests?.requests;
  if (Array.isArray(directRequests)) {
    return directRequests.map((entry) => entry?.request || entry);
  }

  const inlinedRequests = payload?.src?.inlinedRequests;
  if (Array.isArray(inlinedRequests)) {
    return inlinedRequests;
  }

  return [];
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

const createBadAtlasResponse = () => ({
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/svg+xml',
              data: BAD_ATLAS_SVG_BASE64,
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
  batchCreate: number;
  batchPoll: number;
  batchDelete: number;
  unknown: number;
};

let atlasBehavior: AtlasBehavior = 'error';
let invocationCounters: InvocationCounters = {
  visuals: 0,
  atlas: 0,
  perIcon: 0,
  batchCreate: 0,
  batchPoll: 0,
  batchDelete: 0,
  unknown: 0,
};
let batchJobs: Record<string, MockBatchJob> = {};
let batchSequence = 0;
let atlasInvocationSequence = 0;
let batchAtlasRateLimitTriggered = false;

const extractBatchNameFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/batches\/([^/:]+)/);
  if (!match) return null;
  return `batches/${match[1]}`;
};

Given('Gemini API calls are mocked with atlas behavior {string}', async ({ page }, behavior) => {
  const normalized = behavior.trim().toLowerCase();
  if (
    normalized !== 'error' &&
    normalized !== 'success' &&
    normalized !== 'primary-pass-error' &&
    normalized !== 'primary-pass-partial' &&
    normalized !== 'primary-pass-partial-repair-error' &&
    normalized !== 'rate-limit-once'
  ) {
    throw new Error(`Unsupported atlas behavior: ${behavior}`);
  }

  atlasBehavior = normalized as AtlasBehavior;
  invocationCounters = {
    visuals: 0,
    atlas: 0,
    perIcon: 0,
    batchCreate: 0,
    batchPoll: 0,
    batchDelete: 0,
    unknown: 0
  };
  batchJobs = {};
  batchSequence = 0;
  atlasInvocationSequence = 0;
  batchAtlasRateLimitTriggered = false;

  await page.route('**/models/**:batchGenerateContent*', async (route) => {
    invocationCounters.batchCreate += 1;

    const payload = JSON.parse(route.request().postData() || '{}');
    const requests = extractBatchRequestsFromPayload(payload);
    const requestTypes = requests.map((request) => classifyGenerateContentCall(JSON.stringify(request)));
    const hasAtlasRequest = requestTypes.includes('atlas');

    if (atlasBehavior === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Forced async batch failure for BDD test' } }),
      });
      return;
    }

    if (atlasBehavior === 'rate-limit-once' && hasAtlasRequest && !batchAtlasRateLimitTriggered) {
      batchAtlasRateLimitTriggered = true;
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 429,
            message: 'Too many requests. Please try again later.',
            status: 'RESOURCE_EXHAUSTED'
          }
        }),
      });
      return;
    }

    const responses = requests.map((request, requestIndex) => {
      const invocationType = requestTypes[requestIndex];
      if (invocationType !== 'atlas') {
        return { response: createImageResponse() };
      }

      atlasInvocationSequence += 1;

      if (atlasBehavior === 'primary-pass-error' && atlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT) {
        return { error: { message: 'Forced primary atlas pass failure for BDD test' } };
      }

      const isPrimaryPartialFailure =
        atlasBehavior === 'primary-pass-partial' &&
        atlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS;

      const isPrimaryAndRepairPartialFailure =
        atlasBehavior === 'primary-pass-partial-repair-error' &&
        (
          atlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS ||
          (
            atlasInvocationSequence > PRIMARY_ATLAS_CHUNK_COUNT &&
            atlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT + PRIMARY_PARTIAL_FAILED_CHUNKS
          )
        );

      if (isPrimaryPartialFailure || isPrimaryAndRepairPartialFailure) {
        return { response: createBadAtlasResponse() };
      }

      return { response: createAtlasResponse() };
    });

    const jobName = `batches/mock-batch-${Date.now()}-${++batchSequence}`;
    batchJobs[jobName] = {
      name: jobName,
      pollCount: 0,
      responses
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: jobName,
        metadata: {
          state: 'BATCH_STATE_RUNNING'
        }
      }),
    });
  });

  await page.route('**/batches/**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const jobName = extractBatchNameFromPath(url.pathname);

    if (method === 'GET') {
      invocationCounters.batchPoll += 1;
      if (!jobName || !batchJobs[jobName]) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: `Unknown batch job: ${jobName || 'n/a'}` } })
        });
        return;
      }

      const job = batchJobs[jobName];
      job.pollCount += 1;
      const isDone = job.pollCount >= 1;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: jobName,
          metadata: {
            state: isDone ? 'BATCH_STATE_SUCCEEDED' : 'BATCH_STATE_RUNNING',
            output: {
              inlinedResponses: {
                inlinedResponses: isDone ? job.responses : []
              }
            }
          }
        }),
      });
      return;
    }

    if (method === 'DELETE') {
      invocationCounters.batchDelete += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: jobName || 'batches/unknown',
          done: true
        }),
      });
      return;
    }

    if (method === 'POST' && url.pathname.includes(':cancel')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: `Unsupported method for batch route: ${method}` } })
    });
  });

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
      atlasInvocationSequence += 1;

      if (atlasBehavior === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Forced atlas failure for BDD test' } }),
        });
        return;
      }

      if (atlasBehavior === 'rate-limit-once' && atlasInvocationSequence === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 429,
              message: 'Too many requests. Please try again later.',
              status: 'RESOURCE_EXHAUSTED'
            }
          }),
        });
        return;
      }

      if (atlasBehavior === 'primary-pass-error' && atlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Forced primary atlas pass failure for BDD test' } }),
        });
        return;
      }

      const isPrimaryPartialFailure =
        atlasBehavior === 'primary-pass-partial' &&
        atlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS;

      const isPrimaryAndRepairPartialFailure =
        atlasBehavior === 'primary-pass-partial-repair-error' &&
        (
          atlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS ||
          (
            atlasInvocationSequence > PRIMARY_ATLAS_CHUNK_COUNT &&
            atlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT + PRIMARY_PARTIAL_FAILED_CHUNKS
          )
        );

      if (isPrimaryPartialFailure || isPrimaryAndRepairPartialFailure) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createBadAtlasResponse()),
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

const readLastUsableSummary = async (page: any): Promise<{ usable: number; total: number }> => {
  const bodyText = await page.locator('body').innerText();
  const matches = Array.from(bodyText.matchAll(/Usable icons:\s*(\d+)\s*\/\s*(\d+)/g));
  expect(matches.length).toBeGreaterThan(0);
  const last = matches[matches.length - 1];
  return {
    usable: Number(last[1]),
    total: Number(last[2]),
  };
};

Then('usable icon summary should report full coverage', async ({ page }) => {
  const summary = await readLastUsableSummary(page);
  expect(summary.total).toBeGreaterThan(0);
  expect(summary.usable).toBe(summary.total);
});

Then('usable icon summary should report zero coverage', async ({ page }) => {
  const summary = await readLastUsableSummary(page);
  expect(summary.total).toBeGreaterThan(0);
  expect(summary.usable).toBe(0);
});

Then('usable icon summary should report partial coverage', async ({ page }) => {
  const summary = await readLastUsableSummary(page);
  expect(summary.total).toBeGreaterThan(0);
  expect(summary.usable).toBeGreaterThan(0);
  expect(summary.usable).toBeLessThan(summary.total);
});

Then(
  'Gemini invocations should be visuals {int} atlas {int} per-icon {int} total {int}',
  async ({}, visuals, atlas, perIcon, total) => {
    expect(invocationCounters.visuals).toBe(visuals);
    expect(invocationCounters.atlas).toBe(atlas);
    expect(invocationCounters.perIcon).toBe(perIcon);
    const allInvocations =
      invocationCounters.visuals +
      invocationCounters.atlas +
      invocationCounters.perIcon +
      invocationCounters.batchCreate +
      invocationCounters.batchPoll +
      invocationCounters.batchDelete;
    expect(allInvocations).toBe(total);
  }
);

Then('Gemini per-icon invocations should be at most {int}', async ({}, maxInvocations) => {
  expect(invocationCounters.perIcon).toBeLessThanOrEqual(maxInvocations);
});

Then('Gemini unknown invocations should be {int}', async ({}, expectedUnknownCount) => {
  expect(invocationCounters.unknown).toBe(expectedUnknownCount);
});

Then(
  'Gemini batch invocations should be create {int} poll {int} delete {int}',
  async ({}, createCount, pollCount, deleteCount) => {
    expect(invocationCounters.batchCreate).toBe(createCount);
    expect(invocationCounters.batchPoll).toBe(pollCount);
    expect(invocationCounters.batchDelete).toBe(deleteCount);
  }
);
