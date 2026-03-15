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

type OpenAiInvocationCounters = {
  text: number;
  image: number;
  atlas: number;
  perIcon: number;
  batchCreate: number;
  batchPoll: number;
  fileUpload: number;
  fileContent: number;
  unknown: number;
};

type OpenAiMockBatchJob = {
  id: string;
  status: 'in_progress' | 'completed';
  outputFileId: string;
  pollCount: number;
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
let openAiInvocationCounters: OpenAiInvocationCounters = {
  text: 0,
  image: 0,
  atlas: 0,
  perIcon: 0,
  batchCreate: 0,
  batchPoll: 0,
  fileUpload: 0,
  fileContent: 0,
  unknown: 0,
};
let openAiAtlasBehavior: AtlasBehavior = 'success';
let openAiAtlasInvocationSequence = 0;
let openAiBatchSequence = 0;
let openAiFileSequence = 0;
let openAiInputFiles: Record<string, string> = {};
let openAiOutputFiles: Record<string, string> = {};
let openAiBatchJobs: Record<string, OpenAiMockBatchJob> = {};
let batchJobs: Record<string, MockBatchJob> = {};
let batchSequence = 0;
let atlasInvocationSequence = 0;
let batchAtlasRateLimitTriggered = false;

const extractBatchNameFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/batches\/([^/:]+)/);
  if (!match) return null;
  return `batches/${match[1]}`;
};

const createOpenAiBatchOutputLine = (
  customId: string,
  kind: 'atlas' | 'per-icon',
  behavior: AtlasBehavior
): string => {
  if (kind === 'per-icon') {
    return JSON.stringify({
      custom_id: customId,
      response: {
        status_code: 200,
        body: {
          data: [{ b64_json: TINY_PNG_BASE64 }]
        }
      },
      error: null
    });
  }

  openAiAtlasInvocationSequence += 1;
  if (behavior === 'error') {
    return JSON.stringify({
      custom_id: customId,
      response: { status_code: 500, body: { error: { message: 'Forced atlas failure for OpenAI BDD test' } } },
      error: { message: 'Forced atlas failure for OpenAI BDD test' }
    });
  }

  if (behavior === 'primary-pass-error' && openAiAtlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT) {
    return JSON.stringify({
      custom_id: customId,
      response: { status_code: 500, body: { error: { message: 'Forced primary atlas pass failure for OpenAI BDD test' } } },
      error: { message: 'Forced primary atlas pass failure for OpenAI BDD test' }
    });
  }

  const isPrimaryPartialFailure =
    behavior === 'primary-pass-partial' &&
    openAiAtlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS;

  const isPrimaryAndRepairPartialFailure =
    behavior === 'primary-pass-partial-repair-error' &&
    (
      openAiAtlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS ||
      (
        openAiAtlasInvocationSequence > PRIMARY_ATLAS_CHUNK_COUNT &&
        openAiAtlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT + PRIMARY_PARTIAL_FAILED_CHUNKS
      )
    );

  if (isPrimaryPartialFailure || isPrimaryAndRepairPartialFailure) {
    return JSON.stringify({
      custom_id: customId,
      response: {
        status_code: 200,
        body: {
          data: [{ url: `data:image/svg+xml;base64,${BAD_ATLAS_SVG_BASE64}` }]
        }
      },
      error: null
    });
  }

  return JSON.stringify({
    custom_id: customId,
    response: {
      status_code: 200,
      body: {
        data: [{ url: `data:image/svg+xml;base64,${ATLAS_SVG_BASE64}` }]
      }
    },
    error: null
  });
};

const providerByLabel = (label: string): 'google-gemini' | 'openai' => {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'google-gemini' || normalized === 'gemini' || normalized === 'google') return 'google-gemini';
  throw new Error(`Unsupported provider label: ${label}`);
};

const openAppWithProviderAndMode = async (
  page: any,
  provider: 'google-gemini' | 'openai',
  mode: 'auto' | 'batch-async' | 'atlas' | 'per-icon'
) => {
  const textModel = provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash';
  const imageModel = provider === 'openai' ? 'gpt-image-1-mini' : 'gemini-2.5-flash-image';

  await page.addInitScript(({ selectedProvider, selectedMode, selectedTextModel, selectedImageModel }) => {
    const config = {
      provider: selectedProvider,
      textModel: selectedTextModel,
      imageModel: selectedImageModel,
      apiKey: 'bdd-test-api-key',
      isCustomKey: true,
      iconGenerationMode: selectedMode,
    };
    localStorage.setItem('mapAlchemistAiConfig', JSON.stringify(config));
  }, {
    selectedProvider: provider,
    selectedMode: mode,
    selectedTextModel: textModel,
    selectedImageModel: imageModel,
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Generate Theme/i })).toBeVisible();
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
  await openAppWithProviderAndMode(page, 'google-gemini', mode);
});

