const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [820, 1180], [768, 1024]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://127.0.0.1:3000/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    await p.evaluate(() => document.getElementById('heroCta').click()); await p.waitForTimeout(1600);
    const r = await p.evaluate(() => { const c = document.querySelector('.ct-card').getBoundingClientRect(); return { top: Math.round(c.top), bottom: Math.round(c.bottom), h: Math.round(c.height), vh: innerHeight }; });
    console.log(`${w}x${h}`.padEnd(10), JSON.stringify(r), r.top >= 84 && r.bottom <= r.vh ? 'FITS' : 'NO FIT by ' + (r.bottom - r.vh) + 'px');
    if (w === 1366) await p.screenshot({ path: 'ct_fit_1366.png' });
    if (w === 1440) await p.screenshot({ path: 'ct_fit_1440.png' });
    await p.close();
  }
  await b.close();
})();
