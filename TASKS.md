# Ajantasa – Team task split

4 people, 4 lanes. Every lane owns its own files, so we rarely touch the same file.
OpenCode and Codex read `AGENTS.md` automatically (OpenCode also loads DESIGN.md, this file and CONTRIBUTING.md via `opencode.json`). Claude Code reads `CLAUDE.md`.

**Goal (Fonecta, DESIGN §0): the whole five-step chain working: Detect → Suggest → Contact → Decide → Apply (Yext).** A complete chain beats a perfect single step.

| Lane | Who | AI tools | Steps / milestones | Theme |
|---|---|---|---|---|
| **A – AI** | Claude Pro #1 | Claude Code | Suggest (M3), Learn (M6), scoring adapter (M7) | Gemini, prompts, fallbacks, customer messages |
| **B – Apply + integration** | Claude Pro #2 | Claude Code | Apply/Yext (M5), voice (M9), submission | Yext sandbox, Atlas, end-to-end, demo, deliverables |
| **C – Detect + validation** | Teammate #3 | OpenCode (free models) or ChatGPT Codex | Detect (M2), validation (M3), dashboard (M8), dataset import (M7) | Deterministic code |
| **D – Contact + Decide** | Teammate #4 | OpenCode (free models) or ChatGPT Codex | Contact + Decide (M4), apply/learn wiring (M5/M6) | Mobile UI, Accept/Edit/Ignore |

Lanes C and D are deterministic code with clear specs (good for free models). Lanes A and B use external APIs and prompts (hard tasks, CONTRIBUTING.md §5).

**Contracts** between lanes are in **`types/api.ts`** and **`types/index.ts`**: API shapes, issue `evidence` per type (C → A, D), `proposed_change` per field (A → D), `ValidateSuggestion` (C → A), `PublishChange` / `YextPublishResult` (B → D), `LearnedDecision` / `StandingPermission` (D writes, A reads).

**Fonecta dataset received, and the app moves onto it (DESIGN §0 "v2", stages in "v2: dataset" below).** Unzip it to `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/` (not committed). The scorer reads a `predictions_2026.csv` file (DESIGN §9.5). **Yext sandbox: confirmed** (DESIGN §10b). **WhatsApp is a valid Contact channel.** **The demo is in English.** Stages marked **TBD** start when we know more; everything else can start now.

---

## Getting started (humans: just do this)

1. Accept the GitHub invite, then clone: `git clone git@github.com:fpauly/sinceai2026.git && cd sinceai2026`
2. **`npm run setup`**: asks your lane and sets up everything (`.env.local`, database, checks). Follow what it prints.
3. Unzip Fonecta's dataset to `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/` in your clone (download link in the team chat; never commit it).
4. `npm run dev` and open **http://localhost:3000**: the **progress board** shows what the team has built so far.
5. Open your AI (Claude Code, OpenCode or Codex) in this folder and type **`next`**.
   **Codex users:** Codex's sandbox may block network access by default. If `npm install`, `git push` or `gh` fail inside Codex, allow network access when it asks, or enable it in Codex's settings.

The AI builds the next stage of your lane, tests it, opens a PR and tells you what to look at (CONTRIBUTING.md §9).
**You check it** (progress board, the page it names). Looks right → type **`merge`**. Something wrong → tell the AI what you saw.

---

## Stages per lane

Each stage = one branch = one PR, about 1–2 hours. Do them **in order**. "Needs" = wait until that stage is merged on `main` (`gh pr list --state merged`, or the progress board). If a stage is blocked, do the next unblocked one.
**[shared]** = touches shared files: merge it fast and tell the team.

### Lane A – AI (Gemini)

Files you own: `lib/ai/*`, `app/api/suggest/route.ts`, `scripts/predict.*` + `predictions_2026.csv` (scoring), `scripts/export-messages.mjs`, `docs/customer-messages.md`, `docs/no-history.md`

