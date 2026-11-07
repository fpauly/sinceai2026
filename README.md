# Hocus Focus – Connect Suggests (Ajantasa)

**Ajantasa** ("up to date" in Finnish) is a proactive feature for **Fonecta Connect**. It notices when what Google shows for a business's opening hours will be wrong on a special day, proposes the exact hours with the reason, messages the owner on their own channel, lets them approve, edit or decline without logging in, and writes the approved change to Yext, telling the owner where it now shows.

Built in 48 hours at Since AI Hackathon 2026 (Turku) for Fonecta's challenge *Connect Suggests – Customer Approves*. **Code detects, AI explains, the owner decides.**

- Demo video: [link to the 2–3 minute video]
- Pitch deck: [link to the deck]
- Live demo: [link, if deployed]

## Run it

You need Node 22.18+ (we use 24; scripts run `lib/` TypeScript directly) and MongoDB (Atlas, or local Docker: `docker run -d -p 27017:27017 mongo:7`).

```bash
npm install
cp .env.example .env.local    # fill in MONGODB_URI (and the optional keys below)
npm run dev                   # http://localhost:3000 (progress board and demo controls)
```

Team members can run `npm run setup` instead, which writes `.env.local` for their lane. Then on the progress board press **Load Fonecta cast**, **Run detection** and **Generate suggestions**, or:

```bash
curl -X POST localhost:3000/api/seed      # loads Fonecta's demo cast (data/fonecta/demo.json, committed)
curl -X POST localhost:3000/api/detect    # step 1
curl -X POST localhost:3000/api/suggest   # step 2
```

