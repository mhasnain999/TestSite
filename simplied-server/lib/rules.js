'use strict';
/* Deterministic conversation engine (used without an LLM key, and as the safe fallback for the LLM).
 * Flow: understand the problem -> the SimpliEd service that solves it -> the result -> invite to a demo.
 *   state = { node: kbId|null, mode: 'cta'|'area'|null, facts: [string], turns: n }
 */
const { normalize, redact, topicalTokens } = require('./text');

const RX = {
  greet: /^(hi|hello|hey|salam|assalam\w*|aoa|good (morning|afternoon|evening))\b[\s!.]*$/,
  thanks: /\b(thanks|thank you|thx|shukriya|jazakallah)\b/,
  bye: /^(bye|goodbye|that ?s all|no thanks?)\b/,
  reset: /\b(never ?mind|start over|something else|different (issue|question|problem)|another (issue|question)|forget it)\b/,
  what: /^(what is|what s|whats|tell me about|about|explain) simplied\b|^simplied$|what does simplied do|who are you/,
  yes: /^(yes|yeah|yep|yup|sure|ok|okay|please|sounds good|let ?s do it|lets do it|book it|go ahead|definitely|of course|why not|i would like that|haan|ji)\b/,
  no: /^(no|nope|not now|later|maybe later|not yet|nah)\b/,
  vague: /^(i have an? (issue|problem|question)|(i need )?help|support|problem|issue|we have (a )?problems?|we are struggling)$/,
};

const AREAS = [['Fee collection', 'sol.fees'], ['Parent communication', 'sol.comms'], ['Teachers', 'sol.teachers'],
               ['Attendance', 'sol.attendance'], ['Multiple branches', 'sol.branches']];

const CTA = [
  'Want to see it for yourself? Book a short demo and our team will walk you through it.',
  'The best way to see this is live. Shall I set up a short demo with our team?',
  'Would you like to see this in action? I can set up a quick demo for you.',
];

const emptyState = () => ({ node: null, mode: null, facts: [], turns: 0 });

function sanitizeState(s, kb) {
  const st = emptyState();
  if (!s || typeof s !== 'object') return st;
  if (typeof s.node === 'string' && kb.get(s.node)) st.node = s.node;
  if (['cta', 'area'].includes(s.mode)) st.mode = s.mode;
  st.turns = Number.isInteger(s.turns) && s.turns >= 0 && s.turns <= 100 ? s.turns : 0;
  st.facts = Array.isArray(s.facts) ? s.facts.filter(f => typeof f === 'string').slice(-6).map(f => redact(f).replace(/[<>]/g, '').slice(0, 140)) : [];
  return st;
}

const cta = turns => CTA[turns % CTA.length];
const resultsText = e => !e.results || !e.results.length ? '' :
  '\n\n**What schools see:**\n\n' + e.results.map(x => '• ' + x).join('\n');
const OPENERS = ["That's a common challenge for schools, and it's exactly what SimpliEd is built to fix.",
                 "You're not alone, many schools face this. Here's how SimpliEd solves it.",
                 "I hear you. This is one of the problems SimpliEd was designed for."];

/* the full pitch for a solution entry: acknowledge -> service -> result -> demo invitation */
function pitch(e, turns) {
  const opener = e.id === 'sol.unlisted' ? '' : OPENERS[turns % OPENERS.length] + '\n\n';
  return opener + e.answer + resultsText(e) + '\n\n' + cta(turns);
}

function r(action, e, reply, quick, state, extra = {}) {
  return Object.assign({ action, intent: e ? e.module : 'unknown', nodeId: e ? e.id : null, reply, quickReplies: quick || [], state, escalation: null }, extra);
}
const relatedTitles = (kb, e) => (e.related || []).map(id => kb.get(id)).filter(Boolean).map(x => x.title).slice(0, 2);