Given('I open the app with provider {string} and icon generation mode {string}', async ({ page }, providerLabel, modeLabel) => {
  const provider = providerByLabel(providerLabel);
  const mode = iconModeByLabel(modeLabel);
  await openAppWithProviderAndMode(page, provider, mode);
});

const setupOpenAiApiMocks = async (page: any, behavior: AtlasBehavior) => {
  openAiAtlasBehavior = behavior;
  openAiAtlasInvocationSequence = 0;
  openAiBatchSequence = 0;
  openAiFileSequence = 0;
  openAiInputFiles = {};
  openAiOutputFiles = {};
  openAiBatchJobs = {};
  openAiInvocationCounters = {
    text: 0,
    image: 0,
    atlas: 0,
    perIcon: 0,
    batchCreate: 0,
    batchPoll: 0,
    fileUpload: 0,
    fileContent: 0,
    unknown: 0,
  };

  await page.route('**/v1/chat/completions*', async (route) => {
    openAiInvocationCounters.text += 1;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'chatcmpl-bdd',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
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
            finish_reason: 'stop',
          },
        ],
      }),
    });
  });

  await page.route('**/v1/images/generations*', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const invocationType = classifyGenerateContentCall(String(payload?.prompt || ''));

    openAiInvocationCounters.image += 1;
    if (invocationType === 'atlas') {
      openAiInvocationCounters.atlas += 1;
      openAiAtlasInvocationSequence += 1;

      if (openAiAtlasBehavior === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Forced atlas failure for OpenAI BDD test' } }),
        });
        return;
      }

      if (openAiAtlasBehavior === 'rate-limit-once' && openAiAtlasInvocationSequence === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Too many requests' } }),
        });
        return;
      }

      if (openAiAtlasBehavior === 'primary-pass-error' && openAiAtlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Forced primary atlas pass failure for OpenAI BDD test' } }),
        });
        return;
      }

      const isPrimaryPartialFailure =
        openAiAtlasBehavior === 'primary-pass-partial' &&
        openAiAtlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS;

      const isPrimaryAndRepairPartialFailure =
        openAiAtlasBehavior === 'primary-pass-partial-repair-error' &&
        (
          openAiAtlasInvocationSequence <= PRIMARY_PARTIAL_FAILED_CHUNKS ||
          (
            openAiAtlasInvocationSequence > PRIMARY_ATLAS_CHUNK_COUNT &&
            openAiAtlasInvocationSequence <= PRIMARY_ATLAS_CHUNK_COUNT + PRIMARY_PARTIAL_FAILED_CHUNKS
          )
        );

      if (isPrimaryPartialFailure || isPrimaryAndRepairPartialFailure) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            created: Math.floor(Date.now() / 1000),
            data: [{ url: `data:image/svg+xml;base64,${BAD_ATLAS_SVG_BASE64}` }],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          created: Math.floor(Date.now() / 1000),
          data: [{ url: `data:image/svg+xml;base64,${ATLAS_SVG_BASE64}` }],
        }),
      });
      return;
    }

    if (invocationType === 'perIcon') {
      openAiInvocationCounters.perIcon += 1;
    } else {
      openAiInvocationCounters.unknown += 1;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: [
          { b64_json: TINY_PNG_BASE64 },
        ],
      }),
    });
  });

  await page.route('**/v1/files', async (route) => {
    const method = route.request().method();
    if (method !== 'POST') {
      await route.fallback();
      return;
    }

    openAiInvocationCounters.fileUpload += 1;
    const fileId = `file-input-${++openAiFileSequence}`;
    openAiInputFiles[fileId] = route.request().postData() || '';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: fileId,
        object: 'file',
        purpose: 'batch',
      }),
    });
  });

  await page.route('**/v1/files/*/content', async (route) => {
    openAiInvocationCounters.fileContent += 1;
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const fileId = parts[parts.length - 2] === 'files' ? parts[parts.length - 1] : parts[parts.length - 2];
    const content = openAiOutputFiles[fileId] || '';

    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: content,
    });
  });

  await page.route('**/v1/batches', async (route) => {
    const method = route.request().method();
    if (method !== 'POST') {
      await route.fallback();
      return;
    }

    openAiInvocationCounters.batchCreate += 1;
    const payload = JSON.parse(route.request().postData() || '{}');
    const metadata = payload?.metadata || {};
    const kind = metadata.request_kind === 'atlas' ? 'atlas' : 'per-icon';
    const requestCount = Math.max(0, Number(metadata.request_count || 0));

    if (openAiAtlasBehavior === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Forced OpenAI async ${kind} batch creation failure for BDD test` } }),
      });
      return;
    }

    const batchId = `batch_${++openAiBatchSequence}`;
    const outputFileId = `file-output-${++openAiFileSequence}`;
    const lines: string[] = [];

    for (let i = 0; i < requestCount; i += 1) {
      lines.push(createOpenAiBatchOutputLine(`req-${i}`, kind, openAiAtlasBehavior));
      if (kind === 'atlas') {
        openAiInvocationCounters.atlas += 1;
      } else {
        openAiInvocationCounters.perIcon += 1;
      }
    }

    openAiOutputFiles[outputFileId] = lines.join('\n');
    openAiBatchJobs[batchId] = {
      id: batchId,
      status: 'in_progress',
      outputFileId,
      pollCount: 0,
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: batchId,
        object: 'batch',
        status: 'in_progress',
        output_file_id: null,
      }),
    });
  });

  await page.route('**/v1/batches/*', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') {
      await route.fallback();
      return;
    }

    openAiInvocationCounters.batchPoll += 1;
    const url = new URL(route.request().url());
    const batchId = url.pathname.split('/').pop() || '';
    const job = openAiBatchJobs[batchId];

    if (!job) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Unknown batch job: ${batchId}` } }),
      });
      return;
    }

    job.pollCount += 1;
    if (job.pollCount >= 1) {
      job.status = 'completed';
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: job.id,
        object: 'batch',
        status: job.status,
        output_file_id: job.status === 'completed' ? job.outputFileId : null,
      }),
    });
  });
};

