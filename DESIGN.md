# Ajantasa – Design Document

> Hackathon project for the **Fonecta challenge** at Since AI Hackathon (Turku, 48 hours).
> Also submitted to the MLH prizes: **Best Use of Gemini API**, **Best Use of MongoDB Atlas**, **Best Use of ElevenLabs**.

This document is the single source of truth for what we are building. If something is unclear, prefer the simplest option that keeps the demo flow working end to end.

---

## 1. Problem

Small businesses (cafés, salons, repair shops) have their information on many channels: Fonecta's Finder, Google, their own website. Owners are busy and forget to update opening hours, holiday hours and descriptions. Customers arrive at locked doors, the business loses revenue and trust.

Today, keeping information up to date depends on the owner remembering to log in. The challenge asks us to turn this into a **proactive service**: detect what needs attention, recommend a sensible fix, and let the owner stay in control and respond in seconds.

## 2. Solution in one sentence

**Ajantasa** ("up to date" in Finnish) is a proactive assistant that detects problems in a business's online information, uses AI to suggest and explain a fix, and lets the owner accept, edit or ignore it in seconds, by tap or by voice, without logging into a dashboard.

## 3. Users

| User | Needs | Surface |
|---|---|---|
| **Business owner** (primary) | Hear about problems only when it matters; fix them in seconds; stay in control | Mobile-first owner view (`/owner/[businessId]`) |
| **Fonecta support team** (secondary) | See the health of all businesses at a glance | Dashboard (`/dashboard`) |

Demo persona: **Liisa**, owner of **Café Aura** by the Aura river in Turku. Busy, never logs into anything.

## 4. Core flow

```
1. DETECT   Rule-based engine scans each business → creates Issues
2. SUGGEST  Gemini turns each Issue into a Suggestion (change + reason + confidence + message)
3. NOTIFY   Owner sees a notification card; optionally hears it via ElevenLabs TTS
4. DECIDE   Owner: Accept / Edit / Ignore (tap) OR speaks a reply (ElevenLabs STT → Gemini intent)
5. APPLY    Accepted change is written to all listings (simulated sync); decision + preference saved
```

**Design principle:** code detects, AI explains, the human decides.
- Never let the LLM compare dates, compute hours or decide whether data conflicts. That is deterministic code.
- The LLM writes human-friendly suggestions, explanations and messages, analyses free-text reviews, and parses spoken replies.
- Nothing is ever changed without an explicit owner decision.

## 5. Scope

### In scope (must have)
- 8 mock businesses in Turku with 3 listing sources each (`finder`, `google`, `website`)
- 4 detection rules (section 8)
- Gemini-generated suggestions with structured JSON output
- Owner mobile view with notification cards and Accept / Edit / Ignore
- Simulated sync: accepting a change updates all three listings in MongoDB
- Remembering ignored suggestions so they are not repeated
- Fonecta dashboard listing all businesses and their open issues

### Should have
- ElevenLabs voice notification (TTS) played in the owner view
- Voice reply: record → ElevenLabs STT → Gemini intent parsing → confirm

### Out of scope (do NOT build)
- Real scraping or real APIs of Finder or Google
- Real SMS, push notifications or phone calls (simulated in the UI)
- Authentication / user accounts
- Any real business data (privacy: mock data only)

## 6. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js (App Router) + TypeScript** |
| Styling | Tailwind CSS |
| Database | **MongoDB Atlas** via official `mongodb` Node driver |
| LLM | **Google Gemini API** via the official Google Gen AI JS SDK |
| Voice | **ElevenLabs** Text-to-Speech and Speech-to-Text via the official ElevenLabs JS SDK |
| Hosting | Local for development; optional Vercel/Vultr deploy for judges |

Check current official docs for SDK package names and model IDs before installing; do not hardcode model names, read them from env vars.

### Environment variables (`.env.local`)

```
MONGODB_URI=
MONGODB_DB=ajantasa
GEMINI_API_KEY=
GEMINI_MODEL=            # e.g. a current fast Gemini model
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=     # a voice that handles Finnish/English well
DEMO_DATE=2026-12-10     # "today" for detection rules, so the demo is deterministic
DEMO_LANGUAGE=en         # en | fi
```

## 7. Data model (MongoDB collections)

All dates are ISO strings (`YYYY-MM-DD`). Hours are strings `"HH:MM-HH:MM"` or `"closed"`.

