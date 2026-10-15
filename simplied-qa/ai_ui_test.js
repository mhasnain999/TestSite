// Browser test of the upgraded chatbot against the real simplied-server (rules mode + mock-Gemini mode).
const { chromium } = require('playwright'); const path = require('path'); const http = require('http'); const { spawn } = require('child_process');
const OUT = process.env.OUT || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true }); const SERVER = 'C:/Users/FPS/Downloads/TestF/simplied-server/server.js';
const results = []; const ok = (n, c, i = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startServer(port, extraEnv) {
  const p = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), LOG: 'off', GEMINI_API_KEY: '', LLM_PROVIDER: '', RATE_PER_MINUTE: '100', ...extraEnv }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/api/health`); return p; } catch { await sleep(100); } }
  throw new Error('server start failed');
}
async function page(b, url, w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); p.errs = []; p.aiCalls = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  p.on('request', r => { if (r.url().includes('/api/chat')) p.aiCalls.push(JSON.parse(r.postData() || '{}')); });
  await p.goto(url + '?v=' + Date.now(), { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.SimpliEdChat);
  await p.evaluate(() => document.getElementById('why').scrollIntoView()); await p.waitForTimeout(1000); await p.click('.sc-launch'); await p.waitForTimeout(500);
  return p;
}
const lastBot = p => p.evaluate(() => { const m = [...document.querySelectorAll('.sc-row.bot .sc-msg:not(.sc-typing)')]; return m.length ? m.at(-1).innerText : ''; });
const chipLabels = p => p.evaluate(() => [...document.querySelectorAll('.sc-chips .sc-chip')].map(c => c.textContent));
const idle = p => p.waitForFunction(() => !window.SimpliEdChat._state.busy && !document.querySelector('.sc-typing'), null, { timeout: 8000 });
const say = async (p, t) => { await p.fill('#scInput', t); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await idle(p); };
const chip = async (p, l) => { await p.locator('.sc-chips .sc-chip', { hasText: l }).first().click(); await p.waitForTimeout(80); await idle(p); };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* ---------- 1) rules engine (no API key) ---------- */
  let srv = await startServer(3101);
  let p = await page(b, 'http://127.0.0.1:3101/index.html');
  ok('greeting invites the visitor to describe their challenge', /what's challenging at your school/.test(await lastBot(p)));
  ok('5 quick actions unchanged', (await chipLabels(p)).length === 5);
  await say(p, 'Teacher issue');
  const a = await lastBot(p);
  ok('A: problem -> service', /Teacher App/.test(a), a.slice(0, 80));
  ok('A: -> result', /What schools see/.test(a) && /Willow Academy/.test(a));
  ok('A: -> demo invitation', /demo/i.test(a));
  ok('A: Book a demo is the first chip', (await chipLabels(p))[0] === 'Book a demo', (await chipLabels(p)).join('|'));
  await p.screenshot({ path: path.join(OUT, 'ai_solution.png') });
  await say(p, 'how does that work?');
  ok('D: follow-up stays on the topic', /Teacher App/.test(await lastBot(p)), await lastBot(p));
  await say(p, "Sir's name is not showing in the list");
  ok('B: different wording understood', /one connected platform/i.test(await lastBot(p)));
  await say(p, 'Parents always pay fees late');
  ok('fees problem -> automated billing + 46% result', /automated billing/i.test(await lastBot(p)) && /46%/.test(await lastBot(p)));
  await say(p, 'yes');
  ok('"yes" to the invitation starts the demo form', /full name/.test(await lastBot(p)));
  await say(p, 'cancel');
  await say(p, 'Do you support homework and assignments?');
  ok('C: documented question answered directly + demo invite', /LMS/.test(await lastBot(p)) && /demo/i.test(await lastBot(p)));
  await say(p, 'How do I export data to Tally?');
  ok('E: unsupported -> no guess', /rather not guess/.test(await lastBot(p)));
  ok('E: offers team', (await chipLabels(p)).includes('Talk to our team'));
  await chip(p, 'Talk to our team');
  ok('local team handler still works', /info@simpliedtech\.com/.test(await lastBot(p)));
  const before = p.aiCalls.length;
  await say(p, 'I want a demo');
  ok('demo handoff starts local lead flow', /full name/.test(await lastBot(p)));
  await say(p, 'Zara Qureshi'); await say(p, 'Zebra Grammar School'); await say(p, '850');
  ok('lead details never sent to the AI endpoint', p.aiCalls.length === before + 1 && !/Zara|Zebra/.test(JSON.stringify(p.aiCalls)), `${p.aiCalls.length - before} calls`);
  ok('history sent is capped/scrubbed', p.aiCalls.every(c => !c.history || c.history.length <= 10));
  ok('no console errors (rules mode)', p.errs.length === 0, p.errs.join(' | '));
  ok('no page overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) === 0);
  await p.context().close();

  // phone
  p = await page(b, 'http://127.0.0.1:3101/index.html', 390, 844);
  await say(p, 'we manage 20 whatsapp groups');
  const m = await p.evaluate(() => ({ chipH: Math.min(...[...document.querySelectorAll('.sc-chip')].map(c => c.getBoundingClientRect().height)), ov: document.documentElement.scrollWidth - innerWidth }));
  ok('390px: solution chips ≥44px, no overflow', m.chipH >= 44 && m.ov === 0, JSON.stringify(m));
  await p.screenshot({ path: path.join(OUT, 'ai_390.png') });
  await p.context().close();

  // backend goes away mid-session -> built-in answers take over, no broken UI
  p = await page(b, 'http://127.0.0.1:3101/index.html');
  await say(p, 'hello');
  srv.kill(); await sleep(300);
  await say(p, 'how much does it cost');
  ok('backend down -> local fallback answer', /don't want to guess a number/.test(await lastBot(p)), await lastBot(p));
  ok('AI disabled after outage (no repeated failing calls)', await p.evaluate(() => window.SimpliEdChat._state.ai.on === false));
  await p.context().close();

  /* ---------- 2) mock Gemini (LLM path + XSS + provider failure) ---------- */
  let mode = 'ok';
  const mock = http.createServer((req, res) => { let s = ''; req.on('data', c => s += c); req.on('end', () => {
    if (mode === '503') { res.writeHead(503); return res.end('{}'); }
    const msg = JSON.parse(s).contents.at(-1).parts[0].text;
    const o = /xss/i.test(msg) ? { action: 'smalltalk', intent: 'general', reply: 'Hi <img src=x onerror="window.__pwned=1"> **there**', confidence: 0.9 }
      : { action: 'solution', node_id: 'sol.teachers', intent: 'teacher_management', confidence: 0.9, reply: 'Teachers carry a lot. The **SimpliEd Teacher App** gives them digital grading and automated results, so results are ready automatically.' };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: 'STOP' }] }));
  }); });
  await new Promise(r => mock.listen(3199, '127.0.0.1', r));
  srv = await startServer(3102, { GEMINI_API_KEY: 'k', LLM_PROVIDER: 'gemini', GEMINI_API_BASE: 'http://127.0.0.1:3199', LLM_TIMEOUT_MS: '2000' });
  p = await page(b, 'http://127.0.0.1:3102/index.html');
  await say(p, 'we have a teacher problem');
  ok('LLM reply rendered', /Teachers carry a lot/.test(await lastBot(p)));
  ok('LLM reply gets a demo invitation + Book a demo chip', /demo/i.test(await lastBot(p)) && (await chipLabels(p))[0] === 'Book a demo');
  await say(p, 'xss test');
  ok('HTML in model output is never executed', await p.evaluate(() => !window.__pwned && !document.querySelector('.sc-log img[src="x"]')));
  mode = '503';
  await say(p, 'Teacher issue');
  ok('F: provider 503 -> helpful fallback, chat keeps working', /Teacher App/.test(await lastBot(p)), await lastBot(p));
  ok('no console errors (LLM mode)', p.errs.length === 0, p.errs.join(' | '));
  await p.screenshot({ path: path.join(OUT, 'ai_llm.png') });
  await p.context().close(); srv.kill(); mock.close();

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
