# Data sources behind Ajantasa

Ajantasa is a feature of **Fonecta Connect**. It has to know two things to be useful: **what each
channel currently says about a business**, and **what is about to change around it**. Then it
proposes the hours, the owner approves, and the change is published.

Since V2 the app runs on **Fonecta's dataset** ("Connect Suggests – Customer Approves · Nordic
opening-hours simulator v1.1", synthetic, code MIT / data CC BY 4.0). The importer
(`scripts/import-fonecta.mjs`) turns the relevant files into `data/fonecta/demo.json` (committed, so
CI works without the 82 MB zip) and `/api/seed` loads it into MongoDB. For every source below we say
what it answers, how the demo uses it, what production Connect would read instead, and where it
falls short.

| # | Source | Answers | Demo file(s) |
|---|---|---|---|
| 1 | Special-day calendar, local events, school breaks | "is a special day coming up, and what does it do to hours?" | `calendar_special_days.csv`, `targets_2026.csv`, `local_events.json` |
| 2 | The business's profile and entrance history | "what does the listing say now, and what did this owner do last season?" | `entities.json`, `holiday_hours_history.jsonl`, `regular_hours_history.jsonl` |
| 3 | Shopping centre hours | "my neighbour already published the centre's holiday hours" | entities with `c_entityRole`, `API_INTEGRATION` history |
| 4 | Peer benchmarks | "what do similar businesses do on this day?" — the no-history case | `peer_benchmarks.csv`, `c_segment`, `cities.csv` |
| 5 | Google search views | "what is at stake if the door is locked?" | `analytics_daily.parquet` (read with `hyparquet`) |
| 6 | Reviews and publisher user edits | "did customers say this place is closed for good?" | `reviews.json`, `publisher_suggestions.json` |
| 7 | Owner decisions | "what did the owner choose last time?" — learning and permission | `pilot_decision_log_2025.csv`, `customer_contacts.csv`, our `preferences` |
| 8 | Publisher listings | "where will the change show, and how fast?" | `listings.json` |

---

## 1. Special-day calendar, local events, school breaks

**Answers:** the trigger of the whole loop. For every business and every special day in the scored
window (7 Nov 2026 – 6 Jan 2027), Connect must decide *suggest new hours*, *no action*, or *flag a
human*. The calendar also says what kind of day it is (public holiday, eve, observance, commercial
day, day between holidays) and whether it is an official public holiday.

**In the demo:** `calendar_special_days.csv` has 244 rows for FI/SE/NO (2024–2027) with `day_key`,
`day_class`, `day_type`, local and English names, and the official-holiday flag. The importer keeps
it as `special_days`. `targets_2026.csv` adds business-specific `EVENT` and `SCHOOL_BREAK` rows (25
for the demo cast); `local_events.json` (2,010 events, fi/sv/nb/en names) names the events, so
`FI-D0010` Pub Kulma gets its nine arena nights and `FI-D0005` Suksivuokraamo Kuura its three school
break days. Business-specific rows carry `business_id`, so no other business sees them.

Detection never compares dates with an LLM: `lib/predict` is pure code, the window starts at
`DEMO_DATE`, and the LLM only writes messages later.

**In production:** Connect already receives holiday-hours suggestions from Yext publishers and can
maintain a Nordic calendar centrally; local events can come from city event APIs (FI/SE/NO), and
school breaks from the national education calendars. The dataset's `docs/LIVE_SOURCES.md` describes
the same idea.

**Did not work / limits:** the dataset is synthetic and fixed to the 2026 season; there is no live
feed in the demo yet. The **C8 bonus** replaces the public-holiday part with a live API while keeping
the dataset and a hardcoded fallback (see the end of this document).

---

## 2. The business's profile and its exception history

**Answers:** what the published profile says today (regular week + exceptions already entered), and
what this owner entered for the same kind of day in previous seasons — the strongest basis for a
proposal ("same as last year").

**In the demo:** `entities.json` (3,032 businesses, FI/SE/NO) gives the Yext-shaped profile:
`hours.monday … sunday`, `hours.holidayHours[]`, `closed`, `hours.reopenDate`, `c_segment`,
`c_connectCustomerSince`, contact and publishers. `holiday_hours_history.jsonl` has every exception
since Dec 2023 with `entered_at` and **how it was entered**: `OWNER_UI`, `CONNECT_SUGGESTION` (the
2025 pilot), `FONECTA_SUPPORT`, `API_INTEGRATION` (centres). `regular_hours_history.jsonl` resolves
`isRegularHours` entries against the week that was in force at the time. The importer stores profiles
(`regular_hours`, `holiday_hours`) and the history rows (1,102 for the demo cast).