### `businesses`
```json
{
  "_id": "cafe_aura",
  "name": "Café Aura",
  "owner_name": "Liisa",
  "category": "cafe",
  "city": "Turku",
  "preferred_channel": "voice",
  "language": "fi"
}
```

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
{
  "_id": "...",
  "business_id": "cafe_aura",
  "date": "2026-11-30",
  "rating": 2,
  "text": "Came on Monday morning and it was closed even though Google said open."
}
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
    "last_year": { "2025-12-24": "08:00-14:00" }
  },
  "status": "open",
  "created_at": "2026-12-10T08:00:00Z",
  "fingerprint": "cafe_aura:missing_holiday_hours:2026-12-24,2026-12-25,2026-12-26"
}
```
`status`: `open` | `suggested` | `resolved` | `ignored`
`fingerprint` is used to avoid duplicate issues and to remember ignored ones.

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
  "audio_url": null,
  "decision": null,
  "decided_via": null,
  "decided_at": null
}
```
`decision`: `accepted` | `edited` | `ignored` | `null`
`decided_via`: `tap` | `voice`

### `preferences`
```json
{
  "business_id": "cafe_aura",
  "ignored_fingerprints": ["cafe_aura:stale_field:description"],
  "notes": []
}
```

## 8. Detection rules (deterministic code)

All rules use `DEMO_DATE` as "today". Each rule returns zero or more Issues. Skip any issue whose fingerprint is in `preferences.ignored_fingerprints` or already exists as open/suggested.

| # | Type | Logic | Severity |
|---|---|---|---|
| 1 | `missing_holiday_hours` | A Finnish public holiday (or Christmas Eve) falls within the next 30 days AND no listing has `holiday_hours` for that date | high |
| 2 | `cross_platform_conflict` | Same field (`opening_hours.<day>`, `phone`) differs between sources | high |
| 3 | `review_signal` | Recent reviews (last 30 days) sent to Gemini for classification; flag if Gemini finds a signal like "closed when listed open", "wrong phone", "moved" | medium |
| 4 | `stale_field` | `field_updated_at.<field>` older than 365 days | low |

Holiday list (hardcode for the demo window): `2026-12-06` Independence Day, `2026-12-24` Christmas Eve, `2026-12-25` Christmas Day, `2026-12-26` Boxing Day, `2027-01-01` New Year's Day, `2027-01-06` Epiphany.

Rule 3 is the only rule that uses the LLM, and it only classifies text. The resulting issue still goes through the normal suggestion step.

## 9. Gemini usage

All Gemini calls must request **JSON output** and be validated with a schema (e.g. zod). On parse failure, retry once, then fall back to a template message.

