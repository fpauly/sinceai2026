# Customer messages

The messages Fonecta Connect sends to business owners, **exported from real suggestions** the app made on Fonecta's dataset
(`node scripts/export-messages.mjs --fresh`: `/api/seed` → `/api/detect` → `/api/suggest`). Do not edit by hand; re-export instead.

- Demo date ("today"): **6 Nov 2026**, the dataset's snapshot
- Exported: 2026-11-07, 52 messages for 13 businesses, in English, Finnish, Swedish, Norwegian
- Written by: 19 × Gemini, 33 × template
- Validated by code (`lib/validate.ts`): 52 of 52 passed
- Applied without asking (standing permission), then the owner is informed: 11
- Flagged for a person, no message: Pizzeria Torni
- No message (Google already shows the right hours): Kesäravintola Ranta, Hammasklinikka Kallio, Trening Nordlys 24/7

## How a message is made

1. **Code detects and decides** (`lib/predict`, the same code that writes `predictions_2026.csv`): for each special day, what Google shows now and
   what it should show, from the owner's own earlier entries, the shopping centre, or similar businesses. See `docs/predict.md`.
2. **Gemini writes** the message in English and in the owner's language, in Fonecta's style: the day and date, what Google shows now,
   what the proposal is based on, then a last line "We suggest: …". It never changes a date, a time or a number.
3. **Code validates** every draft (only that date, exactly the decided hours, at most 2 sentences plus the suggestion line).
   If Gemini fails or its draft is invalid, the template in `lib/ai/specialDay.ts` is used. It says the same thing.
4. **The owner decides** on their channel: approve, edit or decline with one tap, no login. Nothing is published without that,
   except when the owner gave a standing permission; then Connect applies it and tells them (follow-ups below).

Low confidence (no history of its own) turns the basis sentence into a question.

## Follow-ups after the owner answers

Fixed texts from `lib/ai/specialDay.ts` (`followUp`), no LLM. *Edited* shows an example edit (split hours).

**English** (Kahvila Aurora, Christmas Eve 24 Dec 2026)

| Owner | Connect replies |
|---|---|
| approves | Thanks Aleksi, done: Christmas Eve 24 Dec open 07:30–13:00 now shows on Google and your other listings. |
| edits to 09:00–12:00, 13:00–15:00 | Thanks Aleksi, your change is saved: Christmas Eve 24 Dec open 09:00–12:00 and 13:00–15:00. It now shows on Google and your other listings. |
| declines | OK Aleksi, we won't change your hours for Christmas Eve 24 Dec and won't ask about it again. |

**Finnish** (Kahvila Aurora, Christmas Eve 24 Dec 2026)

| Owner | Connect replies |
|---|---|
| approves | Kiitos Aleksi, tehty: jouluaatto 24.12 auki klo 7.30–13 näkyy nyt Googlessa ja muissa palveluissa. |
| edits to 09:00–12:00, 13:00–15:00 | Kiitos Aleksi, muutoksesi on tallennettu: jouluaatto 24.12 auki klo 9–12 ja 13–15. Se näkyy nyt Googlessa ja muissa palveluissa. |
| declines | Selvä Aleksi, emme muuta aukioloaikoja (jouluaatto 24.12) emmekä kysy tästä uudelleen. |

**Swedish** (Pub Kulma, Christmas Day 25 Dec 2026)

| Owner | Connect replies |
|---|---|
| approves | Tack Oskar, klart: juldagen 25/12 stängt syns nu på Google och i era andra tjänster. |
| edits to 09:00–12:00, 13:00–15:00 | Tack Oskar, din ändring är sparad: juldagen 25/12 öppet 9–12 och 13–15. Den syns nu på Google och i era andra tjänster. |
| declines | Okej Oskar, vi ändrar inte öppettiderna (juldagen 25/12) och frågar inte om det igen. |

**Norwegian** (Bakeri Fjord, Christmas Day 25 Dec 2026)