`lib/predict` only uses entries entered **before** `DEMO_DATE`, so the same code can run a 2025
back-test honestly.

**In production:** the Yext entity plus Connect's own change log. This is the data Connect already
has; the proposal is "copy what the owner did, then let them fix it".

**Did not work / limits:** one profile per business means we cannot show per-publisher values (what
Google says vs what Finder says) — the old v1 seed had three disagreeing listings, v2 deliberately
does not. "What Google shows on a date" is defined as *the exception if entered, else that
weekday's regular hours*.

---

## 3. Shopping centre hours

**Answers:** for a shop inside a centre, the centre's published exception is a very strong signal:
"the mall closes at 13:00, so do you".

**In the demo:** `FI-D0004` Muoti Lyhty sits in `FI-M000` Kauppakeskus Revontuli. The importer keeps
the centres' profiles and history, and `lib/predict` uses the centre's exception when the store's
regular hours match the centre's that weekday (basis `SHOPPING_CENTRE`, confidence high).

**In production:** the same, from Yext / Connect: a centre is a customer too, and its hours are
already maintained.

**Did not work / limits:** the demo has 15 centres but only one store inside a centre, so the rule is
shown once. The signal is only used when the store and the centre share a weekday pattern.

---

## 4. Peer benchmarks

**Answers:** the no-history case. A new customer has no previous season and no decisions; asking
"what do cafés like this do on Christmas Eve?" is better than guessing or staying silent.

**In the demo:** `peer_benchmarks.csv` aggregates what owners entered per country, city tier
(`capital`, `large_city`, `town`, `ski_resort`), segment (33 types) and day key — only cells with at
least 10 businesses. The importer keeps 421 rows for the demo cast's combinations.
`lib/predict` suggests "closed" from peers only when most who entered something closed and enough
did (basis `PEERS`, confidence low). `FI-D0017` Kahvila Kipinä (joined 12 Oct 2026) shows exactly
this: two peer-based suggestions with low confidence, and the message asks instead of telling.

**In production:** the same aggregates computed over Connect's own customer base, refreshed per
season.

**Did not work / limits:** the benchmarks describe what owners *entered*, so they are biased towards
diligent owners; and a small segment/city combination may have no cell at all. That is why the
confidence is low and the owner has the last word.

---

## 5. Google search views — what is at stake

**Answers:** "if we get this wrong, what does it cost?" A special day is a day when people search;
the number makes the message concrete instead of nagging.

**In the demo:** `analytics_daily.parquet` (18 MB, 3.1M rows) has `GOOGLE_SEARCH_VIEWS` per
entity and day. The importer reads it with `hyparquet` (MIT, devDependency, scripts only) and stores,
per business and day key, the views on the **same special day last season** (Christmas Eve 2025 for
Christmas Eve 2026). Detection copies the number into `evidence.expected_search_views`, so lane A's
message can say "last Christmas Eve about 29 people found you on Google" — and the number comes from
code, never from the LLM. `FI-D0001` Christmas Eve = 29 views.

**In production:** Google Business Profile performance API (plus Finder/Connect analytics), per
business and per day.

**Did not work / limits:** the dataset only has search views (no per-channel attribution, no
conversion data), and we do not use the file to prioritise which businesses to contact first — that
would be a later extra. The number is last season's, so it is an honest *estimate* of what is at
stake, not a promise.

---

## 6. Reviews and publisher user edits — closure signals

**Answers:** "has this place closed for good?" Sending an owner a holiday-hours proposal for a
business that no longer exists is worse than doing nothing, so this must be a **flag for a person**,
not a suggestion.

**In the demo:** `reviews.json` (59,856 reviews; 245 with text kept for the demo cast) and
`publisher_suggestions.json` (5,843 user edits; 40 kept). A 150-day window, a keyword list per
language ("lopettanut", "pysyvästi", "stängt för gott", "closed down", "lagt ned", …) and
`fieldName: "closed"` edits decide it. `FI-D0011` Pizzeria Torni has five such reviews and a
2026-10-14 `closed` edit, so detection produces one `needs_human/closed_for_good` issue; the owner
never receives a message, and the dashboard lists it as "needs a person".

