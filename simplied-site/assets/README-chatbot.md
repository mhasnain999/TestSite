# SimpliEd Assistant — website chatbot

Files: `assets/chatbot.js`, `assets/chatbot.css`, `assets/brand/mark.png`.
Loaded by `index.html` (one `<link>` in `<head>`, one config block + `<script defer>` before `</body>`). No dependencies, no build step.

## What it does
- Greeting with 5 quick actions: What is SimpliEd? · Explore features · How can SimpliEd help my school? · Book a demo · Talk to our team.
- Feature answers (admissions & student info, attendance, timetable, fees & billing, communication, LMS & homework, reports & multi-branch) — **only facts already published on the website**. No pricing, no invented integrations.
- Guided needs path: biggest challenge → one campus or several → tailored recommendation → demo offer. The choices are remembered and added to the demo request.
- Understands typed questions (keyword intents) and falls back honestly when it can't answer.
- Demo request: name → school → students → email/phone, one question at a time, validated, with a summary to confirm or edit. Type `cancel` to stop.

## Where do demo requests go?
Configure in `index.html`:

```html
<script>
  window.SIMPLIED_CHAT = {
    email: 'info@simpliedtech.com',
    phone: '+92 331 7734499',
    leadEndpoint: null,   // your backend URL
    bookingUrl: null      // e.g. https://calendly.com/simplied/demo
  };
</script>
```

| Setting | Behaviour |
|---|---|
| **Nothing configured (current)** | Nothing is stored or sent silently. After confirming, the visitor taps **Send to SimpliEd** — their email app opens to `info@simpliedtech.com` with all details pre-filled. Call and copy options are shown too. The bot says plainly that the demo **isn't scheduled yet**. |
| `leadEndpoint` set | The bot `POST`s JSON to that URL. 2xx → "request sent". Error/timeout (10 s) → clear error + the email fallback, so the lead is never lost. |
| `bookingUrl` set | Adds a **Pick a time** button (opens your booking page) after the summary. |

### Payload sent to `leadEndpoint`
```json
{ "name": "Sara Ahmed", "school": "Willow Academy", "students": "850", "contact": "sara@willow.edu.pk",
  "focus": "Parent communication", "campuses": "Multiple branches",
  "source": "website-chatbot", "page": "https://www.simpliedtech.com/", "at": "2026-10-14T09:30:00.000Z" }
```

### Minimal backend (example — any stack works)
The endpoint must be **your own server** (same domain, or with CORS allowing your domain). Keep CRM / email API keys on the server — never in `index.html` or `chatbot.js`.

```js
// Node/Express example
app.post('/api/demo-requests', express.json({ limit: '5kb' }), async (req, res) => {
  const { name, school, students, contact } = req.body || {};
  if (!name || !school || !contact) return res.status(400).end();
  await saveToCrmOrSendEmail(req.body);   // e.g. HubSpot/Zoho API or SMTP — keys stay server-side
  res.status(201).json({ ok: true });
});
```
Add basic rate limiting and spam protection on the server.

## AI assistant (free-text understanding)
`aiEndpoint: '/api/chat'` connects typed questions to the AI backend in `../simplied-server` (see its README). Its features:
- natural-language understanding;
- follow-up questions;
- support triage;
- answers grounded in the knowledge base.

Behaviour:
- **Quick-action buttons, feature cards and the demo form stay local.** Demo details are never sent to the AI.
- The chat only calls the API when the page was served by `simplied-server` (it marks pages with a `Server-Timing` header).
  - On plain static hosting, the built-in keyword answers above are used, with no failing requests.
  - If the API is on another domain, set `aiDetect: false`.
- If the API is down, slow or rate-limited, the chat falls back to the built-in answers automatically.

## Other hooks
- Any element with `data-chat="demo"` opens the chat straight into the demo flow, e.g. `<a href="#contact" data-chat="demo">Book a Demo</a>`.
- `window.SimpliEdChat.open()` / `.close()` from your own scripts.

## Editing answers
All copy lives at the top of `chatbot.js` (`F` = features, `CHALLENGES`, and the `switch` in `handle()`). Keep it in line with what the website states.
