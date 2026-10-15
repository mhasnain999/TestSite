const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' }); const OUT = process.env.OUT || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true });
  // 1) every in-page href points at a real section
  let p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:5500/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  const broken = await p.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
  console.log('broken in-page links:', broken.length ? broken : 'none');
  // 2) click every desktop nav + footer + CTA link; target should land just under the fixed nav
  const sel = ['.nav-links a:not(.nav-cta)', '.foot-nav a[href^="#"]', '#heroCta', '.hero-cta .btn-ghost', '.foot-cta'];
  const results = [];
  for (const s of sel) {
    const n = await p.locator(s).count();
    for (let i = 0; i < n; i++) {
      await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(80);
      const el = p.locator(s).nth(i); const href = await el.getAttribute('href'); const label = (await el.innerText()).trim().replace(/\s+/g, ' ');
      if (s === '.foot-nav a[href^="#"]' || s === '.foot-cta') await el.scrollIntoViewIfNeeded();
      await el.click(); await p.waitForTimeout(250);
      const top = await p.evaluate(h => Math.round(document.getElementById(h.slice(1)).getBoundingClientRect().top), href);
      results.push(`${label.slice(0, 26).padEnd(26)} -> ${href.padEnd(14)} top=${top}${Math.abs(top - 84) <= 2 ? ' OK' : ' !!'}`);
    }
  }
  console.log(results.join('\n'));
  // 3) scrollspy: which nav item is lit inside each section
  const spy = [];
  for (const id of ['hero', 'trust', 'why', 'roles', 'admin', 'speed', 'transform', 'founder', 'impact', 'versus', 'testimonials', 'contact']) {
    await p.evaluate(id => { const s = document.getElementById(id); scrollTo(0, s.getBoundingClientRect().top + scrollY + Math.min(s.offsetHeight / 2, innerHeight * 0.4) - innerHeight * 0.4); }, id);
    await p.waitForTimeout(250);
    spy.push(id + '=' + (await p.evaluate(() => document.querySelector('.nav-links a[aria-current]')?.textContent || '—')));
  }
  console.log('active nav item per section:', spy.join(' | '));
  await p.screenshot({ path: path.join(OUT, 'ia_nav.png'), clip: { x: 0, y: 0, width: 1440, height: 80 } });
  await p.evaluate(() => document.querySelector('footer').scrollIntoView()); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'ia_footer.png'), clip: { x: 0, y: 900 - (await p.evaluate(() => document.querySelector('footer').offsetHeight)), width: 1440, height: await p.evaluate(() => document.querySelector('footer').offsetHeight) } });
  console.log('desktop errs:', errs); await p.close();
  // 4) mobile menu: every item + CTA
  p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.goto('http://127.0.0.1:5500/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  const items = await p.evaluate(() => [...document.querySelectorAll('#navPanel a')].map(a => a.textContent.trim() + '→' + a.getAttribute('href')));
  const mres = [];
  for (let i = 0; i < items.length; i++) {
    await p.evaluate(() => scrollTo(0, 0)); await p.click('#navToggle'); await p.waitForTimeout(300);
    const a = p.locator('#navPanel a').nth(i); const href = await a.getAttribute('href'); await a.tap(); await p.waitForTimeout(300);
    const r = await p.evaluate(h => ({ top: Math.round(document.getElementById(h.slice(1)).getBoundingClientRect().top), open: document.getElementById('nav').classList.contains('open') }), href);
    mres.push(`${items[i].padEnd(26)} top=${r.top} menuClosed=${!r.open}`);
  }
  await p.click('#navToggle'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, 'ia_menu.png'), clip: { x: 0, y: 0, width: 390, height: 600 } });
  await p.click('#navToggle'); await p.evaluate(() => document.querySelector('footer').scrollIntoView()); await p.waitForTimeout(300);
  const fh = await p.evaluate(() => document.querySelector('footer').offsetHeight);
  await p.screenshot({ path: path.join(OUT, 'ia_footer_m.png'), fullPage: false });
  console.log('mobile menu:\n' + mres.join('\n'));
  await p.close(); await b.close();
})();
