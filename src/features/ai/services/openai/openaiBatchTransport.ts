import {
  ProviderAsyncBatchSnapshot,
  ProviderAsyncBatchState,
  ProviderAsyncBatchTransport,
  ProviderAsyncImageRequest,
  ProviderAsyncImageResponse
} from '../AbstractAiService';

type OpenAiBatchTransportConfig = {
  apiKey: string;
  imageModel: string;
  displayNamePrefix: string;
  baseUrl?: string;
  imageSize?: string;
  responseFormat?: 'b64_json' | 'url';
};

type OpenAiBatchCreateResponse = {
  id?: string;
};

type OpenAiBatchGetResponse = {
  id?: string;
  status?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  errors?: {
    data?: Array<{ message?: string }>;
  };
};

type OpenAiFileResponse = {
  id?: string;
};

type OpenAiBatchOutputLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: any;
  };
  error?: { message?: string } | string | null;
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const toProviderBatchState = (status?: string): ProviderAsyncBatchState => {
  switch (String(status || '').toLowerCase()) {
    case 'validating':
      return 'pending';
    case 'in_progress':
    case 'finalizing':
    case 'cancelling':
      return 'running';
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    default:
      return 'running';
  }
};

const classifyBatchKind = (requests: ProviderAsyncImageRequest[]): 'atlas' | 'per-icon' => {
  const firstPrompt = requests[0]?.prompt || '';
  if (firstPrompt.includes('Create ONE square icon sprite atlas image')) {
    return 'atlas';
  }
  return 'per-icon';
};

const parseJsonl = (content: string): OpenAiBatchOutputLine[] => {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as OpenAiBatchOutputLine;
      } catch {
        return {};
      }
    });
};

const errorMessageFromLine = (line: OpenAiBatchOutputLine): string => {
  if (typeof line.error === 'string' && line.error.trim()) {
    return line.error;
  }
  if (typeof line.error === 'object' && line.error?.message) {
    return line.error.message;
  }
  if (line.response?.body?.error?.message) {
    return String(line.response.body.error.message);
  }
  return 'Batch response item failed';
};

const toProviderImageResponse = (line: OpenAiBatchOutputLine | undefined): ProviderAsyncImageResponse => {
  if (!line) {
    return { error: 'Missing batch output item' };
  }

  if (line.error) {
    return { error: errorMessageFromLine(line) };
  }

  const statusCode = Number(line.response?.status_code || 0);
  if (statusCode >= 400) {
    return { error: errorMessageFromLine(line) };
  }

  const item = line.response?.body?.data?.[0];
  if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) {
    return { imageDataUrl: `data:image/png;base64,${item.b64_json}` };
  }
  if (typeof item?.url === 'string' && item.url.length > 0) {
    return { imageDataUrl: item.url };
  }

  return { error: 'Batch response item returned no image data' };
};

const summarizeResponsesState = (
  responses: Array<ProviderAsyncImageResponse | null>
): ProviderAsyncBatchState => {
  const usableCount = responses.filter((response) => Boolean(response?.imageDataUrl)).length;
  if (usableCount === responses.length && responses.length > 0) {
    return 'succeeded';
  }
  if (usableCount > 0) {
    return 'partially_succeeded';
  }
  return 'failed';
};

const createOpenAiBatchTransport = (config: OpenAiBatchTransportConfig): ProviderAsyncBatchTransport => {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const imageSize = config.imageSize || '1024x1024';
  const responseFormat = config.responseFormat || 'b64_json';
  const customIdsByBatchId = new Map<string, string[]>();

  const requestOpenAiJson = async <T>(
    path: string,
    init: RequestInit,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> => {
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      ...extraHeaders
    };

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message
        ? `${payload.error.message} (status ${response.status})`
        : `OpenAI request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  };

  const uploadBatchInputFile = async (jsonl: string): Promise<string> => {
    const formData = new FormData();
    formData.append('purpose', 'batch');
    formData.append(
      'file',
      new Blob([jsonl], { type: 'application/jsonl' }),
      `${config.displayNamePrefix}-${Date.now()}.jsonl`
    );

    const response = await fetch(`${baseUrl}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      },
      body: formData
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message
        ? `${payload.error.message} (status ${response.status})`
        : `OpenAI file upload failed (${response.status})`;
      throw new Error(message);
    }

    const fileId = (payload as OpenAiFileResponse).id || '';
    if (!fileId) {
      throw new Error('Batch input upload returned no file id');
    }
    return fileId;
  };

  const fetchBatchOutputFile = async (fileId: string): Promise<string> => {
    const response = await fetch(`${baseUrl}/files/${fileId}/content`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to fetch batch output file (${response.status})`);
    }
    return text;
  };

  return {
    create: async (requests: ProviderAsyncImageRequest[]) => {
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error('Cannot create async batch without requests.');
      }

      const customIds = requests.map((_, index) => `req-${index}`);
      const jsonl = requests
        .map((request, index) => JSON.stringify({
          custom_id: customIds[index],
          method: 'POST',
          url: '/v1/images/generations',
          body: {
            model: config.imageModel,
            prompt: request.prompt,
            size: imageSize,
            response_format: responseFormat
          }
        }))
        .join('\n');

      const inputFileId = await uploadBatchInputFile(jsonl);
      const batchKind = classifyBatchKind(requests);
      const created = await requestOpenAiJson<OpenAiBatchCreateResponse>('/batches', {
        method: 'POST',
        body: JSON.stringify({
          input_file_id: inputFileId,
          endpoint: '/v1/images/generations',
          completion_window: '24h',
          metadata: {
            source: config.displayNamePrefix,
            request_kind: batchKind,
            request_count: String(requests.length)
          }
        })
      }, {
        'Content-Type': 'application/json'
      });

      const batchId = created.id || '';
      if (!batchId) {
        throw new Error('Async batch created without a batch id.');
      }

      customIdsByBatchId.set(batchId, customIds);
      return batchId;
    },
    get: async (batchId: string) => {
      const batch = await requestOpenAiJson<OpenAiBatchGetResponse>(`/batches/${batchId}`, {
        method: 'GET'
      });

      const baseState = toProviderBatchState(batch.status);
      if ((batch.status || '').toLowerCase() !== 'completed') {
        return {
          state: baseState,
          errorMessage: batch.errors?.data?.[0]?.message
        };
      }

      const customIds = customIdsByBatchId.get(batchId) || [];
      const outputFileId = batch.output_file_id || '';
      if (!outputFileId) {
        return {
          state: 'failed',
          responses: customIds.map(() => ({ error: 'Batch completed without output file.' })),
          errorMessage: batch.errors?.data?.[0]?.message || 'Batch completed without output file.'
        };
      }

      const outputContent = await fetchBatchOutputFile(outputFileId);
      const lines = parseJsonl(outputContent);
      const lineByCustomId = new Map<string, OpenAiBatchOutputLine>();
      lines.forEach((line) => {
        if (line.custom_id) {
          lineByCustomId.set(line.custom_id, line);
        }
      });

      const responses = customIds.map((customId) => toProviderImageResponse(lineByCustomId.get(customId)));
      const state = summarizeResponsesState(responses);
      const firstError = responses.find((response) => response?.error)?.error;

      return {
        state,
        responses,
        errorMessage: typeof firstError === 'string' ? firstError : undefined
      };
    },
    delete: async (batchId: string) => {
      customIdsByBatchId.delete(batchId);
    }
  };
};

export { createOpenAiBatchTransport };