| Owner | Connect replies |
|---|---|
| approves | Takk Marte, ferdig: første juledag 25.12 stengt vises nå på Google og i de andre tjenestene deres. |
| edits to 09:00–12:00, 13:00–15:00 | Takk Marte, endringen er lagret: første juledag 25.12 åpent 9–12 og 13–15. Den vises nå på Google og i de andre tjenestene deres. |
| declines | Greit Marte, vi endrer ikke åpningstidene (første juledag 25.12) og spør ikke om det igjen. |

**Standing permission** (Kukkakauppa Kide: "handle public holidays from now on")

> Hi Anna, as you asked, we set Independence Day 6 Dec open 10:00–14:00. It now shows on Google and your other listings; reply if it should be different.

<details><summary>Finnish</summary>

> Hei Anna, kuten pyysitte, merkitsimme: itsenäisyyspäivä 6.12 auki klo 10–14. Se näkyy nyt Googlessa ja muissa palveluissa; vastaa tähän, jos haluatte muuttaa sitä.

</details>

## Kahvila Aurora (`FI-D0001`)

Aleksi · cafe · Helsinki · channel: **SMS** · language: Finnish · contact window 12-16

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 07:30–18:00 (regular hours) · about 29 searches expected that day
- Proposal: **07:30–13:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Aleksi, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 07:30–18:00. Last year you were open 07:30–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 07:30–13:00.

<details><summary>Finnish</summary>

> Hei Aleksi, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18. Viime vuonna olitte auki klo 7.30–13, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 7.30–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 07:30–18:00 (regular hours) · about 14 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Aleksi, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 07:30–18:00. Last year you were closed that day. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Aleksi, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne, auki 7.30–18. Viime vuonna olitte kyseisenä päivänä kiinni. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 07:30–18:00 (regular hours) · about 11 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Aleksi, New Year's Day is on Friday 1 Jan and Google now shows open 07:30–18:00. Last year you were closed that day. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Aleksi, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt aukioloajat klo 7.30–18. Viime vuonna olitte tuolloin kiinni. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 07:30–18:00 (regular hours) · about 25 searches expected that day
- Proposal: **10:00–16:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Aleksi, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours 07:30–18:00. Last year you were open 10:00–16:00. We suggest: Epiphany 6 Jan open 10:00–16:00.

<details><summary>Finnish</summary>

> Hei Aleksi, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt normaalit aukioloaikanne 7.30–18. Viime vuonna olitte auki klo 10–16. Ehdotamme: loppiainen 6.1 auki klo 10–16.

</details>

## Ravintola Kanerva (`FI-D0002`)

Janne · restaurant · Tampere · channel: **EMAIL** · language: Finnish · contact window 10-12

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 16:00–22:00 (regular hours) · about 7 searches expected that day
- Proposal: **11:00–15:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Janne, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours 16:00–22:00. Last year you were open 11:00–15:00. We suggest: Christmas Eve 24 Dec open 11:00–15:00.

<details><summary>Finnish</summary>

> Hei Janne, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne 16–22. Viime vuonna olitte auki klo 11–15. Ehdotamme: jouluaatto 24.12 auki klo 11–15.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 16:00–23:00 (regular hours) · about 16 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Janne, Christmas Day is on Friday 25 Dec and Google now shows your regular hours 16:00-23:00. Last year you were closed on that day. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne 16-23. Viime vuonna olitte kiinni kyseisenä päivänä. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 16:00–23:00 (regular hours) · about 9 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Janne, Boxing Day is on Saturday 26 Dec and Google now shows open 16:00–23:00. In 2024 you were closed on that day. We suggest: Boxing Day 26 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt aukioloaikoja 16–23. Vuonna 2024 olitte kiinni kyseisenä päivänä. Ehdotamme: tapaninpäivä 26.12 kiinni.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 16:00–22:00 (regular hours) · about 5 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Janne, New Year's Eve is on Thursday 31 Dec and Google now shows 16:00–22:00. Last year you were closed on that day. We suggest: New Year's Eve 31 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt 16–22. Viime vuonna olitte kiinni sinä päivänä. Ehdotamme: uudenvuodenaatto 31.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 16:00–23:00 (regular hours) · about 2 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: Gemini · Validation: passed

