const INVALID_API_KEY_USER_MESSAGE = 'Invalid Gemini API key. Update API key in AI Configuration and try again.';
const IMAGE_RATE_LIMIT_USER_MESSAGE = 'Image model is temporarily rate-limited. Please retry in about a minute.';

const parseJsonIfPossible = (value: string): any | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getGeminiErrorEnvelope = (
  error: unknown
): { message: string; status?: string; code?: number; reasons: string[] } => {
  const baseMessage = error instanceof Error ? error.message : String(error ?? '');
  const parsed = parseJsonIfPossible(baseMessage);
  const errorNode = parsed?.error;
  const details = Array.isArray(errorNode?.details) ? errorNode.details : [];
  const reasons = details
    .map((detail: any) => (typeof detail?.reason === 'string' ? detail.reason : ''))
    .filter(Boolean);

  return {
    message: typeof errorNode?.message === 'string' ? errorNode.message : baseMessage,
    status: typeof errorNode?.status === 'string' ? errorNode.status : undefined,
    code: typeof errorNode?.code === 'number' ? errorNode.code : undefined,
    reasons
  };
};

const isInvalidApiKeyError = (error: unknown): boolean => {
  const envelope = getGeminiErrorEnvelope(error);
  const reasonMatch = envelope.reasons.some((reason) => reason.toUpperCase() === 'API_KEY_INVALID');
  const statusMatch = (envelope.status || '').toUpperCase() === 'INVALID_ARGUMENT';
  const message = envelope.message.toLowerCase();
  const messageMatch = message.includes('api key not valid') || message.includes('api_key_invalid');
  return reasonMatch || (statusMatch && messageMatch);
};

const toUserFacingGeminiError = (error: unknown): Error | null => {
  if (error instanceof Error && error.message === INVALID_API_KEY_USER_MESSAGE) {
    return error;
  }
  if (isInvalidApiKeyError(error)) {
    return new Error(INVALID_API_KEY_USER_MESSAGE);
  }
  return null;
};

const isGeminiRateLimitError = (error: unknown): boolean => {
  const envelope = getGeminiErrorEnvelope(error);
  if (envelope.code === 429) return true;

  const upperStatus = (envelope.status || '').toUpperCase();
  if (upperStatus === 'RESOURCE_EXHAUSTED') return true;

  const hasRateLimitReason = envelope.reasons.some((reason) => {
    const normalized = reason.toUpperCase();
    return normalized.includes('RATE_LIMIT') || normalized.includes('RESOURCE_EXHAUSTED');
  });
  if (hasRateLimitReason) return true;

  const message = envelope.message.toLowerCase();
  return message.includes('too many requests')
    || message.includes('rate limit')
    || message.includes('resource exhausted');
};

export {
  IMAGE_RATE_LIMIT_USER_MESSAGE,
  INVALID_API_KEY_USER_MESSAGE,
  isGeminiRateLimitError,
  toUserFacingGeminiError
};
