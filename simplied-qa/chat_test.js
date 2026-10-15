const { chromium } = require('playwright'); const path = require('path');
const OUT = process.env.OUT || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true }); const URL = 'http://127.0.0.1:5500/index.html';
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
async function setup(b, w, h, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  if (opts.endpoint) {
    await p.route('**/api/demo', r => opts.endpoint === 'ok' ? r.fulfill({ status: 201, body: '{}' }) : r.fulfill({ status: 500, body: 'x' }));
    await p.addInitScript(() => { Object.defineProperty(window, 'SIMPLIED_CHAT', { configurable: true, set(v) { this._sc = Object.assign(v, { leadEndpoint: '/api/demo' }); }, get() { return this._sc; } }); });
  }
  await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.SimpliEdChat);
  return p;
}
const lastBot = p => p.evaluate(() => { const m = [...document.querySelectorAll('.sc-row.bot .sc-msg:not(.sc-typing)')]; return m.length ? m[m.length - 1].innerText : ''; });
const chipLabels = p => p.evaluate(() => [...document.querySelectorAll('.sc-chips .sc-chip')].map(c => c.textContent));
const clickChip = async (p, label) => { await p.locator('.sc-chips .sc-chip', { hasText: label }).first().click(); await p.waitForTimeout(150); };
const say = async (p, text) => { await p.fill('#scInput', text); await p.keyboard.press('Enter'); await p.waitForTimeout(150); };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  // ---------------- desktop: core flows ----------------
  let p = await setup(b, 1440, 900);
  await p.waitForTimeout(1200);
  ok('launcher visible', await p.locator('.sc-launch.in').isVisible());
  await p.click('.sc-launch'); await p.waitForTimeout(400);
  ok('panel opens', await p.evaluate(() => document.querySelector('.sc').classList.contains('open')));
  ok('focus moves to input', await p.evaluate(() => document.activeElement.id === 'scInput'));
  ok('greeting + 5 quick actions', (await chipLabels(p)).length === 5, (await chipLabels(p)).join(' | '));
  await p.screenshot({ path: path.join(OUT, 'chat_open.png') });

  await clickChip(p, 'What is SimpliEd?');
  ok('What is SimpliEd answer', /all-in-one school operating system/i.test(await lastBot(p)));
  await clickChip(p, 'Explore features');
  ok('7 feature chips', (await chipLabels(p)).length === 7, (await chipLabels(p)).join(' | '));
  await clickChip(p, 'Fees & billing');
  const fees = await lastBot(p);
  ok('fees answer uses site facts', /reconciles automatically/.test(fees) && /Stripe/.test(fees));
  ok('follow-up chips offered after feature', (await chipLabels(p)).some(c => /Book a demo/.test(c)));

  // typed intents
  const intents = await p.evaluate(() => ['how much does it cost', 'do you support homework and assignments?', 'can parents see the timetable', 'whatsapp groups are a mess', 'who founded simplied', 'we have 5 branches, need reports', 'what about admissions', 'can I talk to a human', 'tell me about the weather on mars', 'hello', 'does it integrate with stripe'].map(t => [t, window.SimpliEdChat._intent(t)]));
  ok('intent routing', JSON.stringify(intents.map(x => x[1])) === JSON.stringify(['pricing', 'lms', 'timetable', 'comms', 'founder', 'reports', 'admissions', 'team', 'fallback', 'greet', 'integrations']), JSON.stringify(intents.map(x => x[1])));
  await say(p, 'How much does it cost?');
  const pr = await lastBot(p);
  ok('pricing: no invented number', /don't want to guess/.test(pr) && !/\d/.test(pr.replace(/\d+%/g, '')), pr.slice(0, 60));
  await say(p, 'tell me about the weather on mars');
  ok('graceful fallback', /rather not guess/.test(await lastBot(p)));

  // guided help path keeps context
  await clickChip(p, 'Explore features'); // reset chip set
  await say(p, 'how can simplied help with our challenges?');
  ok('help asks challenge', /biggest challenge/.test(await lastBot(p)));
  await clickChip(p, 'Parent communication');
  await clickChip(p, 'Multiple branches');
  const rec = await lastBot(p);
  ok('recommendation reflects choices', /Smart Inbox/.test(rec) && /branch-wise/.test(rec), rec.slice(0, 80));

  // ---------------- demo lead capture with validation ----------------
  await clickChip(p, 'Book a demo');
  ok('demo asks name first', /full name/.test(await lastBot(p)));
  await say(p, 'x'); ok('name validation', /full name/.test(await lastBot(p)));
  await say(p, 'Sara Ahmed'); ok('asks school', /school or institution/.test(await lastBot(p)));
  await say(p, 'Willow Academy'); ok('asks students w/ ranges', (await chipLabels(p)).length === 4);
  await say(p, 'lots'); ok('student validation', /choose a range or type a number/.test(await lastBot(p)));
  await say(p, '850'); ok('asks contact', /email address or phone/.test(await lastBot(p)));
  await say(p, 'sara@school'); ok('email validation', /doesn't look right/.test(await lastBot(p)));
  await say(p, '12ab'); ok('phone validation', /valid email address or phone/.test(await lastBot(p)));
  await say(p, 'sara@willow.edu.pk');
  const sum = await p.evaluate(() => [...document.querySelectorAll('.sc-sum dd')].map(d => d.textContent));
  ok('summary shows all fields + remembered context', sum.join('|') === 'Sara Ahmed|Willow Academy|850|sara@willow.edu.pk|Parent communication|Multiple branches', sum.join('|'));
  await clickChip(p, 'Edit details'); await clickChip(p, 'Students'); await clickChip(p, '1,000 – 3,000');
  const sum2 = await p.evaluate(() => { const all = document.querySelectorAll('.sc-sum'); return [...all[all.length - 1].querySelectorAll('dd')].map(d => d.textContent); });
  ok('edit returns to summary with change', sum2[2] === '1,000 – 3,000');
  await clickChip(p, 'Yes, looks good');
  const done = await p.evaluate(() => ({ note: document.querySelector('.sc-note')?.innerText || '', mail: [...document.querySelectorAll('.sc-acts a')].map(a => a.getAttribute('href')) }));
  ok('honest next step (not "booked")', /isn't scheduled yet/.test(done.note) && !/has been booked|is booked/i.test(await p.evaluate(() => document.querySelector('.sc-log').innerText)));
  const mail = decodeURIComponent(done.mail.find(h => h.startsWith('mailto:')) || '');
  ok('mailto prefilled to info@', mail.startsWith('mailto:info@simpliedtech.com') && /Willow Academy/.test(mail) && /1,000 – 3,000/.test(mail));
  ok('call link present', done.mail.some(h => h.startsWith('tel:+923317734499')));
  await p.screenshot({ path: path.join(OUT, 'chat_done.png') });
  // asking for a demo again doesn't re-ask everything
  await say(p, 'book a demo');
  ok('no repeated questions on 2nd demo request', /already have your details/.test(await p.evaluate(() => document.querySelector('.sc-log').innerText)));

  // keyboard: Esc closes & returns focus to launcher; restart works
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Esc closes, focus to launcher', await p.evaluate(() => !document.querySelector('.sc').classList.contains('open') && document.activeElement.classList.contains('sc-launch')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('Enter on launcher reopens', await p.evaluate(() => document.querySelector('.sc').classList.contains('open')));
  await p.click('.sc-restart'); await p.waitForTimeout(400);
  ok('restart shows fresh greeting', (await chipLabels(p)).length === 5);
  ok('no overflow on desktop', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) === 0);
  ok('no console errors (desktop)', p.errs.length === 0, p.errs.join(' | '));
  // site still works: nav link + dashboard tab
  await p.keyboard.press('Escape'); await p.click('.nav-links a[href="#impact"]'); await p.waitForTimeout(500);
  ok('existing nav still works', await p.evaluate(() => Math.round(document.getElementById('impact').getBoundingClientRect().top)) === 84);
  await p.context().close();

  // ---------------- configured backend: success + failure ----------------
  for (const mode of ['ok', 'fail']) {
    p = await setup(b, 1366, 768, { endpoint: mode });
    await p.waitForTimeout(1000); await p.click('.sc-launch'); await p.waitForTimeout(300);
    await clickChip(p, 'Book a demo');
    for (const v of ['Ali Raza', 'Foundation Public School']) await say(p, v);
    await clickChip(p, 'Under 300'); await say(p, '0300 1234567'); await clickChip(p, 'Yes, looks good'); await p.waitForTimeout(400);
    const txt = await p.evaluate(() => document.querySelector('.sc-log').innerText);
    if (mode === 'ok') ok('backend success message', /has been sent to the SimpliEd team/.test(txt));
    else ok('backend failure → clear error + fallback', /couldn't send/.test(txt) && /nothing was sent/.test(txt) && await p.locator('.sc-acts a[href^="mailto:"]').count() > 0);
    await p.context().close();
  }

  // ---------------- phones ----------------
  for (const [w, h] of [[390, 844], [320, 568]]) {
    p = await setup(b, w, h);
    await p.evaluate(() => document.getElementById('why').scrollIntoView()); await p.waitForTimeout(1000); await p.tap('.sc-launch'); await p.waitForTimeout(400);  // at the very top the launcher tucks away from the hero buttons (by design)
    const g = await p.evaluate(() => { const r = document.querySelector('.sc-panel').getBoundingClientRect(); return { full: r.left === 0 && Math.round(r.width) === innerWidth && Math.round(r.height) >= innerHeight - 1, overflow: document.documentElement.scrollWidth - innerWidth, inputFont: getComputedStyle(document.getElementById('scInput')).fontSize, chipH: Math.min(...[...document.querySelectorAll('.sc-chip')].map(c => c.getBoundingClientRect().height)) }; });
    ok(`${w}px full-screen sheet`, g.full); ok(`${w}px no overflow`, g.overflow === 0); ok(`${w}px input 16px (no iOS zoom)`, g.inputFont === '16px'); ok(`${w}px chips ≥44px`, g.chipH >= 44, String(g.chipH));
    await p.locator('.sc-chip', { hasText: 'Explore features' }).tap(); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, `chat_${w}.png`) });
    await p.tap('.sc-close'); await p.waitForTimeout(300);
    ok(`${w}px close button`, await p.evaluate(() => !document.querySelector('.sc').classList.contains('open')));
    ok(`${w}px no console errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
})();
