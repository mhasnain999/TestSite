const { chromium } = require('playwright');
const cases = {
  baseline: '',
  'no chatbot anim': '.sc *,.sc-launch::before,.sc-launch::after{animation:none!important}',
  'no cta halo': '.btn-cta-hl::after{animation:none!important}',
  'no scroll-hint': '.scroll-hint{animation:none!important}',
  'no css anim at all': '*,*::before,*::after{animation:none!important;transition:none!important}',
};
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[412, 823], [1440, 900]]) for (const [name, css] of Object.entries(cases)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600 });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
    await p.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'networkidle' });
    if (css) await p.addStyleTag({ content: css });
    await p.waitForTimeout(1500);
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const a = await m(); await p.waitForTimeout(3000); const c = await m();
    console.log(`${w}px ${name.padEnd(20)} layouts/s ${((c.LayoutCount - a.LayoutCount) / 3).toFixed(1).padStart(5)}  styleRecalcs/s ${((c.RecalcStyleCount - a.RecalcStyleCount) / 3).toFixed(1).padStart(5)}  layoutMs/s ${((c.LayoutDuration - a.LayoutDuration) / 3 * 1000).toFixed(0).padStart(4)}  scriptMs/s ${((c.ScriptDuration - a.ScriptDuration) / 3 * 1000).toFixed(0)}`);
    await ctx.close();
  }
  await b.close();
})();
