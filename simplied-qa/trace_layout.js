// Attribute style/layout cost to the JS that triggered it (mobile, 4x CPU throttle, first 6s after load).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const events = [];
  cdp.on('Tracing.dataCollected', e => events.push(...e.value));
  const done = new Promise(r => cdp.on('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute', transferMode: 'ReportEvents' });
  await p.goto(process.env.URL || 'http://127.0.0.1:3000/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  await cdp.send('Tracing.end'); await done;
  const main = events.filter(e => e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask' || e.name==='Layout')).reduce((m, e) => (m[e.tid] = (m[e.tid] || 0) + e.dur, m), {});
  const tn = events.filter(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map(e => e.tid); console.log('renderer main tids', tn, 'events', events.length, [...new Set(events.filter(e=>e.ph==='X').map(e=>e.name))].slice(0,30).join(','));
  const tid = tn.length ? tn.find(t => events.some(e => e.tid === t && e.name === 'Layout')) ?? tn[0] : +Object.entries(main).sort((a, b) => b[1] - a[1])[0][0];
  const X = events.filter(e => e.ph === 'X' && e.tid === tid);
  const callers = X.filter(e => ['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'v8.callFunction'].includes(e.name));
  const agg = {}, kinds = {};
  for (const e of X.filter(e => ['Layout', 'UpdateLayoutTree', 'RecalculateStyles', 'Paint', 'PrePaint', 'Layerize'].includes(e.name))) {
    kinds[e.name] = (kinds[e.name] || 0) + e.dur;
    let best = null; for (const c of callers) if (c.ts <= e.ts && c.ts + c.dur >= e.ts + e.dur && (!best || c.dur < best.dur)) best = c;
    const d = best ? (best.args?.data?.functionName || best.name) + ':' + (best.args?.data?.lineNumber ?? '') + (best.name === 'FireAnimationFrame' ? ' (rAF)' : '') : 'no-JS (rendering/animation)';
    agg[d] = (agg[d] || { ms: 0, n: 0 }); agg[d].ms += e.dur / 1000; agg[d].n++;
  }
  console.log('totals ms:', Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, Math.round(v / 1000)])));
  Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 18).forEach(([k, v]) => console.log(`${Math.round(v.ms).toString().padStart(6)} ms  ${String(v.n).padStart(5)}x  ${k}`));
  const js = {}; for (const c of X.filter(e => e.name === 'FunctionCall')) { const k = (c.args?.data?.functionName || '?') + ':' + c.args?.data?.lineNumber; js[k] = (js[k] || 0) + c.dur / 1000; }
  console.log('top JS:'); Object.entries(js).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`${Math.round(v).toString().padStart(6)} ms  ${k}`));
  await b.close();
})();
