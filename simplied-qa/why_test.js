// Feature rows on phones: drift (row1 left, row2 right), swipeable, touch stops a row, touch outside restarts it.
const { chromium } = require('playwright');
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[390, 844], [320, 568], [768, 1024]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://127.0.0.1:3000/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    await p.evaluate(() => document.getElementById('whyMarquee').scrollIntoView({ block: 'center' })); await p.waitForTimeout(1200);
    const pos = () => p.evaluate(() => [...document.querySelectorAll('.wm-row')].map(r => Math.round(r.scrollLeft)));
    // content moving left = scrollLeft increasing; moving right = scrollLeft decreasing
    let a = await pos(); await p.waitForTimeout(1500); let c = await pos();
    ok(`${w}px: row 1 drifts left, row 2 drifts right`, c[0] > a[0] && c[1] < a[1], `${a} -> ${c}`);
    const info = await p.evaluate(() => ({ grid: getComputedStyle(document.querySelector('.why-grid')).display, rows: document.querySelectorAll('.wm-row').length,
      announced: document.querySelectorAll('.wm-track .card:not([aria-hidden])').length, pauseBtn: !!document.querySelector('.wm-pause'), overflow: document.documentElement.scrollWidth - innerWidth,
      height: Math.round(document.getElementById('whyMarquee').getBoundingClientRect().height) }));
    ok(`${w}px: 2 rows, 9 features announced once, no pause button, no overflow`, info.grid === 'none' && info.rows === 2 && info.announced === 9 && !info.pauseBtn && info.overflow === 0, JSON.stringify(info));
    // touch row 1 -> it stops (row 2 keeps moving)
    const r1 = await p.evaluate(() => { const r = document.querySelectorAll('.wm-row')[0].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.touchscreen.tap(r1[0], r1[1]); await p.waitForTimeout(300);
    a = await pos(); await p.waitForTimeout(1200); c = await pos();
    ok(`${w}px: touching row 1 stops it, row 2 keeps drifting`, a[0] === c[0] && c[1] !== a[1], `${a} -> ${c}`);
    // swipe the stopped row
    const before = c[0];
    await p.evaluate(() => document.querySelectorAll('.wm-row')[0].scrollBy({ left: 180 })); await p.waitForTimeout(400);
    const after = (await pos())[0];
    ok(`${w}px: the row can be swiped/scrolled by hand`, Math.abs(after - before - 180) <= 2, `${before} -> ${after}`);
    // touch outside the rows -> row 1 drifts again, from where the visitor left it
    const out = await p.evaluate(() => { const r = document.getElementById('whyMarquee').getBoundingClientRect(); const y = Math.min(innerHeight - 10, r.bottom + 14); return [innerWidth / 2, y > r.bottom ? y : Math.max(10, r.top - 14)]; });
    await p.touchscreen.tap(out[0], out[1]); await p.waitForTimeout(300);
    a = await pos(); await p.waitForTimeout(1200); c = await pos();
    ok(`${w}px: touching outside restarts row 1 (continuing from the swiped spot)`, c[0] > a[0] && Math.abs(a[0] - after) < 40, `${a} -> ${c}`);
    ok(`${w}px: no console errors`, errs.length === 0, errs.join('|'));
    await p.close();
  }
  { const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' }); await p.evaluate(() => document.getElementById('whyMarquee').scrollIntoView({ block: 'center' })); await p.waitForTimeout(600);
    const a = await p.evaluate(() => document.querySelector('.wm-row').scrollLeft); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ moved: document.querySelector('.wm-row').scrollLeft, copies: document.querySelectorAll('.wm-track [aria-hidden="true"]').length, scrollable: document.querySelector('.wm-row').scrollWidth > document.querySelector('.wm-row').clientWidth }));
    ok('reduced motion: rows stay still but can be swiped', r.moved === a && r.copies === 0 && r.scrollable, JSON.stringify(r)); await p.close(); }
  { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => ({ grid: getComputedStyle(document.querySelector('.why-grid')).display, marquee: getComputedStyle(document.getElementById('whyMarquee')).display }));
    ok('desktop: original 3x3 grid, no rows', r.grid === 'grid' && r.marquee === 'none', JSON.stringify(r)); await p.close(); }
  await b.close(); console.log(R.join('\n')); console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} passed`);
})();
