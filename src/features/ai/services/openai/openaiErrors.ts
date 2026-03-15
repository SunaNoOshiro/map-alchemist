const OPENAI_INVALID_KEY_USER_MESSAGE = 'Invalid OpenAI API key. Update API key in AI Configuration and try again.';
const OPENAI_RATE_LIMIT_USER_MESSAGE = 'OpenAI image model is temporarily rate-limited. Please retry in about a minute.';

const toUserFacingOpenAiAuthError = (status: number, body: any): Error | null => {
  const code = String(body?.error?.code || '').toLowerCase();
  const message = String(body?.error?.message || '').toLowerCase();
  if (status === 401 || code === 'invalid_api_key' || message.includes('incorrect api key')) {
    return new Error(OPENAI_INVALID_KEY_USER_MESSAGE);
  }
  return null;
};

const toUserFacingOpenAiError = (error: unknown): Error | null => {
  if (!(error instanceof Error)) return null;
  const message = error.message.toLowerCase();
  if (error.message === OPENAI_INVALID_KEY_USER_MESSAGE) {
    return error;
  }
  if (message.includes('invalid openai api key') || message.includes('incorrect api key')) {
    return new Error(OPENAI_INVALID_KEY_USER_MESSAGE);
  }
  return null;
};

const isOpenAiRateLimitError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|429|too many requests|quota|resource exhausted|cooldown/i.test(message);
};

export {
  OPENAI_INVALID_KEY_USER_MESSAGE,
  OPENAI_RATE_LIMIT_USER_MESSAGE,
  isOpenAiRateLimitError,
  toUserFacingOpenAiAuthError,
  toUserFacingOpenAiError
};
