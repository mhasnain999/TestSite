// Quality gate: 8 real viewports. overflow, pinned-section fit, clipping, broken images, tap targets, errors.
const { chromium } = require('playwright'); const path = require('path');
const VP = (process.env.VP ? JSON.parse(process.env.VP) : [[320,568],[375,667],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]);
(async () => {
  const b = await chromium.launch({ channel: 'chrome' }); const OUT = process.env.OUT || require('path').join(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true }); const rows = [];
  for (const [w, h] of VP) {
    const touch = w <= 1024;
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 768 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('requestfailed', r => errs.push('FAILED ' + r.url().split('/').pop()));
    await p.goto('http://127.0.0.1:5500/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += Math.round(h * 0.7)) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(60); }
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const clipped = e => { for (let n = e.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'hidden' || o === 'clip') return true; } return false; };
      const over = []; document.querySelectorAll('body *').forEach(e => { const q = e.getBoundingClientRect(); if (q.width && q.right > vw + 1 && !clipped(e)) over.push(String(e.className || e.tagName).slice(0, 24)); });
      const brokenImg = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'));
      const small = []; const coarse = matchMedia('(pointer:coarse)').matches;
      if (coarse) document.querySelectorAll('a,button,select,input,textarea').forEach(e => { const q = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (q.width && q.height && cs.visibility !== 'hidden' && e.offsetParent && (q.height < 44 || q.width < 44) && !e.closest('.hotspots')) small.push(((e.textContent || e.getAttribute('aria-label') || e.id || e.tagName) + '').trim().slice(0, 16) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); });
      return { docOverflow: document.documentElement.scrollWidth - innerWidth, over: [...new Set(over)].slice(0, 5), brokenImg, small: [...new Set(small)].slice(0, 6) };
    });
    // pinned sections: does the content fit between the nav and the bottom of the window?
    const navH = await p.evaluate(() => Math.round(document.getElementById('nav').getBoundingClientRect().height));
    const fit = {};
    for (const [id, frac, sel] of [['hero', 0.0, '#heroCopy .hero-cta'], ['hero', 0.0, '#thePhone .device2'], ['hero', 0.45, '#thePhone .device2'], ['hero', 0.45, '#tourCopy .reel-slide.active'], ['versus', 0.45, '.versus-stage'], ['versus', 0.45, '.vs-dots']]) {
      const k = `${id}@${frac}:${sel.split(' ').pop()}`;
      fit[k] = await p.evaluate(({ id, frac, sel, navH }) => {
        const s = document.getElementById(id); const pinned = getComputedStyle(s.firstElementChild).position === 'sticky';
        if (!pinned) return 'n/a (not pinned)';
        scrollTo(0, s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * frac);
        return new Promise(res => setTimeout(() => { const e = document.querySelector(sel); if (!e) return res('missing'); const q = e.getBoundingClientRect();
          res(q.top >= navH - 2 && q.bottom <= innerHeight + 1 ? 'fits' : `CLIPPED top=${Math.round(q.top)} bottom=${Math.round(q.bottom)} vh=${innerHeight}`); }, 1200));
      }, { id, frac, sel, navH });
    }
    // screenshots of pinned sections for visual review
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, `q_${w}x${h}_hero.png`) });
    rows.push({ vp: `${w}x${h}`, ...r, fit, errs });
    await p.close();
  }
  await b.close();
  for (const r of rows) {
    const bad = Object.entries(r.fit).filter(([k, v]) => v.startsWith('CLIPPED') || v === 'missing');
    console.log(`${r.vp.padEnd(10)} overflow:${r.docOverflow}${r.over.length ? ' ' + r.over : ''} | brokenImg:${r.brokenImg.length} | smallTap:${r.small.length ? JSON.stringify(r.small) : 0} | errs:${r.errs.length ? JSON.stringify(r.errs) : 0}`);
    for (const [k, v] of bad) console.log(`           ${k} -> ${v}`);
  }
})();
