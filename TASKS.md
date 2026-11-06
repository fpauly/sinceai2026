# Ajantasa – Team task split

4 people, 4 lanes. Every lane owns its own files, so we rarely touch the same file.
Read `DESIGN.md` first; this file only says **who builds what** and **how we connect**.

| Lane | Who | AI tools | Milestones | Theme |
|---|---|---|---|---|
| **A – AI** | Claude Pro #1 | Claude Code | M3, M6 (AI part), M7 (intent) | Gemini wrappers, prompts, schemas, fallbacks |
| **B – Voice + integration** | Claude Pro #2 | Claude Code | M7, M8, deploy | ElevenLabs, Atlas, merging, end-to-end, demo |
| **C – Detection + dashboard** | Copilot #1 | Copilot | M2, M5, M6 (wiring) | Deterministic rules, `/dashboard` |
| **D – Owner view + apply** | Copilot #2 | Copilot | M4 | Mobile owner UI, Accept/Edit/Ignore, sync |

Why this split: lanes C and D are deterministic code with clear specs (well suited to Copilot).
Lanes A and B use external SDKs and prompts, where Claude Code helps most.

The contracts between lanes are in **`types/api.ts`**. Build against those types. If you need to change them, open a small PR and tell everyone.

---

## Lane A – AI (Gemini)

Files you own: `lib/ai/*`, `app/api/suggest/route.ts`