| Stage | Branch | What | Needs | Done when |
|---|---|---|---|---|
| **A1** [shared] | `a/gemini-sdk` | Add the official Google Gen AI JS SDK to `package.json` (check the current docs for the package name; licence must not be GPL/AGPL). Nothing else. **Merge in the first hour; B's dependency PRs wait for it.** | – | PR merged |
| **A2** | `a/fallback-suggest` | `lib/ai/fallback.ts`: `fallbackSuggestion(business, issue, listings, prefs)` → `SuggestionDraft`, one template per issue type, EN (demo language) + FI, in Fonecta Connect's voice. The proposal comes from evidence only (copy last year's holiday hours; most recently updated source for a conflict; majority value for phone). **No history** → the category's common pattern, confidence `low`, message phrased as a question. `POST /api/suggest[?businessId=]`: for each `open` issue, create a `Suggestion` (`source: "fallback"`), set the issue to `suggested`, and return `SuggestResponse`. If C3 has landed, run `validateSuggestion` and store `validation`. **Target ~H4.** | – | Board M3 "POST /api/suggest" green; after C1, "Suggestions generated" green |
| **A3** | `a/gemini-wrapper` | `lib/ai/gemini.ts`: the single wrapper. It reads `GEMINI_API_KEY`/`GEMINI_MODEL`, requests JSON output, validates with zod, has a timeout, retries once, then throws. | A1 | A valid JSON call works; an empty key throws cleanly |
| **A4** | `a/gemini-suggest` | `lib/ai/suggest.ts`: Gemini first (prompt rules DESIGN §9.1), then `validateSuggestion`; if invalid or on error → fallback. Store `source` + `validation`. | A2, A3, C3 | Rye & Shine gets valid, readable English suggestions (FI also filled) that name their data; works with the key empty |
| **A5** | `a/learning` | Feed `preferences.learned` + `standing_permissions` into the prompt and the fallback (use the owner's last edit). In `/api/suggest`: a **valid** suggestion that matches a standing permission is applied right away via D's `applyDecision` (`decision: "auto"`). | A4, D5 | Edit Boxing Day to 11:00 → reset issues → next suggestion proposes 11:00; with standing permission it auto-applies |
| ~~A6~~ | – | **Replaced by v2 stage A10** (`lib/predict` + `predictions_2026.csv`), see "v2: dataset" below. | – | – |
| **A7** | `a/docs-messages` | `docs/customer-messages.md` (final messages as text, exported from real suggestions) + `docs/no-history.md`. | A4 | Files exist and match the demo |
| A8 (extra) | `a/review-classifier` | `lib/ai/reviews.ts` `classifyReviews` (DESIGN §9.2) with fallback `{signal:false}`. | A3 | Rye & Shine and Pizzeria → signal |
| A9 (extra) | `a/intent` | `lib/ai/intent.ts` `parseIntent` (DESIGN §9.3) with fallback `unclear`. | A3 | "yes" / "ignore it" / "yes but 11 on the 26th" parse correctly |

### Lane B – Apply (Yext) + integration lead

Files you own: `lib/yext/*`, `lib/voice/*`, `app/api/suggestions/[id]/tts`, `app/api/voice/reply`, `components/VoiceButton.tsx`, `README.md` (submission parts), deploy config

| Stage | Branch | What | Needs | Done when |
|---|---|---|---|---|
| **B1** (no code) | – | **H0:** create the free MongoDB Atlas cluster, allow network access, post the URI in the team chat. Get the Gemini key. **Ask Fonecta (Discord, or Joki Sat 9–12) about the Yext sandbox, the dataset and the scoring script**, and post the answers. | – | Board M1 green against Atlas; answers in chat |
| **B2** | `b/yext-client` | `lib/yext/index.ts` `publishChange` (stub already exists; keep its signature): write holiday hours / opening hours to the entity in our Yext sandbox, with a timeout and never throwing. `published_to` = where it shows. A small script `scripts/yext-check.mjs` reads one entity to prove access. | B1 (access confirmed, DESIGN §10b) | A real change is visible in the Yext sandbox UI |
| **B3** | `b/yext-reset` | Map our businesses to Yext entities (`yext_entity_id`): Rye & Shine Bakery is already mapped (`yext_entity_id: "SinceAI03"` in the seed). Add a reset script `scripts/yext-reset.mjs` that restores the entity to its original state (DESIGN §10b) before the demo. | B2 | Accepting Rye & Shine's suggestion updates the Yext entity; reset restores it; board step 5 green |
| **B4** | `b/submission-readme` | README: how to run, data sources, **libraries and licences** (`npx license-checker --summary`), architecture (the loop and extensibility), links to the docs. | M5 | README covers DESIGN §18 |
| **B5** | `b/deploy` | Vercel deploy with Atlas, plus a demo reset. | M5 | Judges can open the URL |
| B6 (extra) [shared] | `b/elevenlabs-sdk` | Add the ElevenLabs JS SDK to `package.json` only. | A1 | PR merged |
| B7 (extra) | `b/tts` | `lib/voice/tts.ts` + `POST /api/suggestions/[id]/tts`, cached; "Connect calls you" on the contact preview. English voice (the demo is in English). | B6, D4 | Board "tts" green; audio plays |
| B8 (extra) | `b/voice-reply` | `lib/voice/stt.ts` + `POST /api/voice/reply` + `VoiceButton`; one-line PR into D's card after asking D. | B7, A9 | Say "yes" → the confirm step shows |
| **B9** | – | Pitch deck, 2–3 min video (DESIGN §16), final submission (DESIGN §18). | M1–M6 | Submitted |

Ongoing for B: after merges, run the full demo flow on `main`. If `main` breaks, fixing it comes before new work.

### Lane C – Detect + validation

Files you own: `lib/holidays.ts`, `lib/rules/*`, `lib/validate.ts`, `app/api/detect`, `app/api/businesses/route.ts`, `app/dashboard/*`, the dataset importer (`scripts/import-fonecta.*`), `docs/data-sources.md`

| Stage | Branch | What | Needs | Done when |
|---|---|---|---|---|
| **C1** | `c/rule-holidays` | `lib/holidays.ts` (DESIGN §8 list); `lib/rules/missingHolidayHours.ts` (pure `Rule`); `lib/rules/index.ts` with `runDetection(businessId?)`: it loads the data, runs the rules, skips fingerprints that are ignored or already open/suggested, inserts the new issues, and returns them; `POST /api/detect[?businessId=]` → `DetectResponse`. **Target ~H4, unblocks A and D.** | – | `npm run smoke`: the holiday issues pass; second run creates 0 |
| **C2** | `c/rule-conflict` | `lib/rules/crossPlatformConflict.ts`: `opening_hours.<day>` and `phone` differ between sources. | C1 | smoke: conflict issues pass |
| **C3** | `c/validate` | `lib/validate.ts`: `validateSuggestion` (type `ValidateSuggestion`, DESIGN §9.4). Pure code, with a test script covering good and bad drafts (bad hours format, close before open, invented dates, a value not seen in any source). | – | Test script passes; A uses it |
| **C4** | `c/rule-stale` | `lib/rules/staleField.ts`: `field_updated_at` > 365 days before `ctx.today`. | C1 | smoke: all 8 issues pass, Leipomo has 0 |
| **C5** | `c/data-sources-doc` | `docs/data-sources.md`: our 3–5 key data sources (holiday calendar, last year's hours, cross-channel listings, reviews, owner decisions), where Connect would get them in production, and what didn't work. | C4 | Doc reviewed by the team |
| ~~C6~~ | – | **Replaced by v2 stage C10** (dataset importer), see "v2: dataset" below. | – | – |
| **C7** | `c/dashboard` | `GET /api/businesses` (`await connection()`) + `/dashboard` (`"use client"`): table, **Run daily check** (`/api/detect` then `/api/suggest`), rows link to `/contact/[id]`. | C1 | Board M8 complete |
| C8 (extra) | `c/live-holidays` | Bonus: holidays from a live public source instead of the hardcoded list (keep the list as a fallback); write what we learned in `docs/data-sources.md`. | C1 | Detection still passes smoke |
| C9 (extra) | `c/review-signal` | `lib/rules/reviewSignal.ts` (async): last 30 days of reviews → A's `classifyReviews`. | A8 | Rye & Shine + Pizzeria get `review_signal` |

**C acceptance test** (checked automatically by `npm run smoke`). After `POST /api/seed` then `POST /api/detect` with `DEMO_DATE=2026-12-10`, rules 1, 2 and 4 must create exactly these **8 issues**. Evidence shapes and fingerprints are in `types/api.ts`.

| Business | Type | Key evidence |
|---|---|---|
| rye_shine | missing_holiday_hours | dates `2026-12-24, 12-25, 12-26, 2027-01-01, 2027-01-06`; last_year has `2025-12-24/25/26, 2026-01-01, 2026-01-06` |
| rye_shine | cross_platform_conflict | field `opening_hours.sat` (website `10:00-14:00`, updated 2026-10-20, vs finder/google `10:00-18:00`) |
| rye_shine | stale_field | field `description` (oldest 2023-05-01) |
| parturi_linnankatu | missing_holiday_hours | dates `2026-12-24, 12-25, 12-26, 2027-01-01, 2027-01-06`; last_year `{}` (**no-history case**) |
| autokorjaamo_skanssi | cross_platform_conflict | field `phone` |
| kukkakauppa_kauppatori | stale_field | field `opening_hours` (oldest 2024-05-14) |
| kirjakauppa_aurajoki | cross_platform_conflict | field `opening_hours.sat` |
| kuntosali_itaharju | missing_holiday_hours | dates `2027-01-01` |

pizzeria_port_arthur and leipomo_martti: **0** issues. A second `/api/detect` creates **0** new issues. "Within the next 30 days" means `today < date <= today + 30`.

### Lane D – Contact + Decide

Files you own: `lib/apply.ts`, `app/api/businesses/[id]`, `app/api/suggestions/[id]/decide`, `app/contact/*`, `app/owner/*`, `components/NotificationCard.tsx`, `components/ChannelSyncRow.tsx`

| Stage | Branch | What | Needs | Done when |
|---|---|---|---|---|
| **D1** | `d/owner-ui-mock` | `/owner/[businessId]` (`"use client"`, ~390px) with **hardcoded mock data** typed as `OwnerViewResponse` in `app/owner/[businessId]/mock.ts`: greeting ("Hi Liisa!"), all text in English, `NotificationCard` stack (title, message, **why + the data**, confidence badge with "please check" when low, before → after, ✅ ✏️ ❌ that only log for now, "Do this automatically next time" checkbox), empty state "Everything is up to date ✅". | – | Board "Owner page" green; looks right at phone width |
| **D2** | `d/owner-api` | `GET /api/businesses/[id]` → `OwnerViewResponse` (`await connection()`; undecided suggestions + their issue). The page uses it instead of the mock. | D1 (real data after A2 + C1) | After seed → detect → suggest, Rye & Shine shows real cards; Leipomo shows the empty state |
| **D3** | `d/apply-decide` | `lib/apply.ts` `applyDecision(...)` + `POST /api/suggestions/[id]/decide` (DESIGN §11): accepted/edited → `publishChange` (from `lib/yext`, a stub until B2) + merge into all 3 listings + `field_updated_at` + issue `resolved` + store `applied`. Ignored → issue `ignored` + fingerprint remembered. Wire ✅ and ❌. Export `applyDecision` so A5 can reuse it. | D2 | Board M4 decide green; ignored issue does not come back |
| **D4** | `d/contact-preview` | `/contact/[businessId]`: phone-shaped frame with the simulated **WhatsApp chat** from Fonecta Connect (SMS/email optional) (what, **why**, the data), and a no-login link "Review in 10 seconds →" to `/owner/[id]`. | D2 | Board "Contact page" green |
| **D5** | `d/edit-learn` | ✏️ Edit with a final confirm tap → `decision: "edited"`. In `applyDecision`: append `LearnedDecision` to `preferences.learned`; if the checkbox was ticked, add a `StandingPermission`. The confirm step is reusable for voice (B8). | D3 | Edit holiday hours → confirm → listings updated, `learned` has the entry |
| **D6** | `d/where-it-shows` | `ChannelSyncRow`: after a decision show **"Published via Yext to: …"** from `applied.published_to`, channels turning green one by one, with an honest message when Yext was not reached. Leave a slot for `<VoiceButton>`. | D3 | Looks good in the demo flow |

---

## v2: dataset (DESIGN §0 "v2")

The app moves from our invented seed to Fonecta's dataset. **The current chain keeps working on the seed until V2 switches the demo.**

### Queue per lane: what `next` picks (in this order)
`next` takes the **first item of your lane's queue that is not merged** and whose **Needs** are merged; if it is blocked, it takes the next one (CONTRIBUTING.md §9). Stage details are in the table below or in the lane tables above. v1 stages that are not in a queue are paused or replaced.

| Lane | Queue |
|---|---|
| **A** | V0 → **V1** → A10 → A11 → A5 (needs D5) → A12 |
| **B** | **B10** (needs V1) → V2 → B4 README (use the dataset's `docs/README_TEMPLATE.md`) → B5 deploy → B9 pitch + video · extras: B7, B8 |
| **C** | **C10** (the extract script can start before V1; the seed route needs V1) → C12 → C11 → C13 → C7 dashboard (also lists `needs_human` flags) → C5 data sources (the dataset's sources) → C8 bonus: replace `calendar_special_days.csv` with a live holiday API · extra: C9 |
| **D** | **D5** (unchanged, start now) → D10 → D6 "where it shows" (publishers + typical update speed from B10) |

Before every stage, also check your lane's open GitHub issues (`gh issue list`); fix those first if they are not blocked.
Every clone needs the dataset unzipped at `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/` (not committed) for C10 and A10.

### v2 stages

| Stage | Lane | Branch | What | Needs | Done when |
|---|---|---|---|---|---|
| **V0** [shared] | A | `shared/fonecta-dataset` | This design (DESIGN §0 v2, §9.5, §18) | – | Merged with a teammate's OK |
| **V1** [shared] | A | `shared/v2-contracts` | `types/`: business with country, segment, contact (first name, channel EMAIL/SMS/WHATSAPP/APP_PUSH, language fi/sv/nb/en, contact window, standing permission, opted out); one published profile (regular week + entered exceptions); special day; exception history row; peer row; publisher; issue types `special_day_hours` + `needs_human` with their evidence; messages `en` + owner's language. `lib/hours.ts`: parse / format / compare multi-interval and past-midnight hours, convert to and from Yext. | V0 | `npm run check` green; old seed chain still works |
| **A10** | A | `a/predict` | `lib/predict/` (pure): one business + one special day → `SUGGEST` + hours + basis + confidence, `NO_ACTION` or `FLAG`. Order: owner's past edit → last year's exception → shopping centre → peers → regular. `scripts/predict.*` runs it on the full dataset → `predictions_2026.csv`. | V0 | `evaluate.py` on dev beats the baseline (54.5), checked on the 2025 back-test too |
| **C10** | C | `c/fonecta-import` | `scripts/import-fonecta.*` builds `data/fonecta/demo.json` (17 demo businesses + 15 centres: entities, exception history, contacts, publishers, calendar FI/SE/NO, peer rows for their segments; committed). `/api/seed?source=fonecta` loads it into MongoDB (the old seed stays the default until V2). | V1 | Seeded DB has the 17 demo businesses with profiles and contacts |
| **C11** | C | `c/rule-special-days` | Detection v2: for each special day 7 Nov 2026 – 6 Jan 2027 in the business's country, call `lib/predict`; `SUGGEST` → `special_day_hours` issue with evidence (date, day, what Google shows, proposal, basis, confidence); `FLAG` → `needs_human` issue. | C10, A10 | `FI-D0013` and `NO-D0015` get 0 issues, `FI-D0011` is flagged, `FI-D0001` and `FI-D0017` get suggestions |
| **C12** | C | `c/validate-v2` | `validateSuggestion` for multi-interval / past-midnight hours, the issue's date only, at most 2 sentences + the "We suggest" line, both languages present. | V1 | `validate-check` covers the new cases |
| **A11** | A | `a/suggest-v2` | Template + Gemini for `special_day_hours`, Fonecta's message style, `en` + owner's language (fi/sv/nb); no message when opted out. | V1, C11 | `FI-D0001` message names what Google shows and last year's hours; `SE-D0008` has Swedish; all valid |
| **B10** | B | `b/yext-v2` | Yext write with multi-interval hours; sandbox entity `SinceAI03` set up as Kahvila Aurora (`FI-D0001`'s address and regular hours); reset script restores that; "where it shows" from the business's publishers with typical update speed. | V1 | Accepting Aurora's suggestion writes to the sandbox; confirmation lists her publishers and speeds |
| **D10** | D | `d/contact-v2` | Contact preview and owner view use the business contact: first name, channel, language; opted out → "not contacted"; standing permission → "applied, you were informed"; one message bundles a business's dates; `needs_human` is not shown to the owner. | V1, C11 | Aurora's bundled message shows on her channel; `FI-D0012` shows the applied state |
| **C13** [shared] | C | `shared/smoke-v2` | New acceptance table in `scripts/smoke.mjs` for the demo cast (DESIGN §0 v2). | C11 | `npm run smoke` green on v2 |
| **V2** [shared] | B | `shared/v2-switch` | Switch the demo: `DEMO_DATE=2026-11-06`, `/api/seed` defaults to the dataset, DESIGN §16 demo script rewritten for the new cast, old rules and seed retired from the demo run. | C13, A11, B10, D10 | Whole chain works on `main` with the dataset |
| A12 | A | `a/docs-v2` | Re-export `docs/customer-messages.md` (all languages + approve / edit / decline follow-ups) and rewrite `docs/no-history.md` around `FI-D0017` (#26). | V2 | Docs match the v2 demo |

---

## Timeline (H = hours since start)

| When | Checkpoint |
|---|---|
| H0–1 | Everyone: `npm run setup`. A1 merged. B1: Atlas URI shared, questions sent to Fonecta. |
| **H4** | C1 + A2 merged → D2 uses real data |
| **H12** | **Steps 1–4 work end to end on `main`** (detect → suggest+validate → contact → decide) |
| **H18** | **Step 5: Yext apply → whole chain works** (minimum demo) |
| H24 | Learning + standing permission; Fonecta dataset/scoring adapter if known |
| H32 | Dashboard, docs, extras (voice, review signal, live source) |
| **H40** | **Feature freeze.** Bugs, polish, README, docs. |
| H44 | Record the 2–3 min video, finish the deck, submit (DESIGN §18) |

If we fall behind, cut from the bottom: extras → dashboard → learning. **Never cut a chain step.**

## Git workflow and rules

See **`CONTRIBUTING.md`**: branches, commits, PRs, conflicts, escalation, local testing, and the AI autopilot (§9).

Technical rules for everyone (also OpenCode / Codex / free models):
- **Next.js 16** has breaking changes compared with what most AIs were trained on (see `AGENTS.md`). Route `params` is a **Promise** (`const { id } = await ctx.params`). `cacheComponents` is on: pages are `"use client"` components that `fetch('/api/...')`; all DB access lives in route handlers; GET handlers start with `await connection()`.
- DB access only through `collections()` from `lib/db.ts`, server-side only.
- Code detects, AI explains, the human decides. The LLM never compares dates or numbers; every suggestion is validated by code.
- Gemini / Yext / ElevenLabs only through `lib/ai` / `lib/yext` / `lib/voice`, with a fallback. Never call them from the browser.
- No GPL/AGPL dependencies. Mock or Fonecta data only. No features outside DESIGN.md without asking the team.
