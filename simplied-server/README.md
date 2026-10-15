# SimpliEd Assistant: AI backend

Serves the SimpliEd website (`../simplied-site`) and the chatbot API `POST /api/chat`.
Node 18+, **no dependencies**, no database. The LLM key lives only in this server's environment.

```
simplied-server/
  server.js              HTTP server: static site, /api/chat, /api/health, rate limits, CORS, security headers
  lib/kb.js              knowledge loader + retrieval (BM25 + synonyms such as "sir/madam" → teacher)
  lib/rules.js           deterministic engine: clarify → diagnose → escalate (used without a key and as fallback)
  lib/assistant.js       LLM orchestration, JSON schema, server-side validation & guards, circuit breaker
  lib/providers/         gemini.js (default), groq.js; add another provider with one file
  knowledge/product.json   verified product answers (from simpliedtech.com)
  knowledge/solutions.json problem → SimpliEd service → result (from the website's features, stats and customer stories)
  test/                  43 automated tests (node --test)
```

## What the assistant does
A visitor describes their situation in their own words ("teacher issue", "parents pay late", "we run 5 branches on different systems"). The assistant:
1. understands the problem;
2. explains which SimpliEd service solves it;
3. says what that results in (only the results published on the website);
4. invites the visitor to book a demo to see it for themselves.

Saying "yes" to the invitation opens the demo form. Direct questions ("do you have an LMS?") get a direct answer plus a demo invitation.

## How a message is handled
1. The browser sends `{ message, history (last 10, contacts scrubbed), state }`. The server keeps **no conversation storage**.
2. The knowledge base is searched; the best entries plus the current topic go to the LLM with the conversation.
3. The LLM returns JSON: `action` (solution · answer · clarify · handoff_demo · handoff_contact · unknown · smalltalk), `node_id`, `intent`, `reply`, `quick_replies`, `facts`, `confidence`.
4. The server **validates** it and rejects (→ rules engine answers instead):
   - unknown action;
   - a source that wasn't retrieved;
   - a solution/answer without a verified source;
   - low confidence;
   - **any number or customer name not in the cited entry** (no invented statistics);
   - invented menu/button instructions;
   - false claims ("your demo is booked");
   - prompt leakage.

   Links, foreign emails and phone numbers are stripped. A demo invitation is added if the model forgot it.
5. Any provider problem (timeout, 429, quota, 5xx, blocked, bad JSON) → the rules engine answers. Repeated failures pause the LLM (circuit breaker).

## Setup
1. Get a Gemini API key:
   1. Go to https://aistudio.google.com/ and sign in with the Google account that should own the project.
   2. Click **Get API key** → **Create API key** (in a new or existing Google Cloud project).
   3. Check your model's limits at https://aistudio.google.com/rate-limit and read the terms.
      **On the free tier, Google may use prompts to improve its products.** For production with real school conversations, enable billing (paid tier) or use another provider.
2. `copy .env.example .env` and set `GEMINI_API_KEY=...` (and optionally `GEMINI_MODEL`, default `gemini-3.5-flash-lite`).
3. `npm start` (or `node server.js`), then open http://127.0.0.1:3000.
   `GET /api/health` shows `llm: ready | paused | disabled | not_configured`.

Without a key the assistant still works with the built-in rules engine. Switch provider: `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`.

## Tests
```
npm test                       # 43 tests: rules engine, LLM validation & fallbacks, HTTP API against a mock Gemini server
```

## Deployment
- Run `node server.js` on any Node host (VPS, Render, Railway, Fly, Azure App Service…). Put it behind HTTPS.
  - Set `HOST=0.0.0.0`.
  - Set `TRUST_PROXY=1` when behind a proxy/load balancer.
- Set the environment variables in the host's **secret settings**. Never commit `.env` (it is git-ignored).
- **Same domain (recommended):** let this server serve the website. The chatbot detects it automatically.
- **Website on separate static hosting:** run this server on e.g. `api.simpliedtech.com`, then:
  - set `ALLOWED_ORIGINS=https://www.simpliedtech.com`;
  - in `index.html` set `aiEndpoint: 'https://api.simpliedtech.com/api/chat', aiDetect: false`.
- Rate limits are in memory (per process). For several instances, put the limit in your proxy/CDN, or move it to Redis.

## Adding knowledge (no code changes)
- **New FAQ:** add an entry to `knowledge/product.json`: `id`, `module`, `kind: "product"`, `title`, `keywords`, `examples`, `answer`.
- **New problem/solution:** add an entry to `knowledge/solutions.json`: `kind: "solution"`, `title` (problem area), `service`, `keywords` and `examples` (how schools describe the problem), `answer` (how SimpliEd solves it), `results` (approved outcomes or customer quotes).
- **New result or customer story:** add it to the entry's `results`. The AI can only quote numbers and customer names that appear there.
- Restart the server. `npm test` validates the files (unknown modules, broken links between entries, missing fields).
