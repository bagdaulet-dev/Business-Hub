/** Server-only OpenAI-compatible Telecom adapter. No env reads, probes or retries. */
const APPROVED_BASE_URL = 'https://llm.telecom.kz/v1';

export function createTelecomCompletion({
  apiKey, model, baseUrl = APPROVED_BASE_URL, fetchImpl = globalThis.fetch, maxTokens = 700,
} = {}) {
  if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
  if (baseUrl !== APPROVED_BASE_URL) throw new Error('INVALID_PROVIDER_BASE_URL');
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof model !== 'string' || !model.trim()) {
    throw new Error('PROVIDER_NOT_CONFIGURED');
  }
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new Error('INVALID_MAX_TOKENS');

  return async ({system, text, signal}) => {
    if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
    if (typeof system !== 'string' || typeof text !== 'string' || !system.trim() || !text.trim()) {
      throw new Error('INVALID_COMPLETION_INPUT');
    }
    // All failures deliberately omit remote text, URLs, headers and credentials.
    try {
      const response = await fetchImpl(`${APPROVED_BASE_URL}/chat/completions`, {
        method: 'POST', redirect: 'error', signal,
        headers: {'content-type':'application/json', Authorization:`Bearer ${apiKey}`},
        body: JSON.stringify({model, max_tokens:maxTokens, messages:[
          {role:'system',content:system}, {role:'user',content:text},
        ]}),
      });
      if (!response?.ok || response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new Error();
      }
      const payload = await response.json();
      if (!Array.isArray(payload?.choices) || payload.choices.length !== 1) throw new Error();
      const choice = payload.choices[0];
      const message = choice?.message;
      if (choice?.finish_reason !== 'stop' || !message ||
        (message.role != null && message.role !== 'assistant') ||
        typeof message.content !== 'string' || !message.content.trim() ||
        message.refusal || message.function_call != null ||
        (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))) {
        throw new Error();
      }
      return message.content;
    } catch {
      throw new Error('PROVIDER_UNAVAILABLE');
    }
  };
}
