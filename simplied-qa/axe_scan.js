// axe-core WCAG 2.x A/AA scan at phone + desktop, after revealing all content; also with the chat panel open.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, 'tools/node_modules/axe-core/axe.min.js'), 'utf8');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600 });
    await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(40); }
    await p.waitForTimeout(1200); await p.evaluate(() => scrollTo(0, 0));
    await p.addScriptTag({ content: AXE });
    for (const state of ['page', 'chat open']) {
      if (state === 'chat open') { await p.evaluate(() => window.SimpliEdChat.open()); await p.waitForTimeout(3500); }
      const res = await p.evaluate(async () => {
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ') }));
      });
      console.log(`\n== ${w}x${h} (${state}): ${res.length} rule(s) violated`);
      for (const v of res) console.log(`  [${v.impact}] ${v.id} x${v.n}: ${v.ex}`);
    }
    await p.close();
  }
  await b.close();
})();
