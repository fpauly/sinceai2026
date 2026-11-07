<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ajantasa – agent instructions (OpenCode, Codex and others)

Read `DESIGN.md` (what we build), `TASKS.md` (lanes, file ownership, timeline) and **`CONTRIBUTING.md` (team rules: branches, commits, conflicts, hard tasks go to Claude Pro lanes, rules for AI agents)** before writing code. CONTRIBUTING.md overrides your defaults.
Shared types: `types/index.ts` (data model) and `types/api.ts` (contracts between lanes). Use them; don't invent new shapes.

Rules:
- **Next.js 16** (see block above). Route `params` is a Promise (`const { id } = await ctx.params`). `cacheComponents` is on, so pages should be `"use client"` components that fetch from `/api/*`; all DB access stays in route handlers.
- DB: only via `collections()` from `@/lib/db`, server-side only.
- GET route handlers that read the DB must start with `await connection()` (`import { connection } from "next/server"`), otherwise the build tries to prerender them and fails in CI. See `app/api/status/route.ts`.
- Detection rules are pure functions `(ctx: RuleContext) => DraftIssue[]`. Use `ctx.today`, never `new Date()`.
- Code detects, AI explains, the human decides. Never ask an LLM to compare dates or numbers.
- Gemini/ElevenLabs only via `lib/ai` / `lib/voice` wrappers with fallbacks; never from client components.
- TypeScript strict, Tailwind for styling, mobile-first owner view (~390px).
- Mock data or Fonecta's synthetic dataset only (`FONECTA/`, not committed; DESIGN.md section 0). Do not add features outside DESIGN.md.
- Before a push: `npm run check` (pre-push hook runs it; never use `--no-verify`). After API/DB changes: `npm run dev` + `npm run smoke` (CONTRIBUTING.md section 8).
- Commits: `<lane>: <summary>`, no Co-Authored-By or AI footers. Commit/push only when the human asks.
- **`next` / `start` / `继续` / `下一步` → autopilot (CONTRIBUTING.md §9):** build one stage of the lane in `AJANTASA_LANE` (`.env.local`); **stop at ⏸ in the TASKS.md queue**: branch → build → `npm run check` + `npm run smoke` → PR → tell the human what to check, then stop. **`merge` → merge that PR** (CI green). Never merge without `merge`.
- No GPL/AGPL dependencies. External APIs (Gemini, Yext, ElevenLabs) only via `lib/ai`, `lib/yext`, `lib/voice`.
- Workflow: every stage starts on a new branch from freshly pulled `main`; shared-file changes go first in their own `shared/<topic>` PR (CONTRIBUTING.md section 1).
