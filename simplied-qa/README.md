# SimpliEd website: QA scripts

Browser tests for `../simplied-site`. They are not part of the website and are never deployed.

## Setup
```
# Node isn't on PATH in Claude's shell; prefix every command with:
export PATH="/c/Users/FPS/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"
# Playwright is borrowed from another project:
export NODE_PATH=/c/Users/FPS/Downloads/TestF/whatsapp-bulk-sender/server/node_modules
```

Servers used by the tests:
- `http://127.0.0.1:3000`: `simplied-server` (`npm start`). The site + chatbot API + compression. Most tests use this.
- `http://127.0.0.1:5500`: a plain static server (`python -m http.server 5500 --bind 127.0.0.1` inside `simplied-site`). Used by `qgate.js`, `ia_test.js` and `chat_test.js`, which checks the chatbot without its backend.

Screenshots go to `./out` (or `$OUT`).

## Scripts

| Script | Checks | Last known result |
|---|---|---|
| `qgate.js` | Overflow, broken images, tap targets under 44px and console errors, at 8 viewports (320 to 1920) | All clean |
| `audit_m.js` | 12 viewports, including phone landscape: overflow, spilling elements, text under 12px, tap targets, text overflow, distorted or unsized images, overlapping controls, heading order. `SHOTS=0` skips the per-section screenshots | Overflow 0 everywhere |
| `ia_test.js` | Every nav, footer and CTA link lands at `top=84`; the mobile menu closes after a tap | 26 ok |
| `chat_test.js` | Chatbot without a backend (port 5500): flows, lead capture, validation, phones | 47/47 |
| `ai_ui_test.js` | Chatbot with the server: rules mode, mock-Gemini mode, XSS, outage fallback (it starts its own servers on 3101/3102/3199) | 27/27 |
| `ct_test.js` | Contact form: topics, validation, mailto fallback, backend ok/fail, phone taps | 17/17 |
| `ct_fit.js` | Contact card fits one screen after clicking "Book a Demo" | Fits at 8 sizes |
| `mobile_ix.js` | Phone interactions: the chat launcher at every scroll position, menu, landscape hero, skip link, reduced motion. Slow, about 9 minutes | 27/27 at the time; the launcher-tuck checks are obsolete because the launcher is now always visible |
| `why_test.js` | "Why SimpliEd" moving rows: drift directions, touch to stop, swipe, touch outside to resume, reduced motion | 20/20 |
| `tour_test.js` | Hero app cards on phones: drift, touch/swipe/dots, phone screen sync, desktop untouched | 26/26 |
| `axe_scan.js` | axe-core WCAG 2.x A/AA at 390 and 1440, page and chat open (`tools/node_modules/axe-core` bundled) | 0 violations |
| `layout_rate.js` | Layouts and style recalcs per second at idle, with animations toggled, to find animations that force layout | Mobile ~0.7 layouts/s |
| `trace_layout.js` | Performance trace on a throttled phone that attributes layout to the JS that triggered it | n/a |

Lighthouse (not bundled, about 100 MB):

```
npm i lighthouse
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" npx lighthouse http://127.0.0.1:3000/index.html --form-factor=mobile --output=json --output-path=lh.json
```

Check `environment.benchmarkIndex` in the report. Runs where it is far below about 1200 come from a busy machine and aren't meaningful. The last good run scored Performance 87–94, Accessibility 100, Best Practices 100, SEO 100 (LCP 1.8s, CLS 0.012).
