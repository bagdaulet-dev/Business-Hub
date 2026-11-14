/** Server-only adapter. No environment reads, automatic requests or retries. */
export function createAnthropicCompletion({apiKey, model, apiVersion = '2023-06-01', fetchImpl = globalThis.fetch} = {}) {
  if (typeof window !== 'undefined') throw new Error('SERVER_ONLY');
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof model !== 'string' || !model.trim()) throw new Error('PROVIDER_NOT_CONFIGURED');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');
  return async ({system, text, signal}) => {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method:'POST', signal,
      headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':apiVersion},
      body:JSON.stringify({model,max_tokens:700,system,messages:[{role:'user',content:text}]})
    });
    if (!response.ok) throw new Error('PROVIDER_HTTP_ERROR');
    const payload = await response.json();
    if (payload.stop_reason !== 'end_turn' || !Array.isArray(payload.content)) throw new Error('PROVIDER_INCOMPLETE_RESPONSE');
    const content = payload.content.filter(x=>x.type==='text').map(x=>x.text);
    if (content.length !== 1 || typeof content[0] !== 'string') throw new Error('PROVIDER_INVALID_RESPONSE');
    return content[0];
  };
}
