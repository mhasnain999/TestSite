// Hero app cards on phones: slow drift, touch stops, swipe, touch elsewhere resumes, dots + phone follow, desktop untouched.
const { chromium } = require('playwright');
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[390, 844], [320, 568], [768, 1024]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://127.0.0.1:3000/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    await p.evaluate(() => { const t = document.getElementById('tourCopy'); scrollTo(0, t.getBoundingClientRect().top + scrollY - 140); }); await p.waitForTimeout(1200);
    const sl = () => p.evaluate(() => Math.round(document.getElementById('tourCopy').scrollLeft));
    let a = await sl(); await p.waitForTimeout(2000); let c = await sl();
    ok(`${w}px: cards drift slowly to the left`, c > a && (c - a) < 70, `${a} -> ${c} in 2s`);
    const info = await p.evaluate(() => ({ cards: document.querySelectorAll('#tourCopy .reel-slide').length, announced: document.querySelectorAll('#tourCopy .reel-slide:not([aria-hidden])').length,
      bg: getComputedStyle(document.querySelector('#tourCopy .reel-slide')).backgroundColor, overflow: document.documentElement.scrollWidth - innerWidth }));
    ok(`${w}px: white classic cards, 3 announced (+3 loop copies), no overflow`, info.cards === 6 && info.announced === 3 && info.bg === 'rgb(255, 255, 255)' && info.overflow === 0, JSON.stringify(info));
    // let it drift until the phone screen changes on its own
    const startShot = await p.evaluate(() => [...document.querySelectorAll('#thePhone .scr img')].findIndex(i => i.classList.contains('active')));
    let changed = false; for (let k = 0; k < 20 && !changed; k++) { await p.waitForTimeout(1000); changed = (await p.evaluate(() => [...document.querySelectorAll('#thePhone .scr img')].findIndex(i => i.classList.contains('active')))) !== startShot; }
    const dotsMatch = await p.evaluate(() => [...document.querySelectorAll('#tourDots button')].findIndex(b => b.getAttribute('aria-current') === 'true') === [...document.querySelectorAll('#thePhone .scr img')].findIndex(i => i.classList.contains('active')));
    ok(`${w}px: phone screen + dot follow the drifting cards`, changed && dotsMatch);
    // touch the strip -> stops
    const t = await p.evaluate(() => { const r = document.getElementById('tourCopy').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 40]; });
    await p.touchscreen.tap(t[0], t[1]); await p.waitForTimeout(300);
    a = await sl(); await p.waitForTimeout(1500); c = await sl();
    ok(`${w}px: touching the cards stops them`, a === c, `${a} -> ${c}`);
    await p.evaluate(() => document.getElementById('tourCopy').scrollBy({ left: 150 })); await p.waitForTimeout(400);
    const swiped = await sl(); ok(`${w}px: cards can be swiped while stopped`, Math.abs(swiped - c - 150) <= 2, `${c} -> ${swiped}`);
    // tap a dot -> goes to that card (stays stopped)
    await p.tap('#tourDots button:nth-child(3)'); await p.waitForTimeout(1200);
    const dot = await p.evaluate(() => ({ cur: [...document.querySelectorAll('#tourDots button')].findIndex(b => b.getAttribute('aria-current') === 'true'), shot: [...document.querySelectorAll('#thePhone .scr img')].findIndex(i => i.classList.contains('active')) }));
    ok(`${w}px: dot 3 shows Smart Inbox card + inbox screen`, dot.cur === 2 && dot.shot === 2, JSON.stringify(dot));
    // touch elsewhere -> drifts again
    const out = await p.evaluate(() => { const r = document.querySelector('.hero-copy h1').getBoundingClientRect(); return [innerWidth / 2, Math.max(10, Math.min(innerHeight - 10, r.top + 10))]; });
    await p.touchscreen.tap(out[0], out[1]); await p.waitForTimeout(300);
    a = await sl(); await p.waitForTimeout(1500); c = await sl();
    ok(`${w}px: touching elsewhere starts the drift again`, c > a, `${a} -> ${c}`);
    ok(`${w}px: no console errors`, errs.length === 0, errs.join('|'));
    if (w === 390) { await p.evaluate(() => { const t = document.getElementById('tourCopy'); scrollTo(0, t.getBoundingClientRect().top + scrollY - 160); }); await p.waitForTimeout(800); await p.screenshot({ path: 'tour_390.png' }); }
    await p.close();
  }
  { const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const a = await p.evaluate(() => document.getElementById('tourCopy').scrollLeft); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ moved: document.getElementById('tourCopy').scrollLeft, copies: document.querySelectorAll('#tourCopy .loop-copy').length }));
    ok('reduced motion: still, swipeable cards, no copies', r.moved === a && r.copies === 0, JSON.stringify(r)); await p.close(); }
  { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' });
    await p.evaluate(() => { const s = document.getElementById('hero'); scrollTo(0, (s.offsetHeight - innerHeight) * 0.85); }); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ copiesShown: [...document.querySelectorAll('#tourCopy .loop-copy')].filter(e => getComputedStyle(e).display !== 'none').length, slideBg: getComputedStyle(document.querySelector('#tourCopy .reel-slide')).backgroundColor }));
    await p.screenshot({ path: 'tour_desktop.png' });
    ok('desktop: tour unchanged (no white cards, no copies shown)', r.copiesShown === 0 && r.slideBg !== 'rgb(255, 255, 255)', JSON.stringify(r)); await p.close(); }
  await b.close(); console.log(R.join('\n')); console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} passed`);
})();
