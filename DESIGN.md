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
- **The demo is in English.** All UI text, customer messages, voice and the video are in English (`DEMO_LANGUAGE=en`). Finnish messages are still generated (`message.fi`) and shown as "also available in Finnish", but they are not part of the demo.

### Open questions
1. ~~Dataset files~~ → received 2026-11-07, see **Fonecta dataset** below.
2. ~~Scoring script~~ → a Python script that scores a CSV file, see section 9.5.
3. ~~Yext sandbox access~~ → answered, see section 10b.

### Fonecta dataset (received 2026-11-07)
**"Connect Suggests – Customer Approves · Nordic opening-hours simulator v1.1"** by Since AI ry. All data is synthetic. Licence: code MIT, data CC BY 4.0 (attribution: "Connect Suggests simulator, Since AI ry 2026").

- **Where:** unzip it to `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/` in your clone (download link from the kickoff / team chat). It is about 82 MB, so it is **not committed** (`FONECTA/` is in `.gitignore`). Start with its `START_HERE.md`, `docs/DATA_DICTIONARY.md` and `docs/DEMO_SCENARIOS.md`.
- **Scenario:** today is **Fri 6 Nov 2026** (data up to 5 Nov). 3,032 businesses and shopping centres in **FI, SE and NO**. For every business and special day from **7 Nov 2026 to 6 Jan 2027**, decide `SUGGEST` + hours, `NO_ACTION` (Google is already right) or `FLAG` (needs a human, e.g. closed for good).
- **Main files** (all in Yext API shapes): `entities.json` (regular + holiday hours already entered), `holiday_hours_history.jsonl` (every exception since 2024, with source), `peer_benchmarks.csv` (what similar businesses entered per holiday), `pilot_decision_log_2025.csv` (3,031 suggestions and what owners did), `customer_contacts.csv` (channel, language, **standing permission**, **opt-out**), `listings.json` (publishers + typical update speed, for the step 5 confirmation), `reviews.json` (60k, fi/sv/nb/en), `publisher_suggestions.json` (Google user edits, half noise), `analytics_daily.parquet` (search views, to prioritise), `calendar_special_days.csv` (FI/SE/NO holidays, eves, observances, commercial days, 2024–2027), plus school breaks, local events and weather.
- **Also included:** a local Yext mock API with an owner simulator (`mock_api/server.py`, Python), a baseline and the scorer. Fonecta: *use the mock for detection and the sandbox to demo the write path* (the sandbox has the same API but no history).
- **17 demo businesses** (`FI-D0001` … `FI-D0017`, not scored) with ready storylines, e.g. `FI-D0001` Kahvila Aurora (Fonecta's own example), `FI-D0017` Kahvila Kipinä (**the no-history case Fonecta names**), `FI-D0011` Pizzeria Torni (closed for good: flag, don't suggest), `FI-D0012` (standing permission: apply, then inform), `FI-D0013` (already right: stay quiet).

### v2: the app runs on Fonecta's dataset (decided 2026-11-07, team to confirm in PR)
Our own seed answered a challenge we imagined. The judges score **their** data, **their** demo storylines and **their** scorer, so from now on the dataset is the source of truth. Where this section conflicts with sections 7, 8, 9, 13 or 16, **this section wins** until those sections are rewritten.

**Rules for the switch**
- **Switched (V2, 7 Nov):** the demo runs on the dataset (`DEMO_DATE=2026-11-06`, `/api/seed` loads it). The v1 seed is still available as `/api/seed?source=seed` with `DEMO_DATE=2026-12-10`, but it is retired from the demo. `main` must stay runnable at every merge.
- **Same principle:** code decides the hours (and the action), the LLM only writes messages and reads text, the owner has the last word.
- **One prediction module for app and scorer:** `lib/predict/` (pure, no DB, no clock) decides `SUGGEST` + hours, `NO_ACTION` or `FLAG` for one business and one special day. Detection (step 1) and `predictions_2026.csv` (section 9.5) both call it, so the score measures exactly what the demo shows.