> Hi Janne, New Year's Day is on Friday 1 Jan and Google now shows open 16:00–23:00. Most similar businesses nearby are closed that day, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Janne, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt aukioloaikoja 16–23. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 16:00–22:00 (regular hours) · about 3 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Janne, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 16:00-22:00. Last year you were closed on this day. We suggest: Epiphany 6 Jan closed.

<details><summary>Finnish</summary>

> Hei Janne, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne auki klo 16-22. Viime vuonna olitte kiinni tänä päivänä. Ehdotamme: loppiainen 6.1 kiinni.

</details>

## Kukkakauppa Kide (`FI-D0003`)

Anna · florist · Turku · channel: **WHATSAPP** · language: Finnish · **standing permission for holidays** · contact window 16-20

### Independence Day, Sun 6 Dec 2026

- Google shows: closed (regular hours) · about 29 searches expected that day
- Proposal: **10:00–14:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, Independence Day is on Sunday 6 Dec and Google now shows you are closed. Last year you were open 10:00–14:00. We suggest: Independence Day 6 Dec open 10:00–14:00.

<details><summary>Finnish</summary>

> Hei Anna, itsenäisyyspäivä on sunnuntaina 6.12 ja Google näyttää teidän olevan kiinni. Viime vuonna olitte auki 10–14. Ehdotamme: itsenäisyyspäivä 6.12 auki 10–14.

</details>

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · about 15 searches expected that day
- Proposal: **09:00–20:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 09:00–18:00. In 2024 you were open 09:00–20:00, but no special hours are set for this year. We suggest: the day before Christmas Eve 23 Dec open 09:00–20:00.

<details><summary>Finnish</summary>

> Hei Anna, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18. Vuonna 2024 olitte auki klo 9–20, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: aatonaatto 23.12 auki klo 9–20.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · about 25 searches expected that day
- Proposal: **09:00–13:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 09:00–18:00. Last year you were open 09:00–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 09:00–13:00.

<details><summary>Finnish</summary>

> Hei Anna, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18. Viime vuonna olitte auki klo 9–13, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 9–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · about 26 searches expected that day
- Proposal: **10:00–14:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 09:00–18:00. Last year you were open 10:00–14:00. We suggest: Christmas Day 25 Dec open 10:00–14:00.

<details><summary>Finnish</summary>

> Hei Anna, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18. Viime vuonna olitte auki klo 10–14. Ehdotamme: joulupäivä 25.12 auki klo 10–14.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · about 31 searches expected that day
- Proposal: **09:00–15:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 09:00-18:00. Last year you were open 09:00-15:00. We suggest: New Year's Eve 31 Dec open 09:00-15:00.

<details><summary>Finnish</summary>

> Hei Anna, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne, auki klo 9-18. Viime vuonna olitte auki klo 9-15. Ehdotamme: uudenvuodenaatto 31.12 auki klo 9-15.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 09:00–18:00 (regular hours) · about 4 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Anna, New Year's Day is on Friday 1 Jan and Google currently shows you are open 09:00-18:00. Last year you were closed on this day.

<details><summary>Finnish</summary>

> Hei Anna, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt aukioloaikojenne olevan 9-18. Viime vuonna olitte kiinni tähän aikaan.

</details>

## Muoti Lyhty (`FI-D0004`)

Matti · clothing_store · Helsinki · channel: **EMAIL** · language: Finnish · contact window 08-10

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · about 30 searches expected that day
- Proposal: **10:00–21:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: template · Validation: passed