function enter(kb, e, st) {
  const turns = st.turns + 1;
  if (e.kind === 'handoff') return r(e.handoff === 'demo' ? 'handoff_demo' : 'handoff_contact', e, '', [], { ...emptyState(), turns });
  if (e.kind === 'solution') return r('solution', e, pitch(e, turns), relatedTitles(kb, e), { node: e.id, mode: 'cta', facts: st.facts, turns });
  // product / policy facts: answer, then invite to a demo (pricing already does)
  if (e.handoff === 'demo') return r('answer_demo', e, e.answer, [], { node: e.id, mode: 'cta', facts: st.facts, turns });
  return r('answer', e, e.answer + '\n\n' + cta(turns), relatedTitles(kb, e), { node: e.id, mode: 'cta', facts: st.facts, turns });
}

/* "how?", "tell me more", "it still isn't working": stay on the same topic and move towards the demo */
function followUp(kb, e, st) {
  const turns = st.turns + 1;
  const what = e.service ? `**${e.service}**` : `**${e.title.toLowerCase()}**`;
  return r(e.kind === 'solution' ? 'solution' : 'answer', e,
    `Good question. The details depend on how your school works today, so the clearest way is to see ${what} live. In a short demo our team will show you exactly how it would work for your school.\n\nShall I set that up?`,
    relatedTitles(kb, e), { ...st, mode: 'cta', turns });
}

function unknown(st) {
  return r('unknown', null, "I don't have verified information on that, so I'd rather not guess. 🙂\n\nTell me what's challenging at your school (fees, parent communication, teachers, attendance, branches) and I'll show you how SimpliEd helps, or connect you with our team.",
    ['Explore features', 'Talk to our team'], { ...emptyState(), turns: st.turns + 1 });
}

function decide(kb, message, rawState) {
  const st = sanitizeState(rawState, kb);
  const nq = normalize(message);
  const node = st.node ? kb.get(st.node) : null;

  // answering the demo invitation
  if (st.mode === 'cta' && RX.yes.test(nq) && nq.split(' ').length <= 6) return r('handoff_demo', kb.get('handoff.demo'), '', [], { ...emptyState(), turns: st.turns + 1 });
  if (st.mode === 'cta' && RX.no.test(nq) && nq.split(' ').length <= 4)
    return r('smalltalk', null, 'No problem! Is there anything else at your school I can help you think through?', ['Explore features', 'Talk to our team'], { ...emptyState(), turns: st.turns + 1 });

  if (RX.what.test(nq)) return enter(kb, kb.get('product.what'), st);
  if (RX.greet.test(nq)) return r('smalltalk', null, "Hello! 😊 Tell me what's challenging at your school, or ask anything about SimpliEd.", ['What is SimpliEd?', 'I have a problem'], st);
  if (RX.bye.test(nq)) return r('smalltalk', null, 'Thanks for chatting with SimpliEd. 👋 Whenever you are ready, our team would love to show you around.', [], emptyState());
  if (RX.thanks.test(nq) && nq.split(' ').length <= 5) return r('smalltalk', null, "You're welcome! Anything else I can help with?", ['Something else'], st);
  if (RX.reset.test(nq)) return r('smalltalk', null, 'Sure, what would you like to ask?', ['Explore features', 'I have a problem', 'Talk to our team'], emptyState());
  if (RX.vague.test(nq) || nq === 'i have a problem')
    return r('clarify', null, "Happy to help. Which area is giving your school the most trouble?", AREAS.map(a => a[0]), { ...emptyState(), mode: 'area', turns: st.turns + 1 });
  if (st.mode === 'area') { const a = AREAS.find(x => normalize(x[0]) === nq); if (a) return enter(kb, kb.get(a[1]), st); }

  // a follow-up with no new topic words stays on the current topic
  if (node && topicalTokens(message).length === 0 && node.kind !== 'handoff') return followUp(kb, node, st);

  const hits = kb.search(message, { k: 3, boostModule: node ? node.module : null });
  const top = hits[0];
  if (!top || top.score < 1.2 || top.coverage < 0.5) return unknown(st);
  return enter(kb, top.entry, { ...st, facts: [...st.facts, redact(message).slice(0, 120)].slice(-6) });
}

module.exports = { decide, sanitizeState, emptyState, pitch, cta, CTA };
