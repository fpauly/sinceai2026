# How Connect decides the hours (`lib/predict`)

For every business and every special day from 7 Nov 2026 to 6 Jan 2027, `lib/predict` decides one of three things:
- **SUGGEST** with hours: Google will show something wrong, so the owner gets a suggestion.
- **NO_ACTION**: what Google shows is already right, so Connect stays quiet.
- **FLAG**: a human should look first.

The same code runs in the app (detection, step 1) and in `scripts/predict.mjs`, which writes `predictions_2026.csv` for Fonecta's scorer. So the score measures exactly what the demo shows.

It is plain code with no LLM: code decides the hours, Gemini only writes the message about them.
It uses only data entered before "today" (6 Nov 2026; 6 Nov 2025 for the back-test).

## The rules, strongest first

| # | Basis | Rule | Confidence |
|---|---|---|---|
| 0 | closed for good | Google/Apple/Bing users marked the place closed, or a review in the last 150 days says "closed down", and the listing is still open → **FLAG**, no message to the owner | – |
| 0b | – | The owner already set this date in Connect (approved, edited, or applied by standing permission) → **NO_ACTION**: their decision stands (app only; the scorer has no Connect decisions) | – |
| 1 | `OWNER_EDIT` | The owner edited this calendar day before, in Connect → their hours | high |
| 2 | `SHOPPING_CENTRE` | The centre has entered hours for the date **and** the store normally keeps the centre's hours on that weekday → the centre's hours | high |
| 3 | `LAST_YEAR` | What the owner entered for the same day last season; if nothing, the season before | high / medium |
| 3b | `LAST_YEAR` | **Event nights and school breaks** (different dates every year): the owner's latest entry for that kind of day, same weekday preferred (for example the autumn break, or the last arena night) | medium |
| 4 | `PEERS` | No history: when ≥ 70 % of similar businesses (same type, country, city size) that entered something were closed, and ≥ 15 % of all of them entered "closed" → **closed** | low |

The result is a suggestion only when it differs from what Google shows now. Otherwise it is NO_ACTION.

## Score (Fonecta's `evaluation/evaluate.py`, dev businesses)

| | Score | Exact precision | Recall | Harmful |
|---|---|---|---|---|
| Fonecta baseline, 2026 season | 54.5 | 0.90 | 0.59 | 224 |
| **Ours, 2026 season** | **62.1** | 0.89 | 0.68 | 263 |
| Fonecta baseline, 2025 back-test | 53.2 | 0.90 | 0.58 | 249 |
| **Ours, 2025 back-test** | **61.0** | 0.88 | 0.66 | 296 |

Search views protected (2026): 66.6 % (baseline 57.2 %). Closed-door views prevented: 76.0 % (baseline 69.2 %).

What made the difference:
- **The season before last** (+6.6 on 2026). Many owners enter holiday hours every other year, and their habits repeat. The baseline looks only one season back.
- **Shopping centre only when the store keeps the centre's hours** (+0.5, fewer harmful). Some stores in a centre close earlier than the centre does.
- **Event nights and school breaks from the owner's latest entry of that kind** (+0.6 on both seasons; about 70 % of these suggestions are exact). On event nights most businesses keep their regular hours, so we only suggest when the owner has entered event hours before.
- **Matching last season by the history's own day key, not by the calendar file** (2025 back-test only). The calendar file starts in 2024, so the baseline cannot find the December 2023 entries; ours can. All of these entries were entered before the snapshot.

### Tried, did not help (kept out)
- **A table learned from the dev businesses' true hours** (what each business type really does on each day when nothing was entered), cross-fitted on two halves of the dev businesses: 60.5–61.2 with up to twice the harmful suggestions.
  What matters is each business's own habit, and the group average cannot see it.
- **Last year's drop in customer actions** (`analytics_daily.parquet`) as a sign the business was closed that day: on wrong-hours days actions fall to about 0.6× normal, but on its own it predicts "closed this year" only about 40 % of the time.
- **Other peer thresholds** (closed share 0.6–0.8, entered-closed share 0.1–0.35): either more harmful suggestions or lower recall. We kept the baseline's 0.7 / 0.15.
- **Three seasons back** (when the last two seasons have nothing for that day, use the one before, confidence low): 64.8 on 2026 (+2.7, harmful 263 → 338).
  The 2025 back-test cannot confirm it, because the history starts in 2023. It would also break one of Fonecta's demo scenarios: `FI-D0013` Hammasklinikka Kallio
  has already entered correct hours ("right move: stay quiet"), but would get three "closed" suggestions for 28–30 Dec from a 2023 entry.
  Leaving out only those days (64.1) would be a special case made for one demo business, not a rule. So we kept two seasons, which both seasons confirm.
- **The owner's habit on the other big holidays** (closed on every one they entered last season → closed on the one they never entered): +0.2 to +0.3 on both seasons, with more harmful suggestions. Not worth a new kind of message.
- **Copying hours from a nearby day** (New Year's Eve from Christmas Eve, Epiphany Eve from New Year's Eve, the days between Christmas and New Year from New Year's Eve): lost points on both seasons, by 50–220 points per day type.
  Short days differ from each other even for the same business; only the same day's history works.

### Where the remaining points are
About 1,600 dev rows still need a change we don't suggest, and almost all of them have no usable history.
Next candidates: complaint reviews about specific dates, Google user edits for hours, the 2025 pilot log (owner edits and rejections), and events or school breaks for restaurants and family venues.

## Run it

```bash
# needs the dataset at FONECTA/FONECTA_CONNECT_SUGGESTS_2026/ (not committed)
node scripts/predict.mjs                    # -> predictions_2026.csv (all splits; organisers score the test rows)
python3 FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py --predictions predictions_2026.csv

node scripts/predict.mjs --season 2025      # honest back-test, snapshot 6 Nov 2025
python3 FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py \
  --predictions FONECTA/FONECTA_CONNECT_SUGGESTS_2026/outputs/predictions_2025.csv \
  --labels FONECTA/FONECTA_CONNECT_SUGGESTS_2026/labels/dev_labels_2025_backtest.csv
```

`PREDICT_DEBUG=FI-D0001 node scripts/predict.mjs` also prints the basis and data behind each prediction for those businesses.
Node prints a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning: it runs `lib/` (TypeScript) directly.

## Demo businesses (2026 season)

| Business | Result |
|---|---|
| FI-D0001 Kahvila Aurora | 4 suggestions from last year (Christmas Eve 07:30–13:00; closed on Christmas Day and New Year's Day; Epiphany 10:00–16:00 from the season before) |
| FI-D0004 Muoti Lyhty | 23–26 Dec from its shopping centre (Kauppakeskus Revontuli); NYE, New Year's Day and Epiphany from last year |
| FI-D0010 Pub Kulma | arena nights: 15:00–03:00 (14:00–05:00 on Saturdays), the hours the owner entered for earlier event nights |
| FI-D0014 Leikkimaa Onni | no earlier school-break entry, so no suggestion for the break (we don't guess) |
| FI-D0011 Pizzeria Torni | flagged on every date (closed for good), no message |
| FI-D0013 Hammasklinikka Kallio, NO-D0015 Trening Nordlys | nothing (already right) |
| FI-D0017 Kahvila Kipinä | no history: closed on Christmas Day and New Year's Day, from peers, confidence **low** |
