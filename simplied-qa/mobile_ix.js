// Mobile interaction checks: chat launcher never covers controls, teaser hidden on phones, testimonial arrows tappable,
// skip link, landscape hero CTAs visible, nav menu opens/closes, reduced motion.
const { chromium } = require('playwright');
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const URL = 'http://127.0.0.1:3000/index.html';
async function page(b, w, h, extra = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: Math.min(w, h) < 600, hasTouch: Math.min(w, h) < 600, ...extra });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle' }); await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  return p;
}
const launcherState = p => p.evaluate(() => ({ tucked: document.querySelector('.sc').classList.contains('tucked'), op: +getComputedStyle(document.querySelector('.sc-launch')).opacity }));
// is any control under the launcher right now, while the launcher is visible?
const covering = p => p.evaluate(() => {
  const l = document.querySelector('.sc-launch'); if (+getComputedStyle(l).opacity < 0.5) return null;
  const r = l.getBoundingClientRect(); const hits = new Set();
  for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6]])
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.sc')) continue;
      const c = el.closest('a[href],button,input,select,textarea'); if (c) { hits.add((c.id || c.className || c.tagName) + ''); break; }
      if (getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)') break;
    }
  return [...hits];
});
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[320, 568], [390, 844]]) {
    const p = await page(b, w, h); await p.waitForTimeout(1200);
    const H = await p.evaluate(() => document.documentElement.scrollHeight); const bad = [];
    for (let y = 0; y < H; y += 140) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(1700); const c = await covering(p); if (c && c.length) bad.push(`y${y}:${c.join(',')}`); }
    ok(`${w}px: launcher never covers a control while visible (${Math.round(H / 140)} positions)`, bad.length === 0, bad.slice(0, 5).join(' | '));
    await p.evaluate(() => document.getElementById('why').scrollIntoView()); await p.waitForTimeout(500);
    const t1 = await launcherState(p); ok(`${w}px: launcher visible where nothing is underneath`, !t1.tucked && t1.op > 0.9, JSON.stringify(t1));
    await p.evaluate(() => document.getElementById('ctName').scrollIntoView({ block: 'center' })); await p.tap('#ctName'); await p.waitForTimeout(450);
    ok(`${w}px: launcher hides while typing in a page form`, (await launcherState(p)).tucked);
    await p.evaluate(() => document.activeElement.blur()); await p.evaluate(() => document.getElementById('why').scrollIntoView()); await p.waitForTimeout(500);
    ok(`${w}px: launcher returns after typing`, !(await launcherState(p)).tucked);
    await p.waitForTimeout(9000);
    ok(`${w}px: no teaser bubble on phones`, !(await p.evaluate(() => document.querySelector('.sc-teaser').classList.contains('in'))));
    await p.evaluate(() => document.getElementById('testiNext').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
    const before = await p.evaluate(() => document.getElementById('testiTrack').scrollLeft);
    const top = await p.evaluate(() => { const r = document.getElementById('testiNext').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id; });
    await p.tap('#testiNext'); await p.waitForTimeout(800);
    const after = await p.evaluate(() => document.getElementById('testiTrack').scrollLeft);
    ok(`${w}px: testimonial "next" arrow is on top and works`, top === 'testiNext' && after > before, `top=${top} ${before}->${after}`);
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200); await p.tap('#navToggle'); await p.waitForTimeout(400);
    const menu = await p.evaluate(() => { const r = document.getElementById('navPanel').getBoundingClientRect(); return { open: document.getElementById('navToggle').getAttribute('aria-expanded'), right: Math.round(r.right), bottom: Math.round(r.bottom), vh: innerHeight, vw: innerWidth }; });
    ok(`${w}px: menu opens within the screen`, menu.open === 'true' && menu.right <= menu.vw + 1 && menu.bottom <= menu.vh + 1, JSON.stringify(menu));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const esc = await p.evaluate(() => document.getElementById('navToggle').getAttribute('aria-expanded'));
    if (esc === 'true') { await p.tap('#navToggle'); await p.waitForTimeout(300); }
    ok(`${w}px: menu closes`, (await p.evaluate(() => document.getElementById('navToggle').getAttribute('aria-expanded'))) === 'false', 'Escape closes it: ' + (esc === 'false'));
    ok(`${w}px: no console errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
  for (const [w, h] of [[844, 390], [667, 375], [740, 360]]) {
    const p = await page(b, w, h); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ ctaBottom: Math.round(document.querySelector('.hero-cta').getBoundingClientRect().bottom), vh: innerHeight }));
    ok(`${w}x${h}: hero CTAs visible on arrival`, r.ctaBottom <= r.vh, JSON.stringify(r));
    const ph = await p.evaluate(() => [...document.querySelectorAll('.device2')].filter(d => d.offsetParent && !d.closest('.back-phone')).map(d => Math.round(d.getBoundingClientRect().height)));
    ok(`${w}x${h}: every phone mockup fits the screen height`, ph.every(x => x <= h), ph.join(','));
    await p.context().close();
  }
  { const p = await page(b, 1280, 800); await p.keyboard.press('Tab'); await p.waitForTimeout(250);
    const f = await p.evaluate(() => ({ cls: document.activeElement.className, top: Math.round(document.activeElement.getBoundingClientRect().top) }));
    ok('skip link is the first Tab stop and becomes visible', f.cls === 'skip-link' && f.top >= 0, JSON.stringify(f));
    await p.keyboard.press('Enter'); await p.waitForTimeout(400); ok('skip link jumps to content', /#why$/.test(p.url())); await p.context().close(); }
  { const p = await page(b, 390, 844, { reducedMotion: 'reduce' }); await p.waitForTimeout(1200);
    const running = await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity && a.playState === 'running').map(a => { const t = a.effect.target; return (t && (t.className.baseVal ?? t.className)) + ' ' + a.animationName; }).slice(0, 8));
    ok('reduced motion: no endless animations', running.length === 0, running.join(' | ')); await p.context().close(); }
  await b.close();
  console.log(R.join('\n')); console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} passed`);
})();
