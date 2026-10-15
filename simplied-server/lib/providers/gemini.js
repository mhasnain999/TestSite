'use strict';
/* Google Gemini (generateContent REST API). Key from GEMINI_API_KEY. Server-side only. */
const { ProviderError, postJSON } = require('./index');

/* Gemini responseSchema uses the OpenAPI subset (upper-case types). */
function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type') out.type = String(v).toUpperCase();
    else if (k === 'additionalProperties') continue;
    else out[k] = (k === 'enum' || k === 'required') ? v : toGeminiSchema(v);
  }
  return out;
}

function create(env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set');
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const base = (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  return {
    name: 'gemini', model,
    async generate({ system, turns, schema, timeoutMs }) {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
      };
      const data = await postJSON(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, body, timeoutMs);
      if (data.promptFeedback && data.promptFeedback.blockReason) throw new ProviderError('blocked', 'prompt blocked: ' + data.promptFeedback.blockReason);
      const c = (data.candidates || [])[0];
      if (!c) throw new ProviderError('bad_response', 'no candidates');
      if (c.finishReason && !['STOP', 'MAX_TOKENS'].includes(c.finishReason)) throw new ProviderError('blocked', 'finish reason ' + c.finishReason);
      const text = ((c.content && c.content.parts) || []).map(p => p.text || '').join('');
      if (!text) throw new ProviderError('bad_response', 'empty text');
      return text;
    },
  };
}

module.exports = { create, toGeminiSchema };
