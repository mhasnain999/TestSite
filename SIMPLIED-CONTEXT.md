# SimpliEd website: project context

Auto-loaded via `CLAUDE.md`. Read it before changing anything in `simplied-site/` or `simplied-server/`. Keep it up to date: when a change alters behaviour, a rule or a convention below, update this file (`SIMPLIED-CONTEXT.md`) in the same task. It sits outside `simplied-site/` on purpose, because everything in that folder is public.

## What this is
The marketing website for **SimpliEd**, an all-in-one school operating system (simpliedtech.com). The owner is a non-technical product person who iterates visually. The site is in English.

| Folder | Purpose |
|---|---|
| `simplied-site/` | The website. **One page**: `index.html` with inline CSS and JS (~2,600 lines), plus `assets/`. No build step, no framework. |
| `simplied-site/assets/chatbot.js`, `chatbot.css` | The website chatbot (no dependencies). Its setup guide is `assets/README-chatbot.md`. |
| `simplied-server/` | Node server (no dependencies): serves the site (with brotli/gzip compression) plus `POST /api/chat` (the AI assistant: Gemini, rules-engine fallback). See its `README.md`. 44 tests: `npm test`. |
| `simplied-qa/` | Playwright QA scripts and how to run them. See its `README.md`. |
| `simplied-video/` | A 64s brand film pipeline (Playwright captures, Piper TTS, synthesised audio, Pillow frames, ffmpeg). **Outdated copy**: it still says "vouchers" and "Book a Product Walkthrough". |

## Run it
- Node is not on PATH in Claude's shell. Prefix commands with `export PATH="/c/Users/FPS/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"`.
- **Main preview:** `cd simplied-server && npm start`, then open http://127.0.0.1:3000. Tell the user to press Ctrl+Shift+R after changes.
- Plain static server (no chatbot backend): `python -m http.server 5500 --bind 127.0.0.1` inside `simplied-site`. Python lives at `C:\Users\FPS\AppData\Local\Python\bin\python.exe` (PIL and numpy installed).
- Restart the Node server after editing `simplied-server/` files. Site files are served live.

## Page structure (top to bottom)
The nav (`#nav`) holds: Why SimpliEd · Product · Approach · Impact · Compare · Customers · **Book a Demo** (`#navCta`). Phones get a ☰ menu built from the same links. Anchors land at `top = 84px` (`--nav-h`). The scrolled desktop nav must stay at or under 84px.

1. **Hero** `#hero`: "For modern schools · All-in-one school *operating system*." The final full stop is a separate white `.blink-dot` that blinks; it must stay outside `.grad-text`, otherwise background-clip keeps it visible.
   - CTAs: Book a Demo (`#heroCta` → `#get-in-touch`) and See it in action (→ `#admin`).
   - Behind it, an animated "web" canvas `#web` runs on all sizes. On phones it covers the first screen only and pauses off-screen.
   - **Desktop:** a pinned scroll tour. One phone switches Parent → Teacher → Smart Inbox, with tour copy beside it.
   - **Phones/tablets (≤860px):** the tour cards are white classic cards in a strip that **drifts slowly left** (22px/s). Touching it stops it (it can be swiped); touching elsewhere resumes it. The dots and the phone screen follow the centred card. Loop copies are `aria-hidden` and `inert`.
2. **Why SimpliEd** `#why`: nine feature cards. Desktop shows a 3×3 grid. **≤860px shows two rows** (5 + 4) that drift left and right, built by JS into `#whyMarquee`. Touch stops a row, touching outside resumes it, rows are swipeable, and there is no pause button (the user removed it).
3. **Roles** `#roles`: bubbles plus a phone per role. On desktop the bubbles are draggable physics, only running while on screen.
4. **Admin** `#admin`: an interactive dashboard demo (`#lap`), with Attendance / Announcements / LMS / Billing / Insights tabs. There is **no "Tech" word** after the logo.
5. **Built for Speed** `#speed`: "Invoices in seconds. Parents notified instantly." Stats, a Stripe badge, and the **Generate Invoice** demo. On click, the button fills ("Generating…"), then 5 **3D invoice packets** fly on curved paths into the phone and vanish. After that the "Fee Invoice Generated" notification appears; its icon is the SimpliEd mark (`assets/brand/mark.png`).
6. **Transform** `#transform`: the four-step approach (Scope, Shape, Influence, Align).
7. **Founder** `#founder`: "An educator's vision for *modern schools.*" Mr. Rehman Minhas, with Harvard and Columbia credentials. On phones the eyebrow and heading come **before** the photo (CSS `order` with `display:contents`).
8. **Impact** `#impact`: an animated bar chart. Fee collection +46%, IT cost −53%, operational cost −30%, new students +33%.
   - The bar tracks are plain, with **no gridlines**.
   - The numbers and % inside the bars use **Sora Light (300)** at 16px desktop / 13px phones, with the arrow sized to match (18/15px) and the pair centred in the fill (verified with `simplied-qa` measurements), which is why the font URL loads Sora `300;400;600;700;800`.
   - The label "Operational" may split as "Opera-tional" (a soft hyphen) only at 360px and under.
9. **Compare** `#versus`: SimpliEd vs Competitor A / WhatsApp / Old-School Register System.
   - Desktop is pinned, with points that draw in one by one.
   - On phones it auto-rotates. Both phone columns share one subgrid, so they always align. The competitor mock is laid out at 282px and scaled to fit (`--csk`).
10. **Testimonials** `#testimonials`: a carousel of five schools.
11. **Trust** `#trust`: client logos.
12. **Promise** `#contact` (`.finisher`): "Built by an Educator. / Engineered for Education. / Designed for What's Next."
    - Its button is **"Schedule a Demo"** (`#endCta`). It is the only CTA with that wording; every other one says "Book a Demo".
    - The top and bottom edges are **smooth navy waves** (seamless SVG mask in `::before` / `::after`).