> Hi Matti, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 10:00–20:00. Kauppakeskus Revontuli is open 10:00–21:00 that day, but no special hours are set for you. We suggest: the day before Christmas Eve 23 Dec open 10:00–21:00.

<details><summary>Finnish</summary>

> Hei Matti, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Kauppakeskus Revontuli on silloin auki klo 10–21, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: aatonaatto 23.12 auki klo 10–21.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · about 20 searches expected that day
- Proposal: **10:00–13:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: Gemini · Validation: passed

> Hi Matti, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 10:00–20:00. Kauppakeskus Revontuli is open 10:00–13:00 that day, but no special hours are set for you. We suggest: Christmas Eve 24 Dec open 10:00–13:00.

<details><summary>Finnish</summary>

> Hei Matti, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Kauppakeskus Revontuli on silloin auki klo 10–13, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: jouluaatto 24.12 auki klo 10–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · about 10 searches expected that day
- Proposal: **closed**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: template · Validation: passed

> Hi Matti, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 10:00–20:00. Kauppakeskus Revontuli is closed that day, but no special hours are set for you. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Matti, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Kauppakeskus Revontuli on silloin kiinni, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 27 searches expected that day
- Proposal: **11:00–17:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: template · Validation: passed

> Hi Matti, Boxing Day is on Saturday 26 Dec and Google now shows your regular hours, open 10:00–18:00. Kauppakeskus Revontuli is open 11:00–17:00 that day, but no special hours are set for you. We suggest: Boxing Day 26 Dec open 11:00–17:00.

<details><summary>Finnish</summary>

> Hei Matti, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Kauppakeskus Revontuli on silloin auki klo 11–17, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: tapaninpäivä 26.12 auki klo 11–17.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · about 22 searches expected that day
- Proposal: **10:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Matti, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 10:00–20:00. Last year you were open 10:00–18:00, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec open 10:00–18:00.

<details><summary>Finnish</summary>

> Hei Matti, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Viime vuonna olitte auki klo 10–18, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 auki klo 10–18.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 10:00–20:00 (regular hours) · about 17 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Matti, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 10:00–20:00. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Matti, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 10:00–20:00 (regular hours) · about 8 searches expected that day
- Proposal: **12:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Matti, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 10:00–20:00. Last year you were open 12:00–18:00, but no special hours are set for this year. We suggest: Epiphany 6 Jan open 12:00–18:00.

<details><summary>Finnish</summary>

> Hei Matti, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20. Viime vuonna olitte auki klo 12–18, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 auki klo 12–18.

</details>

## Suksivuokraamo Kuura (`FI-D0005`)

Heikki · ski_rental · Kittilä (Levi) · channel: **SMS** · language: Finnish · contact window 10-12

### Father's Day, Sun 8 Nov 2026

- Google shows: 09:00–17:00 (regular hours)
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Heikki, Father's Day is on Sunday 8 Nov and Google now shows your regular hours, open 09:00–17:00. Last year you were closed, but no special hours are set for this year. We suggest: Father's Day 8 Nov closed.

<details><summary>Finnish</summary>

> Hei Heikki, isänpäivä on sunnuntaina 8.11 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–17. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: isänpäivä 8.11 kiinni.

</details>

## Parturi-Kampaamo Helmi (`FI-D0007`)

Mikko · hair_salon · Oulu · channel: **SMS** · language: Finnish · contact window 12-16

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 16 searches expected that day
- Proposal: **10:00–20:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 10:00–18:00. Last year you were open 10:00–20:00, but no special hours are set for this year. We suggest: the day before Christmas Eve 23 Dec open 10:00–20:00.

<details><summary>Finnish</summary>

> Hei Mikko, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Viime vuonna olitte auki klo 10–20, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: aatonaatto 23.12 auki klo 10–20.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 12 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 10:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 24 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 10:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 09:00–14:00 (regular hours) · about 20 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, Boxing Day is on Saturday 26 Dec and Google now shows your regular hours, open 09:00–14:00. Last year you were closed, but no special hours are set for this year. We suggest: Boxing Day 26 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–14. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: tapaninpäivä 26.12 kiinni.

