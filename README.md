# SimpliEd website

The marketing website for **SimpliEd**, the all-in-one school operating system.

| Path | What it is |
|---|---|
| `simplied-site/` | The website: `index.html` plus `assets/`, including the website chatbot (`assets/chatbot.js`). |
| `api/` | Vercel functions: `chat.js` (the AI assistant, `POST /api/chat`) and `health.js` (`GET /api/health`). |
| `simplied-server/` | The shared assistant code (`lib/`, `knowledge/`) plus a standalone Node server for local use (`npm start`, `npm test`). |
| `simplied-qa/` | Playwright QA scripts (see its README). |
| `vercel.json` | Vercel config: serves `simplied-site/` as the website and runs `api/*.js` as functions. |
| `SIMPLIED-CONTEXT.md` | Full project context: structure, design rules, conventions, open items. |

## Deploy on Vercel
1. In Vercel, choose Import Project and select this repo.
2. Settings:
   - **Framework Preset:** Other.
   - **Root Directory:** `./` (the repo root, **not** a subfolder).
   - Leave the Build, Output and Install commands **empty or default**; `vercel.json` sets them.
3. Optional: under Settings → Environment Variables, add `GEMINI_API_KEY` for AI answers. Without it, the chatbot uses its built-in rules engine. Redeploy after adding it.
4. Check `https://<your-domain>/api/health`: it shows `"ok": true` and which engine is active (it never shows keys).

## Run locally
`cd simplied-server && npm start`, then open http://127.0.0.1:3000.

Secrets go only in `simplied-server/.env` (local) or in Vercel Environment Variables. They are never committed.