13. **Contact Us** `#get-in-touch`: an illustrated decision-maker panel and a short form.
    - Topics: Book a demo / Get pricing / Ask a question.
    - Fields: name, role, school, email (all required); phone and message (optional).
    - The card must fit one screen at 1024×768 and larger.
    - Without a backend the form opens a pre-filled `mailto:` and honestly says "Press Send". If `window.SIMPLIED_CHAT.leadEndpoint` is set, it POSTs instead.
    - Every "Book a Demo" link goes here and preselects "Book a demo" (`data-ct="demo"`).
14. **Footer**: brand, four link columns, the © line, and **Privacy Policy** (https://www.simpliedtech.com/privacy-policy.html) and **Terms and Conditions** (https://www.simpliedtech.com/terms-and-conditions.html).

Contact details used everywhere: **info@simpliedtech.com**, **+92 331 7734499**.

## Design rules (the user's preferences, all confirmed)
- The style is **classic, clean, premium**.
  - **No gradients on surfaces** (cards, buttons, sections). Gradient is allowed only as headline text (`.grad-text`, `--grad-text`).
  - The brand colours are navy `#160446`, accent `#4361ee`, violet `#574bd3` and cyan `#12b3c7`.
  - Fonts are Sora (headings) and Inter (body), each with metric-matched fallbacks: always write `'Sora','Sora Fallback'` and `'Inter','Inter Fallback'`.
- **Never use "—" (em dash)** in site text or chatbot text. Use " - " instead. En-dash number ranges in the chatbot ("300 – 1,000") were left as they are.
- **No "Pakistan"** anywhere.
- The founder is "Mr. Rehman Minhas". Use the wording "invoices", never "vouchers".
- **Mobile-first and touch-friendly**:
  - targets at least 44px;
  - text at least 12px (11px in the dense dashboard demo and chart labels at 360px and under);
  - no horizontal overflow at any width from 320 to 1920 (phone landscape included).
- Keep existing animations unless the user asks to change them. Any motion must:
  - use **transform/opacity only** (no animated box-shadow, and no animating shapes *inside* SVGs, which forces a full layout every frame);
  - pause when off-screen;
  - respect `prefers-reduced-motion`.
- Images: add `width`/`height` plus `data-ar` (a zero-specificity reset keeps the CSS sizing), and use `loading="lazy"` below the fold. The first visible hero screen uses `fetchpriority="high"`.
- **The chatbot launcher must always stay visible on screen.** It is hidden only while the chat panel is open on phones (full-screen sheet). An earlier "tuck away over controls" behaviour was removed at the user's request; don't bring it back.

## Chatbot rules (business and honesty)
- It is consultative. A visitor's problem is answered with the SimpliEd service that solves it, the result, and an invitation to book a demo. A "yes" opens the demo form inside the chat.
- **Only verified facts:** website copy, `simplied-server/knowledge/product.json` and `solutions.json`.
  - Never invent features, menus, prices, integrations, customers or statistics.
  - The server rejects AI replies containing numbers or customer names that aren't in the cited entry, or invented UI steps.
- It never claims a demo is booked or a ticket created. Leads go out only by `mailto` unless a backend `leadEndpoint` is configured. API keys stay on the server only (`simplied-server/.env`, `GEMINI_API_KEY`; default model `gemini-3.5-flash-lite`).
- The Gemini **key is not set yet**, so the server runs its rules engine. Free-tier prompts may be used by Google, so recommend the paid tier for real school data.

## How to work here (what the user expects)
- **"Loop engineering":** inspect, fix, test, inspect again, refine. Verify with real browser tests and screenshots before reporting.
  - Report concisely: what changed, what was tested, anything unverified.
  - Do not ask for approval on small decisions.
- After CSS edits, **check brace balance**. A stray `}` once silently broke the admin section's navy background.
- When splicing big blocks with scripts, confirm each marker appears exactly once afterwards. A wrong marker order once duplicated a script block.
- Quick regression after most changes:
  - `qgate.js` (overflow, taps, errors at 8 sizes)
  - `ia_test.js` (links)
  - `axe_scan.js`
  - the suite for whatever was touched: `chat_test.js`, `ai_ui_test.js`, `ct_test.js`, `why_test.js` or `tour_test.js`.

  See `simplied-qa/README.md`.
- The user often sends follow-up requests mid-task. Finish the current change cleanly, then do the new one.

## GitHub
- Repo: **github.com/mhasnain999/TestSite**, **private**, branch `main`. First push was on 2026-10-15.
- It contains `simplied-site/`, `simplied-server/`, `simplied-qa/` (with the bundled axe-core), `SIMPLIED-CONTEXT.md`, `CLAUDE.md`, a root `README.md` and a `.gitignore` (`.env`, `node_modules` except axe-core, `simplied-qa/out/`, logs).
- It does **not** contain the other TestF projects or `simplied-video/`. `TestF` itself is not a git repo.
- To upload changes, copy those folders into a clean staging clone, run a secret scan, then commit and push.
- **Never store the GitHub token** in files, git config or remote URLs. Ask the user for one each time, or use `gh auth login`.

## Open items / not done
- Set `GEMINI_API_KEY` and test the AI against real Gemini.
- Deployment: the site needs the Node server (or the API on a subdomain plus `aiDetect:false`). Hosting is unknown; ask the user.
- `leadEndpoint` / CRM: no backend for leads yet (mailto fallback).
- Possibly self-host the fonts for faster first paint.
- The brand film in `simplied-video/` uses old copy and could be re-rendered.
