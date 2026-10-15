'use strict';
/* The /api/chat logic shared by the local Node server (server.js) and the Vercel function (/api/chat.js):
 * config from env, knowledge base, LLM provider, assistant, per-IP rate limit and request validation.
 * handle() never throws: it always returns { status, data, headers }. */
const path = require('path');

function createChatService({ env = process.env, knowledgeDir, log = () => {} } = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);
  const cfg = {
    origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    assistant: { email: env.SUPPORT_EMAIL || 'info@simpliedtech.com', timeoutMs: num(env.LLM_TIMEOUT_MS, 9000),
                 dailyLimit: num(env.LLM_DAILY_LIMIT, 1000), maxMessage: 500, maxHistory: 10 },
    rate: { perMinute: num(env.RATE_PER_MINUTE, 15), perDay: num(env.RATE_PER_DAY, 300) },
  };
  const kb = require('./kb').load(knowledgeDir || path.join(__dirname, '..', 'knowledge'));
  // a misconfigured provider (e.g. LLM_PROVIDER set but no key) must not take the chat down: fall back to rules
  let provider = null;
  try { provider = require('./providers').fromEnv(env); }
  catch (e) { log('llm', { event: 'provider_config_error', detail: String(e.message).slice(0, 160) }); }
  const assistant = require('./assistant').createAssistant({ kb, provider, cfg: cfg.assistant, log });

  const hits = new Map();
  function rateLimited(ip) {
    const now = Date.now(); const h = hits.get(ip) || { min: [], day: 0, dayStart: now };
    if (now - h.dayStart > 864e5) { h.day = 0; h.dayStart = now; }
    h.min = h.min.filter(t => now - t < 60e3);
    if (h.min.length >= cfg.rate.perMinute || h.day >= cfg.rate.perDay) { hits.set(ip, h); return true; }
    h.min.push(now); h.day++; hits.set(ip, h);
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.dayStart > 864e5 && !v.min.length) hits.delete(k);
    return false;
  }

  const originAllowed = (origin, host) => !origin || cfg.origins.includes(origin) || origin === `http://${host}` || origin === `https://${host}`;
  const corsHeaders = origin => (origin && cfg.origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});

  /* body: parsed object, raw string, or an Error carrying .status (e.g. 413) */
  async function handle({ body, ip = '?', contentType = '', origin, host }) {
    const headers = corsHeaders(origin);
    const out = (status, data, extra = {}) => ({ status, data, headers: { ...headers, ...extra } });
    if (!originAllowed(origin, host)) return out(403, { error: 'origin not allowed' });
    if (!/^application\/json\b/i.test(contentType)) return out(415, { error: 'JSON only' });
    if (rateLimited(ip)) return out(429, { error: 'Too many messages. Please wait a moment.' }, { 'Retry-After': '30' });
    if (body instanceof Error) return out(body.status || 400, { error: body.status === 413 ? 'Message too large' : 'Invalid JSON' });
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return out(400, { error: 'Invalid JSON' }); } }
    if (!body || typeof body.message !== 'string' || !body.message.trim()) return out(400, { error: 'message is required' });
    if (body.message.length > cfg.assistant.maxMessage) return out(400, { error: `Please keep messages under ${cfg.assistant.maxMessage} characters.` });
    const history = Array.isArray(body.history) ? body.history.filter(h => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'assistant')) : [];
    try {
      const r = await assistant.respond({ message: body.message, history, state: body.state });
      return out(200, { reply: r.reply, action: r.action, intent: r.intent, quickReplies: r.quickReplies, state: r.state,
                        escalation: r.escalation, engine: r.engine, degraded: !!r.degraded });
    } catch (e) {
      log('error', { where: 'chat', detail: String(e.message).slice(0, 200) });
      return out(500, { error: 'Something went wrong' });
    }
  }

  return { handle, corsHeaders, status: () => ({ ok: true, kbEntries: kb.entries.length, ...assistant.status() }), kb, assistant, cfg };
}

module.exports = { createChatService };