1. **First, by ~H4: `/api/suggest` with fallback templates only (no Gemini).** This unblocks lane D.
   - `lib/ai/fallback.ts`: `fallbackSuggestion(business, issue, listings): SuggestionDraft`, one template per issue type. It must produce a sensible `proposed_change` from the evidence on its own (e.g. copy last year's holiday hours, take the most recently updated source in a conflict).
   - `POST /api/suggest[?businessId=]`: for each issue with status `open`, create a `Suggestion`, set the issue to `suggested`, and return `SuggestResponse`.
2. `lib/ai/gemini.ts`: the single wrapper. It reads `GEMINI_MODEL` from env, requests JSON output, validates with zod, has a timeout, retries once, then throws so the caller falls back.
3. `lib/ai/suggest.ts`: `generateSuggestion(...) => Promise<SuggestionDraft>`, Gemini first, then `fallbackSuggestion`. Prompt rules are in DESIGN §9.1.
4. `lib/ai/reviews.ts`: `classifyReviews(reviews, listing) => Promise<ReviewClassification>` (DESIGN §9.2). Lane C calls it from rule 3.
5. `lib/ai/intent.ts`: `parseIntent(suggestion, transcript) => Promise<IntentResult>` (DESIGN §9.3). Lane B calls it.

Done when: Café Aura gets four readable suggestions in EN and FI, and the app still works with `GEMINI_API_KEY` empty.

## Lane B – Voice + integration lead

Files you own: `lib/voice/*`, `app/api/suggestions/[id]/tts`, `app/api/voice/reply`, `components/VoiceButton.tsx`, deploy config

1. **H0: Create the MongoDB Atlas cluster** and share the URI. Each person sets their own `MONGODB_DB` (e.g. `ajantasa_c`) so we don't overwrite each other's data.
2. Integration: review and merge PRs, keep `main` runnable, and run the full demo flow after every merge.
3. **Test ElevenLabs Finnish quality early** (DESIGN §10). Decide EN or FI for the demo by ~H12.
4. `lib/voice/tts.ts` + `POST /api/suggestions/[id]/tts`: generate audio once and cache it (`audio_url` / base64 in Mongo).
5. `lib/voice/stt.ts` + `POST /api/voice/reply`: multipart audio → transcript → `parseIntent` (lane A) → `VoiceReplyResponse`.
6. `components/VoiceButton.tsx`: 🔊 Play + 🎙️ hold-to-record (MediaRecorder). Props: `{ suggestionId, onIntent(result: VoiceReplyResponse) }`. Lane D places it in the card.
7. M8: polish, loading states, pre-generated fallback audio, Vercel deploy, demo rehearsal.

## Lane C – Detection + dashboard

Files you own: `lib/holidays.ts`, `lib/rules/*`, `app/api/detect`, `app/api/businesses/route.ts`, `app/dashboard/*`

1. **First, by ~H4: rule 1 + `/api/detect`**, so issues show up in the DB.
2. `lib/holidays.ts`: the hardcoded holiday list (DESIGN §8).
3. One file per rule, each a pure `Rule` (`types/api.ts`): `missingHolidayHours.ts`, `crossPlatformConflict.ts`, `staleField.ts`. No DB, no `new Date()`; use `ctx.today`.
4. `lib/rules/index.ts`: `runDetection(businessId?)` loads the data, runs the rules, skips fingerprints that are ignored (`preferences`) or already `open`/`suggested`, inserts the new issues, and returns `DetectResponse`.
5. Expected results with the seed data, `DEMO_DATE=2026-12-10`: see the comments in `data/seed.ts`. Leipomo Martti must produce **0** issues. Write a small test script that checks this.
6. `GET /api/businesses` → `BusinessesResponse`.
7. `/dashboard`: table (name, category, issues by severity, last decision), a **Run daily check** button (`/api/detect` then `/api/suggest`), and each row links to `/owner/[id]`.
8. M6: `reviewSignal.ts`. This one is async and calls lane A's `classifyReviews` on reviews from the last 30 days, so call it from `runDetection` separately rather than as a pure `Rule`.

## Lane D – Owner view + apply

Files you own: `lib/apply.ts`, `app/api/businesses/[id]`, `app/api/suggestions/[id]/decide`, `app/owner/*`, `components/NotificationCard.tsx`, `components/ChannelSyncRow.tsx`

1. **Start with the UI using hardcoded mock data** typed as `OwnerViewResponse`. Switch to the real API once lanes A and C land (~H4).
2. `GET /api/businesses/[id]` → `OwnerViewResponse`.
3. `lib/apply.ts` + `POST /api/suggestions/[id]/decide` (DESIGN §11):
   - `accepted`/`edited`: write the value to all 3 listings, update `field_updated_at`, set the issue to `resolved`.
   - `ignored`: set the issue to `ignored` and push the fingerprint to `preferences.ignored_fingerprints`.
4. `/owner/[businessId]`, mobile first, ~390px wide (DESIGN §12): greeting header, a stack of `NotificationCard`, before → after view, confidence badge, ✅ ✏️ ❌ buttons, and the empty state.
5. The Edit flow: show an editable value, then a final confirm tap. Voice edits from lane B reuse the same confirm step.
6. `ChannelSyncRow`: Finder / Google / Website turn green after a decision.
7. Leave a slot in the card for `<VoiceButton>` (lane B).

---

## Timeline (H = hours since start)

| When | Checkpoint |
|---|---|
| H0–1 | Everyone reads DESIGN.md and this file. B shares the Atlas URI. Everyone runs `npm i && npm run dev` and `POST /api/seed`. |
| **H4** | C: rule 1 + `/api/detect`. A: fallback `/api/suggest`. Then D switches from mock data to real data. |
| **H10** | **M1–M4 work end to end on `main`** (seed → detect → suggest → owner accepts → listings synced) |
| H16 | M5 dashboard + Gemini suggestions live |
| H24 | M6 review signal |
| H32 | M7 voice working |
| **H40** | **Feature freeze.** Bugs and polish only. |
| H44 | Demo rehearsal (DESIGN §16), record a backup video |

If we fall behind, cut from the bottom: M8 → M7 → M6. M1–M5 is the minimum demo.

## Git workflow

- One branch per task: `a/gemini-wrapper`, `c/rule-1`, `d/owner-cards`, … Keep PRs small, and merge to `main` often (at least every few hours).
- Before opening a PR: `npx tsc --noEmit && npm run lint`, and check that `npm run dev` still works.
- B merges. If B is busy, anyone can merge a green PR that only touches their own lane's files.
- Shared files (`types/*`, `data/seed.ts`, `lib/db.ts`, `package.json`): small separate PR, and say so in chat.
- Never commit `.env.local` or API keys.

## Rules that apply to everyone (also for Copilot / free AI users)

- **Next.js 16** has breaking changes compared with what most AIs were trained on. Read `AGENTS.md`. In particular:
  - route `params` is a **Promise**: `const { id } = await ctx.params`
  - `next.config.ts` has `cacheComponents: true`. **Simplest pattern for us:** pages are `"use client"` components that `fetch('/api/...')`; all DB access lives in route handlers. Then you avoid Suspense/caching errors.
- DB access only through `collections()` from `lib/db.ts`, and only on the server.
- Code detects, AI explains, the human decides. The LLM never compares dates or numbers.
- Gemini/ElevenLabs only through `lib/ai` / `lib/voice`, with a fallback. Never call them from the browser.
- Mock data only. No features outside DESIGN.md without asking the team.