</details>

### Between Christmas and New Year, Tue 29 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 23 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, the day between Christmas and New Year is on Tuesday 29 Dec and Google now shows your regular hours, open 10:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: the day between Christmas and New Year 29 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, välipäivä on tiistaina 29.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: välipäivä 29.12 kiinni.

</details>

### Between Christmas and New Year, Wed 30 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · about 23 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Mikko, the day between Christmas and New Year is on Wednesday 30 Dec and Google now shows open 10:00–18:00. Last year you were closed on that day. We suggest: the day between Christmas and New Year 30 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, välipäivä on keskiviikkona 30.12 ja Google näyttää nyt aukioloaikaa auki klo 10–18. Viime vuonna olitte kyseisenä päivänä kiinni. Ehdotamme: välipäivä 30.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 10:00–18:00 (regular hours) · about 15 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Mikko, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 10:00–18:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Mikko, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

## Pub Kulma (`FI-D0010`)

Oskar · bar_pub · Helsinki · channel: **WHATSAPP** · language: Swedish · contact window 10-12

### Christmas Day, Fri 25 Dec 2026

- Google shows: 14:00–03:00 (regular hours) · about 61 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Oskar, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 14:00–03:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Swedish</summary>

> Hej Oskar, juldagen infaller fredag 25/12 och Google visar nu era vanliga öppettider: öppet 14–3. Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: juldagen 25/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 14:00–03:00 (regular hours) · about 45 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Oskar, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 14:00–03:00. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Oskar, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 14–3. Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: nyårsdagen 1/1 stängt.

</details>

### Epiphany Eve, Tue 5 Jan 2027

- Google shows: 15:00–01:00 (regular hours) · about 33 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Oskar, Epiphany Eve is on Tuesday 5 Jan and Google now shows your regular hours, open 15:00–01:00. Last year you were closed, but no special hours are set for this year. We suggest: Epiphany Eve 5 Jan closed.

<details><summary>Swedish</summary>

> Hej Oskar, trettondagsafton infaller tisdag 5/1 och Google visar nu era vanliga öppettider: öppet 15–1. Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: trettondagsafton 5/1 stängt.

</details>

## Tilitoimisto Otso (`FI-D0012`)

Laura · accounting_office · Jyväskylä · channel: **EMAIL** · language: Finnish · **standing permission for holidays** · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · about 3 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Laura, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · about 3 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · about 5 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:30–16:30 (regular hours) · about 4 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Laura, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 08:30–16:30 (regular hours) · about 3 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Epiphany 6 Jan closed.

<details><summary>Finnish</summary>

> Hei Laura, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 kiinni.

</details>

## Leikkimaa Onni (`FI-D0014`)

Anna · indoor_playground · Kuopio · channel: **APP_PUSH** · language: Finnish · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 12:00–19:00 (regular hours) · about 9 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Anna, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 12:00–19:00. In 2024 you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Anna, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 12–19. Vuonna 2024 olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 12:00–19:00 (regular hours) · about 11 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Anna, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 12:00–19:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Anna, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 12–19. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

## Kahvila Kipinä (`FI-D0017`)

Aino · cafe · Turku · channel: **SMS** · language: Finnish · contact window 12-16

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:00–17:00 (regular hours) · about 33 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Aino, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–17:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Aino, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8–17. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:00–17:00 (regular hours) · about 29 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Aino, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:00–17:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Aino, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8–17. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

## Bakeri Fjord (`NO-D0009`)

Marte · bakery · Bergen · channel: **SMS** · language: Norwegian · contact window 08-10

### Christmas Day, Fri 25 Dec 2026

- Google shows: 07:00–18:00 (regular hours) · about 13 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Marte, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 07:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Norwegian</summary>