### 9.1 Generate suggestion (`lib/ai/suggest.ts`)
Input: business, issue (with evidence), relevant listings, language.
Output:
```json
{
  "proposed_change": { "field": "...", "value": {} },
  "reason": "One short sentence an owner understands.",
  "confidence": "high | medium | low",
  "message": { "en": "Max 2 sentences.", "fi": "Max 2 sentences." }
}
```
Prompt rules:
- Friendly, plain language, no jargon
- Base the proposal on evidence (last year's hours, the most recently updated source, review content)
- If evidence is weak, set confidence `low` and say so
- For conflicts, prefer the most recently updated source and say why

### 9.2 Classify reviews (`lib/ai/reviews.ts`)
Input: recent reviews + current listing.
Output: `{ "signal": boolean, "type": "closed_when_open | wrong_phone | moved | other", "evidence_review_ids": [], "summary": "..." }`

### 9.3 Parse voice reply (`lib/ai/intent.ts`)
Input: suggestion + transcript of the owner's reply.
Output:
```json
{ "intent": "accept | edit | ignore | unclear", "edited_value": {}, "confirmation_text": "..." }
```
If `unclear`, the UI asks the owner to tap a button instead. Edits are always shown for a final tap confirmation before saving.

## 10. ElevenLabs usage

- **TTS** (`lib/voice/tts.ts`): turn `suggestion.message[lang]` into audio. Cache the audio (file or base64 in MongoDB) so it is generated once.
- **STT** (`lib/voice/stt.ts`): owner holds a button to record (browser MediaRecorder), audio is sent to an API route, transcribed by ElevenLabs, then passed to `intent.ts`.
- Test Finnish quality early. If it is poor, demo in English and mention Finnish as supported in principle.
- Buttons always work without voice. Voice is an extra path, never the only path.

## 11. API routes (Next.js route handlers)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/seed` | Reset DB and load mock data |
| POST | `/api/detect` | Run all rules for all businesses (or `?businessId=`) |
| POST | `/api/suggest` | Generate suggestions for open issues |
| GET | `/api/businesses` | List businesses with issue counts (dashboard) |
| GET | `/api/businesses/[id]` | Business, listings, open suggestions (owner view) |
| POST | `/api/suggestions/[id]/decide` | Body `{ decision, edited_value?, via }` → apply + save |
| POST | `/api/suggestions/[id]/tts` | Generate/return audio for a suggestion |
| POST | `/api/voice/reply` | Multipart audio + `suggestionId` → transcript + parsed intent |

Applying a decision:
- `accepted` / `edited` → write the value to all three listings, update `field_updated_at`, set issue `resolved`
- `ignored` → set issue `ignored`, add fingerprint to `preferences.ignored_fingerprints`

## 12. UI

### Owner view `/owner/[businessId]` (mobile-first, ~390px wide)
- Header: business name, greeting ("Hei Liisa!")
- A stack of notification cards, one per open suggestion:
  - Title (issue type in plain words), message text
  - Reason + confidence badge (high/medium/low)
  - Proposed change shown clearly (before → after)
  - Buttons: ✅ Accept, ✏️ Edit, ❌ Ignore
  - 🔊 Play (TTS) and 🎙️ Hold to reply (STT)
- After a decision: short success animation, then a "channels synced" row showing Finder / Google / Website turning green
- Empty state: "Everything is up to date ✅"

### Dashboard `/dashboard`
- Table of businesses: name, category, open issues by severity, last decision
- Button "Run daily check" → calls `/api/detect` then `/api/suggest`
- Click a business → opens its owner view

### Demo controls (hidden or small)
- "Reset demo" → `/api/seed`

## 13. Mock data (`data/seed.ts`)

8 Turku businesses. Each must trigger at least one rule; Café Aura must trigger all four.

| Business | Category | Planted problems |
|---|---|---|
| Café Aura | café | Missing Christmas hours (had them last year), Google vs Finder Monday hours conflict, review "closed on Monday", description stale |
| Parturi Kampaamo Linnankatu | hair salon | Missing Independence Day + Christmas hours |
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
  /dashboard/page.tsx
  /owner/[businessId]/page.tsx
  /api/...                    (routes from section 11)
/components
  NotificationCard.tsx
  ChannelSyncRow.tsx
  VoiceButton.tsx
/lib
  db.ts                       MongoDB client (singleton)
  holidays.ts
  /rules                      one file per rule + index.ts
  /ai                         suggest.ts, reviews.ts, intent.ts, gemini.ts
  /voice                      tts.ts, stt.ts
  apply.ts                    apply decision + sync listings
/data/seed.ts
/types/index.ts               shared TypeScript types
```

## 15. Build order (milestones)

Each milestone must leave the app runnable.

1. **M1 – Foundation:** Next.js + Tailwind + MongoDB connection + seed route + types
2. **M2 – Detection:** rules 1, 2, 4 + `/api/detect`; verify issues in DB
3. **M3 – Suggestions:** Gemini suggest + schema validation + fallback template
4. **M4 – Owner view:** cards, Accept/Edit/Ignore, apply + sync, empty state
5. **M5 – Dashboard:** list + "Run daily check"
6. **M6 – Review signal:** rule 3 with Gemini classification
7. **M7 – Voice:** TTS playback, then STT + intent parsing
8. **M8 – Polish:** animations, loading states, demo reset, pre-generated fallback audio

If time runs short, cut from the bottom (M8 → M7 → M6). M1–M5 is the minimum demo.

## 16. Demo script (3 minutes)

1. **Problem (30 s):** "You walk to a café that says it's open. The door is locked." + interview findings
2. **Meet Liisa (20 s):** busy café owner, never logs into anything
3. **Detection (30 s):** dashboard → "Run daily check" → Café Aura shows 4 issues
4. **Voice moment (60 s):** owner view → play voice message about Christmas hours → Liisa says "Yes, but open at 11 on the 26th" → edited change shown → tap confirm → Finder, Google, Website turn green
5. **Control (20 s):** Liisa ignores the description suggestion; run the check again; it does not come back
6. **Close (20 s):** "Liisa doesn't have to remember anything. Ajantasa does it for her."

## 17. Conventions for Claude Code

- TypeScript strict mode; shared types in `/types`
- Keep functions small and pure where possible; rules are pure functions `(business, listings, reviews, today) => Issue[]`
- All external API calls (Gemini, ElevenLabs) go through `/lib/ai` or `/lib/voice` wrappers with timeouts, error handling and a fallback
- Never call Gemini or ElevenLabs from client components; only from server routes
- Never commit `.env.local`
- Prefer working end to end over perfect; do not add features outside this document without asking
- After each milestone, briefly summarize what works and what is next
