# How Connect behaves for a customer with no history

Fonecta asked: *what does the system do for a business it knows nothing about yet?*
Short answer: **it still notices the problem, it does not pretend to know the answer, and it asks.**

## What "no history" means here

For holiday hours, the best evidence is what the business did on the same days last year.
A business has **no history** when none of its listings (Finder, Google, own website) has hours for those days last season.
In the demo:

| Business | Situation |
|---|---|
| **Parturi Kampaamo Linnankatu** (hair salon) | No holiday hours at all, ever. Full no-history case. |
| **Kuntosali Itäharju** (gym) | Has hours for this Christmas, but nothing for New Year's Day, this year or last year. No history *for that date*. |
| Rye & Shine Bakery (for comparison) | Had hours for every holiday last season, so Connect proposes the same again with confidence *high*. |

## What happens, step by step

1. **Detection does not need history.** The rule compares the public holiday calendar with the listings
   (`lib/rules/missingHolidayHours.ts`). A business with no history gets the same "holiday hours are missing" issue as everyone else.
   The evidence simply says `last_year: {}`.
2. **The proposal falls back to the common pattern for the category, chosen by code** (`lib/ai/fallback.ts`):
   - Christmas Eve: a short day, from the business's usual opening time on that weekday until 14:00 at the latest
     (closed if it usually opens later or is closed that day);
   - the other public holidays: closed.

   Code makes this choice, not the LLM, so it is the same every time and never invents hours.
   Each date is handled on its own: dates with last year's hours copy them, dates without use the pattern.
3. **Confidence is lowered.** All dates from the pattern → confidence **low**. Some from last year, some from the pattern → **medium**.
   The owner view shows a low-confidence card with a "please check" badge.
4. **The message is a question, and it says why.** It says the hours are a common pattern for this kind of business, not the owner's own data,
   and asks whether to use them. Gemini writes the wording; code checks it (`lib/validate.ts`: only the issue's dates,
   valid hours, at most two sentences). Without Gemini, a fixed template says the same thing.
5. **The owner decides.** Accept, edit (for example "open 10–14 on New Year's Day") or ignore. Nothing is published before that.
6. **Next time there is history.** Whatever the owner confirmed is written to all listings and Yext, so next season the
   business has last year's hours to copy. Learning (stage A5, not built yet) will also reuse the owner's edits in the next suggestion.

## The real messages (exported from the app, see `docs/customer-messages.md`)

**Parturi Kampaamo Linnankatu**, no history at all. Proposed: Christmas Eve 09:00–14:00 (the salon opens at 09:00 on Thursdays), closed on the other four holidays. Confidence: **low**.

> Hi Sanna, your holiday hours are not set yet and I do not have last year's hours to copy, so would you like to use what most hair salons do, which is being open on Christmas Eve from 09:00–14:00 and closed on Christmas Day, Boxing Day, New Year's Day and Epiphany?

**Kuntosali Itäharju**, no history for New Year's Day. Proposed: closed on 1 Jan. Confidence: **low**.

> Hi Tomi, your hours for New Year's Day are not set anywhere yet and I could not find them from last year. Would you like me to set them as closed on New Year's Day, which is what most gyms do?

For comparison, **Rye & Shine Bakery** (has history), confidence **high**:

> Hi Liisa, your holiday hours for Christmas and New Year are not set yet so I can copy them from the same days last year, meaning Christmas Eve 10:00–14:00 and closed on Christmas Day, Boxing Day, New Year's Day and Epiphany. Shall I publish this everywhere?

Template version (used when Gemini is not available) for Parturi:

> Hi Sanna, the holidays (Christmas Eve – Epiphany) are coming up and your hours for them aren't set anywhere yet, and I can't find last year's hours for them. Shall I use what most hair salons do: Christmas Eve 09:00–14:00; closed on Christmas Day, Boxing Day, New Year's Day and Epiphany?

## Why this design

- **Cautious, not silent.** Saying nothing leaves customers at a locked door on Christmas Eve. Guessing with high confidence would be wrong.
  A clearly marked question is the honest middle.
- **Code chooses, AI explains.** The pattern is fixed code that is easy to check, and every message is validated before the owner sees it.
- **One answer fixes it.** The owner's reply becomes the history for next year.

## In production

The category pattern is hard-coded for the demo. With Fonecta's data, Connect could learn it from similar businesses:
the most common holiday hours of hair salons in the same city last year, with the share of businesses that used them as the confidence.
It would still be a proposal for the owner to confirm, never published on its own.
