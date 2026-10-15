'use strict';
/* End-to-end over HTTP: real server.js + real Gemini adapter, talking to a local mock of the Gemini REST API. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const KEY = 'test-key-never-leaves-the-server';
let mock, mockPort, srv, base; const seen = [];

function geminiReply(obj) { return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] }; }

test.before(async () => {
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
      const body = JSON.parse(b); seen.push({ url: req.url, key: req.headers['x-goog-api-key'], body });
      const msg = body.contents.at(-1).parts[0].text;
      const json = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (msg.includes('MOCK_429')) return json(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Requests per minute exceeded' } });
      if (msg.includes('MOCK_500')) return json(500, { error: { message: 'internal' } });
      if (msg.includes('MOCK_SLOW')) return setTimeout(() => json(200, geminiReply({ action: 'smalltalk', intent: 'general', reply: 'late', confidence: 1 })), 2500);
      if (msg.includes('MOCK_GARBAGE')) return json(200, { candidates: [{ content: { parts: [{ text: 'I think the answer is yes' }] }, finishReason: 'STOP' }] });
      return json(200, geminiReply({ action: 'solution', node_id: 'sol.teachers', intent: 'teacher_management', confidence: 0.92,
        reply: 'Teachers carry a lot. The SimpliEd Teacher App gives them digital grading and automated results. Want to see it for yourself in a demo?' }));
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); mockPort = mock.address().port;
  const port = 30000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: KEY, LLM_PROVIDER: 'gemini',
    GEMINI_API_BASE: `http://127.0.0.1:${mockPort}`, LLM_TIMEOUT_MS: '1200', RATE_PER_MINUTE: '40', LOG: 'off' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
test.after(() => { srv && srv.kill(); mock && mock.close(); });

const chat = (body, headers = {}) => fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('health reports provider/model without exposing the key', async () => {
  const h = await (await fetch(base + '/api/health')).json();
  assert.equal(h.provider, 'gemini'); assert.equal(h.model, 'gemini-3.5-flash-lite'); assert.equal(h.llm, 'ready');
  assert.doesNotMatch(JSON.stringify(h), new RegExp(KEY));
});

test('LLM path: key sent only as a server-side header, structured JSON schema requested', async () => {
  const r = await chat({ message: 'Teacher issue' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.engine, 'llm'); assert.equal(j.action, 'solution'); assert.equal(j.state.node, 'sol.teachers');
  const call = seen.at(-1);
  assert.equal(call.key, KEY); assert.match(call.url, /\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(call.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(call.body.generationConfig.responseSchema.type, 'OBJECT');
  assert.doesNotMatch(JSON.stringify(j), new RegExp(KEY));
});

for (const [tag, why] of [['MOCK_SLOW', 'timeout'], ['MOCK_GARBAGE', 'invalid output'], ['MOCK_500', 'server error'], ['MOCK_429', 'rate limit']]) {
  test(`F over HTTP: ${why} -> 200 with a helpful fallback reply`, async () => {
    const t0 = Date.now();
    const r = await chat({ message: `Teacher issue ${tag}` }); const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.engine, 'rules'); assert.equal(j.degraded, true);
    assert.equal(j.action, 'solution'); assert.match(j.reply, /Teacher App/); assert.match(j.reply, /demo/i);
    assert.ok(Date.now() - t0 < 4000, 'answers quickly even when the provider hangs');
  });
}

test('input validation: content-type, size, empty, too long, bad JSON', async () => {
  assert.equal((await chat('{"message":"hi"}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await chat('{bad json')).status, 400);
  assert.equal((await chat({ message: '   ' })).status, 400);
  assert.equal((await chat({ message: 'x'.repeat(501) })).status, 400);
  const big = await chat({ message: 'hi', history: [{ role: 'user', text: 'x'.repeat(20000) }] }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
  assert.equal((await fetch(base + '/api/chat')).status, 405);
});

test('foreign origins are refused (CORS)', async () => {
  assert.equal((await chat({ message: 'hi' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await chat({ message: 'hello' }, { Origin: base })).status, 200);
});

test('static site is served; secrets and path traversal are not', async () => {
  const home = await fetch(base + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /SimpliEd/);
  assert.equal((await fetch(base + '/assets/chatbot.js')).status, 200);
  for (const p of ['/../simplied-server/server.js', '/%2e%2e/simplied-server/.env.example', '/..%5csimplied-server%5cserver.js', '/.git/config'])
    assert.equal((await fetch(base + p)).status, 404, p);
});

test('text assets are compressed (brotli / gzip) and decode to the original', async () => {
  const plain = await (await fetch(base + '/index.html', { headers: { 'Accept-Encoding': 'identity' } })).text();
  for (const enc of ['br', 'gzip']) {
    const r = await new Promise(res => http.get(base + '/index.html', { headers: { 'Accept-Encoding': enc } }, res));
    assert.equal(r.headers['content-encoding'], enc); assert.equal(r.headers.vary, 'Accept-Encoding');
    const chunks = []; for await (const c of r) chunks.push(c);
    const buf = Buffer.concat(chunks), zlib = require('zlib');
    assert.ok(buf.length < plain.length / 3, `${enc} is much smaller`);
    assert.equal((enc === 'br' ? zlib.brotliDecompressSync(buf) : zlib.gunzipSync(buf)).toString(), plain);
  }
});

test('per-IP rate limit returns 429 (runs last)', async () => {
  let got429 = false;
  for (let i = 0; i < 45 && !got429; i++) got429 = (await chat({ message: 'hello' })).status === 429;
  assert.ok(got429);
});