**What changes**
| Topic | Before (seed) | v2 (dataset) |
|---|---|---|
| Today | `DEMO_DATE` 2026-12-10 | `DEMO_DATE` **2026-11-06** (the dataset's snapshot) |
| Window | holidays within 30 days | special days from **7 Nov 2026 to 6 Jan 2027** in the business's country (`calendar_special_days.csv`: Father's Day, Black Friday, Independence Day, Lucia, Dec 23, Christmas, the days between, New Year's Eve, Epiphany …); events and school breaks later |
| Businesses | 8 invented Turku businesses | the 17 demo storylines `FI-D0001` … `FI-D0017` + the 15 shopping centres, imported into MongoDB |
| Data in git | `data/seed.ts` | `data/fonecta/demo.json`: a small extract for those businesses (entities, exception history, contacts, publishers, calendar FI/SE/NO, peer rows for their segments), made by the importer and **committed** so CI and teammates without the zip still work. The full zip stays in `FONECTA/` (not committed) and is only needed for the scorer. |
| Listings | 3 sources (Finder, Google, website) that disagree | one published profile per business (the Yext entity): regular week + exceptions already entered. "What Google shows" = the exception if entered, else the regular hours for that weekday |
| Hours | `"10:00-18:00"` or `"closed"` | also `"10:00-14:00,17:00-22:00"`, past midnight `"18:00-02:00"`, 24 h `"00:00-23:59"`; one helper `lib/hours.ts` parses, formats, compares and converts to/from Yext |
| Detection rules | missing holiday hours, cross-platform conflict, stale field, review signal | **special day hours**: for each special day, `lib/predict` gives the likely real hours; if they differ from what Google shows → an issue (`SUGGEST`). **Needs a human** (`FLAG`): closed for good / seasonal closure (e.g. `FI-D0011`), shown to Connect staff in the dashboard, not sent to the owner. The conflict and stale rules do not fit one-profile data and are retired for v2. |
| Proposal basis (code) | last year → category pattern | the owner's own past edit (learning) → **last year's exception for the same day** (`holiday_hours_history`) → **shopping centre hours** (business inside a centre) → **peers** (`peer_benchmarks`: same segment, country, city tier) → regular hours (= no action). Each basis has a confidence; low confidence → the message asks instead of telling. Thresholds tuned on the 2025 back-test, not on 2026 labels. |
| Contact | `preferred_channel` on the business | `customer_contacts.csv`: first name, channel (EMAIL / SMS / WHATSAPP / APP_PUSH), language (fi / sv / nb / en), contact window. **Opted out → no message. Standing permission → apply, then inform.** One message per business can bundle several dates (like the 2025 pilot). |
| Messages | `message.en` + `message.fi` | `message.en` (the demo language) + the owner's language (fi, sv or nb). Style of Fonecta's example: day and date, what Google shows now, last year / centre / peers as the reason, the exact proposal, then Approve / Edit / No thanks. |
| Apply | Rye & Shine in the Yext sandbox | the sandbox entity `SinceAI03` is renamed and set up as **`FI-D0001` Kahvila Aurora** (Fonecta allows changing the sandbox business) so the protagonist's change is really written to Yext. Other businesses: saved in MongoDB. "Where it shows" comes from `listings.json` with the typical update speed ("Google in about 2 minutes, Apple Maps within 2 days"). |
| Learning | edits only | edits and declines from our UI, plus the 2025 pilot log as each owner's history (who edits, who never replies, who granted standing permission) |
| Priority | – | `analytics_daily.parquet` search views decide which suggestions go first (extra) |

**Demo cast (all from the dataset)**
| Business | Shows |
|---|---|
| `FI-D0001` Kahvila Aurora, Helsinki | **Protagonist**, Fonecta's own example: last year's exceptions exist only partly, nothing entered for this year; written to the real Yext sandbox |
| `FI-D0017` Kahvila Kipinä, Turku | **No history**: new customer, peers decide, confidence low, the message asks |
| `SE-D0008` Kafé Linnea, Stockholm | Swedish message (Julafton closed, Lucia early) |
| `FI-D0012` Tilitoimisto Otso | Standing permission: applied without asking, then informed |
| `FI-D0011` Pizzeria Torni | Closed for good: flagged for a human, no suggestion |
| `FI-D0013` Hammasklinikka Kallio | Already correct: stays quiet (empty state) |
| `FI-D0010` Pub Kulma, Helsinki | One unusual signal: open later on arena nights (event days, from the owner's earlier event-night entries) |

**Stand-out extras (agreed 2026-11-07, after the v2 chain works)**
In this order. The values and numbers always come from code, never from the LLM.

1. **What customers will see** (D11): a small Google-style card before Approve: "Today Google says: open 07:30–18:00" next to "After your OK: Christmas Eve 07:30–13:00".
2. **What's at stake** (C14 + A13): code takes the business's Google search views on the same special day last year from `analytics_daily.parquet`. The importer computes them for the demo cast, and they are stored as `expected_search_views` in the issue evidence. The message says it honestly, for example "last Christmas Eve about 40 people found you on Google". This matches Fonecta's findability focus and the scorer's "search views protected".
3. **Standing permission as a highlight** (A11, video): the dataset's `standing_permission_holidays` (customer_contacts) counts as a standing permission for `special_day_hours`, so `FI-D0012` is applied and then informed. It gets its own moment in the video ("handle public holidays from now on").
4. **Where it shows, live** (D6): publishers turn green on their typical update speed (Google about 2 minutes … Apple Maps about 2 days).
5. **Reply by text** (D12): Aleksi prefers SMS, so in the simulated chat the owner can answer the message in plain words ("yes", "24.12 8–12", "no thanks"). `parseIntent` (A9) reads it, code builds the value, and the owner confirms with one tap. The message also carries an **Edit** link that opens the owner page (no login) for anything longer. The voice reply (B8) uses the same route.
6. **Event nights in the app** (C15): event and school-break days for the demo cast are imported as special days, so `FI-D0010`'s arena nights show up (lib/predict already handles them, #49).
7. **Send at the right moment** (D10, one line): "Sent at 12:10, inside Aleksi's 12–16 contact window", from `best_contact_window`.
8. Then: **live holiday API** (C8, Fonecta's bonus), **"Connect calls you"** voice (B7/B8).

Not built: a review-reply feature. Extensibility is shown with one slide or a 10-second clip in the video instead.

The stages for this switch are in `TASKS.md` under "v2: dataset".

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

Demo persona: **Liisa**, owner of **Rye & Shine Bakery** on Eerikinkatu in Turku: the real entity in our Yext sandbox (section 10b), so Apply writes real Yext data (and our seed mirrors what Yext holds). Busy, never logs into anything, reads WhatsApp.

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
- Businesses from **Fonecta's dataset** (the demo storylines, section 0 v2); the Turku mock seed only until v2 works
- Detection rules (section 8), each recording the data that triggered it
- Gemini suggestions with structured JSON, plus a **validation layer** and fallback templates
- **Customer with no history:** sensible, clearly low-confidence suggestion that asks the owner instead of guessing (section 9.1)
- **Contact:** a message preview (simulated **WhatsApp** chat; SMS/email as alternatives) in Connect's voice that explains why, with a no-login link
- Owner view with Accept / Edit / Ignore
- **Apply to the Yext sandbox** (section 10b) and show where the change will appear
- **Learning:** remember edits and ignores, use them in the next suggestion; **standing permission** per change type
- Fonecta dashboard (minimal): list of businesses and a "Run daily check" button
- A **scoring adapter**: `predictions_2026.csv` in the format of Fonecta's scoring script (section 9.5)

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
DEMO_LANGUAGE=en         # en | fi. The demo is in English
```

## 7. Data model (MongoDB collections)

All dates are ISO strings (`YYYY-MM-DD`). Hours are strings `"HH:MM-HH:MM"` or `"closed"`.
TypeScript types: `types/index.ts` (data) and `types/api.ts` (contracts between lanes). **May change once Fonecta's dataset format is known.**

### `businesses`
```json
{
  "_id": "rye_shine",
  "name": "Rye & Shine Bakery",
  "owner_name": "Liisa",
  "category": "bakery",
  "city": "Turku",
  "preferred_channel": "whatsapp",
  "language": "fi",
  "yext_entity_id": "SinceAI03"
}
```
`yext_entity_id`: the matching entity in our Yext sandbox (TBD how we map them).

### `listings` (one document per business per source)
```json
{
  "_id": "rye_shine:google",
  "business_id": "rye_shine",
  "source": "google",
  "opening_hours": {
    "mon": "08:00-18:00", "tue": "08:00-18:00", "wed": "08:00-18:00",
    "thu": "08:00-18:00", "fri": "08:00-20:00", "sat": "10:00-16:00", "sun": "closed"
  },
  "holiday_hours": { "2025-12-24": "08:00-14:00" },
  "phone": "+358 2 123 4567",
  "description": "Sourdough and rye bakery on Eerikinkatu.",
  "field_updated_at": {
    "opening_hours": "2024-03-12",
    "holiday_hours": "2025-11-20",
    "description": "2023-05-01"
  }
}
```

### `reviews`
```json
{ "_id": "...", "business_id": "rye_shine", "date": "2026-11-30", "rating": 2,
  "text": "Came on Saturday at 3 pm and the door was locked, although Google said open until 18." }
```

### `issues`
```json
{
  "_id": "...",
  "business_id": "rye_shine",
  "type": "missing_holiday_hours",
  "severity": "high",
  "evidence": {
    "dates": ["2026-12-24", "2026-12-25", "2026-12-26"],
    "holiday_names": { "2026-12-24": "Christmas Eve" },
    "last_year": { "2025-12-24": "08:00-14:00" }
  },
  "status": "open",
  "created_at": "2026-12-10T08:00:00Z",
  "fingerprint": "rye_shine:missing_holiday_hours:2026-12-24,2026-12-25,2026-12-26"
}
```
`status`: `open` | `suggested` | `resolved` | `ignored`. The evidence shape per type is in `types/api.ts`; it is also "the data that told Connect" for step 1.

### `suggestions`
```json
{
  "_id": "...",
  "issue_id": "...",
  "business_id": "rye_shine",
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
  "business_id": "rye_shine",
  "ignored_fingerprints": ["rye_shine:stale_field:description"],
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

### 9.5 Scoring adapter (`predictions_2026.csv`)
Fonecta's scorer is `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py` (Python, standard library, MIT). It does not call us: it scores a CSV file.
- **Input rows:** `evaluation/targets_2026.csv` (`entity_id, date, day_key, day_type, event_id, country, split`). Organisers score the hidden **test** split; `dev` rows have labels in `labels/` for our own checks.
- **Our output:** `predictions_2026.csv` in the repository root with `entity_id,date,action,hours[,confidence]`; `action` is `SUGGEST` | `NO_ACTION` | `FLAG`; `hours` is `closed` or `HH:MM-HH:MM[,HH:MM-HH:MM]` (required for `SUGGEST`). Rows left out count as `NO_ACTION`.
- **Points per row:** needs a change: exact +1, same state and both ends within 30 min +0.6, same state +0.2, wrong open/closed state −1, `FLAG` +0.05. Already correct: `NO_ACTION` 0, `FLAG` −0.1, `SUGGEST` −0.1 to −1. Closed for good: `FLAG` +1. Score = 100 × points / rows that need action. It also reports the share of search views protected.
- **Baseline to beat** (copy last year → shopping centre → peers): 54.5 on dev 2026, exact precision 0.90, recall 0.59. About 40 % of needed changes have no usable history.
- **Check:** `python FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py --predictions predictions_2026.csv` (dev rows). Back-test honestly: when simulating 6 Nov 2025, use only rows with timestamps before it.
- The same rule as everywhere: code decides the hours; the LLM does not compare dates or numbers.

## 10. ElevenLabs usage (extra)

- **TTS** (`lib/voice/tts.ts`): turn `suggestion.message[lang]` into audio as an optional Contact channel ("Connect calls you"). Cache the audio so it is generated once.
- **STT** (`lib/voice/stt.ts`): hold-to-record (MediaRecorder) → API route → ElevenLabs → `intent.ts`.
- The demo is in English, so pick a clear English voice. Finnish TTS is optional (only mention it as supported).
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
| – | scoring adapter | not a route: a script writes `predictions_2026.csv` (section 9.5) |

Applying a decision:
- `accepted` / `edited` → `publishChange` to Yext, write the value to all three listings, update `field_updated_at`, set issue `resolved`, store `applied`; add an entry to `preferences.learned`; if `standing_permission` is true, add `{issue_type, field}` to `preferences.standing_permissions`
- `ignored` → set issue `ignored`, add fingerprint to `preferences.ignored_fingerprints`, add an entry to `preferences.learned`
- In `/api/suggest`: if a **valid** suggestion matches a standing permission, apply it right away (`decision: "auto"`, `decided_via: "standing_permission"`) and still tell the owner afterwards

## 12. UI

### Contact preview `/contact/[businessId]` (step 3)
- A phone-shaped frame showing the simulated **WhatsApp chat** from **Fonecta Connect** (WhatsApp is a valid channel per Fonecta): what is needed, why (the data), and a no-login link "Review in 10 seconds →" to the owner view. Optional tabs for SMS / email.
- Optional 🔊 "Connect calls you" (TTS, extra)

### Owner view `/owner/[businessId]` (mobile-first, ~390px wide, steps 4 and 5)
- Header: business name, greeting ("Hi Liisa!"), all UI text in English
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

### Home `/` (public demo entry) and progress board `/team` (team tool, not linked)
- `/`: three ways into the demo: Pub Kulma's WhatsApp chat (reply by text or voice), Kahvila Aurora's SMS, and Fonecta's dashboard.
- Live checklist of the milestones, "Reset demo", "Run detection", "Generate suggestions"

## 13. Mock data (`data/seed.ts`)

8 Turku businesses. **Replaced by Fonecta's dataset in v2 (section 0)**; this seed keeps the current chain working until the v2 chain works end to end.

| Business | Category | Planted problems |
|---|---|---|
| **Rye & Shine Bakery** (Yext `SinceAI03`) | bakery | Same base hours as Yext (Mon–Sat 10–18, Sun closed). No holiday hours for Christmas–Epiphany (had them last season); own website says Saturday 10–14 (newest) vs Finder/Google 18:00; review "locked on Saturday afternoon"; description stale |
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
  /page.tsx                   public home (demo entry)
  /team/page.tsx              progress board (team tool)
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

Runs on Fonecta's dataset (V2): `DEMO_DATE=2026-11-06`, `POST /api/seed` loads the demo cast. Before recording: `node scripts/yext-reset.mjs` (the sandbox entity is Kahvila Aurora), then `/api/seed`, `/api/detect`, `/api/suggest`. Never show API keys or `.env.local`.

1. **Problem (15 s):** "You check Google, it says open. You walk there, and the door is locked." Busy owners forget, and holidays are when it goes wrong.
2. **Detect (20 s):** dashboard → "Run daily check" → `FI-D0001` Kahvila Aurora, Helsinki: Christmas Eve (Thu 24 Dec) shows regular hours 07:30–18:00. *The data:* the special-day calendar, what Google shows now, last season's exception (07:30–13:00).
3. **Suggest (20 s):** "Christmas Eve 24 Dec open 07:30–13:00", basis *last year*, confidence high, validated. Code decides the hours; the AI only writes the message (English + Finnish).
4. **Contact (15 s):** Aleksi's preferred channel is **SMS**: one short message in Fonecta's own style (day and date, what Google shows, last year, "We suggest …") with a no-login link.
5. **Decide (30 s):** Aleksi opens the link and accepts Christmas Eve, or edits a day (split hours like 09:00–12:00 and 13:00–15:00 work) and confirms. Option: "Do this automatically next time".
6. **Apply (20 s):** written to the real Yext sandbox entity (show `node scripts/yext-check.mjs` or the Yext UI) → "Published via Yext to: Google (Search & Maps), Finder.fi …": Aurora's live publishers, fastest first, with typical update speed (Google about 2 minutes, Apple Maps about 2 days). Opted-out Facebook is not claimed.
7. **Trust and learning (25 s):**
   - `FI-D0012` Tilitoimisto Otso has standing permission: 5 dates applied without asking, then the owner is informed ("handle public holidays from now on").
   - `FI-D0017` Kahvila Kipinä, a new customer with no history: peers suggest closed, confidence low, and the message asks instead of telling.
   - `FI-D0013` Hammasklinikka Kallio is already correct: nothing is sent. `FI-D0011` Pizzeria Torni closed for good: flagged for a person, no message.
   - `SE-D0008` Kafé Linnea gets its message in Swedish.
8. **Results (10 s):** score on Fonecta's `evaluate.py` (dev, 2026) against the baseline 54.5; use the number from `docs/predict.md` on the day.
9. **Close (10 s):** "Aleksi doesn't have to remember anything. Connect takes care of it." + extensibility: the same loop serves posts and review replies (one slide).

## 17. Conventions for Claude Code and other AI agents

- TypeScript strict mode; shared types in `/types`
- Keep functions small and pure where possible; rules are pure functions `(ctx) => DraftIssue[]`
- All external API calls (Gemini, Yext, ElevenLabs) go through `/lib/ai`, `/lib/yext` or `/lib/voice` wrappers with timeouts, error handling and a fallback
- Never call external APIs from client components; only from server routes
- Never commit `.env.local`; no GPL/AGPL dependencies
- Prefer working end to end over perfect; do not add features outside this document without asking
- Team workflow and rules: `CONTRIBUTING.md`; lanes and stages: `TASKS.md`

## 18. Submission checklist (Fonecta)

Submit in the Since AI app by the event deadline. Fonecta asks us to use the dataset's `docs/README_TEMPLATE.md` as the structure of our README (run it, the five steps, 3–5 data sources, what didn't work, no-history customer, final messages, live source, licences).

| Deliverable | Where | Owner |
|---|---|---|
| Working demo of the five steps, **2–3 minute video** (live is also allowed) | link in README | B (all record) |
| Code repository with a README following `README_TEMPLATE.md`: how to run it, data sources, libraries and licences (incl. the dataset: CC BY 4.0 / MIT) | `README.md` | B |
| **3–5 key data sources**: how we used them, where Connect would get them in production, and what didn't work | `docs/data-sources.md` | C + A |
| **Final customer messages as text**: at least one per supported language, plus the approve / edit / decline follow-ups | `docs/customer-messages.md` (exported from real suggestions) | A |
| **How it behaves for a customer with no history / no previous actions**; Fonecta names `FI-D0017` Kahvila Kipinä | `docs/no-history.md` + demo moment | A |
| Short pitch deck: problem, solution, how it learns, results, next steps | link in README | B (all) |
| Bonus: one dataset file replaced with a live source; what we learned about coverage, quality, gaps (see the dataset's `docs/LIVE_SOURCES.md`) | `docs/data-sources.md` | C |
| Optional: `predictions_2026.csv` for the scorer (section 9.5) | repository root | A |