Given('OpenAI API calls are mocked', async ({ page }) => {
  await setupOpenAiApiMocks(page, 'success');
});

Given('OpenAI API calls are mocked with atlas behavior {string}', async ({ page }, behavior) => {
  const normalized = behavior.trim().toLowerCase();
  if (
    normalized !== 'error' &&
    normalized !== 'success' &&
    normalized !== 'primary-pass-error' &&
    normalized !== 'primary-pass-partial' &&
    normalized !== 'primary-pass-partial-repair-error' &&
    normalized !== 'rate-limit-once'
  ) {
    throw new Error(`Unsupported OpenAI atlas behavior: ${behavior}`);
  }

  await setupOpenAiApiMocks(page, normalized as AtlasBehavior);
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

Then('OpenAI invocations should be text {int} image {int} total {int}', async ({}, textCount, imageCount, totalCount) => {
  expect(openAiInvocationCounters.text).toBe(textCount);
  expect(openAiInvocationCounters.image).toBe(imageCount);
  expect(openAiInvocationCounters.text + openAiInvocationCounters.image).toBe(totalCount);
});

Then('OpenAI classified image invocations should be atlas {int} per-icon {int}', async ({}, atlasCount, perIconCount) => {
  expect(openAiInvocationCounters.atlas).toBe(atlasCount);
  expect(openAiInvocationCounters.perIcon).toBe(perIconCount);
});

Then(
  'OpenAI batch invocations should be create {int} poll {int} file-upload {int} file-content {int}',
  async ({}, createCount, pollCount, fileUploadCount, fileContentCount) => {
    expect(openAiInvocationCounters.batchCreate).toBe(createCount);
    expect(openAiInvocationCounters.batchPoll).toBe(pollCount);
    expect(openAiInvocationCounters.fileUpload).toBe(fileUploadCount);
    expect(openAiInvocationCounters.fileContent).toBe(fileContentCount);
  }
);

Then('OpenAI unknown invocations should be {int}', async ({}, expectedUnknownCount) => {
  expect(openAiInvocationCounters.unknown).toBe(expectedUnknownCount);
});
