const { chromium } = require('playwright');
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
async function open(b, w, h, endpoint) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
  const p = await ctx.newPage(); p.errs = []; p.mail = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  await p.addInitScript(() => { window.__mailto = []; const d = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); });
  if (endpoint) {
    await p.route('**/api/contact', r => endpoint === 'ok' ? r.fulfill({ status: 201, body: '{}' }) : r.fulfill({ status: 500, body: 'x' }));
    await p.addInitScript(() => { let v; Object.defineProperty(window, 'SIMPLIED_CHAT', { configurable: true, set(x) { v = Object.assign(x, { leadEndpoint: '/api/contact' }); }, get() { return v; } }); });
  }
  await p.goto('http://127.0.0.1:3000/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  return p;
}
const fill = async p => { await p.fill('#ctName', 'Sara Ahmed'); await p.selectOption('#ctRole', 'Principal'); await p.fill('#ctSchool', 'Willow Academy'); await p.fill('#ctEmail', 'sara@willow.edu.pk'); };
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let p = await open(b, 1440, 900);
  // hero CTA -> form with "Book a demo" selected
  await p.click('.ct-topics label:nth-of-type(2)', {force:true}).catch(()=>{}); // pick pricing first
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  await p.click('#heroCta'); await p.waitForTimeout(1500);
  const land = await p.evaluate(() => ({ top: Math.round(document.getElementById('get-in-touch').getBoundingClientRect().top), topic: document.querySelector('input[name=topic]:checked').value, btn: document.getElementById('ctSubmit').textContent.trim() }));
  ok('hero Book a Demo lands on contact section', land.top === 84, String(land.top));
  ok('Book a Demo preselects "Book a demo"', land.topic === 'demo' && land.btn === 'Request a demo', JSON.stringify(land));
  ok('nav Book a Demo hidden while the form is on screen', await p.evaluate(() => document.getElementById('navCta').classList.contains('is-hidden')));
  ok('no arrows on Book a Demo buttons', await p.evaluate(() => [...document.querySelectorAll('#heroCta,#endCta,#navCta')].every(a => a.textContent.trim() === 'Book a Demo')));
  ok('no arrow in dashboard hint', await p.evaluate(() => document.querySelector('.dash-hint').textContent.trim() === 'Try it below: every tab and button works.'));
  // topics
  await p.click('.ct-topics label:nth-of-type(2)'); ok('pricing changes button text', (await p.textContent('#ctSubmit')).trim() === 'Request pricing');
  await p.click('.ct-topics label:nth-of-type(3)'); ok('question changes button text', (await p.textContent('#ctSubmit')).trim() === 'Send message');
  await p.click('.ct-topics label:nth-of-type(1)');
  // validation
  await p.click('#ctSubmit'); await p.waitForTimeout(100);
  const v = await p.evaluate(() => ({ errs: [...document.querySelectorAll('.ct-err')].filter(e => e.textContent).length, focus: document.activeElement.id }));
  ok('empty submit shows 4 errors (phone optional)', v.errs === 4, JSON.stringify(v));
  ok('focus moves to first invalid field', v.focus === 'ctName');
  await p.fill('#ctEmail', 'sara@school'); await p.fill('#ctPhone', '12ab'); await p.click('#ctSubmit');
  ok('bad email + bad phone flagged', await p.evaluate(() => /valid email/.test(ctEmailErr.textContent) && /phone/.test(ctPhoneErr.textContent)));
  await fill(p); await p.fill('#ctPhone', '0300 1234567'); await p.fill('#ctMsg', 'Two campuses.');
  ok('errors clear once fixed', await p.evaluate(() => [...document.querySelectorAll('.ct-err')].every(e => !e.textContent)));
  // no backend: mailto fallback (capture navigation instead of opening an email app)
  let mailto = '';
  p.on('request', r => { if (r.url().startsWith('mailto:')) mailto = r.url(); });
  await p.evaluate(() => { window.__nav = ''; });
  await p.route('mailto:*', r => { mailto = r.request().url(); r.abort(); }).catch(() => {});
  await p.click('#ctSubmit'); await p.waitForTimeout(500);
  const st = await p.evaluate(() => document.getElementById('ctStatus').innerText);
  ok('no backend: honest "press Send" status', /Almost done, Sara/.test(st) && /Press Send/.test(st) && !/has reached/.test(st), st.slice(0, 80));
  const link = await p.evaluate(() => decodeURIComponent(document.querySelector('#ctStatus a').getAttribute('href')));
  ok('mailto prefilled with all details', link.startsWith('mailto:info@simpliedtech.com') && /Demo request - Willow Academy/.test(link) && /Principal/.test(link) && /0300 1234567/.test(link) && /Two campuses/.test(link));
  ok('no console errors', p.errs.filter(e => !/mailto/i.test(e)).length === 0, p.errs.join(' | '));
  await p.context().close();
  // backend success / failure
  for (const mode of ['ok', 'fail']) {
    p = await open(b, 1366, 768, mode);
    await p.evaluate(() => document.getElementById('get-in-touch').scrollIntoView()); await fill(p);
    await p.click('#ctSubmit'); await p.waitForTimeout(600);
    const s = await p.evaluate(() => ({ t: document.getElementById('ctStatus').innerText, name: document.getElementById('ctName').value }));
    if (mode === 'ok') ok('backend ok: thank-you + form reset', /has reached the SimpliEd team/.test(s.t) && s.name === '', s.t.slice(0, 60));
    else ok('backend fail: clear error, nothing claimed, email fallback', /couldn't send/.test(s.t) && /Nothing was sent/.test(s.t), s.t.slice(0, 60));
    await p.context().close();
  }
  // phone: tap targets + 16px inputs
  p = await open(b, 390, 844);
  await p.evaluate(() => document.getElementById('get-in-touch').scrollIntoView()); await p.waitForTimeout(300);
  const m = await p.evaluate(() => ({ font: getComputedStyle(ctName).fontSize, minTap: Math.min(...[...document.querySelectorAll('#get-in-touch input:not([type=radio]),#get-in-touch select,#get-in-touch .ct-topics span,#get-in-touch .ct-direct a,#ctSubmit')].map(e => e.getBoundingClientRect().height)), ov: document.documentElement.scrollWidth - innerWidth }));
  ok('390px: inputs 16px (no iOS zoom), taps ≥44px, no overflow', m.font === '16px' && m.minTap >= 44 && m.ov === 0, JSON.stringify(m));
  await p.context().close();
  await b.close();
  console.log(R.join('\n')); console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} passed`);
})();