Pages: `/dashboard` (Fonecta's view, "Run daily check"), `/contact/FI-D0001` (the message Aleksi gets), `/owner/FI-D0001` (approve / edit / decline, no login).

**Settings** (`.env.local`, see `.env.example`; never committed):

| Key | Needed for | Without it |
|---|---|---|
| `MONGODB_URI`, `MONGODB_DB` | everything | – |
| `DEMO_DATE=2026-11-06` | "today", the dataset's snapshot | defaults to 2026-11-06 |
| `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | message wording | messages use fixed templates; hours are never from the LLM anyway |
| `YEXT_API_KEY`, `YEXT_API_BASE` | step 5 writes to our Yext sandbox | change is saved in MongoDB, and the owner is told Yext was not reached |

**Yext sandbox:** our entity `SinceAI03` is set up as Kahvila Aurora. `node scripts/yext-check.mjs` shows what Yext holds; `node scripts/yext-reset.mjs` restores it before a demo.

**Score:** unzip Fonecta's dataset to `FONECTA/FONECTA_CONNECT_SUGGESTS_2026/` (not committed), then:

```bash
node scripts/predict.mjs                                    # writes predictions_2026.csv
python3 FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py --predictions predictions_2026.csv
```

**Checks:** `npm run check` (types, lint, build; also runs on `git push`) and `npm run smoke` (end to end against the running app).

## The five steps

1. **Detect.** For each business and each special day from 7 Nov 2026 to 6 Jan 2027, `lib/predict` (plain code, no LLM) works out the likely real hours and compares them with what Google shows now: the entered exception, otherwise the regular hours. A difference becomes an issue; a business that looks closed for good is flagged for a person instead.
2. **Suggest.** The proposal comes from evidence, strongest first: the owner's own earlier edit, the shopping centre's hours, last season's exception (or the season before), event nights and school breaks, then peers. Each basis has a confidence. Gemini only writes the message; code validates every draft and falls back to a template.
3. **Contact.** One short message on the owner's preferred channel (SMS, WhatsApp, e-mail or app), in English and the owner's language (fi, sv or nb), in the style of Fonecta's example: the day, what Google shows now and how often the listing was seen on Google that day last year, why, and "We suggest …". Delivery is simulated. Opted-out owners get nothing.
4. **Decide.** A no-login link opens the owner view: approve, edit (with a confirm step) or decline, with a preview of what customers will see. Optional "Do this automatically next time". Owners with standing permission get the change applied, then a "for your information" note.
5. **Apply.** The change is written to the Yext sandbox entity and to our profile. The owner sees where it shows: their live publishers, fastest first, with the typical update speed (Google about 2 minutes, Apple Maps about 2 days). Opted-out publishers are never claimed.

## Data sources that mattered most

| Signal | How we used it | Where Connect would get it in production |
|---|---|---|
| **Exception-hour history** (`holiday_hours_history.jsonl`) | Last season's hours for the same day, or the season before (many owners enter hours every other year); the owner's own earlier edits | Connect's audit log / the Yext entity's change history |
| **What Google shows now** (`entities.json`: regular week + entered exceptions) | The thing we compare against: no suggestion when it is already right | Yext Knowledge Graph *Entities* |
| **Shopping-centre hours** (centres in `entities.json`) | A store inside a centre gets the centre's hours, but only if it normally keeps them | Centres' own Yext entities or API integrations |
| **Peer benchmarks** (`peer_benchmarks.csv`) | The no-history case: if most similar businesses are closed, propose closed with low confidence and ask | Connect's own anonymised data across customers |
| **Customer contacts + publishers** (`customer_contacts.csv`, `listings.json`) | Channel, language, contact window, opt-out, standing permission; where the change shows and how fast | Connect CRM; Yext *Listings* |

Reviews and Google user edits (`reviews.json`, `publisher_suggestions.json`) are used to flag businesses that have closed for good. More detail: [`docs/predict.md`](docs/predict.md) and [`docs/data-sources.md`](docs/data-sources.md).

## Results on Fonecta's scorer

`evaluation/evaluate.py` on the dev businesses (the organisers score the hidden test set):

| | Score | Exact precision | Changes found | Harmful | Search views protected |
|---|---|---|---|---|---|
| Fonecta baseline, 2026 | 54.5 | 0.90 | 0.59 | 224 | 57.2 % |
| **Ours, 2026** | **62.1** | 0.89 | 0.68 | 263 | 66.6 % |
| Fonecta baseline, 2025 back-test | 53.2 | 0.90 | 0.58 | 249 | – |
| **Ours, 2025 back-test** | **61.0** | 0.88 | 0.66 | 296 | – |

We make more suggestions than the baseline, so the number of harmful ones (wrong open/closed state) is also higher. Every suggestion still needs the owner's approval or a standing permission they gave.

## What we tried that didn't work

- **Our own invented seed first.** Before the dataset arrived we built rules for disagreeing channels and stale fields on 8 made-up Turku businesses. Fonecta's data has one published profile per business, so those rules were retired and detection was rebuilt around special days.
- **A table of what each business type usually does** (learned from the dev truth): 60.5–61.2 with up to twice the harmful suggestions. Each owner's own habit matters more than the group average.
- **Last year's drop in customer actions** (`analytics_daily.parquet`) as a sign the business was closed: real, but too weak on its own.
- **Other peer thresholds:** either more harmful suggestions or fewer changes found; we kept the baseline's 0.7 / 0.15.
- **Yext sandbox limits:** it has no live listings, so "where it shows" comes from the dataset's publishers; it rejects the dataset's fake phone numbers; and a slow write once made us report a saved change as failed, so we now read Yext back after a timeout.
- **Gemini free tier:** rate limits make many messages fall back to templates. The demo still works, because the hours never come from the LLM.

## Customer with no history

`FI-D0017` Kahvila Kipinä joined in October 2026 and has no exception history and no earlier decisions. Connect still notices the problem (Google shows regular hours on Christmas Day), does not pretend to know the answer, and asks. Most similar cafés nearby are closed, so it proposes closed with **low confidence** and phrases it as a question:

> Hi Aino, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–17:00 (on the same day last year, your listing was seen 33 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Day 25 Dec closed.

When there is no history and no clear peer pattern, Connect stays quiet. Whatever the owner answers becomes history for next season. More in [`docs/no-history.md`](docs/no-history.md).

## Final customer messages

Exported from the app on 7 Nov 2026 (`DEMO_DATE` 2026-11-06): 52 messages for 13 businesses, all 52 validated by code. English is the demo language; every message is also stored in the owner's language. The full export, with each message's data, is [`docs/customer-messages.md`](docs/customer-messages.md) (`node scripts/export-messages.mjs --fresh`).

**Kahvila Aurora, Helsinki (`FI-D0001`, SMS), English and Finnish**
> Hi Aleksi, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 07:30–18:00 (on the same day last year, your listing was seen 29 times on Google). Last year you were open 07:30–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 07:30–13:00.

> Hei Aleksi, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 29 kertaa). Viime vuonna olitte auki klo 7.30–13, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 7.30–13.

**Kafé Linnea, Stockholm (`SE-D0008`, e-mail), Swedish: an early opening on St Lucy's Day**
> Hej Maria, luciadagen infaller söndag 13/12 och Google visar nu era vanliga öppettider: öppet 10–17 (samma dag förra året visades ni 43 gånger på Google). År 2024 hade ni öppet 7–18, men inga avvikande tider är inlagda i år. Vi föreslår: luciadagen 13/12 öppet 7–18.

**Bakeri Fjord, Bergen (`NO-D0009`), Norwegian**
> Hei Marte, første juledag er fredag 25.12 og Google viser nå de vanlige åpningstidene deres: åpent 7–18 (samme dag i fjor ble dere vist 13 ganger på Google). I fjor hadde dere stengt, men ingen avvikende åpningstider er lagt inn i år. Vi foreslår: første juledag 25.12 stengt.

**Follow-ups after the owner answers** (fixed texts, no LLM; Kahvila Aurora)

| Owner | Connect replies |
|---|---|
| approves | Thanks Aleksi, done: Christmas Eve 24 Dec open 07:30–13:00 now shows on Google and your other listings. |
| edits to 09:00–12:00, 13:00–15:00 | Thanks Aleksi, your change is saved: Christmas Eve 24 Dec open 09:00–12:00 and 13:00–15:00. It now shows on Google and your other listings. |
| declines | OK Aleksi, we won't change your hours for Christmas Eve 24 Dec and won't ask about it again. |

**Standing permission** ("handle public holidays from now on", Tilitoimisto Otso `FI-D0012`):
> Hi Laura, as you asked, we set Christmas Eve 24 Dec closed. It now shows on Google and your other listings; reply if it should be different.

> Hei Laura, kuten pyysitte, merkitsimme: jouluaatto 24.12 kiinni. Se näkyy nyt Googlessa ja muissa palveluissa; vastaa tähän, jos haluatte muuttaa sitä.

## Bonus: live source

Not done yet. The plan (stage C8) is to fetch public holidays from a live API with the dataset's calendar as the fallback; [`docs/data-sources.md`](docs/data-sources.md) will record what we learn.

## Architecture

Next.js 16 (App Router) + TypeScript, MongoDB, Tailwind. All external APIs (Gemini, Yext, ElevenLabs) are called only from server code, through wrappers with timeouts and fallbacks.

| Step | Code |
|---|---|
| Detect | `lib/predict/` (shared with the scorer), `lib/rules/`, `POST /api/detect` |
| Suggest | `lib/ai/` (Gemini wrapper, templates, learning), `lib/validate.ts`, `POST /api/suggest` |
| Contact | `app/contact/[businessId]` |
| Decide | `app/owner/[businessId]`, `lib/apply.ts`, `POST /api/suggestions/[id]/decide` |
| Apply | `lib/yext/` (write, read-back, publishers), `scripts/yext-*.mjs` |

Hours of every shape (`10:00-14:00,17:00-22:00`, `18:00-02:00`, `00:00-23:59`) go through one helper, `lib/hours.ts`. The same loop (detect → suggest → contact → decide → apply) would serve automatic posts and review replies. Design: [`DESIGN.md`](DESIGN.md).

## Third-party code, data and licences

| Component | Licence |
|---|---|
| Next.js, React, React DOM | MIT |
| MongoDB Node.js driver | Apache-2.0 |
| Google Gen AI SDK (`@google/genai`) | Apache-2.0 |
| ElevenLabs JS SDK | MIT |
| zod, server-only | MIT |
| Tailwind CSS | MIT |
| hyparquet (dev, reads the analytics file) | MIT |
| TypeScript | Apache-2.0 |
| ESLint, eslint-config-next, @types/* (dev) | MIT |
| Fonecta's *Connect Suggests* dataset (`data/fonecta/demo.json` is an extract) | CC BY 4.0, "Connect Suggests simulator, Since AI ry 2026" |
| Fonecta's scorer and baseline (used offline, not in this repo) | MIT |

All 493 installed packages, including indirect ones: MIT 377, Apache-2.0 44, ISC 17, BSD 22, MPL-2.0 13, LGPL-3.0 14, other permissive 6. **No GPL or AGPL.** The LGPL-3.0 packages are prebuilt `libvips` binaries for `sharp`, the optional image library Next.js uses for image optimisation. The MPL-2.0 packages are `lightningcss` (Tailwind's CSS compiler) and `axe-core` (linting only).

Services used through their APIs: Google Gemini, Yext (our sandbox), MongoDB Atlas, ElevenLabs. All data is synthetic; no real business or personal data is used, and no API keys are in this repository.