**In production:** Google Business Profile reviews (owner OAuth), Finder reviews, Facebook
recommendations, and publisher edit notifications from Yext.

**Did not work / limits:** the reviews are synthetic and keyword matching is deliberately simple —
an LLM classifier could read them, but then a closure decision would depend on a model. The current
split is: **code decides that a person must look**, the person decides what to do. Reviews are
*also* the natural place to grow review replies later (the extensibility story).

---

## 7. Owner decisions — learning and permission

**Answers:** "what did this owner do last time?" — so the next proposal uses it; and "may we just do
it?" — the standing permission.

**In the demo:** `pilot_decision_log_2025.csv` is the 2025 pilot: 3,031 suggestions and what owners
did with them. Our own `preferences` collection stores `learned` entries (proposed vs final value,
decision, time), `ignored_fingerprints` (a declined issue does not come back) and
`standing_permissions`; `customer_contacts.csv` adds `standing_permission_holidays` per owner, which
the app treats as a standing permission for `special_day_hours` (`FI-D0012` is applied and then
informed). `lib/predict` reads `learned` first (`OWNER_EDIT`), before last season, the centre or
peers.

**In production:** Connect's customer record, the pilot log, and the Yext change history. This is
the only source that is *ours* — no third party can provide it, which is what makes the loop
defensible.

**Did not work / limits:** the demo freezes `DEMO_DATE`, so decisions do not age; a real system needs
enough volume per business and change type before a learned preference is trusted, and should expire
stale ones (a business may change its Christmas pattern). Standing permissions are per change type,
not per date.

---

## 8. Publisher listings — where the change will show

**Answers:** step 5 of the chain: after the owner approves, tell them where it shows and how fast.

**In the demo:** `listings.json` gives each business's publishers with `status` (LIVE,
WAITING_ON_PUBLISHER, OPTED_OUT, …) and `typicalUpdateSpeedSeconds` (Google about 2 minutes, Apple
about 2 days). The importer keeps them on the business; the Yext write goes to the sandbox entity for
`FI-D0001` and the confirmation lists only publishers that are really live for that business.

**In production:** Yext publisher status per location; the write path is Yext itself.

**Did not work / limits:** the sandbox has **0 live listings**, so the green "published" animation is
driven by the dataset's publisher set, not by a real propagation check. Facebook is OPTED_OUT for
Aurora and is therefore not claimed.

---

## What we wanted but could not get

| Wanted | Why | What we did instead |
|---|---|---|
| Real Finder / Google Business Profile APIs | real conflicts, real reviews, real views | Fonecta's synthetic dataset (CC BY 4.0); no scraping |
| Per-publisher values and per-field timestamps | "which channel is wrong, since when?" | one profile per business; `entered_at` from the exception history |
| A live Nordic holiday calendar | one fewer dataset file to trust | dataset calendar now; C8 tries a live public-holiday API with the dataset as fallback |
| Real WhatsApp / SMS sending | reach the owner where they are | simulated chat in the contact preview; WhatsApp is confirmed as a valid channel by Fonecta |
| Propagation confirmation from publishers | "published everywhere" honestly | publisher list + typical update speed, with Facebook OPTED_OUT excluded |
| Real analytics attribution / conversions | prioritise by revenue, not only views | `GOOGLE_SEARCH_VIEWS` as an honest estimate of what is at stake |

## Bonus: one dataset file replaced with a live source (C8)

Planned, not done yet. Candidate: **Nager.Date** (MIT,
`https://date.nager.at/api/v3/PublicHolidays/<year>/<CC>`), which returns official public holidays
per country and year. Plan:

- the importer fetches the public holidays for FI/SE/NO for the seasons it imports, with a short
  timeout, one retry and a cache, and uses them to **confirm or correct** the public-holiday dates
  and names in `calendar_special_days.csv`;
- everything the dataset knows beyond official holidays (eves, observances, commercial days, local
  events, school breaks) stays from the dataset — a live API cannot replace those;
- `DEMO_DATE` still defines the window, so detection stays deterministic; if the API is unreachable,
  the dataset rows are used unchanged;
- a short "what we learned" section will record coverage, response shape, licence, and any
  differences from the official Finnish calendar (e.g. Christmas Eve is a de facto holiday but not
  an official public holiday).
