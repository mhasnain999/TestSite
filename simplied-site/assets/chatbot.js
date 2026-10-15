/* SimpliEd Assistant - website chatbot (no dependencies).
 *
 * Knowledge: ONLY facts already published on the SimpliEd website. No pricing, no invented features.
 * Leads: never sent anywhere unless window.SIMPLIED_CHAT.leadEndpoint is configured (see README-chatbot.md).
 *        Without it, the visitor sends their details to the team themselves (pre-filled email) - nothing is
 *        stored or transmitted silently, and the bot never claims a demo is "booked".
 */
(function () {
  'use strict';
  const CFG = Object.assign({
    email: 'info@simpliedtech.com',
    phone: '+92 331 7734499',
    leadEndpoint: null,      // e.g. '/api/demo-requests' - POST JSON; must be YOUR backend (no API keys in the browser)
    bookingUrl: null,        // e.g. a Calendly/Google Calendar booking page
    aiEndpoint: null,        // e.g. '/api/chat' - the SimpliEd assistant backend (simplied-server). Holds the LLM key server-side.
    aiDetect: true,          // only call aiEndpoint when the page was served by simplied-server; false = always call (API on another domain)
    logo: 'assets/brand/mark.png',
  }, window.SIMPLIED_CHAT || {});

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* tiny formatter for internal copy: **bold**, "• " list lines, blank line = new paragraph */
  const fmt = txt => esc(txt).split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => l.startsWith('• '))) return '<ul>' + lines.map(l => `<li>${l.slice(2)}</li>`).join('') + '</ul>';
    return '<p>' + lines.join('<br>') + '</p>';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  /* ===================== knowledge (sourced from the website) ===================== */
  const DEMO = { id: 'demo', label: 'Book a demo', pri: true };
  const F = {
    admissions: { label: 'Admissions & student info', text:
      "SimpliEd brings **admissions and student information** into the same platform as billing, teaching and communication.\n\n• One record per student, shared across every module\n• Multi-branch ready, with campus-wise visibility\n• Less re-typing between separate systems" },
    attendance: { label: 'Attendance', text:
      "**Attendance takes one tap.** Teachers mark Present, Late or Absent from the Teacher app, and parents are told when the teacher presses **Notify parents**.\n\n• Parents see attendance at a glance in their app\n• Leaders see live attendance in the admin command center" },
    timetable: { label: 'Timetable', text:
      "Parents and students see the **timetable at a glance** in the SimpliEd app, and teachers see their **teaching day at a glance** - what's next, which class and which room." },
    fees: { label: 'Fees & billing', text:
      "SimpliEd's **automated billing** is built for schools:\n\n• Generate fee invoices for a student, a class or an entire campus in one click\n• Every parent gets an instant push notification\n• Every IBFT and online payment reconciles automatically to the right student and branch\n• Remind pending families in one tap\n• Secure online payments via the **Stripe** integration" },
    comms: { label: 'Communication', text:
      "The **SimpliEd Smart Inbox** replaces scattered WhatsApp groups with one secure, school-owned channel:\n\n• Category routing to the right conversation\n• Auto-escalation when no one replies\n• Full admin transparency on every thread\n• Circulars, news and events on one home screen\n• Instant announcements with read receipts" },
    lms: { label: 'LMS & homework', text:
      "The built-in **LMS** keeps learning in one place:\n\n• Lessons, resources, homework and assignments\n• Lesson plans, class streams and materials\n• Track every submission: assigned, submitted, graded\n• Digital grading and automated results" },
    reports: { label: 'Reports & multi-branch', text:
      "Leaders run the whole school from **one command center**:\n\n• Attendance, announcements, LMS, billing and insights in one place\n• Real-time, branch-wise visibility and control\n• Live insights so principals and owners act on facts, not guesswork" },
  };
  const FEATURE_CHIPS = ['admissions', 'attendance', 'timetable', 'fees', 'comms', 'lms', 'reports'].map(k => ({ id: 'f:' + k, label: F[k].label }));

  const CHALLENGES = {
    fees:     { label: 'Fee collection & reconciliation', rec: ['fees'] },
    comms:    { label: 'Parent communication',            rec: ['comms'] },
    teachers: { label: 'Teacher workload',                 rec: ['attendance', 'lms'] },
    branches: { label: 'Visibility across branches',       rec: ['reports', 'admissions'] },
    records:  { label: 'Admissions & records',             rec: ['admissions', 'reports'] },
  };

  /* typed-question intents: [id, regex] - first matches win ties via order */
  const INTENTS = [
    ['bye', /\b(bye|goodbye|that'?s all|no thanks?)\b/],
    ['thanks', /\b(thanks|thank you|thx|shukriya|great|perfect)\b/],
    ['demo', /\b(demo|book|walk ?through|trial|meeting|appointment|see it)\b/],
    ['team', /\b(talk|speak|human|agent|someone|contact|call|phone|email|team|sales|representative)\b/],
    ['pricing', /\b(price|pricing|cost|costs|how much|subscription|plan|plans|quote|package|charges?)\b/],
    ['founder', /\b(founders?|founded|who built|who made|rehman|harvard|columbia|educator)\b/],
    ['clients', /\b(clients?|customers?|who uses|testimonials?|reviews?|stories|trusted)\b/],
    ['impact', /\b(impact|statistics?|stats|roi|proof|improve(ment)?s?|benefits?)\b/],
    ['integrations', /\b(integrat\w*|stripe|api|connect|sync)\b/],
    ['ai', /\b(ai|artificial intelligence|automation|smart)\b/],
    ['security', /\b(secure|security|privacy|safe|data protection|gdpr)\b/],
    ['fees', /\b(fees?|billing|invoices?|vouchers?|payments?|ibft|reconcil\w*|challan|dues?|collection)\b/],
    ['attendance', /\b(attendance|absent|present|late|absence)\b/],
    ['timetable', /\b(timetable|time table|schedule|periods?|classes today)\b/],
    ['comms', /\b(whats ?app|messag\w*|communicat\w*|inbox|announcements?|circulars?|notif\w*|parents? chat)\b/],
    ['lms', /\b(lms|homework|classwork|assignments?|lessons?|grad(e|es|ing)|results?|exams?|marks|learning|curriculum)\b/],
    ['admissions', /\b(admissions?|enrol\w*|student (info|information|records?|profiles?)|records?|sis)\b/],
    ['reports', /\b(branch\w*|campus\w*|reports?|insights?|dashboard|analytics|overview|admin)\b/],
    ['apps', /\b(apps?|mobile|android|ios|iphone|teacher app|parent app|student app|roles?)\b/],
    ['help', /\b(help|problems?|challenges?|struggl\w*|issues?|pain points?)\b/],
    ['what', /\b(what is|what'?s simplied|about simplied|tell me about (simplied|it|your (platform|product))|who are you|what do you do|what does simplied do)\b/],
    ['features', /\b(features?|modules?|capabilit\w*|what can|functions?)\b/],
    ['greet', /\b(hi|hello|hey|salam|assalam\w*|aoa|good (morning|afternoon|evening))\b/],
  ];

  /* ===================== state ===================== */
  const S = { open: false, started: false, busy: false, flow: null, step: null, editing: false,
              ctx: { challenge: null, campuses: null, seen: new Set() },
              lead: { name: '', school: '', students: '', contact: '' },
              ai: { on: !!CFG.aiEndpoint && (CFG.aiDetect === false || backendPresent()), state: null, history: [] } };
  /* The assistant server marks its pages with a Server-Timing entry. On plain static hosting there is no backend,
   * so we don't call it at all. Set aiDetect:false when the API lives on a different domain than the site. */
  function backendPresent() {
    try { const n = performance.getEntriesByType('navigation')[0]; return !!(n && n.serverTiming && n.serverTiming.some(t => t.name === 'simplied-assistant')); }
    catch (e) { return false; }
  }

  /* ===================== DOM ===================== */
  const root = $('div', 'sc');
  root.innerHTML = `
    <div class="sc-teaser" role="button" tabindex="-1" aria-hidden="true"><b>Hi there 👋</b>Questions about SimpliEd? I can help in seconds.<button class="sc-teaser-x" aria-label="Dismiss" tabindex="-1">&times;</button></div>
    <section class="sc-panel" id="scPanel" role="dialog" aria-modal="false" aria-labelledby="scTitle" aria-hidden="true">
      <header class="sc-head">
        <span class="sc-av"><img src="${esc(CFG.logo)}" width="96" height="96" alt="" /></span>
        <div class="sc-title"><b id="scTitle">SimpliEd Assistant</b><span>Automated replies</span></div>
        <button class="sc-hbtn sc-restart" aria-label="Start over"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
        <button class="sc-hbtn sc-close" aria-label="Close chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="sc-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <form class="sc-form" novalidate>
        <label class="sc-sr" for="scInput">Type your message</label>
        <textarea class="sc-input" id="scInput" rows="1" placeholder="Type your question…" autocomplete="off" maxlength="400"></textarea>
        <button class="sc-send" type="submit" aria-label="Send message" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </form>
      <div class="sc-foot">Answers based on simpliedtech.com</div>
    </section>
    <button class="sc-launch" aria-label="Chat with SimpliEd" aria-expanded="false" aria-controls="scPanel">
      <span class="sc-label" aria-hidden="true">Ask SimpliEd</span>
      <span class="sc-char" aria-hidden="true">
        <svg class="sc-bubble" viewBox="0 0 32 32">
          <path class="sc-shape" d="M9.6 5h12.8A4.6 4.6 0 0 1 27 9.6v8.8a4.6 4.6 0 0 1-4.6 4.6h-7.3l-5.2 4.2c-.7.6-1.7.1-1.7-.8V23A4.6 4.6 0 0 1 5 18.4V9.6A4.6 4.6 0 0 1 9.6 5Z"/>
          <path class="sc-smile" d="M12.8 17q3.2 2.6 6.4 0"/>
        </svg>
        <span class="sc-eyes"><i></i><i></i></span>
        <svg class="sc-spark" viewBox="0 0 8 8"><path d="M4 0l1.15 2.85L8 4 5.15 5.15 4 8 2.85 5.15 0 4l2.85-1.15Z"/></svg>
      </span>
      <svg class="sc-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>`;
  document.body.appendChild(root);
  const panel = root.querySelector('.sc-panel'), log = root.querySelector('.sc-log'), form = root.querySelector('.sc-form'),
        input = root.querySelector('.sc-input'), send = root.querySelector('.sc-send'), launch = root.querySelector('.sc-launch'),
        teaser = root.querySelector('.sc-teaser');

  /* ===================== rendering ===================== */
  const scroll = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  function addRow(kind, node) {
    const row = $('div', 'sc-row ' + kind);
    if (kind === 'bot') row.appendChild($('span', 'sc-mini', `<img src="${esc(CFG.logo)}" width="96" height="96" alt="" />`));
    row.appendChild(node); log.appendChild(row); scroll(); return row;
  }
  const typing = () => { const t = addRow('bot', $('div', 'sc-msg sc-typing', '<i></i><i></i><i></i>')); t.setAttribute('aria-hidden', 'true'); return t; };
  async function bot(text, extraHtml, instant) {
    if (!instant) { const t = typing(); await wait(Math.min(1300, 380 + text.length * 7)); t.remove(); }
    const m = $('div', 'sc-msg', fmt(text) + (extraHtml || ''));
    addRow('bot', m);
  }
  function me(text) { addRow('me', $('div', 'sc-msg', esc(text))); }
  function chips(list) {
    clearChips();
    const wrap = $('div', 'sc-chips'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Suggested replies');
    // menus (4+ options or long labels) read best as a tidy stacked list; a few short replies stay as pills
    if (list.length >= 4 || list.some(c => c.label.length > 24)) wrap.classList.add('stack');
    list.forEach(c => {
      const b = $('button', 'sc-chip' + (c.pri ? ' pri' : ''), esc(c.label)); b.type = 'button';
      b.addEventListener('click', () => { if (S.busy) return; clearChips(); me(c.label); handle(c.id, c.label); });
      wrap.appendChild(b);
    });
    log.appendChild(wrap); scroll();
  }
  const clearChips = () => log.querySelectorAll('.sc-chips').forEach(c => c.remove());
  function actions(list) {
    const wrap = $('div', 'sc-acts');
    list.forEach(a => {
      const el = a.href ? $('a', 'sc-act ' + (a.pri ? 'pri' : 'sec')) : $('button', 'sc-act ' + (a.pri ? 'pri' : 'sec'));
      el.innerHTML = (a.icon || '') + esc(a.label);
      if (a.href) { el.href = a.href; if (/^https?:/.test(a.href)) { el.target = '_blank'; el.rel = 'noopener'; } } else el.type = 'button';
      if (a.onClick) el.addEventListener('click', a.onClick);
      wrap.appendChild(el);
    });
    log.appendChild(wrap); scroll();
  }
  const ICON = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  };
  const telHref = 'tel:' + CFG.phone.replace(/[^\d+]/g, '');

  /* ===================== conversation ===================== */
  const MAIN = [{ id: 'what', label: 'What is SimpliEd?' }, { id: 'features', label: 'Explore features' },
                { id: 'help', label: 'How can SimpliEd help my school?' }, DEMO, { id: 'team', label: 'Talk to our team' }];
  async function start() {
    S.started = true;
    await bot(S.ai.on
      ? "Hi! I'm the **SimpliEd Assistant** 👋\n\nTell me what's challenging at your school (fees, parent communication, teachers, attendance, branches…) and I'll show you how SimpliEd solves it. Or ask me anything about SimpliEd."
      : "Hi! I'm the **SimpliEd Assistant** 👋\n\nI can explain how SimpliEd helps schools, show you its features, or set up a demo with our team. What would you like to do?");
    chips(MAIN);
  }
  const more = (extra = []) => chips([...extra, ...(S.ctx.seen.size >= 2 ? [DEMO] : []), { id: 'menu', label: 'Something else' }].slice(0, 5));

  async function feature(k, followUps) {
    S.ctx.seen.add(k);
    await bot(F[k].text);
    const related = { fees: ['comms', 'reports'], comms: ['fees', 'attendance'], attendance: ['lms', 'timetable'], lms: ['attendance', 'timetable'],
                      timetable: ['attendance', 'lms'], reports: ['admissions', 'fees'], admissions: ['reports', 'fees'] }[k] || [];
    chips([...(followUps || related.filter(r => !S.ctx.seen.has(r)).slice(0, 2).map(r => ({ id: 'f:' + r, label: F[r].label }))),
           DEMO, { id: 'features', label: 'All features' }]);
  }

  async function handle(id, raw) {
    S.busy = true;
    try {
      if (id.startsWith('f:')) return await feature(id.slice(2));
      if (id.startsWith('ch:')) return await challengeChosen(id.slice(3));
      if (id.startsWith('camp:')) return await campusChosen(id.slice(5));
      switch (id) {
        case 'menu': await bot('Sure - what would you like to know?'); return chips(MAIN);
        case 'what':
          await bot("**SimpliEd is an all-in-one school operating system.** It unifies admissions, billing, teaching and parent communication into one platform your whole institution can use.\n\n• A Parent app, a Teacher app and a Smart Inbox\n• An admin command center for leaders\n• Built by an educator, engineered for education");
          return chips([{ id: 'features', label: 'Explore features' }, { id: 'help', label: 'How can it help my school?' }, DEMO]);
        case 'features':
          await bot('Here are the main areas SimpliEd covers. Pick one to learn more:');
          return chips(FEATURE_CHIPS);
        case 'help':
          if (S.ctx.challenge) { await bot(`Earlier you mentioned **${CHALLENGES[S.ctx.challenge].label.toLowerCase()}**. Want to look at another challenge?`); }
          else await bot("Happy to help. What's the **biggest challenge** at your school right now?");
          return chips(Object.entries(CHALLENGES).map(([k, c]) => ({ id: 'ch:' + k, label: c.label })));
        case 'demo': return await startDemo();
        case 'team':
          await bot(`You can reach the SimpliEd team directly:\n\n• Email: **${CFG.email}**\n• Phone: **${CFG.phone}**\n\nOr leave your details here and the team will get back to you to arrange a demo.`);
          actions([{ label: 'Email the team', href: `mailto:${CFG.email}`, icon: ICON.mail, pri: true }, { label: 'Call ' + CFG.phone, href: telHref, icon: ICON.phone }]);
          return chips([DEMO, { id: 'menu', label: 'Ask something else' }]);
        case 'pricing':
          await bot("Pricing depends on your school's size and the modules you need, so I don't want to guess a number.\n\nThe quickest way to get an accurate quote is a short demo with our team.");
          return chips([DEMO, { id: 'team', label: 'Talk to our team' }]);
        case 'founder':
          await bot("SimpliEd was founded by **Mr. Rehman Minhas**, an educator with a Masters in Educational Leadership from **Harvard University** and a Masters in Private School Leadership from **Columbia University**.\n\nHis goal: world-class systems for every school, and leadership driven by data.");
          return more([{ id: 'what', label: 'What is SimpliEd?' }]);
        case 'clients':
          await bot("SimpliEd is used by schools from single campuses to multi-branch school groups - including **Foundation Public School**, **Head Start School**, **Willow Academy**, **Building Blocks** and **Prime Blessings**. You can read their stories on this page.");
          return more([{ id: 'impact', label: 'What results do schools see?' }]);
        case 'impact':
          await bot("Schools report these results after implementation (as published on our website):\n\n• On-time fee collection **up 46%**\n• IT cost **down 53%**\n• Operational cost **down 30%**\n• New students **up 33%**");
          return more([{ id: 'help', label: 'How can it help my school?' }]);
        case 'integrations':
          await bot("SimpliEd supports **secure online payments via Stripe**, and every IBFT and online payment reconciles automatically.\n\nFor other systems you'd like to connect, our team can confirm what's possible for your school.");
          return chips([{ id: 'f:fees', label: 'Fees & billing' }, { id: 'team', label: 'Ask our team' }, DEMO]);
        case 'ai':
          await bot('SimpliEd includes **AI integration** - AI-assisted insights and smart automation built into everyday school workflows, so your team spends less time on routine work.\n\nOur team can show exactly how it works in a demo.');
          return chips([DEMO, { id: 'features', label: 'Explore features' }]);
        case 'security':
          await bot("Communication runs through **one secure, school-owned channel** instead of personal WhatsApp groups, and admins have full transparency on every thread.\n\nFor detailed questions about data security and hosting, our team can give you accurate answers.");
          return chips([{ id: 'team', label: 'Talk to our team' }, DEMO]);
        case 'apps':
          await bot("SimpliEd gives every role a focused view:\n\n• **Parents** - circulars, attendance, timetable, fees and results; multiple children from one login\n• **Teachers** - teaching day, attendance, lesson plans, digital grading\n• **Students** - timetable and learning\n• **Admin** - the full command center");
          return more();
        case 'greet': await bot('Hello! 😊 How can I help you today?'); return chips(MAIN);
        case 'thanks': await bot("You're welcome! Is there anything else I can help with?"); return chips([DEMO, { id: 'menu', label: 'Ask something else' }]);
        case 'bye': await bot('Thanks for visiting SimpliEd. Whenever you are ready, our team would love to show you around. 👋'); return chips([DEMO]);
        case 'fees': case 'attendance': case 'timetable': case 'comms': case 'lms': case 'admissions': case 'reports': return await feature(id);
        default:
          await bot("I'm not sure I can answer that accurately, and I'd rather not guess. 🙂\n\nI can tell you about SimpliEd's features, help match it to your school's needs, or connect you with our team.");
          return chips([{ id: 'features', label: 'Explore features' }, { id: 'team', label: 'Talk to our team' }, DEMO]);
      }
    } finally { S.busy = false; }
  }

  async function challengeChosen(k) {
    S.ctx.challenge = k;
    await bot(`Got it - **${CHALLENGES[k].label.toLowerCase()}**. Does your school have one campus or several branches?`);
    chips([{ id: 'camp:one', label: 'One campus' }, { id: 'camp:multi', label: 'Multiple branches' }]);
  }
  async function campusChosen(v) {
    S.ctx.campuses = v === 'multi' ? 'Multiple branches' : 'One campus';
    const ch = CHALLENGES[S.ctx.challenge];
    const recs = ch.rec.slice(); if (v === 'multi' && !recs.includes('reports')) recs.push('reports');
    recs.forEach(r => S.ctx.seen.add(r));
    const lines = { fees: 'automated billing - one-click invoices, instant parent notifications and automatic reconciliation of every IBFT and online payment',
      comms: 'the Smart Inbox - one secure channel with category routing, auto-escalation and full admin transparency',
      attendance: 'one-tap attendance with automatic parent notifications', lms: 'the built-in LMS - lesson plans, assignments, digital grading and automated results',
      reports: 'the admin command center - real-time, branch-wise visibility in one place', admissions: 'admissions and student records in one connected platform',
      timetable: 'timetables at a glance for parents, students and teachers' };
    await bot(`Here's where SimpliEd would help most:\n\n${recs.map(r => '• ' + lines[r].charAt(0).toUpperCase() + lines[r].slice(1)).join('\n')}\n\nWould you like to see this live? A short demo with our team is the best next step.`);
    chips([DEMO, ...recs.slice(0, 2).map(r => ({ id: 'f:' + r, label: 'More on ' + F[r].label.toLowerCase() }))]);
  }

  /* ===================== demo lead capture ===================== */
  const STEPS = ['name', 'school', 'students', 'contact'];
  const ASK = {
    name: "Great, let's set that up. It takes four quick questions.\n\nFirst, what's your **full name**?",
    school: n => `Thanks, ${n.split(' ')[0]}! What's the name of your **school or institution**?`,
    students: 'Roughly how many **students** does your school have? Pick a range or type a number.',
    contact: "Last one: what's the best **email address or phone number** to reach you?",
  };
  const SIZE = ['Under 300', '300 – 1,000', '1,000 – 3,000', '3,000+'];
  const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const validate = {
    name: v => v.length < 2 ? 'Please enter your full name.' : !/^[\p{L}][\p{L}\s.'-]{1,59}$/u.test(v) ? 'Names can only use letters, spaces, apostrophes and hyphens.' : null,
    school: v => v.length < 2 ? 'Please enter your school or institution name.' : v.length > 80 ? 'That looks a bit long. Please use the short name.' : null,
    students: v => { if (SIZE.includes(v)) return null; const n = Number(v.replace(/[, ]/g, '')); return Number.isInteger(n) && n > 0 && n <= 200000 ? null : 'Please choose a range or type a number, like 850.'; },
    contact: v => {
      if (v.includes('@')) return RX_EMAIL.test(v) ? null : "That email doesn't look right. Please check it (e.g. name@school.edu.pk).";
      const d = v.replace(/[\s()-]/g, '');
      return /^\+?\d{7,15}$/.test(d) ? null : 'Please enter a valid email address or phone number (e.g. 0300 1234567).';
    },
  };
  const placeholders = { name: 'e.g. Sara Ahmed', school: 'e.g. Willow Academy', students: 'e.g. 850', contact: 'Email or phone number' };

  async function startDemo() {
    if (S.lead.contact && S.flow !== 'demo') {           // already captured this session - don't re-ask everything
      await bot('I already have your details from earlier:'); return await confirmLead();
    }
    S.flow = 'demo'; S.step = 'name'; S.editing = false;
    await bot(ASK.name); setInput('name');
  }
  async function ask(step) {
    S.step = step; setInput(step);
    if (step === 'students') { await bot(ASK.students); chips(SIZE.map(s => ({ id: 'size:' + s, label: s }))); }
    else await bot(typeof ASK[step] === 'function' ? ASK[step](S.lead.name) : ASK[step]);
  }
  function setInput(step) {
    input.placeholder = step ? placeholders[step] : 'Type your question…';
    input.setAttribute('inputmode', step === 'students' ? 'numeric' : step === 'contact' ? 'email' : 'text');
    input.setAttribute('autocomplete', step === 'name' ? 'name' : step === 'school' ? 'organization' : step === 'contact' ? 'email' : 'off');
  }
  async function answer(val) {
    const step = S.step, err = validate[step](val);
    if (err) { input.setAttribute('aria-invalid', 'true'); await bot(err); if (step === 'students') chips(SIZE.map(s => ({ id: 'size:' + s, label: s }))); return; }
    input.removeAttribute('aria-invalid');
    S.lead[step] = step === 'students' && !SIZE.includes(val) ? Number(val.replace(/[, ]/g, '')).toLocaleString('en-US') : val.trim().replace(/\s+/g, ' ');
    if (S.editing) { S.editing = false; return await confirmLead(); }
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) return await ask(next);
    return await confirmLead();
  }
  const rows = () => [['Name', S.lead.name], ['School', S.lead.school], ['Students', S.lead.students], ['Contact', S.lead.contact],
                      ...(S.ctx.challenge ? [['Focus', CHALLENGES[S.ctx.challenge].label]] : []), ...(S.ctx.campuses ? [['Campuses', S.ctx.campuses]] : [])];
  async function confirmLead() {
    S.flow = 'confirm'; S.step = null; setInput(null);
    const sum = '<dl class="sc-sum">' + rows().map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>';
    await bot('Here is a summary of your request. Does everything look right?', sum);
    chips([{ id: 'lead:ok', label: 'Yes, looks good', pri: true }, { id: 'lead:edit', label: 'Edit details' }]);
  }
  const leadText = () => rows().map(([k, v]) => `${k}: ${v}`).join('\n');
  async function submitLead() {
    S.flow = 'done';
    const payload = { ...S.lead, focus: S.ctx.challenge ? CHALLENGES[S.ctx.challenge].label : null, campuses: S.ctx.campuses, source: 'website-chatbot', page: location.href, at: new Date().toISOString() };
    if (CFG.leadEndpoint) {
      const t = addRow('bot', $('div', 'sc-msg sc-typing', '<i></i><i></i><i></i>'));
      try {
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch(CFG.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
        clearTimeout(timer); t.remove();
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await bot(`Thank you, ${S.lead.name.split(' ')[0]}! ✅ Your demo request has been sent to the SimpliEd team. They'll contact you at **${S.lead.contact}** to agree a time.`);
        if (CFG.bookingUrl) actions([{ label: 'Pick a time now', href: CFG.bookingUrl, icon: ICON.cal, pri: true }]);
        return chips([{ id: 'menu', label: 'Ask something else' }]);
      } catch (e) {
        t.remove();
        await bot("Sorry - I couldn't send your request just now. Please use one of the options below so it isn't lost:", '<p class="sc-err">Connection problem - nothing was sent.</p>');
      }
    }
    // No backend configured (or it failed): the visitor sends it themselves. Never claim it's booked.
    const subject = encodeURIComponent(`Demo request - ${S.lead.school}`);
    const body = encodeURIComponent(`Hello SimpliEd team,\n\nI'd like to book a demo.\n\n${leadText()}\n\nThank you.`);
    if (!CFG.leadEndpoint) await bot(`Thanks, ${S.lead.name.split(' ')[0]}! One last step to reach our team:`,
      `<div class="sc-note">Your demo <strong>isn't scheduled yet</strong>. Tap <strong>Send to SimpliEd</strong> - your email app opens with these details ready. The team will reply to agree a time.</div>`);
    const acts = [{ label: 'Send to SimpliEd', href: `mailto:${CFG.email}?subject=${subject}&body=${body}`, icon: ICON.mail, pri: true }];
    if (CFG.bookingUrl) acts.unshift({ label: 'Pick a time', href: CFG.bookingUrl, icon: ICON.cal, pri: true });
    acts.push({ label: 'Call ' + CFG.phone, href: telHref, icon: ICON.phone });
    acts.push({ label: 'Copy details', icon: ICON.copy, onClick: async e => {
      const b = e.currentTarget; try { await navigator.clipboard.writeText(leadText()); b.lastChild.textContent = 'Copied ✓'; } catch { b.lastChild.textContent = 'Copy not available'; } } });
    actions(acts);
    chips([{ id: 'menu', label: 'Ask something else' }]);
  }

  /* chip ids that need the lead flow */
  const _handle = handle;
  handle = async function (id, raw) {
    if (id.startsWith('size:')) { S.busy = true; try { await answer(id.slice(5)); } finally { S.busy = false; } return; }
    if (id === 'lead:ok') { S.busy = true; try { await submitLead(); } finally { S.busy = false; } return; }
    if (id === 'lead:edit') { await bot('Which detail would you like to change?'); return chips(STEPS.map(s => ({ id: 'edit:' + s, label: { name: 'Name', school: 'School', students: 'Students', contact: 'Contact' }[s] }))); }
    if (id.startsWith('edit:')) { S.flow = 'demo'; S.editing = true; S.busy = true; try { await ask(id.slice(5)); } finally { S.busy = false; } return; }
    if (id.startsWith('ai:')) return aiTurn(raw);
    return _handle(id, raw);
  };

  /* ===================== AI assistant (optional backend) =====================
   * Free text goes to CFG.aiEndpoint, which understands the question, asks follow-ups and answers only from the
   * verified knowledge base (the LLM key stays on the server). If the backend is missing, slow or failing,
   * the built-in keyword answers above take over, so the chat never breaks. Demo details never go to the AI. */
  const LOCAL_CHIP = { 'explore features': 'features', 'talk to our team': 'team', 'what is simplied?': 'what', 'something else': 'menu', 'book a demo': 'demo' };
  const chipFor = label => { const id = LOCAL_CHIP[label.toLowerCase()]; return id === 'demo' ? DEMO : { id: id || 'ai:' + label, label }; };
  const scrub = t => String(t).replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[email]').replace(/\+?\d[\d\s()-]{6,}\d/g, '[number]').slice(0, 600);
  function remember(role, text) { S.ai.history.push({ role, text: scrub(text) }); S.ai.history = S.ai.history.slice(-10); }

  async function aiTurn(text) {
    S.busy = true;
    const t = typing();
    let data = null, status = 0;
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(CFG.aiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ message: text, history: S.ai.history, state: S.ai.state }) });
      clearTimeout(timer); status = r.status;
      if (r.ok) data = await r.json();
    } catch (e) { /* network error / timeout */ }
    t.remove();
    try {
      if (!data || typeof data.reply !== 'string') {
        if (status === 429) { await bot("You're sending messages quite fast. Please give me a few seconds and try again. 🙂", null, true); return chips([{ id: 'menu', label: 'Show options' }]); }
        if (!status || [404, 405, 501].includes(status)) S.ai.on = false;     // no assistant backend here: use built-in answers
        S.busy = false; return await _handle(intentOf(text), text);
      }
      remember('user', text);
      S.ai.state = data.state || null;
      const qr = (Array.isArray(data.quickReplies) ? data.quickReplies : []).slice(0, 5).map(chipFor);
      switch (data.action) {
        case 'handoff_demo': S.busy = false; return await startDemo();
        case 'handoff_contact': S.busy = false; return await _handle('team');
        case 'escalate': {
          remember('assistant', data.reply);
          const summary = (data.escalation && data.escalation.summary) || '';
          await bot(data.reply, summary ? `<dl class="sc-sum"><div><dt>Issue</dt><dd>${esc(summary)}</dd></div></dl>` : '', true);
          const body = encodeURIComponent(`Hello SimpliEd support,\n\nI need help with:\n${summary}\n\nSchool: \nMy name: \n\nThank you.`);
          actions([{ label: 'Email support', href: `mailto:${CFG.email}?subject=${encodeURIComponent('Support request: ' + summary.split(' · ')[0])}&body=${body}`, icon: ICON.mail, pri: true },
                   { label: 'Call ' + CFG.phone, href: telHref, icon: ICON.phone }]);
          return chips([{ id: 'menu', label: 'Something else' }]);
        }
        case 'answer_demo':
          remember('assistant', data.reply);
          await bot(data.reply, null, true);
          return chips([DEMO, { id: 'team', label: 'Talk to our team' }]);
        case 'solution': case 'answer':
          // problem -> SimpliEd service -> result -> "see it for yourself": the demo is always the first option
          remember('assistant', data.reply);
          await bot(data.reply, null, true);
          return chips([DEMO, ...qr.filter(c => c.id !== 'demo').slice(0, 2), { id: 'team', label: 'Talk to our team' }]);
        default:
          remember('assistant', data.reply);
          await bot(data.reply, null, true);
          return qr.length ? chips(qr.slice(0, 5)) : undefined;
      }
    } finally { S.busy = false; }
  }

  /* free-text routing */
  function intentOf(text) {
    const t = ' ' + text.toLowerCase() + ' ';
    for (const [id, rx] of INTENTS) if (rx.test(t)) return id;
    return 'fallback';
  }
  async function onText(text) {
    if (S.busy) return;
    clearChips(); me(text);
    if (S.flow === 'demo' && S.step) {
      if (/^\s*(cancel|stop|exit|quit|nevermind|never mind)\s*$/i.test(text)) { S.flow = null; S.step = null; setInput(null); await bot("No problem - I've cancelled the demo request. What else can I help with?"); return chips(MAIN); }
      S.busy = true; try { await answer(text.trim()); } finally { S.busy = false; } return;
    }
    if (S.flow === 'confirm') {
      if (/\b(yes|yep|correct|ok|okay|good|confirm|send)\b/i.test(text)) return handle('lead:ok');
      if (/\b(no|edit|change|wrong)\b/i.test(text)) return handle('lead:edit');
    }
    if (S.ai.on) return aiTurn(text);
    return handle(intentOf(text), text);
  }

  /* ===================== open / close / input ===================== */
  let lastFocus = null;
  function setOpen(open) {
    S.open = open; root.classList.toggle('open', open); root.classList.add('seen');
    panel.setAttribute('aria-hidden', String(!open)); launch.setAttribute('aria-expanded', String(open));
    launch.setAttribute('aria-label', open ? 'Close chat' : 'Chat with SimpliEd');
    hideTeaser();
    if (open) {
      lastFocus = document.activeElement; if (!S.started) start();
      let tries = 0;   // focus once the panel is actually visible (works with and without animation)
      const focusInput = () => { input.focus({ preventScroll: true }); if (document.activeElement !== input && tries++ < 12) setTimeout(focusInput, 50); };
      setTimeout(focusInput, reduce ? 30 : 320);
    }
    else if (lastFocus && lastFocus.focus) { launch.focus(); }
  }
  launch.addEventListener('click', () => setOpen(!S.open));
  root.querySelector('.sc-close').addEventListener('click', () => setOpen(false));
  root.querySelector('.sc-restart').addEventListener('click', () => {
    if (S.busy) return;
    log.innerHTML = ''; S.flow = null; S.step = null; S.editing = false; S.ai.state = null; S.ai.history = []; setInput(null); start();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.open) setOpen(false); });
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', e => {
    e.preventDefault(); const v = input.value.trim(); if (!v || S.busy) return;
    input.value = ''; send.disabled = true; input.style.height = 'auto'; onText(v);
  });
  // any element with data-chat="demo" can open the chat straight into the demo flow
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-chat]'); if (!t) return;
    e.preventDefault(); if (!S.open) setOpen(true);
    const go = () => { clearChips(); me('Book a demo'); handle('demo'); };
    S.started ? go() : setTimeout(go, 1200);
  });

  /* the launcher's eyes follow the pointer (desktop, motion allowed) */
  const eyes = launch.querySelector('.sc-eyes');
  if (!reduce && matchMedia('(hover: hover)').matches) {
    let px = 0, py = 0, raf = 0;
    addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY;
      if (raf || S.open) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const b = launch.getBoundingClientRect(), dx = px - (b.left + b.width / 2), dy = py - (b.top + b.height / 2);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260) * 1.8;   // px; HTML transform = GPU only, no layout
        eyes.style.transform = `translate(${(dx / d * k).toFixed(2)}px,${(dy / d * k).toFixed(2)}px)`;
      });
    }, { passive: true });
  }

  /* launcher entrance + one gentle teaser per session */
  let teaserTimer;
  function hideTeaser() { teaser.classList.remove('in'); teaser.setAttribute('aria-hidden', 'true'); clearTimeout(teaserTimer); }
  setTimeout(() => launch.classList.add('in'), 900);
  let seenTeaser = false; try { seenTeaser = sessionStorage.getItem('sc-teaser') === '1'; } catch (e) {}
  if (!seenTeaser) teaserTimer = setTimeout(() => {
    // small or short screens: the launcher alone is enough; a speech bubble would sit on top of page content
    if (S.open || innerWidth < 600 || innerHeight < 500) return; teaser.classList.add('in'); teaser.setAttribute('aria-hidden', 'false');
    try { sessionStorage.setItem('sc-teaser', '1'); } catch (e) {}
    teaserTimer = setTimeout(hideTeaser, 9000);
  }, 9000);
  teaser.addEventListener('click', e => { if (e.target.closest('.sc-teaser-x')) { hideTeaser(); return; } setOpen(true); });

  /* expose a tiny API for testing / other buttons */
  window.SimpliEdChat = { open: () => setOpen(true), close: () => setOpen(false), _state: S, _intent: intentOf };
})();
