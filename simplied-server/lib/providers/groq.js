'use strict';
/* GroqCloud (OpenAI-compatible chat completions). Key from GROQ_API_KEY; set GROQ_MODEL to a model listed in your Groq console. */
const { ProviderError, postJSON } = require('./index');

function create(env) {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error('LLM_PROVIDER=groq but GROQ_API_KEY is not set');
  if (!env.GROQ_MODEL) throw new Error('LLM_PROVIDER=groq needs GROQ_MODEL (check the current model list in the Groq console)');
  const base = (env.GROQ_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  return {
    name: 'groq', model: env.GROQ_MODEL,
    async generate({ system, turns, schema, timeoutMs }) {
      const body = {
        model: env.GROQ_MODEL, temperature: 0.2, max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system + '\n\nRespond with one JSON object matching this JSON Schema:\n' + JSON.stringify(schema) },
                   ...turns.map(t => ({ role: t.role, content: t.text }))],
      };
      const data = await postJSON(`${base}/chat/completions`, { Authorization: `Bearer ${key}` }, body, timeoutMs);
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new ProviderError('bad_response', 'empty text');
      return text;
    },
  };
}

module.exports = { create };
