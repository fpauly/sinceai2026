# Data sources behind Ajantasa

Ajantasa (a Fonecta Connect feature) only works if Connect knows two things: **what the business
says about itself on each channel**, and **what is about to change around it**. This doc lists the
sources we rely on, what each one contributes, and — honestly — what we could not get in 48 hours.

Owned by lane C (with input from lane A, `DESIGN.md` §18). The demo runs on mock data
(`data/seed.ts`), so for each source we say what the production version would read instead.

| # | Source | Used by | Demo implementation | Production source |
|---|---|---|---|---|
| 1 | Finnish public holiday calendar | rule 1 (`missing_holiday_hours`) | hardcoded list, `lib/holidays.ts` | official calendar / Yext holiday hours / live API (C8) |
| 2 | Last year's holiday hours | rule 1 evidence + the proposal | `listings.holiday_hours`, seeded | Connect/Yext entity history |
| 3 | Cross-channel listings (Finder, Google, website) | rules 2 and 4 (conflicts, staleness) | 3 mock `listings` per business | Yext publishers / Google Business Profile / Connect's own channels |
| 4 | Recent customer reviews | rule 3 (`review_signal`, extra) | 12 mock reviews, classified by Gemini | Google/Finder review APIs |
| 5 | Owner decisions | learning + standing permissions | `preferences` collection | Connect CRM / Yext |

A useful cross-cut: rules 2 and 4 need **when** a field was last updated
(`listings.field_updated_at`). That metadata is the hardest thing to get in production — see §6.

---

## 1. Finnish public holiday calendar

**Answers:** "is a public holiday coming up in the next 30 days?" — the trigger for step 1 of the
demo, and the reason a customer can find a locked door.

**In the demo:** `lib/holidays.ts` hardcodes six holidays covering the demo window
(Independence Day 2026-12-06, Christmas Eve/Day/Boxing Day 2026-12-24/25/26, New Year's Day
2027-01-01, Epiphany 2027-01-06) with English and Finnish names. The window is
`today < date <= today + 30 days`, where `today` is `DEMO_DATE` (`2026-12-10`), so the demo is
deterministic and never depends on the venue's network.

**In production:** Connect already stores holiday hours per location (Yext has a
`holidayHours` field). The calendar itself can come from:

- an official Finnish calendar (Digi- ja väestötietovirasto publishes public holidays; the data is
  also in the open `date-holidays` / Nager.Date style datasets), or
- Yext's own suggested holiday hours where the publisher offers them, or
- a curated calendar maintained by Connect (six dates a year — cheap and safe).

**What did not work / limits:** we did not verify a free, machine-readable, licence-compatible
source during the hackathon, so we did not ship a live fetch; hardcoding six dates was the safe
choice for a deterministic demo. C8 (extra) is the stage that replaces the list with a live source
and records what happened.

---

## 2. Last year's holiday hours

**Answers:** "what did this business do last Christmas?" — the evidence that turns a guess into a
high-confidence proposal ("same as last year"), and the difference between the Rye & Shine demo and
the no-history case (Parturi Kampaamo Linnankatu).

**In the demo:** each mock listing carries `holiday_hours` for the previous season
(e.g. `2025-12-24: "10:00-14:00"`). Rule 1 reads the same month-day one year earlier, from the
listing whose `holiday_hours` was updated most recently, and stores it as
`evidence.last_year` (`{}` when there is none). The proposal copies it; `lib/validate.ts` checks the
owner is only offered the dates that are actually missing.

**In production:** the business's own past hours, from

- the Yext entity's history for that location (holiday hours set last season), or
- Connect's change log (what we published last year), or
- the owner's previous decisions stored in `preferences.learned`.

**What did not work / limits:** our Yext sandbox entity (Rye & Shine, `SinceAI03`) has **no holiday
hours set at all**, so reading real history from Yext was not possible; the seed mirrors what Yext
holds for regular hours only. A production system also has to handle "last year's hours are wrong
this year" — which is exactly what the owner's edit + `learned` entry exists for.

---

## 3. Cross-channel listings (Finder, Google, the business website)

**Answers:** "do the channels disagree?" (rule 2) and "has this field been untouched for over a
year?" (rule 4) — the two signals that produce a proposal even when no holiday is coming.

**In the demo:** three listings per business (`finder`, `google`, `website`) with opening hours,
holiday hours, phone, description and `field_updated_at`. The seed plants the story: Rye & Shine's
own website says Saturday `10:00-14:00` (updated 2026-10-20) while Finder and Google still say
`10:00-18:00`; Autokorjaamo Skanssi's Google phone number differs; Kukkakauppa Kauppatori's opening
hours have not changed since 2024-05-14. Evidence lists every value with its source and update date,
so lane A can prefer the newest source and say why.

**In production:** Connect is the aggregation point — Yext publishers (Google Business Profile,
Apple, Bing, Facebook, Foursquare, HERE, TomTom, …) and Finder itself. In practice:

- **our own channels (Finder, website)** are the easy part; Connect controls them;
- **publisher channels (Google, Apple, …)** can be read through Yext's publisher status or the
  Google Business Profile API;
- **the business's own website** would need either the site's structured data (`schema.org`
  `OpeningHoursSpecification`) or an integration/CMS plugin — or we simply use it as a *hint*
  ("your website changed, shall we propagate it?"), which is what the demo suggests.

