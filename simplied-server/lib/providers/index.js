'use strict';
/* LLM provider abstraction. Every provider implements:
 *   async generate({ system, turns: [{role:'user'|'assistant', text}], schema, timeoutMs }) -> string (JSON text)
 * and throws ProviderError with kind: timeout | rate_limit | quota | auth | unavailable | blocked | bad_response.
 * To add a provider: create a file exporting create(env) and register it below. Nothing else changes. */

class ProviderError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status || 0; }
}

async function postJSON(url, headers, body, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res, text;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    text = await res.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderError('timeout', `no response within ${timeoutMs} ms`);
    throw new ProviderError('unavailable', 'network error: ' + e.message);
  } finally { clearTimeout(timer); }
  if (res.status === 429) {
    const daily = /per ?day|daily|quota/i.test(text);
    throw new ProviderError(daily ? 'quota' : 'rate_limit', 'rate limited', 429);
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'API key rejected', res.status);
  if (res.status >= 500) throw new ProviderError('unavailable', 'provider error', res.status);
  if (!res.ok) throw new ProviderError('bad_response', `HTTP ${res.status}`, res.status);
  try { return JSON.parse(text); } catch { throw new ProviderError('bad_response', 'non-JSON response'); }
}

const REGISTRY = {
  gemini: () => require('./gemini'),
  groq: () => require('./groq'),
};

/* Returns a provider or null when nothing is configured (the assistant then uses the rules engine). */
function fromEnv(env) {
  const name = (env.LLM_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.GROQ_API_KEY ? 'groq' : '')).toLowerCase();
  if (!name || name === 'none') return null;
  if (!REGISTRY[name]) throw new Error(`Unknown LLM_PROVIDER "${name}" (use: ${Object.keys(REGISTRY).join(', ')}, none)`);
  return REGISTRY[name]().create(env);
}

module.exports = { ProviderError, postJSON, fromEnv };
