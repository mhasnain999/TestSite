// Loop-engineering mobile audit: every viewport, every section. Writes JSON + section screenshots.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'audit'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:3000/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : [[320,568],[360,740],[375,667],[390,844],[430,932],[600,900],[768,1024],[1024,768],[1280,800],[1440,900],[844,390],[667,375]];
const SHOTS = process.env.SHOTS !== '0';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const report = {};
  for (const [w, h] of VP) {
    const touch = w <= 1024 || h <= 430;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && Math.min(w, h) < 600, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = [], failed = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('requestfailed', r => { if (!r.url().startsWith('mailto')) failed.push(r.url().split('/').slice(-2).join('/')); });
    await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += Math.round(h * 0.6)) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(50); }
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth, coarse = matchMedia('(pointer:coarse)').matches;
      const vis = e => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
      const hiddenTree = e => { for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true' || +cs.opacity === 0) return true; } return false; };
      const label = e => { const id = e.id ? '#' + e.id : ''; const c = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; const sec = e.closest('section,header,footer,nav,.sc'); return `${e.tagName.toLowerCase()}${id}${c} @${sec ? (sec.id || sec.className.split(' ')[0]) : '?'}`; };
      const clippedBy = e => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n); if (/(hidden|clip|auto|scroll)/.test(o.overflowX)) return n; } return null; };
      const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, spill: [], tinyText: [], smallTap: [], under24: [], textOverflow: [], distorted: [], noDims: [], overlaps: [] };
      const all = [...document.querySelectorAll('body *')];
      for (const e of all) {
        if (e.closest('.sc') && !document.querySelector('.sc.open') && !e.closest('.sc-launch')) continue;
        const q = e.getBoundingClientRect(); if (!q.width) continue;
        if ((q.right > vw + 1 || q.left < -1) && !clippedBy(e) && getComputedStyle(e).position !== 'fixed') out.spill.push(label(e) + ` [${Math.round(q.left)},${Math.round(q.right)}]`);
        // tiny text: own text nodes only
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
        if (own && vis(e) && !hiddenTree(e)) {
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (fs < 12) out.tinyText.push(`${label(e)} ${fs}px "${e.textContent.trim().slice(0, 24)}"`);
          const cs = getComputedStyle(e);
          if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX === 'visible' && cs.display !== 'inline' && e.children.length === 0 && cs.whiteSpace !== 'nowrap') out.textOverflow.push(label(e) + ` sw=${e.scrollWidth} cw=${e.clientWidth}`);
        }
      }
      const ctrls = [...document.querySelectorAll('a[href],button,select,input:not([type=hidden]),textarea,[role=button],[tabindex="0"]')].filter(e => vis(e) && !hiddenTree(e) && !e.closest('.sc-panel'));
      for (const e of ctrls) {
        const q = e.getBoundingClientRect();
        let t = q; if (e.matches('input[type=radio],input[type=checkbox]') && e.closest('label')) t = e.closest('label').getBoundingClientRect();
        if (coarse && (t.height < 44 || t.width < 44)) out.smallTap.push(`${label(e)} ${Math.round(t.width)}x${Math.round(t.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`);
        if (t.height < 24 || t.width < 24) out.under24.push(`${label(e)} ${Math.round(t.width)}x${Math.round(t.height)}`);
      }
      // overlapping controls (document coordinates; skip fixed + ancestors/descendants)
      const R = ctrls.filter(e => getComputedStyle(e).position !== 'fixed' && !e.closest('#nav')).map(e => { const q = e.getBoundingClientRect(); return { e, l: q.left, t: q.top + scrollY, r: q.right, b: q.bottom + scrollY }; });
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
        const a = R[i], c = R[j]; if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        const ix = Math.min(a.r, c.r) - Math.max(a.l, c.l), iy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
        if (ix > 4 && iy > 4) out.overlaps.push(`${label(a.e)} × ${label(c.e)}`);
      }
      for (const img of document.images) {
        if (!vis(img) || !img.naturalWidth) continue;
        const q = img.getBoundingClientRect(), of = getComputedStyle(img).objectFit;
        const ra = q.width / q.height, na = img.naturalWidth / img.naturalHeight;
        if ((of === 'fill' || of === '') && Math.abs(ra - na) / na > 0.03) out.distorted.push(`${img.getAttribute('src').split('/').pop()} rendered ${ra.toFixed(2)} vs natural ${na.toFixed(2)}`);
        if (!img.getAttribute('width') && !img.getAttribute('height') && getComputedStyle(img).aspectRatio === 'auto') out.noDims.push(img.getAttribute('src').split('/').pop());
      }
      const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map(h => h.tagName[1] + ':' + h.textContent.trim().slice(0, 30));
      for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])];
      return { ...out, heads };
    });
    r.errs = errs; r.failed = failed;
    report[`${w}x${h}`] = r;
    if (SHOTS) {
      const secs = await p.evaluate(() => [...document.querySelectorAll('header[id],section[id],footer')].map(s => ({ id: s.id || 'footer', top: s.getBoundingClientRect().top + scrollY, hgt: s.offsetHeight })));
      let i = 0;
      for (const s of secs) {
        const pins = s.hgt > h * 1.6 ? [0, 0.5, 0.95] : [0];
        for (const f of pins) {
          await p.evaluate(v => scrollTo(0, v), Math.round(s.top + (s.hgt - h) * f)); await p.waitForTimeout(f ? 900 : 650);
          await p.screenshot({ path: path.join(OUT, `${w}x${h}_${String(i++).padStart(2, '0')}_${s.id}${f ? '_' + f : ''}.png`) });
        }
      }
    }
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  for (const [vp, r] of Object.entries(report)) {
    console.log(`\n== ${vp}  overflow:${r.overflow}  errs:${r.errs.length} failed:${r.failed.length}`);
    for (const k of ['spill', 'tinyText', 'smallTap', 'under24', 'textOverflow', 'distorted', 'noDims', 'overlaps']) if (r[k].length) console.log(`  ${k} (${r[k].length}): ${r[k].slice(0, 8).join(' | ')}`);
    if (r.errs.length) console.log('  errs: ' + r.errs.slice(0, 4).join(' | '));
    if (r.failed.length) console.log('  failed: ' + r.failed.slice(0, 4).join(' | '));
  }
  console.log('\nheadings @390:', (report['390x844'] || Object.values(report)[0]).heads.join(' > '));
})();
