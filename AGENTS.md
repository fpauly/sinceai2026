<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ajantasa – agent instructions (OpenCode and others)

Read `DESIGN.md` (what we build) and `TASKS.md` (lanes, file ownership, timeline) before writing code.
Only edit files owned by your lane (see TASKS.md). Shared files (`types/*`, `data/seed.ts`, `lib/db.ts`, `package.json`) change only in small separate PRs.
Shared types: `types/index.ts` (data model) and `types/api.ts` (contracts between lanes). Use them; don't invent new shapes.

Rules:
- **Next.js 16** (see block above). Route `params` is a Promise (`const { id } = await ctx.params`). `cacheComponents` is on, so pages should be `"use client"` components that fetch from `/api/*`; all DB access stays in route handlers.
- DB: only via `collections()` from `@/lib/db`, server-side only.
- Detection rules are pure functions `(ctx: RuleContext) => DraftIssue[]`. Use `ctx.today`, never `new Date()`.
- Code detects, AI explains, the human decides. Never ask an LLM to compare dates or numbers.
- Gemini/ElevenLabs only via `lib/ai` / `lib/voice` wrappers with fallbacks; never from client components.
- TypeScript strict, Tailwind for styling, mobile-first owner view (~390px).
- Mock data only. Do not add features outside DESIGN.md.
- Before a PR: `npx tsc --noEmit && npm run lint`.
- Commit messages: plain, no AI co-author trailers.
