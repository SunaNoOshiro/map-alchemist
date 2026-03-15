import { GoogleGenAI, JobState } from '@google/genai';
import {
  ProviderAsyncBatchSnapshot,
  ProviderAsyncBatchState,
  ProviderAsyncBatchTransport,
  ProviderAsyncImageResponse
} from '../AbstractAiService';

type AsyncBatchInlinedRequest = {
  contents: string;
  metadata?: Record<string, string>;
};

const getClient = (apiKey: string) => {
  if (!apiKey) throw new Error('API Key not found.');
  return new GoogleGenAI({ apiKey });
};

const extractInlineImageDataUrl = (response: any): string | null => {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    if (part?.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  return null;
};

const extractBatchJobState = (job: any): string | undefined => {
  if (typeof job?.state === 'string' && job.state.trim()) {
    return job.state;
  }
  if (typeof job?.metadata?.state === 'string' && job.metadata.state.trim()) {
    return job.metadata.state;
  }
  return undefined;
};

const extractBatchInlinedResponses = (job: any): any[] => {
  if (Array.isArray(job?.dest?.inlinedResponses)) {
    return job.dest.inlinedResponses;
  }
  if (Array.isArray(job?.output?.inlinedResponses)) {
    return job.output.inlinedResponses;
  }
  const nested = job?.metadata?.output?.inlinedResponses?.inlinedResponses;
  if (Array.isArray(nested)) {
    return nested;
  }
  return [];
};

const normalizeProviderBatchState = (state?: string): ProviderAsyncBatchState => {
  switch (state) {
    case JobState.JOB_STATE_SUCCEEDED:
    case 'JOB_STATE_SUCCEEDED':
    case 'BATCH_STATE_SUCCEEDED':
      return 'succeeded';
    case JobState.JOB_STATE_PARTIALLY_SUCCEEDED:
    case 'JOB_STATE_PARTIALLY_SUCCEEDED':
    case 'BATCH_STATE_PARTIALLY_SUCCEEDED':
      return 'partially_succeeded';
    case JobState.JOB_STATE_FAILED:
    case 'JOB_STATE_FAILED':
    case 'BATCH_STATE_FAILED':
      return 'failed';
    case JobState.JOB_STATE_CANCELLED:
    case 'JOB_STATE_CANCELLED':
    case 'BATCH_STATE_CANCELLED':
      return 'cancelled';
    case JobState.JOB_STATE_EXPIRED:
    case 'JOB_STATE_EXPIRED':
    case 'BATCH_STATE_EXPIRED':
      return 'expired';
    case JobState.JOB_STATE_PENDING:
    case 'JOB_STATE_PENDING':
    case JobState.JOB_STATE_UNSPECIFIED:
    case 'JOB_STATE_UNSPECIFIED':
      return 'pending';
    default:
      return 'running';
  }
};

const buildGeminiBatchSnapshot = (job: any): ProviderAsyncBatchSnapshot => {
  const rawState = extractBatchJobState(job) || JobState.JOB_STATE_UNSPECIFIED;
  const responses = extractBatchInlinedResponses(job);

  const normalizedResponses = Array.isArray(responses)
    ? responses.map((responseItem): ProviderAsyncImageResponse | null => {
      if (!responseItem) return null;
      if (responseItem.error) {
        return { error: String(responseItem.error?.message || 'Batch response item failed') };
      }

      const imageDataUrl = extractInlineImageDataUrl(responseItem.response);
      if (!imageDataUrl) {
        return { error: 'Batch response item returned no image data' };
      }

      return { imageDataUrl };
    })
    : undefined;

  return {
    state: normalizeProviderBatchState(rawState),
    responses: normalizedResponses,
    errorMessage: job.error?.message
      || job?.metadata?.error?.message
      || undefined
  };
};

const createGeminiAsyncBatchTransport = (
  apiKey: string,
  imageModel: string,
  displayNamePrefix: string
): ProviderAsyncBatchTransport => ({
  create: async (requests) => {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Cannot create async batch without requests.');
    }

    const inlinedRequests: AsyncBatchInlinedRequest[] = requests.map((request) => ({
      contents: request.prompt,
      metadata: request.metadata
    }));
    const client = getClient(apiKey);
    const created = await client.batches.create({
      model: imageModel,
      src: {
        inlinedRequests
      },
      config: {
        displayName: `${displayNamePrefix}-${Date.now()}`
      }
    });

    const batchId = created.name || '';
    if (!batchId) {
      throw new Error('Async batch created without a job name.');
    }
    return batchId;
  },
  get: async (batchId: string) => {
    const client = getClient(apiKey);
    const job = await client.batches.get({ name: batchId });
    return buildGeminiBatchSnapshot(job);
  },
  delete: async (batchId: string) => {
    const client = getClient(apiKey);
    await client.batches.delete({ name: batchId });
  }
});

export { createGeminiAsyncBatchTransport, extractInlineImageDataUrl, getClient };
