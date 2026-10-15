# SimpliEd website

The marketing website for **SimpliEd**, the all-in-one school operating system.

| Folder | What it is |
|---|---|
| `simplied-site/` | The website: `index.html` plus `assets/`, including the website chatbot (`assets/chatbot.js`). |
| `simplied-server/` | Node server: serves the site (compressed) and `POST /api/chat` (the AI assistant). `npm start`, `npm test`. |
| `simplied-qa/` | Playwright QA scripts (see its README). |
| `SIMPLIED-CONTEXT.md` | Full project context: structure, design rules, conventions, open items. |

Run locally: `cd simplied-server && npm start`, then open http://127.0.0.1:3000.
Secrets (e.g. `GEMINI_API_KEY`) go only in `simplied-server/.env`, which is git-ignored and never committed.
