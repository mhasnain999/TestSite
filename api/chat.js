'use strict';
/* Vercel serverless function: POST /api/chat (the SimpliEd assistant).
 * Same logic as the local server (simplied-server/lib/chat-service.js). The LLM key comes from the
 * Vercel project's Environment Variables (GEMINI_API_KEY). Without a key, the built-in rules engine answers. */
const fs = require('fs');
const path = require('path');
const { createChatService } = require('../simplied-server/lib/chat-service');

// included via vercel.json "includeFiles"; on Vercel the project root is process.cwd()
const candidates = [path.join(process.cwd(), 'simplied-server', 'knowledge'), path.join(__dirname, '..', 'simplied-server', 'knowledge')];
const knowledgeDir = candidates.find(d => fs.existsSync(d)) || candidates[0];

let service = null, bootError = null;
try {
  service = createChatService({ env: process.env, knowledgeDir, log: (event, data) => { if (process.env.LOG !== 'off') console.log(JSON.stringify({ event, ...data })); } });
} catch (e) { bootError = e; console.error('chat service failed to start:', e && e.message); }

const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
function send(res, status, data, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })) res.setHeader(k, v);
  res.end(data === null ? '' : JSON.stringify(data));
}

module.exports = async (req, res) => {
  // never crash the function: any failure becomes a JSON error the chat widget can fall back from
  try {
    if (!service) return send(res, 503, { error: 'Assistant unavailable', detail: bootError ? String(bootError.message).slice(0, 120) : undefined });
    if (req.method === 'OPTIONS') return send(res, 204, null, { ...service.corsHeaders(req.headers.origin), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, { Allow: 'POST' });
    let body;
    try { body = req.body; } catch (e) { body = Object.assign(new Error('bad json'), { status: 400 }); }   // Vercel parses JSON lazily
    if (body && !(body instanceof Error) && JSON.stringify(body).length > 16 * 1024) body = Object.assign(new Error('too large'), { status: 413 });
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '?');
    const r = await service.handle({ body, ip, contentType: req.headers['content-type'] || '', origin: req.headers.origin, host: req.headers.host });
    return send(res, r.status, r.data, r.headers);
  } catch (e) {
    console.error('chat function error:', e && e.message);
    return send(res, 500, { error: 'Something went wrong' });
  }
};
