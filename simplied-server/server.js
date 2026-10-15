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
  trustProxy: env.TRUST_PROXY === '1',
  maxBody: 16 * 1024,
};

const log = (event, data) => { if (env.LOG !== 'off') console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data })); };
// all chat logic (config, knowledge base, LLM provider, rate limit, validation) is shared with the Vercel function
const chatService = require('./lib/chat-service').createChatService({ env, knowledgeDir: path.join(__dirname, 'knowledge'), log });
const { kb, assistant } = chatService;

/* ---------- helpers ---------- */
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SEC, ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
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
  const ct = req.headers['content-type'] || '';
  let body = null;
  if (/^application\/json\b/i.test(ct)) { try { body = await readBody(req); } catch (e) { body = e; } }
  const r = await chatService.handle({ body, ip: clientIp(req), contentType: ct, origin: req.headers.origin, host: req.headers.host });
  send(res, r.status, r.data, r.headers);
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
    if (req.method === 'OPTIONS') return send(res, 204, '', { ...chatService.corsHeaders(req.headers.origin), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, { Allow: 'POST' });
    return chat(req, res);
  }
  if (pathname === '/api/health') return send(res, 200, chatService.status());
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
module.exports = { server, assistant, kb, CFG, chatService };