**What did not work / limits:** we did **not** scrape Finder or Google (out of scope per
`DESIGN.md` §5, and fragile/unfriendly). Yext's sandbox has **0 live listings** on our entity, so
`published_to` (where the owner is told the change shows) is derived from Yext's set of publishers
that support Finnish locations, not from live listings. Real per-source values therefore come from
our seed, not from the APIs.

---

## 4. Recent customer reviews

**Answers:** "did a customer just tell us the listing is wrong?" (rule 3, extra) — e.g. Rye &
Shine's "came on Saturday at 3 pm and the door was locked, although Google said open until 18", or
Pizzeria Port Arthur's "walked to the old address, a note said they moved".

**In the demo:** 12 mock reviews with dates and ratings. Rule 3 (extra, C9) takes the last 30 days,
and `lib/ai/reviews.ts` (A8) asks Gemini to classify the text into
`closed_when_open | wrong_phone | moved | other` with a one-sentence summary and the review ids it
used. Gemini only reads text — dates are filtered in code, and a classification without valid
evidence is discarded (`NO_SIGNAL`).

**In production:** Google Business Profile reviews API (with the location owner's OAuth), Finder
reviews via Connect, and Facebook recommendations. The same pipeline would also serve review replies
(the extensibility story in `DESIGN.md` §0).

**What did not work / limits:** no real review API access within the hackathon, so the reviews are
written by us; without a `GEMINI_API_KEY` the classifier returns `NO_SIGNAL` and the rule produces
nothing (the demo still works, it just has no review issue).

---

## 5. Owner decisions (learning)

**Answers:** "what did the owner do last time?" — used to improve the next suggestion and to honour
standing permissions.

**In the demo:** `preferences.learned` (proposed vs final value, decision, timestamp) and
`preferences.standing_permissions` (`{ issue_type, field }`) are the target of lane D's
`applyDecision`; `preferences.ignored_fingerprints` is already written there and stops a declined
issue from coming back (`runDetection` skips those fingerprints). At the time of writing the
`ignored_fingerprints` path is live; the `learned` / `standing_permissions` entries land with D5
(learning), and lane A reads them when building the prompt/fallback.

**In production:** Connect's customer record + the Yext entity's change history. This is the only
source that is *ours* — no third party can provide it, which is why the learning loop is the
defensible part of the product.

**What did not work / limits:** in the demo one owner decision is enough to change the next
suggestion, so "learning" is easy to over-claim. With real data we would need enough volume per
business and change type before a learned preference is trusted, and we would need to expire stale
preferences (a business may change its Christmas pattern).

---

## 6. The metadata problem: "when was this field last updated?"

Rules 2 (prefer the newest source) and 4 (stale fields) both depend on
`listings.field_updated_at.{opening_hours,holiday_hours,description}`. It is the least realistic
part of our mock data:

- **Yext** does not expose a per-field "last updated" timestamp for publisher channels; it exposes
  the entity and its sync state.
- **Google Business Profile** gives you the location's data and change history through the API in
  some cases, but not a simple per-field timestamp per publisher.
- What is realistic: Connect's **own** change log (when *we* last wrote the field) plus the
  publisher's acknowledgement time, and the business's website's own `dateModified`.

So in production we would store "last changed by us / last confirmed by the publisher" ourselves and
treat a missing timestamp as "unknown" rather than "stale" — a rule that guesses staleness from a
missing date would nag the owner, which is exactly the behaviour the product must avoid.

Also note: phone numbers have no timestamp in our data model (`TrackedField` covers
`opening_hours`, `holiday_hours`, `description`), so a phone conflict is detected (rule 2) but can
never be called "stale" (rule 4).

---

## 7. What we wanted but could not get

| Wanted | Why | What we did instead |
|---|---|---|
| Fonecta's dataset files | replace the mock businesses with real ones | kept `data/seed.ts` (8 Turku businesses); importer is stage C6, still TBD |
| A machine-readable holiday calendar we could rely on | one fewer hardcoded list | six hardcoded dates in `lib/holidays.ts`, live source deferred to C8 |
| Yext entity history / live listings in the sandbox | real "last year" and real `published_to` | seeded last-year hours; `published_to` from Yext's publisher list for Finland |
| Google Business Profile / Finder read access | real conflicts and real reviews | mock listings and reviews; Gemini classifies the mock review text |
| WhatsApp Business API | send the real message | simulated WhatsApp chat in the contact preview (`DESIGN.md` §12); WhatsApp is confirmed as a valid channel by Fonecta |
| Per-field publisher timestamps | honest "stale" and "newest source" reasoning | documented limitation above; demo still shows the mechanism |

## 8. Bonus: one dataset replaced with a live source (C8)

Planned, not done yet: fetch upcoming Finnish public holidays from a live HTTP API (candidate:
Nager.Date, MIT-licensed, `https://date.nager.at/api/v3/PublicHolidays/<year>/FI`), with a short
timeout, one retry, a cache, and the hardcoded `HOLIDAYS` list as fallback. Detection stays
deterministic because the **window** still comes from `DEMO_DATE`; only the list of dates changes.
When C8 lands, this doc gets a short "what we learned" section: whether the API was reachable from
the venue, response shape, licence, and whether it matched the official Finnish calendar (it should
include Christmas Eve, which is a de facto holiday but not an official public holiday).
