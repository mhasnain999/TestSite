'use strict';
/* Knowledge base: loads knowledge/*.json, validates it, and retrieves entries for a message (BM25 + phrase bonus).
 * Add FAQs by editing the JSON files only; no code changes needed. */
const fs = require('fs');
const path = require('path');
const { tokens, normalize, hasIssueSignal, hasProductSignal } = require('./text');

const MODULES = ['teacher_management', 'student_management', 'admissions', 'attendance', 'timetable', 'fees_billing',
  'invoice_adjustments', 'id_cards', 'branch_transfers', 'academic_holds', 'communication', 'lms', 'login_access',
  'general', 'demo', 'contact', 'unknown'];

function load(dir) {
  const entries = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const e of data.entries || []) entries.push(e);
  }
  const byId = new Map();
  for (const e of entries) {
    if (!e.id || byId.has(e.id)) throw new Error(`KB: missing or duplicate id "${e.id}"`);
    if (!MODULES.includes(e.module)) throw new Error(`KB: ${e.id} has unknown module "${e.module}"`);
    if (!['product', 'policy', 'handoff', 'issue', 'solution'].includes(e.kind)) throw new Error(`KB: ${e.id} has unknown kind "${e.kind}"`);
    if ((e.kind === 'solution' || e.kind === 'product') && !e.answer) throw new Error(`KB: ${e.id} needs an "answer"`);
    if (e.results && !Array.isArray(e.results)) throw new Error(`KB: ${e.id} "results" must be a list`);
    byId.set(e.id, e);
  }
  for (const e of entries) {
    for (const o of (e.clarify && e.clarify.options) || []) if (!byId.has(o.goto)) throw new Error(`KB: ${e.id} option -> missing "${o.goto}"`);
    for (const r of e.related || []) if (!byId.has(r)) throw new Error(`KB: ${e.id} related -> missing "${r}"`);
    if (e.kind === 'issue' && !e.clarify && !Array.isArray(e.diagnose)) throw new Error(`KB: issue ${e.id} needs clarify or diagnose`);
  }
  return new KB(entries, byId);
}

class KB {
  constructor(entries, byId) {
    this.entries = entries; this.byId = byId;
    // weighted bag of words per entry
    this.docs = entries.map(e => {
      const tf = new Map(); const add = (s, w) => tokens(s).forEach(t => tf.set(t, (tf.get(t) || 0) + w));
      add(e.title, 2); (e.keywords || []).forEach(k => add(k, 2)); (e.examples || []).forEach(x => add(x, 1));
      const len = [...tf.values()].reduce((a, b) => a + b, 0);
      const phrases = [...(e.keywords || []), ...(e.examples || [])].map(normalize).filter(p => p.includes(' '));
      return { e, tf, len, phrases };
    });
    this.avg = this.docs.reduce((a, d) => a + d.len, 0) / this.docs.length;
    const df = new Map(); this.docs.forEach(d => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = this.docs.length;
    this.idf = t => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  }
  get(id) { return this.byId.get(id) || null; }

  /* returns [{entry, score}] best first */
  search(message, { k = 5, boostModule = null } = {}) {
    const q = [...new Set(tokens(message))]; const nq = normalize(message);
    if (!q.length) return [];
    const issue = hasIssueSignal(message), product = hasProductSignal(message);
    const k1 = 1.2, b = 0.75;
    const out = this.docs.map(d => {
      let s = 0, hit = 0;
      for (const t of q) { const f = d.tf.get(t); if (f) { hit++; s += this.idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avg)); } }
      for (const p of d.phrases) if (nq.includes(p)) s += 2.5;
      const kind = d.e.kind === 'solution' ? 'issue' : d.e.kind;   // problems -> solutions; "what is / does it" -> product facts
      if (issue && kind === 'issue') s *= 1.5;
      if (issue && (kind === 'product')) s *= 0.55;
      if (!issue && product && kind === 'issue') s *= 0.6;
      if (!issue && product && kind === 'product') s *= 1.3;
      if (boostModule && d.e.module === boostModule) s *= 1.25;
      // coverage = share of the visitor's meaningful words this entry explains (low coverage = probably not about this)
      return { entry: d.e, score: Math.round(s * 100) / 100, coverage: hit / q.length };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    return out.slice(0, k);
  }
}

module.exports = { load, MODULES };
