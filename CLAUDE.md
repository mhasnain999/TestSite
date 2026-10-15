# TestF workspace

This folder holds several separate projects.

| Project | Folders | Context |
|---|---|---|
| **SimpliEd website + chatbot** | `simplied-site/` (public website), `simplied-server/`, `simplied-qa/`, `simplied-video/` | `SIMPLIED-CONTEXT.md`, imported below. Keep it updated after every SimpliEd change. |
| SalesOS (AI sales OS) | `salesos/` | (see project files) |
| Scholara (school SaaS) | `schoolsaas/` | (see project files) |
| WhatsApp bulk sender | `whatsapp-bulk-sender/` | Its `server/node_modules` also supplies Playwright to the SimpliEd QA scripts. |

Node is installed but not on PATH in Claude's shell. Prefix commands with:
`export PATH="/c/Users/FPS/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.18.0-win-x64:$PATH"`

Never put notes, context or secrets inside `simplied-site/`: everything there is served publicly.

@SIMPLIED-CONTEXT.md
