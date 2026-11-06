# Copilot instructions – Ajantasa

Before writing code, read `DESIGN.md` (what we build) and `TASKS.md` (who owns which files, API contracts).
Shared types: `types/index.ts` (data model) and `types/api.ts` (contracts between lanes). Use them; don't invent new shapes.

Rules:
- This is **Next.js 16** (App Router). It differs from older versions. Route `params` is a Promise (`const { id } = await ctx.params`). `cacheComponents` is on, so pages should be `"use client"` components that fetch from `/api/*`; all DB access stays in route handlers.
- Docs for this exact Next.js version are in `node_modules/next/dist/docs/`.
- DB: only via `collections()` from `@/lib/db`, server-side only.
- Detection rules are pure functions `(ctx: RuleContext) => DraftIssue[]`. Use `ctx.today`, never `new Date()`.
- Code detects, AI explains, the human decides. Never ask an LLM to compare dates or numbers.
- Gemini/ElevenLabs only via `lib/ai` / `lib/voice` wrappers with fallbacks; never from client components.
- TypeScript strict, Tailwind for styling, mobile-first owner view (~390px).
- Mock data only. Do not add features outside DESIGN.md.
- Before a PR: `npx tsc --noEmit && npm run lint`.
