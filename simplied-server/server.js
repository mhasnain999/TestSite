'use strict';
/* SimpliEd assistant backend: serves the website and POST /api/chat. Node 18+; no dependencies.
 *   node server.js            (reads .env next to this file)
 * The LLM key lives only here (GEMINI_API_KEY). The browser never sees it. */
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------- .env (tiny loader; real environment variables win) ---------- */
(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
})();

const env = process.env;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);
const CFG = {
  port: num(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  siteDir: path.resolve(__dirname, env.SITE_DIR || '../simplied-site'),
  origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1',
  assistant: {
    email: env.SUPPORT_EMAIL || 'info@simpliedtech.com',
    timeoutMs: num(env.LLM_TIMEOUT_MS, 9000),
    dailyLimit: num(env.LLM_DAILY_LIMIT, 1000),
    maxMessage: 500, maxHistory: 10,
  },
  rate: { perMinute: num(env.RATE_PER_MINUTE, 15), perDay: num(env.RATE_PER_DAY, 300) },
  maxBody: 16 * 1024,
};

const kb = require('./lib/kb').load(path.join(__dirname, 'knowledge'));
const provider = require('./lib/providers').fromEnv(env);
const log = (event, data) => { if (env.LOG !== 'off') console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data })); };
const assistant = require('./lib/assistant').createAssistant({ kb, provider, cfg: CFG.assistant, log });

/* ---------- rate limiting (in memory, per IP) ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(); const h = hits.get(ip) || { min: [], day: 0, dayStart: now };
  if (now - h.dayStart > 864e5) { h.day = 0; h.dayStart = now; }
  h.min = h.min.filter(t => now - t < 60e3);
  if (h.min.length >= CFG.rate.perMinute || h.day >= CFG.rate.perDay) { hits.set(ip, h); return true; }
  h.min.push(now); h.day++; hits.set(ip, h); return false;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.dayStart > 864e5 && !h.min.length) hits.delete(ip); }, 10 * 60e3).unref();

/* ---------- helpers ---------- */
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SEC, ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function cors(req, res) {
  const o = req.headers.origin;
  if (o && CFG.origins.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  return !o || CFG.origins.includes(o) || o === `http://${req.headers.host}` || o === `https://${req.headers.host}`;
}
const clientIp = req => (CFG.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > CFG.maxBody) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------- /api/chat ---------- */
async function chat(req, res) {
  if (!cors(req, res)) return send(res, 403, { error: 'origin not allowed' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only' });
  if (rateLimited(clientIp(req))) return send(res, 429, { error: 'Too many messages. Please wait a moment.' }, { 'Retry-After': '30' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? 'Message too large' : 'Invalid JSON' }); }
  if (!body || typeof body.message !== 'string' || !body.message.trim()) return send(res, 400, { error: 'message is required' });
  if (body.message.length > CFG.assistant.maxMessage) return send(res, 400, { error: `Please keep messages under ${CFG.assistant.maxMessage} characters.` });
  const history = Array.isArray(body.history) ? body.history.filter(h => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'assistant')) : [];
  try {
    const out = await assistant.respond({ message: body.message, history, state: body.state });
    send(res, 200, { reply: out.reply, action: out.action, intent: out.intent, quickReplies: out.quickReplies, state: out.state,
                     escalation: out.escalation, engine: out.engine, degraded: !!out.degraded });
  } catch (e) {
    log('error', { where: 'chat', detail: String(e.message).slice(0, 200) });
    send(res, 500, { error: 'Something went wrong' });
  }
}

/* ---------- static website ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8' };
/* text assets are compressed (brotli, else gzip) once per file version and cached in memory */
const zlib = require('zlib');
const COMPRESSIBLE = /\.(html|css|js|json|svg|txt)$/i, zcache = new Map();
function compressed(file, st, enc) {
  const key = `${file}|${st.mtimeMs}|${enc}`;
  if (!zcache.has(key)) {
    const raw = fs.readFileSync(file);
    zcache.set(key, enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : zlib.gzipSync(raw, { level: 9 }));
    if (zcache.size > 200) zcache.delete(zcache.keys().next().value);
  }
  return zcache.get(key);
}
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(CFG.siteDir, '.' + rel);
  if (!file.startsWith(CFG.siteDir + path.sep) || /(^|[\\/])\./.test(path.relative(CFG.siteDir, file))) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = COMPRESSIBLE.test(file) && st.size > 1024 ? (/\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null) : null;
    const body = enc ? compressed(file, st, enc) : null;
    res.writeHead(200, { ...SEC, 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body ? body.length : st.size,
                         'Cache-Control': /\.(html)$/.test(file) ? 'no-cache' : 'public, max-age=3600', Vary: 'Accept-Encoding',
                         ...(enc ? { 'Content-Encoding': enc } : {}),
                         // lets chatbot.js know this page is served alongside the assistant API (no extra request needed)
                         ...(/\.html$/.test(file) ? { 'Server-Timing': 'simplied-assistant' } : {}) });
    if (req.method === 'HEAD') return res.end();
    if (body) return res.end(body);
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/api/chat') {
    if (req.method === 'OPTIONS') { cors(req, res); return send(res, 204, '', { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }); }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, { Allow: 'POST' });
    return chat(req, res);
  }
  if (pathname === '/api/health') return send(res, 200, { ok: true, kbEntries: kb.entries.length, ...assistant.status() });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, pathname);
});
server.requestTimeout = 30e3;
server.headersTimeout = 15e3;

if (require.main === module) {
  server.listen(CFG.port, CFG.host, () => {
    const s = assistant.status();
    console.log(`SimpliEd site + assistant on http://${CFG.host}:${CFG.port}  (site: ${CFG.siteDir})`);
    console.log(s.provider ? `LLM: ${s.provider} / ${s.model}` : 'LLM: not configured, using the built-in rules engine (set GEMINI_API_KEY in .env)');
  });
}
module.exports = { server, assistant, kb, CFG };