> Hei Marte, første juledag er fredag 25.12 og Google viser nå de vanlige åpningstidene deres: åpent 7–18. I fjor hadde dere stengt, men ingen avvikende åpningstider er lagt inn i år. Vi foreslår: første juledag 25.12 stengt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 07:00–18:00 (regular hours) · about 5 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Marte, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 07:00–18:00. In 2025 you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Norwegian</summary>

> Hei Marte, første nyttårsdag er fredag 1.1 og Google viser nå de vanlige åpningstidene deres: åpent 7–18. I 2025 hadde dere stengt, men ingen avvikende åpningstider er lagt inn i år. Vi foreslår: første nyttårsdag 1.1 stengt.

</details>

## Kafé Linnea (`SE-D0008`)

Maria · cafe · Stockholm · channel: **EMAIL** · language: Swedish · contact window 08-10

### St Lucy's Day, Sun 13 Dec 2026

- Google shows: 10:00–17:00 (regular hours) · about 43 searches expected that day
- Proposal: **07:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Maria, St Lucy's Day is on Sunday 13 Dec and Google now shows your regular hours, open 10:00–17:00. In 2024 you were open 07:00–18:00, but no special hours are set for this year. We suggest: St Lucy's Day 13 Dec open 07:00–18:00.

<details><summary>Swedish</summary>

> Hej Maria, luciadagen infaller söndag 13/12 och Google visar nu era vanliga öppettider: öppet 10–17. År 2024 hade ni öppet 7–18, men inga avvikande tider är inlagda i år. Vi föreslår: luciadagen 13/12 öppet 7–18.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 08:00–18:00 (regular hours) · about 118 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 08:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Swedish</summary>

> Hej Maria, julafton infaller torsdag 24/12 och Google visar nu era vanliga öppettider: öppet 8–18. Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: julafton 24/12 stängt.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:00–18:00 (regular hours) · about 69 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Maria, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–18:00. In 2024 you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Swedish</summary>

> Hej Maria, juldagen infaller fredag 25/12 och Google visar nu era vanliga öppettider: öppet 8–18. År 2024 hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: juldagen 25/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:00–18:00 (regular hours) · about 43 searches expected that day
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Maria, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 8–18. Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: nyårsdagen 1/1 stängt.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 08:00–18:00 (regular hours) · about 85 searches expected that day
- Proposal: **10:00–16:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 08:00–18:00. Last year you were open 10:00–16:00, but no special hours are set for this year. We suggest: Epiphany 6 Jan open 10:00–16:00.

<details><summary>Swedish</summary>

> Hej Maria, trettondedag jul infaller onsdag 6/1 och Google visar nu era vanliga öppettider: öppet 8–18. Förra året hade ni öppet 10–16, men inga avvikande tider är inlagda i år. Vi föreslår: trettondedag jul 6/1 öppet 10–16.

</details>

## Restaurang Fyren (`SE-D0016`)

Per · restaurant · Malmö · channel: **EMAIL** · language: Swedish · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 11:00–23:00 (regular hours) · about 11 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Per, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 11:00–23:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Eve 24 Dec closed.

<details><summary>Swedish</summary>

> Hej Per, julafton infaller torsdag 24/12 och Google visar nu era vanliga öppettider: öppet 11–23. De flesta liknande företag i området har stängt då och inga avvikande tider är inlagda för er, så stämmer det för er också? Vi föreslår: julafton 24/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 11:00–23:00 (regular hours) · about 5 searches expected that day
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Per, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 11:00–23:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Per, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 11–23. De flesta liknande företag i området har stängt då och inga avvikande tider är inlagda för er, så stämmer det för er också? Vi föreslår: nyårsdagen 1/1 stängt.

</details>

## Flagged for a person (no message to the owner)

- **Pizzeria Torni** (`FI-D0011`): The listing still looks open, but 6 recent signals say this place has closed. A person should confirm before anything is sent.
