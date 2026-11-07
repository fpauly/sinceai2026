# Lane C handover — Detect + validation

> Written 2026-11-07 by the lane C agent (OpenCode). Read this first, then `DESIGN.md` §0/§8/§9.4,
> the lane C table in `TASKS.md`, and `CONTRIBUTING.md`. Those three are the source of truth; this
> file only records where lane C stands and what I learned while building it.

## 1. Status at a glance

| Stage | Branch | PR | State |
|---|---|---|---|
| C1 `missing_holiday_hours` | `c/rule-holidays` | #19 | **merged** |
| C2 `cross_platform_conflict` | `c/rule-conflict` | #22 | **merged** |
| C3 `validateSuggestion` | `c/validate` | #17 | **merged** (A4 already uses it) |
| C4 `stale_field` | `c/rule-stale` | #24 | **open, CI green, waiting for `merge`** |
| C5 `docs/data-sources.md` | — | — | not started |
| C7 dashboard | — | — | not started |
| C6 dataset import | — | — | blocked (TBD, needs Fonecta's format) |
| C8 live holiday source | — | — | not started (extra) |
| C9 `review_signal` rule | — | — | not started (extra; A8's `classifyReviews` is already merged) |

With C4 merged, **the lane C acceptance table is complete**: seed + detect creates exactly the
8 issues in `TASKS.md`, and the smoke test reports 14 passed / 0 failed / 0 skipped.

**Open PRs at handover** (not mine to judge, just so you know the tree is busy):

- `#24 c/rule-stale` — this lane's C4, ready to merge.
- `#28 d/apply-decide`, `#27 a/message-names-data` — other lanes.

## 2. Set up in 5 minutes

1. `npm run setup`, pick lane **C**. That fills `.env.local`:
   `AJANTASA_LANE=C`, your own `MONGODB_DB` (I used `ajantasa_c`), `DEMO_DATE=2026-12-10`,
   `DEMO_LANGUAGE=en`. Never commit `.env.local`.
2. `npm run dev` — **one** dev server. During this work it was running on port 3001, so every
   command below uses `SMOKE_URL=http://localhost:3001`; on the default port just run `npm run smoke`.
3. `SMOKE_URL=http://localhost:3001 npm run smoke` — it calls `/api/seed` first, which **wipes
   your DB**, so always keep your own `MONGODB_DB`.
4. `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/validate-check.mjs` — the C3 test
   (28 cases, no build needed).

## 3. What exists in lane C

| File | What it does |
|---|---|
| `lib/holidays.ts` | The six hardcoded holidays (EN + FI names) and pure calendar helpers: `addDays`, `lastYearDate`, `upcomingHolidays(today, 30)` (window `today < date <= today+30`), `holidayOn`. No clock: callers pass `today`. |
| `lib/rules/missingHolidayHours.ts` | Rule 1. One issue per business grouping every upcoming holiday no channel has hours for. Evidence `{ dates, holiday_names, last_year }`; `last_year` comes from the most recently updated listing, `{}` when there is no history (parturi case). |
| `lib/rules/crossPlatformConflict.ts` | Rule 2. One issue per field where sources disagree: all seven `opening_hours.<day>` plus `phone`. Evidence `{ field, values: [{ source, value, updated_at }] }`; `updated_at` is that channel's `field_updated_at.opening_hours`, `null` for phone (not tracked). |
| `lib/rules/staleField.ts` | Rule 4. One issue per tracked field (`opening_hours`, `holiday_hours`, `description`) whose update is **strictly** more than 365 days before `ctx.today`. Evidence `{ field, oldest_update, days_old, stale_sources, current_value }`. |
| `lib/rules/index.ts` | `rules` array + `runDetection(businessId?)`: loads data once, runs every rule, skips ignored fingerprints and issues already `open`/`suggested`, inserts the rest. Rules are tried one by one: a throwing rule is logged and skipped, the daily check continues. |
| `lib/validate.ts` | `validateSuggestion(draft, issue, listings)` typed as `ValidateSuggestion` (DESIGN 9.4). Pure, LLM-free, no clock. This is the answer to "how are wrong suggestions prevented?". |
| `scripts/validate-check.mjs` | 28 good/bad cases for `validateSuggestion`, runs directly with Node 24. |
| `app/api/detect/route.ts` | `POST /api/detect[?businessId=]` → `DetectResponse`. No `connection()` needed (POST is always dynamic). |

`lib/holidays.ts` and the rules are lane C files. `scripts/validate-check.mjs` is a lane C test,
not part of `smoke.mjs`.

## 4. Contracts you must keep (shared, ask before changing)

- `types/api.ts` evidence shapes: `MissingHolidayHoursEvidence`, `CrossPlatformConflictEvidence`,
  `StaleFieldEvidence`, `ReviewSignalEvidence`. Lane A reads them in `lib/ai/fallback.ts` and in the
  Gemini prompt; lane D shows them in the owner view.
- **Fingerprints** (dedupe + "ignore forever"):
  - `${business_id}:missing_holiday_hours:${dates.join(",")}` (dates sorted)
  - `${business_id}:cross_platform_conflict:${field}`
  - `${business_id}:stale_field:${field}`
  - `${business_id}:review_signal:${type}`
  Changing a fingerprint resurrects issues the owner already ignored.
- `RuleContext`, `DraftIssue`, `Rule`, `DetectResponse`, `ValidateSuggestion` in `types/api.ts`.
- Issue lifecycle: rules create `open` issues → `/api/suggest` marks them `suggested` → a decision
  makes them `resolved` or `ignored` (lane D's `lib/apply.ts`). **Detection never closes an issue**
  — if a problem disappears on its own, the issue stays until a decision or `/api/seed`.

## 5. How detection works

```
POST /api/detect[?businessId=]
  → runDetection()                        lib/rules/index.ts
      load businesses (+ listings, reviews, preferences, open/suggested issues)
      today = demoDate()                  ← DEMO_DATE, never new Date()
      for each business (sorted by _id)
        for each rule in `rules`
          drafts = rule(ctx)              ← pure, sync, no DB/clock/network
          skip draft if ignored or already open/suggested
          insert { _id, ...draft, status: "open", created_at }
  → { ok: true, created: Issue[] }
```

Evidence must be **stable across runs** (arrays sorted by source/date): the same data must produce
byte-identical evidence, or dedupe and the demo story drift.

## 6. How validation works

`validateSuggestion` checks, in order:

1. draft shape: `reason`, `confidence` ∈ high/medium/low, `message.en` + `message.fi`;
2. `field` is one of the four fields **and** the field that issue type asks for
   (`missing_holiday_hours` → `holiday_hours`, conflict `opening_hours.<day>` → `opening_hours`,
   conflict `phone` → `phone`, `stale_field` → same field, `review_signal` by signal type);
3. value shape per field: holiday/opening hours objects with real dates / `mon..sun` keys, phone
   characters + 5–15 digits, non-empty description;
4. hours: `"closed"` or `HH:MM-HH:MM` with close after open;
5. holiday dates are **exactly** the issue's `evidence.dates` (nothing invented, nothing missing);
6. conflicts may only propose a value a source really shows (and only the conflicted day);
7. messages ≤ 2 sentences per language (dots between digits, e.g. `24.12.2026`, don't count).

Every problem is a short human-readable string in `problems[]`; A4 falls back to the template when
`ok: false`, and forces `confidence: "low"` if even the template fails (the owner then sees
"please check").

Adding a case: append to `cases` in `scripts/validate-check.mjs` with `ok: true` or
`ok: false, expect: "<substring of a problem>"`.

## 7. Acceptance test (what "done" means for lane C)

```
curl -X POST localhost:3001/api/seed
curl -X POST localhost:3001/api/detect      # → 8 created
curl -X POST localhost:3001/api/detect      # → 0 created
SMOKE_URL=http://localhost:3001 npm run smoke
```

| Business | Type | Detail |
|---|---|---|
| rye_shine | missing_holiday_hours | 5 dates; `last_year` 2025-12-24/25/26, 2026-01-01/06 |
| rye_shine | cross_platform_conflict | `opening_hours.sat` (website 10:00-14:00 @2026-10-20 vs 10:00-18:00) |
| rye_shine | stale_field | `description`, oldest 2023-05-01, 1319 days |
| parturi_linnankatu | missing_holiday_hours | 5 dates; `last_year: {}` (no-history case) |
| autokorjaamo_skanssi | cross_platform_conflict | `phone` |
| kukkakauppa_kauppatori | stale_field | `opening_hours`, oldest 2024-05-14, 940 days |
| kirjakauppa_aurajoki | cross_platform_conflict | `opening_hours.sat` |
| kuntosali_itaharju | missing_holiday_hours | `2027-01-01` only |

`leipomo_martti` → 0 issues. `pizzeria_port_arthur` → 0 (its `review_signal` arrives with C9).

## 8. Gotchas that cost me time

- **Typed evidence does not fit `DraftIssue`.** `Issue.evidence` is `Record<string, unknown>`, and an
  *interface* is not assignable to that. Build the object and use
  `const evidence = {...} satisfies MissingHolidayHoursEvidence;` — the inferred literal type is.
  This will bite C9 too.
- **`lib/validate.ts` must stay import-free at runtime.** `scripts/validate-check.mjs` imports the
  `.ts` file directly and Node 24 strips types, but it does not know the `@/` alias. Only
  `import type` there; that is why `DAY_KEYS` / `FIELD_KEYS` are local (each is typed as an
  exhaustive `Record<..., true>` so tsc catches a missing day/field).
- **Rules are sync.** `Rule = (ctx) => DraftIssue[]`. A8's `classifyReviews` is async, so C9 needs a
  small **shared PR** to `types/api.ts` (e.g. `Rule` may return a promise + `await rule(ctx)` in
  `runDetection`) before the rule can exist. Don't smuggle async into a rule.
- **Date maths only.** Rules never call `new Date()` for "now" — use `ctx.today`; use
  `addDays`/`lastYearDate` from `lib/holidays.ts` for arithmetic. `lastYearDate` handles 29 Feb.
- **Sort everything that goes into evidence.** Two runs must be byte-identical, otherwise a demo
  reset and a re-run produce new fingerprints and duplicated issues.
- **Detection is create-only.** Re-running does not update or close existing issues; that is
  `/api/suggest` + decisions (lane D). Ignored fingerprints live in `preferences`, so
  `npm run smoke` (which reseeds) clears them.
- **`scripts/smoke.mjs` is shared.** If you add a route and want it covered, change it in a
  `shared/*` PR (or agree with the lane owner); never weaken an existing check.
- **GitHub Actions runs only `tsc` + `lint` + `next build`** — smoke needs a DB, so "smoke passed"
  is on you; paste the output in the PR.
- There is no unique index on `issues.fingerprint` (read-then-insert). Fine for the demo; if you ever
  run detection in parallel, add one.

## 9. Remaining stages — concrete notes

### C5 `docs/data-sources.md` (docs only, do this next)
Five key sources, for each: what we use it for, where Connect gets it in production, what we could
not get. Suggested set:
1. **Holiday calendar** (Finnish public holidays) — now hardcoded in `lib/holidays.ts`; production:
   an official calendar (e.g. Digi- ja väestötietovirasto / Yext holiday hours) or an API like
   Nager.Date (check licence and availability at the venue). C8 can replace the list.
2. **Last year's hours** — from our own `listings.holiday_hours` (or Connect's history). Be honest
   that our seed plays this role.
3. **Cross-channel listings** — `lister`/Finder, Google Business Profile, the business website;
   production would read them through Yext/Connect instead of our mock `listings`.
4. **Reviews** — Google/Finder reviews; our `reviews` collection is mock text. A8 classifies them.
5. **Owner decisions** — `preferences.learned` / `standing_permissions`; in production the Connect
   CRM. Also say what did not work (no real Google/Finder scraping; no WhatsApp sending).

### C7 `c/dashboard` (the natural next code stage)
- `GET /api/businesses` — **must** start with `await connection()` (`next/server`); return
  `BusinessesResponse` (`BusinessSummary[]`): `open_issues` counted per severity for issues with
  status `open` **or** `suggested`, and `last_decision` = the newest suggestion with
  `decision !== null` (`{ decision, field, decided_at }`, else `null`). Sort by business name.
- `app/dashboard/page.tsx` — `"use client"`, fetch `/api/businesses`, table of name / category /
  open issues by severity / last decision, a **Run daily check** button that POSTs `/api/detect`
  then `/api/suggest` and refreshes, and a row link. `app/contact/[businessId]` does not exist yet
  (D4 is open) → link to `/owner/[businessId]` for now, or switch to contact once D4 merges.
- The progress board (`components/ProgressBoard.tsx`, shared) turns M8 green on its own once the
  route and page exist — you do not edit it.

### C6 `c/dataset-import` (blocked: TBD)
Wait for Fonecta's dataset format. Keep the importer behind one function (`data/seed.ts` stays the
fallback), and re-run the smoke test after importing: the acceptance table may need adjusting with
the team, which is a shared change.

### C8 `c/live-holidays` (extra)
Fetch a live holiday list with a timeout; keep `HOLIDAYS` as fallback; **cache** the result and keep
`upcomingHolidays` driven by `DEMO_DATE` so the demo stays deterministic. Write in
`docs/data-sources.md` what you learned (availability, licence, response shape). If the venue
network blocks the API, document that — it is a valid finding.

### C9 `review_signal` (extra)
A8 gives `classifyReviews(business, reviews, listings)` (async, and it returns `NO_SIGNAL` when
there is no Gemini key, no reviews, or any error — so without `GEMINI_API_KEY` this rule produces
nothing). Steps:
1. shared PR: allow an async rule (`Rule` may return `Promise<DraftIssue[]>`, `await` it in
   `runDetection`);
2. `lib/rules/reviewSignal.ts`: last 30 days of reviews (`ctx.today`), call `classifyReviews`, and
   only create an issue when `signal === true`: `closed_when_open` → `opening_hours`,
   `wrong_phone` → `phone`, `moved`/`other` → `description`; evidence
   `{ signal_type, summary, reviews }`, fingerprint `${id}:review_signal:${type}`;
3. register it and extend the smoke expectations for rye_shine and pizzeria_port_arthur — this
   **changes a shared file and the expected issue count**, so agree with the team first.

## 10. Useful commands

```bash
# C3 tests (28 cases, no server needed)
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/validate-check.mjs

# full lane C acceptance
curl -s -X POST localhost:3001/api/seed
curl -s -X POST localhost:3001/api/detect | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.created.length);j.created.forEach(i=>console.log(i.business_id,i.type,JSON.stringify(i.evidence)))})'
curl -s -X POST localhost:3001/api/detect | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("second run created", JSON.parse(s).created.length))'
SMOKE_URL=http://localhost:3001 npm run smoke

# one business only
curl -s -X POST "localhost:3001/api/detect?businessId=rye_shine"

# do the existing suggestions still pass validation? (A4 + your checks)
curl -s -X POST localhost:3001/api/seed >/dev/null
curl -s -X POST localhost:3001/api/detect >/dev/null
curl -s -X POST localhost:3001/api/suggest | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);j.created.forEach(x=>console.log(x.business_id,x.proposed_change.field,JSON.stringify(x.validation)))})'

# ignore path: an ignored fingerprint must not come back (replace the URI/DB reading as you like)
node --input-type=module -e '
import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()]}));
const c = new MongoClient(env.MONGODB_URI); await c.connect();
await c.db(env.MONGODB_DB).collection("preferences").updateOne({_id:"kuntosali_itaharju"},{$addToSet:{ignored_fingerprints:"kuntosali_itaharju:missing_holiday_hours:2027-01-01"}});
await c.close();'
# then POST /api/detect → 7 created (2 holiday + 3 conflict + 2 stale)
```

## 11. House rules that matter here

- One stage = one branch from freshly pulled `main` = one PR; `npm run check` before every push
  (the `pre-push` hook runs it; never `--no-verify`).
- Commit format `<lane>: <summary>`, no AI attribution, no co-author lines.
- Merge only when a human says `merge` for that PR; own-lane PRs you may merge yourself once CI is
  green, `shared/*` PRs need one other person's OK.
- `npx tsc --noEmit && npm run lint` plus the smoke run, and paste the real output in the PR.
- No GPL/AGPL dependencies. Mock data only. Nothing outside `DESIGN.md` without asking the team.
