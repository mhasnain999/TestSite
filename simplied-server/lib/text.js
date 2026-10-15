'use strict';
/* Text normalisation shared by retrieval and the rules engine. */

const CONTRACTIONS = [
  [/\bcan'?t\b/g, 'cannot'], [/\bwon'?t\b/g, 'will not'], [/\b(is|are|was|were|does|do|did|has|have|could|should|would)n'?t\b/g, '$1 not'],
  [/\bim\b/g, 'i am'], [/\bpls\b|\bplz\b/g, 'please'], [/\bu\b/g, 'you'],
];

/* word -> canonical concept. Lets "Sir's name is not showing" match "teacher not visible". */
const SYN = {};
const group = (canon, words) => words.split(' ').forEach(w => { SYN[w] = canon; });
group('teacher', 'teacher teachers sir sirs madam maam mam miss staff faculty instructor instructors tutor tutors educator');
group('student', 'student students pupil pupils child children kid kids learner learners ward');
group('parent', 'parent parents guardian guardians mother father mom dad family families');
group('login', 'login logon signin log sign password passwords otp credentials locked lockout access');
group('fee', 'fee fees invoice invoices voucher vouchers challan challans bill bills billing dues');
group('payment', 'payment payments paid pay ibft transfer-payment deposit');
group('visible', 'show shows showing shown appear appears appearing visible listed missing disappeared disappear find locate');
group('add', 'add adding added create creating new register registering onboard');
group('edit', 'edit editing change changing update updating modify correct correcting rename');
group('attendance', 'attendance attendence absent absence present late roll register');
group('timetable', 'timetable timetables schedule schedules period periods');
group('homework', 'homework assignment assignments classwork submission submissions');
group('message', 'message messages messaging announcement announcements circular circulars notice inbox chat');
group('notify', 'notify notified notification notifications alert alerts reminder reminders');
group('branch', 'branch branches campus campuses');
group('discount', 'discount discounts concession concessions waive waiver scholarship refund');
group('broken', 'error errors broken bug failing fails failed stuck crash crashes glitch');
group('demo', 'demo demos walkthrough trial');
group('integration', 'integrate integrates integrated integration integrations connect connects connecting sync syncing');

const STOP = new Set('a an the is are was were be been am i me my we our you your it its this that to of in on for with and or at by from as do does did can could would should will please hi hello hey there just so some any about how what which simplied simplyed school schools us need want get also'.split(' '));
const ISSUE_RX = /\b(cannot|can not|not|unable|error|issue|issues|problem|problems|wrong|incorrect|broken|fail\w*|stuck|missing|doesn ?t|won ?t|isn ?t|never|help with|trouble|bug|fix)\b/;
const PRODUCT_RX = /\b(what is|what are|how does|do you|does it|does simplied|can it|is there|feature|features|support|offer|include|price|cost)\b/;

function normalize(s) {
  let t = String(s || '').toLowerCase().replace(/[’`]/g, "'");
  for (const [rx, rep] of CONTRACTIONS) t = t.replace(rx, rep);
  return t.replace(/'s\b/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
function tokens(s) {
  return normalize(s).split(' ').filter(w => w && !STOP.has(w)).map(w => SYN[w] || stem(w));
}
/* words that carry no topic on their own ("it still isn't working") */
const GENERIC = new Set(['still', 'not', 'work', 'issue', 'problem', 'same', 'again', 'help', 'fix', 'fixed', 'try', 'tried', 'broken',
  'yes', 'no', 'ok', 'okay', 'happen', 'happening', 'now', 'yet', 'thing', 'one', 'cannot', 'nothing', 'sure', 'done', 'all', 'only',
  'tell', 'more', 'detail', 'explain', 'really', 'mean', 'example', 'elaborate', 'interesting', 'cool', 'great', 'nice', 'good', 'exactly', 'possible']);
const topicalTokens = s => tokens(s).filter(t => !GENERIC.has(t));
const hasIssueSignal = s => ISSUE_RX.test(normalize(s));
const hasProductSignal = s => PRODUCT_RX.test(normalize(s));

/* Remove personal data before anything leaves the server (LLM prompts, logs). */
function redact(s) {
  return String(s || '')
    .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s()-]{6,}\d/g, '[number]')
    .replace(/\b\d{5}-?\d{7}-?\d\b/g, '[id]');
}
/* Strip control chars / markup from user input. */
function cleanInput(s, max) {
  return String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim().slice(0, max);
}

module.exports = { normalize, tokens, stem, topicalTokens, hasIssueSignal, hasProductSignal, redact, cleanInput };
