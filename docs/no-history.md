# How Connect behaves for a customer with no history

Fonecta asked: *what does the system do for a business it knows nothing about yet?*
Short answer: **it only speaks up when similar businesses agree, it says it is not sure, and it asks.**

## The case: `FI-D0017` Kahvila Kipinä

A café in Turku that has never entered special hours: **0 entries** in the exception history.
Google shows its regular hours (08:00–17:00) on every holiday.
Its owner, Aino, prefers SMS in Finnish, between 12 and 16.

The best evidence Connect has for a business is what that business did on the same day before (`docs/predict.md`, rules 1–3).
Kipinä has none of that, so only the last rule applies: **similar businesses**.

## What happens, step by step

1. **Detection does not need history.** `lib/predict` looks at every special day for every business. For Kipinä, rules 1–3 find nothing.
2. **Similar businesses decide, but only when they clearly agree.** Code reads Fonecta's peer benchmarks for the same
   country, city size and segment (Finnish cafés in large cities, 636 business-days per day).
   Connect proposes **closed** only when at least **70 %** of the cafés that entered something were closed, **and** at least **15 %** of all of them entered "closed":

   | Day | Closed, among cafés that entered something | Entered "closed", of all | Connect |
   |---|---|---|---|
   | Christmas Day | 86 % | 38 % | suggests **closed** |
   | New Year's Day | 76 % | 31 % | suggests **closed** |
   | Boxing Day | 62 % | 21 % | nothing: peers don't agree enough |
   | Epiphany | 41 % | 13 % | nothing |
   | Independence Day | 39 % | 12 % | nothing |
   | Christmas Eve | 34 % | 13 % | nothing |
   | New Year's Eve | 13 % | 2 % | nothing |

   Code makes this choice, not the LLM, so it is the same every time and never invents hours.
   It never proposes opening hours from peers (each café's hours differ), only "closed".
3. **Confidence is low.** Both suggestions have confidence **low**, and the owner card shows them as "please check".
4. **The message asks instead of telling.** The basis sentence becomes a question. The same validation applies as for every message
   (`lib/validate.ts`: only that date, exactly the decided hours, at most two sentences plus the suggestion line).
5. **The owner decides.** Approve, edit (for example "open 10–14") or decline. Nothing is published before that.
6. **Next time there is history.** Whatever Aino confirms is saved to her profile and published through Yext.
   From then on Connect uses her own answer: it does not ask again about a date she has set
   (rule 0b), and next season the same day has *her* hours to copy (rules 1 and 3, confidence high).

## The real messages (exported from the app, see `docs/customer-messages.md`)

**Christmas Day**, proposed closed, confidence **low**:

> Hi Aino, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–17:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Day 25 Dec closed.

In Finnish, as Aino receives it:

> Hei Aino, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8–17. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: joulupäivä 25.12 kiinni.

For comparison, **`FI-D0001` Kahvila Aurora**, which has history (confidence **high**):

> Hi Aleksi, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 07:30–18:00. Last year you were open 07:30–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 07:30–13:00.

## Is it right? (Fonecta's scorer)

The peer rule is the same as Fonecta's baseline (thresholds 0.7 and 0.15). We tried others (closed share 0.6–0.8,
entered-closed share 0.1–0.35) on the dev businesses: they either produced more harmful suggestions or found fewer real changes,
so we kept these. A wrong "closed" is the most harmful mistake (a customer stays away from an open café), which is why
Connect stays quiet on days where peers are split, like Boxing Day.

## Why this design

- **Cautious, not silent.** On Christmas Day most cafés are closed; leaving "open 08:00–17:00" on Google sends customers to a locked door.
- **Not guessing either.** Where peers are split, a guess is as likely to hurt as to help, so Connect says nothing.
- **Code chooses, AI explains.** The thresholds are fixed code that is easy to check; every message is validated before the owner sees it.
- **One answer fixes it.** The owner's reply becomes the history for next year.
