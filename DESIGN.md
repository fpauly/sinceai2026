# Ajantasa – Design Document

> Hackathon project for the **Fonecta challenge** at Since AI Hackathon (Turku, 48 hours).
> Also submitted to the MLH prizes: **Best Use of Gemini API**, **Best Use of MongoDB Atlas**, **Best Use of ElevenLabs**.

This document is the single source of truth for what we are building. If something is unclear, prefer the simplest option that keeps the demo flow working end to end.

---

## 0. Challenge requirements (Fonecta kickoff, 2026-11-06)

These come from Fonecta's slides and **override everything below**.

**Build a working demo of the whole chain.** All five steps must be shown, and *a complete chain beats a perfect single step*. Great customer experience wins: it should be easy to act on, with clear value from **Connect** (Fonecta's product; Ajantasa is a feature of Connect).

| # | Step | Owner | Question the judges ask |
|---|---|---|---|
| 1 | **Detect** | Connect | What data tells Connect that the hours need to change? |
| 2 | **Suggest** | Connect | Which hours does Connect propose, and why exactly those? |
| 3 | **Contact** | Connect | How does the message reach the customer, and does it explain why? |
| 4 | **Decide** | Customer | Is saying yes easy (no login) and clearly worth it? |
| 5 | **Apply** | Connect | Is the change written to **our team's Yext sandbox**, and is the customer told where it shows? |

**Evaluation criteria:**
- **Suggestion quality:** sensible and backed by data? **A scoring script measures it on hidden test data.**
- **Customer experience:** does a busy entrepreneur get the message at once, and is approving easy?
- **Reliability:** does the customer always have the last word? How are wrong suggestions prevented?
- **Extensibility:** which similar use cases would the same loop serve? (Automatic posts and review replies are already live or on the roadmap.)
- **Learning:** is the next suggestion better after an edit or a decline? Can recurring changes get standing permission?
- **All five steps:** the demo must show the whole chain.

**Submit:** see section 18. **Licences:** no GPL/AGPL components without Fonecta's written approval.
**Help:** Fonecta Q&A point at Joki on Saturday 9–12, the Fonecta channel on the Since AI Discord, no Q&A on Sunday.

### Confirmed with Fonecta
- **WhatsApp is a valid communication channel** for step 3 (Contact). Our contact preview shows the message as a WhatsApp chat (simulated, section 12); SMS/email are alternatives.
- **Yext sandbox works** (tested read-only on 2026-11-06), details in section 10b.

### Open questions (waiting for Fonecta, marked **TBD** below)
1. **Dataset files** provided by Fonecta (format, fields), and whether to replace our mock data with them.
2. **Scoring script**: how it calls us (HTTP, function, file) and the exact input/output format for suggestions.
3. ~~Yext sandbox access~~ → answered, see section 10b.

Until these are answered, we build on our own mock data and keep the data shapes easy to adapt (one importer, one scoring adapter).

## 1. Problem

Small businesses (cafés, salons, repair shops) have their information on many channels: Fonecta's Finder, Google, their own website. Owners are busy and forget to update opening hours, holiday hours and descriptions. Customers arrive at locked doors, the business loses revenue and trust.

Today, keeping information up to date depends on the owner remembering to log in. The challenge asks us to turn this into a **proactive service**: detect what needs attention, recommend a sensible fix, and let the owner stay in control and respond in seconds.

## 2. Solution in one sentence

**Ajantasa** ("up to date" in Finnish) is a proactive feature of Fonecta Connect. It detects when a business's hours need to change, proposes the exact hours with the reasons, messages the owner, lets them accept, edit or ignore with one tap (no login), and then publishes the change through Yext. It learns from every decision.

## 3. Users

| User | Needs | Surface |
|---|---|---|
| **Business owner** (primary) | Hear about problems only when it matters; fix them in seconds; stay in control | Message preview (`/contact/[businessId]`) → mobile owner view (`/owner/[businessId]`), no login |
| **Fonecta support team** (secondary) | See the health of all businesses at a glance | Dashboard (`/dashboard`) |

Demo persona: **Liisa**, owner of **Café Aura** by the Aura river in Turku. Busy, never logs into anything.

## 4. Core flow (the five steps)

```
1. DETECT    Rule-based engine scans each business → Issues, each with the data that triggered it
2. SUGGEST   Gemini turns each Issue into a Suggestion (change + reason + confidence + message)
             → VALIDATE: deterministic code checks the proposal; if it fails → fallback template / low confidence
3. CONTACT   Connect sends a message (simulated WhatsApp; SMS/email as alternatives; optional voice via ElevenLabs) that explains why,
             with a no-login link to the owner view
4. DECIDE    Owner: Accept / Edit / Ignore with one tap (or voice). Optional "do this automatically next time"
5. APPLY     Accepted change is written to the Yext sandbox (+ our listings in MongoDB);
             the owner is told where it now shows (Google, Apple Maps, Finder, …)
   LEARN     Every edit/ignore is stored and used for the next suggestion; standing permissions skip step 4
```

**Design principle:** code detects, AI explains, the human decides.
- Never let the LLM compare dates, compute hours or decide whether data conflicts. That is deterministic code.
- Never apply an LLM proposal that fails validation (section 9.4).
- The LLM writes human-friendly suggestions, explanations and messages, analyses free-text reviews, and parses spoken replies.
- Nothing is ever changed without an explicit owner decision, or a standing permission the owner gave.

## 5. Scope

### In scope (must have)
- All **five steps** working end to end for the demo business (section 0)
- Mock businesses in Turku with 3 listing sources each (`finder`, `google`, `website`), replaced or extended by **Fonecta's dataset** once known (**TBD**)
- Detection rules (section 8), each recording the data that triggered it
- Gemini suggestions with structured JSON, plus a **validation layer** and fallback templates
- **Customer with no history:** sensible, clearly low-confidence suggestion that asks the owner instead of guessing (section 9.1)
- **Contact:** a message preview (simulated **WhatsApp** chat; SMS/email as alternatives) in Connect's voice that explains why, with a no-login link
- Owner view with Accept / Edit / Ignore
- **Apply to the Yext sandbox** (section 10b) and show where the change will appear
- **Learning:** remember edits and ignores, use them in the next suggestion; **standing permission** per change type
- Fonecta dashboard (minimal): list of businesses and a "Run daily check" button
- A **scoring adapter** exposing suggestions in the format of Fonecta's scoring script (**TBD**)

### Should have (extras, in this order)
- ElevenLabs voice: TTS of the message as a Contact channel, voice reply (STT → Gemini intent)
- Review signal rule (rule 3)
- Bonus: replace at least one dataset file with a **live source** (e.g. public holidays from a live API) and write down what we learned

### Out of scope (do NOT build)
- Real scraping or real APIs of Finder or Google (Yext is our one real write target)
- Real WhatsApp/SMS sending, push notifications or phone calls (simulated in the UI; WhatsApp Business API needs Meta approval)
- Authentication / user accounts (the no-login link is the owner's access)
- Any real business data (privacy: mock or Fonecta-provided data only)

## 6. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js (App Router) + TypeScript** |
| Styling | Tailwind CSS |
| Database | **MongoDB Atlas** via official `mongodb` Node driver |
| LLM | **Google Gemini API** via the official Google Gen AI JS SDK |
| Listings | **Yext** sandbox API (plain `fetch`, no SDK needed) |
| Voice | **ElevenLabs** Text-to-Speech and Speech-to-Text via the official ElevenLabs JS SDK |
| Hosting | Local for development; optional Vercel deploy for judges |

Check current official docs for SDK package names and model IDs before installing; do not hardcode model names, read them from env vars.
**Licences:** only MIT / Apache-2.0 / BSD / ISC-style dependencies. No GPL/AGPL (Fonecta rule).

### Environment variables (`.env.local`)

See `.env.example` (it explains which lane needs what). Main keys:
```
AJANTASA_LANE=           # A | B | C | D, set by npm run setup
MONGODB_URI=  MONGODB_DB=
GEMINI_API_KEY=  GEMINI_MODEL=
YEXT_API_KEY=  YEXT_ACCOUNT_ID=SinceAI03  YEXT_API_BASE=https://sbx-api.yextapis.com
ELEVENLABS_API_KEY=  ELEVENLABS_VOICE_ID=
DEMO_DATE=2026-12-10     # "today" for detection rules, so the demo is deterministic
DEMO_LANGUAGE=en         # en | fi
```

## 7. Data model (MongoDB collections)

All dates are ISO strings (`YYYY-MM-DD`). Hours are strings `"HH:MM-HH:MM"` or `"closed"`.
TypeScript types: `types/index.ts` (data) and `types/api.ts` (contracts between lanes). **May change once Fonecta's dataset format is known.**

### `businesses`
```json
{
  "_id": "cafe_aura",
  "name": "Café Aura",
  "owner_name": "Liisa",
  "category": "cafe",
  "city": "Turku",
  "preferred_channel": "voice",
  "language": "fi",
  "yext_entity_id": null
}
```
`yext_entity_id`: the matching entity in our Yext sandbox (TBD how we map them).

### `listings` (one document per business per source)
```json
{
  "_id": "cafe_aura:google",
  "business_id": "cafe_aura",
  "source": "google",
  "opening_hours": {
    "mon": "08:00-18:00", "tue": "08:00-18:00", "wed": "08:00-18:00",
    "thu": "08:00-18:00", "fri": "08:00-20:00", "sat": "10:00-16:00", "sun": "closed"
  },
  "holiday_hours": { "2025-12-24": "08:00-14:00" },
  "phone": "+358 2 123 4567",
  "description": "Cozy café by the river.",
  "field_updated_at": {
    "opening_hours": "2024-03-12",
    "holiday_hours": "2025-11-20",
    "description": "2023-05-01"
  }
}
```

### `reviews`
```json
{ "_id": "...", "business_id": "cafe_aura", "date": "2026-11-30", "rating": 2,
  "text": "Came on Monday morning and it was closed even though Google said open." }
```

### `issues`
```json
{
  "_id": "...",
  "business_id": "cafe_aura",
  "type": "missing_holiday_hours",
  "severity": "high",
  "evidence": {
    "dates": ["2026-12-24", "2026-12-25", "2026-12-26"],
    "holiday_names": { "2026-12-24": "Christmas Eve" },
    "last_year": { "2025-12-24": "08:00-14:00" }
  },
  "status": "open",
  "created_at": "2026-12-10T08:00:00Z",
  "fingerprint": "cafe_aura:missing_holiday_hours:2026-12-24,2026-12-25,2026-12-26"
}
```
`status`: `open` | `suggested` | `resolved` | `ignored`. The evidence shape per type is in `types/api.ts`; it is also "the data that told Connect" for step 1.

### `suggestions`
```json
{
  "_id": "...",
  "issue_id": "...",
  "business_id": "cafe_aura",
  "proposed_change": {
    "field": "holiday_hours",
    "value": { "2026-12-24": "08:00-14:00", "2026-12-25": "closed", "2026-12-26": "closed" }
  },
  "reason": "Christmas is coming and no hours are set. This follows what you did last year.",
  "confidence": "high",
  "message": { "en": "...", "fi": "..." },
  "source": "gemini",
  "validation": { "ok": true, "problems": [] },
  "audio_url": null,
  "decision": null,
  "decided_via": null,
  "decided_at": null,
  "applied": null
}
```
- `source`: `gemini` | `fallback`. `validation`: result of section 9.4.
- `decision`: `accepted` | `edited` | `ignored` | `auto` (standing permission) | `null`; `decided_via`: `tap` | `voice` | `standing_permission`
- `applied`: `{ "yext": true, "published_to": ["Google", "Apple Maps", "Finder", …], "at": "…" }` after step 5, or `{ "yext": false, "error": "…" }`

### `preferences`
```json
{
  "business_id": "cafe_aura",
  "ignored_fingerprints": ["cafe_aura:stale_field:description"],
  "learned": [
    { "issue_type": "missing_holiday_hours", "field": "holiday_hours",
      "proposed": { "2026-12-26": "closed" }, "final": { "2026-12-26": "11:00-16:00" },
      "decision": "edited", "at": "2026-12-10T09:00:00Z" }
  ],
  "standing_permissions": [ { "issue_type": "missing_holiday_hours", "field": "holiday_hours" } ],
  "notes": []
}
```

## 8. Detection rules (deterministic code)

All rules use `DEMO_DATE` as "today". Each rule returns zero or more Issues with evidence (types in `types/api.ts`). Skip any issue whose fingerprint is in `preferences.ignored_fingerprints` or already exists as open/suggested.

| # | Type | Logic | Severity |
|---|---|---|---|
| 1 | `missing_holiday_hours` | A Finnish public holiday (or Christmas Eve) falls within the next 30 days AND no listing has `holiday_hours` for that date | high |
| 2 | `cross_platform_conflict` | Same field (`opening_hours.<day>`, `phone`) differs between sources | high |
| 3 | `review_signal` | Recent reviews (last 30 days) sent to Gemini for classification; flag if Gemini finds a signal like "closed when listed open", "wrong phone", "moved" | medium |
| 4 | `stale_field` | `field_updated_at.<field>` older than 365 days | low |

Holiday list (hardcode for the demo window; the bonus may replace it with a live source): `2026-12-06` Independence Day, `2026-12-24` Christmas Eve, `2026-12-25` Christmas Day, `2026-12-26` Boxing Day, `2027-01-01` New Year's Day, `2027-01-06` Epiphany.

Rule 3 is the only rule that uses the LLM, and it only classifies text. The demo focuses on **hours** (rules 1 and 2 for opening hours); phone and description issues exist but are not the story.

## 9. Gemini usage

All Gemini calls must request **JSON output** and be validated with a schema (zod). On parse failure, retry once, then fall back to a template.

### 9.1 Generate suggestion (`lib/ai/suggest.ts`)
Input: business, issue (with evidence), relevant listings, **learned preferences** (`preferences.learned` for this business, plus standing permissions), language.
Output:
```json
{
  "proposed_change": { "field": "...", "value": {} },
  "reason": "One short sentence an owner understands, naming the data it is based on.",
  "confidence": "high | medium | low",
  "message": { "en": "Max 2 sentences.", "fi": "Max 2 sentences." }
}
```
Prompt rules:
- Friendly, plain language, no jargon. Written as Fonecta Connect talking to the owner.
- Base the proposal on evidence (last year's hours, the most recently updated source, review content) and say which data.
- **Use what the owner did before** (`learned`): if they edited the same kind of change last time, propose their version.
- **No history** (no last-year hours, nothing learned): propose the common pattern for the category (e.g. closed on Christmas Day), set confidence `low`, and phrase the message as a question.
- For conflicts, prefer the most recently updated source and say why.

### 9.2 Classify reviews (`lib/ai/reviews.ts`)
Input: recent reviews + current listing.
Output: `{ "signal": boolean, "type": "closed_when_open | wrong_phone | moved | other", "evidence_review_ids": [], "summary": "..." }`

### 9.3 Parse voice reply (`lib/ai/intent.ts`)
Input: suggestion + transcript of the owner's reply.
Output: `{ "intent": "accept | edit | ignore | unclear", "edited_value": {}, "confirmation_text": "..." }`
If `unclear`, the UI asks the owner to tap a button instead. Edits are always shown for a final tap confirmation before saving.

### 9.4 Validate suggestion (`lib/validate.ts`, deterministic code, no LLM)
Answers the judges' question "how are wrong suggestions prevented?". Every suggestion (Gemini or fallback) passes through `validateSuggestion(draft, issue, listings)` → `{ ok, problems[] }`:
- `field` is one of the allowed fields, and `value` has the right shape for it (`types/api.ts` `TypedProposedChange`)
- every hours value is `"closed"` or a valid `HH:MM-HH:MM` with close after open
- holiday dates in the proposal are exactly the dates in the issue evidence (none invented, none missing)
- for conflicts, the proposed value is one of the values actually seen in the sources
- phone numbers look like phone numbers; messages are non-empty and ≤ 2 sentences per language

If a Gemini suggestion fails, use the fallback template instead. If the fallback also fails, keep it but force confidence `low` and show the problems to the owner. Invalid suggestions are **never** auto-applied by a standing permission.

### 9.5 Scoring adapter (**TBD**)
Fonecta's scoring script measures suggestion quality on hidden test data. As soon as the format is known, we add one adapter (route or CLI) that maps their input to our detect + suggest pipeline and returns their expected output. The pipeline itself must stay callable without the UI.

## 10. ElevenLabs usage (extra)

- **TTS** (`lib/voice/tts.ts`): turn `suggestion.message[lang]` into audio as an optional Contact channel ("Connect calls you"). Cache the audio so it is generated once.
- **STT** (`lib/voice/stt.ts`): hold-to-record (MediaRecorder) → API route → ElevenLabs → `intent.ts`.
- Test Finnish quality early. If it is poor, demo in English and mention Finnish as supported in principle.
- Buttons always work without voice. Voice is an extra path, never the only path.

## 10b. Yext usage (step 5, Apply)

- `lib/yext/index.ts` is the only place that talks to Yext. `publishChange(business, change)` writes the accepted change (`hours` / holiday hours) to the business's entity in **our Yext sandbox** and returns `{ yext: true, published_to: [...] }` or `{ yext: false, error }` (`types/api.ts` `YextPublishResult`).
- With timeout, error handling and a clear fallback: if Yext is not configured or fails, the change is still saved in MongoDB and the UI says Yext was not reached. The demo must not crash.
- `published_to` is the list of places the owner is told the change will show (Google, Apple Maps, Finder, …), based on Yext's publishers for the entity where available.
- **Sandbox (confirmed 2026-11-06, read-only test):**
  - Base URL `https://sbx-api.yextapis.com/v2/accounts/me/…`, auth `?api_key=…&v=YYYYMMDD`. The key only works on the sandbox, not on `api.yextapis.com`. Key in `.env.local` only (team chat, never git).
  - Account `SinceAI03`; one entity: **Rye & Shine Bakery**, entity id `SinceAI03`, type `location`, language `fi`, Eerikinkatu 7, 20100 Turku, Fonecta category `L2815B`.
  - Current `hours`: Mon–Sat 10:00–18:00, Sunday closed. **No holiday hours set.** No phone or description.
  - Yext hours format: `{"monday":{"openIntervals":[{"start":"10:00","end":"18:00"}]},"sunday":{"isClosed":true}}`. `lib/yext` converts to/from our `"mon":"10:00-18:00"` format.
  - Publishers supporting Finnish locations (for `published_to`): Google Business Profile, Apple, Bing, Facebook, Foursquare, HERE, TomTom, MapQuest, Booking.com, Tupalo, ShowMeLocal, Navmii, Where To?, First Party. The sandbox has 0 live listings, which is expected.
  - Writing changes the shared sandbox entity: before the demo, reset it to the state above.

## 11. API routes (Next.js route handlers)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/seed` | Reset DB and load mock data |
| GET | `/api/status` | DB snapshot for the progress board |
| POST | `/api/detect` | Run all rules for all businesses (or `?businessId=`) |
| POST | `/api/suggest` | Generate + validate suggestions for open issues; apply standing permissions |
| GET | `/api/businesses` | List businesses with issue counts (dashboard) |
| GET | `/api/businesses/[id]` | Business, listings, open suggestions (contact preview + owner view) |
| POST | `/api/suggestions/[id]/decide` | Body `{ decision, edited_value?, via, standing_permission? }` → apply + learn |
| POST | `/api/suggestions/[id]/tts` | Generate/return audio for a suggestion (extra) |
| POST | `/api/voice/reply` | Multipart audio + `suggestionId` → transcript + parsed intent (extra) |
| ? | scoring adapter | **TBD** (section 9.5) |

Applying a decision:
- `accepted` / `edited` → `publishChange` to Yext, write the value to all three listings, update `field_updated_at`, set issue `resolved`, store `applied`; add an entry to `preferences.learned`; if `standing_permission` is true, add `{issue_type, field}` to `preferences.standing_permissions`
- `ignored` → set issue `ignored`, add fingerprint to `preferences.ignored_fingerprints`, add an entry to `preferences.learned`
- In `/api/suggest`: if a **valid** suggestion matches a standing permission, apply it right away (`decision: "auto"`, `decided_via: "standing_permission"`) and still tell the owner afterwards

## 12. UI

### Contact preview `/contact/[businessId]` (step 3)
- A phone-shaped frame showing the simulated **WhatsApp chat** from **Fonecta Connect** (WhatsApp is a valid channel per Fonecta): what is needed, why (the data), and a no-login link "Review in 10 seconds →" to the owner view. Optional tabs for SMS / email.
- Optional 🔊 "Connect calls you" (TTS, extra)

### Owner view `/owner/[businessId]` (mobile-first, ~390px wide, steps 4 and 5)
- Header: business name, greeting ("Hei Liisa!")
- A stack of notification cards, one per open suggestion:
  - Title (issue type in plain words), message text
  - **Why:** reason + the data it is based on, confidence badge (high/medium/low); low confidence clearly says "please check"
  - Proposed change shown clearly (before → after)
  - Buttons: ✅ Accept, ✏️ Edit, ❌ Ignore, plus a checkbox "Do this automatically next time"
  - Extra: 🔊 Play (TTS) and 🎙️ Hold to reply (STT)
- After a decision: short success animation, then **"Published via Yext to: Google, Apple Maps, Finder …"** with the channels turning green
- Empty state: "Everything is up to date ✅"

### Dashboard `/dashboard` (minimal)
- Table of businesses: name, category, open issues by severity, last decision
- Button "Run daily check" → calls `/api/detect` then `/api/suggest`
- Click a business → opens its contact preview / owner view

### Progress board `/` (team tool and demo controls)
- Live checklist of the milestones, "Reset demo", "Run detection", "Generate suggestions"

## 13. Mock data (`data/seed.ts`)

8 Turku businesses until Fonecta's dataset is known (**TBD**; then an importer loads their files and our seed stays as a fallback).

| Business | Category | Planted problems |
|---|---|---|
| Café Aura | café | Missing Christmas hours (had them last year), Google vs Finder Monday hours conflict, review "closed on Monday", description stale |
| Parturi Kampaamo Linnankatu | hair salon | Missing Christmas and New Year hours, **no history at all** (the no-history case) |
| Autokorjaamo Skanssi | car repair | Phone number conflict between sources |
| Kukkakauppa Kauppatori | florist | Stale opening hours (2+ years) |
| Pizzeria Port Arthur | restaurant | Review signal: "moved to a new address" |
| Kirjakauppa Aurajoki | bookshop | Saturday hours conflict |
| Kuntosali Itäharju | gym | Missing New Year hours |
| Leipomo Martti | bakery | Clean, no issues (shows the empty state) |

Names are fictional. Use realistic but fake phone numbers.

## 14. Project structure

```
/app
  /page.tsx                   progress board
  /dashboard/page.tsx
  /contact/[businessId]/page.tsx
  /owner/[businessId]/page.tsx
  /api/...                    (routes from section 11)
/components
  ProgressBoard.tsx  NotificationCard.tsx  ChannelSyncRow.tsx  VoiceButton.tsx
/lib
  db.ts  config.ts  holidays.ts
  validate.ts                 suggestion validation (section 9.4)
  apply.ts                    apply decision + sync + learn
  /rules                      one file per rule + index.ts
  /ai                         gemini.ts, suggest.ts, fallback.ts, reviews.ts, intent.ts
  /yext                       index.ts (publishChange)
  /voice                      tts.ts, stt.ts
/data/seed.ts
/scripts                      setup.mjs, smoke.mjs
/types                        index.ts, api.ts
```

## 15. Build order (milestones)

Each milestone must leave the app runnable. **M1–M5 is the complete five-step chain and the minimum demo.**

1. **M1 – Foundation:** Next.js + Tailwind + MongoDB + seed + types ✅
2. **M2 – Detect:** rules 1, 2, 4 + `/api/detect`
3. **M3 – Suggest:** fallback templates + validation, then Gemini (incl. the no-history case)
4. **M4 – Contact + Decide:** contact preview, owner view, Accept/Edit/Ignore
5. **M5 – Apply:** Yext sandbox write + "where it shows" → **whole chain works**
6. **M6 – Learn:** learned edits/ignores feed the next suggestion; standing permission
7. **M7 – Fonecta data:** dataset importer + scoring adapter (**jumps the queue as soon as the format is known**)
8. **M8 – Dashboard:** minimal list + "Run daily check"
9. **M9 – Extras:** voice (TTS, then STT), review signal, live data source bonus, polish

If time runs short, cut from the bottom.

## 16. Demo script (2–3 minutes, also the submission video)

1. **Problem (20 s):** "You walk to a café that says it's open. The door is locked."
2. **Detect (20 s):** dashboard → "Run daily check" → Café Aura: Christmas hours missing; *the data:* public holiday calendar + last year's hours
3. **Suggest (20 s):** proposed hours and why exactly those ("same as last year"), confidence high, validated
4. **Contact (20 s):** Liisa's phone gets a message from Fonecta Connect explaining why, with a no-login link (optional: Connect calls her with the voice message)
5. **Decide (30 s):** Liisa edits "open at 11 on the 26th", ticks "do this automatically next time", confirms
6. **Apply (20 s):** written to Yext → "now showing on Google, Apple Maps, Finder…", channels turn green
7. **Learn + control (20 s):** run the check again: the next suggestion uses her edit; the ignored description issue does not come back; a no-history business gets a cautious, low-confidence question instead of a guess
8. **Close (10 s):** "Liisa doesn't have to remember anything. Connect does it for her." + extensibility: the same loop serves posts and review replies

## 17. Conventions for Claude Code and other AI agents

- TypeScript strict mode; shared types in `/types`
- Keep functions small and pure where possible; rules are pure functions `(ctx) => DraftIssue[]`
- All external API calls (Gemini, Yext, ElevenLabs) go through `/lib/ai`, `/lib/yext` or `/lib/voice` wrappers with timeouts, error handling and a fallback
- Never call external APIs from client components; only from server routes
- Never commit `.env.local`; no GPL/AGPL dependencies
- Prefer working end to end over perfect; do not add features outside this document without asking
- Team workflow and rules: `CONTRIBUTING.md`; lanes and stages: `TASKS.md`

## 18. Submission checklist (Fonecta)

| Deliverable | Where | Owner |
|---|---|---|
| Working demo of the five steps, **2–3 minute video** | link in README | B (all record) |
| Code repository with a README: how to run it, data sources, libraries and licences | `README.md` | B |
| **3–5 key data sources**: where Connect would get them in production, and what didn't work | `docs/data-sources.md` | C + A |
| **Final customer messages as text** | `docs/customer-messages.md` (exported from real suggestions) | A |
| **How it behaves for a customer with no history** | `docs/no-history.md` + demo moment | A |
| Short pitch deck | link in README | B (all) |
| Bonus: one dataset file replaced with a live source, and what we learned | `docs/data-sources.md` | C |
