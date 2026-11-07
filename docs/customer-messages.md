# Customer messages

The messages Fonecta Connect sends to business owners, **exported from real suggestions** the app made on Fonecta's dataset
(`node scripts/export-messages.mjs --fresh`: `/api/seed` → `/api/detect` → `/api/suggest`). Do not edit by hand; re-export instead.

- Demo date ("today"): **6 Nov 2026**, the dataset's snapshot
- Exported: 2026-11-07, 64 messages for 13 businesses, in English, Finnish, Swedish, Norwegian
- Written by: 46 × template, 18 × Gemini
- Validated by code (`lib/validate.ts`): 64 of 64 passed
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

**Swedish** (Pub Kulma, Ice hockey home game 21 Nov 2026)

| Owner | Connect replies |
|---|---|
| approves | Tack Oskar, klart: evenemangskvällen 21/11 öppet 14–5 syns nu på Google och i era andra tjänster. |
| edits to 09:00–12:00, 13:00–15:00 | Tack Oskar, din ändring är sparad: evenemangskvällen 21/11 öppet 9–12 och 13–15. Den syns nu på Google och i era andra tjänster. |
| declines | Okej Oskar, vi ändrar inte öppettiderna (evenemangskvällen 21/11) och frågar inte om det igen. |

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

- Google shows: 07:30–18:00 (regular hours) · seen 29 times on Google on the same day last year
- Proposal: **07:30–13:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Aleksi, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 07:30–18:00 (on the same day last year, your listing was seen 29 times on Google). Last year you were open 07:30–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 07:30–13:00.

<details><summary>Finnish</summary>

> Hei Aleksi, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 29 kertaa). Viime vuonna olitte auki klo 7.30–13, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 7.30–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 07:30–18:00 (regular hours) · seen 14 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Aleksi, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 07:30–18:00 (on the same day last year, your listing was seen 14 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Aleksi, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 14 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 07:30–18:00 (regular hours) · seen 11 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Aleksi, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 07:30–18:00 (on the same day last year, your listing was seen 11 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Aleksi, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 11 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 07:30–18:00 (regular hours) · seen 25 times on Google on the same day last year
- Proposal: **10:00–16:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Aleksi, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 07:30–18:00 (on the same day last year, your listing was seen 25 times on Google). In 2025 you were open 10:00–16:00, but no special hours are set for this year. We suggest: Epiphany 6 Jan open 10:00–16:00.

<details><summary>Finnish</summary>

> Hei Aleksi, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 7.30–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 25 kertaa). Vuonna 2025 olitte auki klo 10–16, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 auki klo 10–16.

</details>

## Ravintola Kanerva (`FI-D0002`)

Janne · restaurant · Tampere · channel: **EMAIL** · language: Finnish · contact window 10-12

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 16:00–22:00 (regular hours) · seen 7 times on Google on the same day last year
- Proposal: **11:00–15:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Janne, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 16:00–22:00 (on the same day last year, your listing was seen 7 times on Google). Last year you were open 11:00–15:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 11:00–15:00.

<details><summary>Finnish</summary>

> Hei Janne, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–22 (viime vuonna samana päivänä tietonne nähtiin Googlessa 7 kertaa). Viime vuonna olitte auki klo 11–15, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 11–15.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 16:00–23:00 (regular hours) · seen 16 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Janne, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 16:00–23:00 (on the same day last year, your listing was seen 16 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–23 (viime vuonna samana päivänä tietonne nähtiin Googlessa 16 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 16:00–23:00 (regular hours) · seen 9 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Janne, Boxing Day is on Saturday 26 Dec and Google now shows your regular hours, open 16:00–23:00 (on the same day last year, your listing was seen 9 times on Google). In 2024 you were closed, but no special hours are set for this year. We suggest: Boxing Day 26 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–23 (viime vuonna samana päivänä tietonne nähtiin Googlessa 9 kertaa). Vuonna 2024 olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: tapaninpäivä 26.12 kiinni.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 16:00–22:00 (regular hours) · seen 5 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Janne, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 16:00–22:00 (on the same day last year, your listing was seen 5 times on Google). In 2024 you were closed, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec closed.

<details><summary>Finnish</summary>

> Hei Janne, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–22 (viime vuonna samana päivänä tietonne nähtiin Googlessa 5 kertaa). Vuonna 2024 olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 16:00–23:00 (regular hours) · seen 2 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Janne, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 16:00–23:00. Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Janne, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–23. Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 16:00–22:00 (regular hours) · seen 3 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Janne, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 16:00–22:00. Last year you were closed, but no special hours are set for this year. We suggest: Epiphany 6 Jan closed.

<details><summary>Finnish</summary>

> Hei Janne, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 16–22. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 kiinni.

</details>

## Kukkakauppa Kide (`FI-D0003`)

Anna · florist · Turku · channel: **WHATSAPP** · language: Finnish · **standing permission for holidays** · contact window 16-20

### Independence Day, Sun 6 Dec 2026

- Google shows: closed (regular hours) · seen 29 times on Google on the same day last year
- Proposal: **10:00–14:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, Independence Day is on Sunday 6 Dec and Google now shows your regular hours, closed (on the same day last year, your listing was seen 29 times on Google). Last year you were open 10:00–14:00, but no special hours are set for this year. We suggest: Independence Day 6 Dec open 10:00–14:00.

<details><summary>Finnish</summary>

> Hei Anna, itsenäisyyspäivä on sunnuntaina 6.12 ja Google näyttää nyt tavalliset aukioloaikanne: kiinni (viime vuonna samana päivänä tietonne nähtiin Googlessa 29 kertaa). Viime vuonna olitte auki klo 10–14, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: itsenäisyyspäivä 6.12 auki klo 10–14.

</details>

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · seen 15 times on Google on the same day last year
- Proposal: **09:00–20:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 09:00–18:00 (on the same day last year, your listing was seen 15 times on Google). In 2024 you were open 09:00–20:00, but no special hours are set for this year. We suggest: the day before Christmas Eve 23 Dec open 09:00–20:00.

<details><summary>Finnish</summary>

> Hei Anna, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 15 kertaa). Vuonna 2024 olitte auki klo 9–20, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: aatonaatto 23.12 auki klo 9–20.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · seen 25 times on Google on the same day last year
- Proposal: **09:00–13:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 09:00–18:00 (on the same day last year, your listing was seen 25 times on Google). Last year you were open 09:00–13:00, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec open 09:00–13:00.

<details><summary>Finnish</summary>

> Hei Anna, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 25 kertaa). Viime vuonna olitte auki klo 9–13, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 auki klo 9–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · seen 26 times on Google on the same day last year
- Proposal: **10:00–14:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 09:00–18:00 (on the same day last year, your listing was seen 26 times on Google). Last year you were open 10:00–14:00, but no special hours are set for this year. We suggest: Christmas Day 25 Dec open 10:00–14:00.

<details><summary>Finnish</summary>

> Hei Anna, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 26 kertaa). Viime vuonna olitte auki klo 10–14, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 auki klo 10–14.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 09:00–18:00 (regular hours) · seen 31 times on Google on the same day last year
- Proposal: **09:00–15:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 09:00–18:00 (on the same day last year, your listing was seen 31 times on Google). Last year you were open 09:00–15:00, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec open 09:00–15:00.

<details><summary>Finnish</summary>

> Hei Anna, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 31 kertaa). Viime vuonna olitte auki klo 9–15, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 auki klo 9–15.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 09:00–18:00 (regular hours) · seen 4 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Anna, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 09:00–18:00. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Anna, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–18. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

## Muoti Lyhty (`FI-D0004`)

Matti · clothing_store · Helsinki · channel: **EMAIL** · language: Finnish · contact window 08-10

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · seen 30 times on Google on the same day last year
- Proposal: **10:00–21:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: Gemini · Validation: passed

> Hi Matti, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 30 times on Google). Kauppakeskus Revontuli is open 10:00–21:00 that day, but no special hours are set for you. We suggest: the day before Christmas Eve 23 Dec open 10:00–21:00.

<details><summary>Finnish</summary>

> Hei Matti, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 30 kertaa). Kauppakeskus Revontuli on silloin auki klo 10–21, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: aatonaatto 23.12 auki klo 10–21.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · seen 20 times on Google on the same day last year
- Proposal: **10:00–13:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: template · Validation: passed

> Hi Matti, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 20 times on Google). Kauppakeskus Revontuli is open 10:00–13:00 that day, but no special hours are set for you. We suggest: Christmas Eve 24 Dec open 10:00–13:00.

<details><summary>Finnish</summary>

> Hei Matti, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 20 kertaa). Kauppakeskus Revontuli on silloin auki klo 10–13, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: jouluaatto 24.12 auki klo 10–13.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · seen 10 times on Google on the same day last year
- Proposal: **closed**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: Gemini · Validation: passed

> Hi Matti, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 10 times on Google). Kauppakeskus Revontuli is closed that day, but no special hours are set for you. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Matti, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 10 kertaa). Kauppakeskus Revontuli on silloin kiinni, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 27 times on Google on the same day last year
- Proposal: **11:00–17:00**, from the shopping centre's hours (the store keeps the centre's hours on that weekday), confidence **high**
- Written by: template · Validation: passed

> Hi Matti, Boxing Day is on Saturday 26 Dec and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 27 times on Google). Kauppakeskus Revontuli is open 11:00–17:00 that day, but no special hours are set for you. We suggest: Boxing Day 26 Dec open 11:00–17:00.

<details><summary>Finnish</summary>

> Hei Matti, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 27 kertaa). Kauppakeskus Revontuli on silloin auki klo 11–17, mutta teille ei ole merkitty poikkeusaikoja. Ehdotamme: tapaninpäivä 26.12 auki klo 11–17.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 10:00–20:00 (regular hours) · seen 22 times on Google on the same day last year
- Proposal: **10:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Matti, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 22 times on Google). Last year you were open 10:00–18:00, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec open 10:00–18:00.

<details><summary>Finnish</summary>

> Hei Matti, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 22 kertaa). Viime vuonna olitte auki klo 10–18, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 auki klo 10–18.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 10:00–20:00 (regular hours) · seen 17 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Matti, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 17 times on Google). Last year you were closed, so we suggest updating your hours for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Matti, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne, auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 17 kertaa). Viime vuonna olitte kiinni, joten suosittelemme päivittämään aukioloaikanne tälle vuodelle. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 10:00–20:00 (regular hours) · seen 8 times on Google on the same day last year
- Proposal: **12:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Matti, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 10:00–20:00 (on the same day last year, your listing was seen 8 times on Google). Last year you were open 12:00–18:00, but no special hours are set for this year. We suggest: Epiphany 6 Jan open 12:00–18:00.

<details><summary>Finnish</summary>

> Hei Matti, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–20 (viime vuonna samana päivänä tietonne nähtiin Googlessa 8 kertaa). Viime vuonna olitte auki klo 12–18, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 auki klo 12–18.

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

### School break, Mon 21 Dec 2026

- Google shows: 09:00–17:00 (regular hours)
- Proposal: **09:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Heikki, the school break is on Monday 21 Dec and Google now shows your regular hours, open 09:00–17:00. During the same school holiday in 2024 (3 Jan) you were open 09:00–18:00. We suggest: the school break 21 Dec open 09:00–18:00.

<details><summary>Finnish</summary>

> Hei Heikki, koululoman päivä on maanantaina 21.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–17. Samalla koululomalla vuonna 2024 (3.1) olitte auki klo 9–18. Ehdotamme: koululoman päivä 21.12 auki klo 9–18.

</details>

### School break, Tue 22 Dec 2026

- Google shows: 09:00–17:00 (regular hours)
- Proposal: **09:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Heikki, the school break is on Tuesday 22 Dec and Google now shows your regular hours, open 09:00–17:00. During the same school holiday in 2024 (3 Jan) you were open 09:00–18:00. We suggest: the school break 22 Dec open 09:00–18:00.

<details><summary>Finnish</summary>

> Hei Heikki, koululoman päivä on tiistaina 22.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–17. Samalla koululomalla vuonna 2024 (3.1) olitte auki klo 9–18. Ehdotamme: koululoman päivä 22.12 auki klo 9–18.

</details>

### School break, Mon 4 Jan 2027

- Google shows: 09:00–17:00 (regular hours)
- Proposal: **09:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Heikki, the school break is on Monday 4 Jan and Google now shows your regular hours, open 09:00–17:00. During the same school holiday in 2024 (3 Jan) you were open 09:00–18:00. We suggest: the school break 4 Jan open 09:00–18:00.

<details><summary>Finnish</summary>

> Hei Heikki, koululoman päivä on maanantaina 4.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–17. Samalla koululomalla vuonna 2024 (3.1) olitte auki klo 9–18. Ehdotamme: koululoman päivä 4.1 auki klo 9–18.

</details>

## Parturi-Kampaamo Helmi (`FI-D0007`)

Mikko · hair_salon · Oulu · channel: **SMS** · language: Finnish · contact window 12-16

### Day before Christmas Eve, Wed 23 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 16 times on Google on the same day last year
- Proposal: **10:00–20:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Mikko, the day before Christmas Eve is on Wednesday 23 Dec and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 16 times on Google). Last year you were open 10:00–20:00, but no special hours are set for this year. We suggest: the day before Christmas Eve 23 Dec open 10:00–20:00.

<details><summary>Finnish</summary>

> Hei Mikko, aatonaatto on keskiviikkona 23.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 16 kertaa). Viime vuonna olitte auki klo 10–20, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: aatonaatto 23.12 auki klo 10–20.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 12 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Mikko, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 12 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 12 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 24 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Mikko, Christmas Day is on Friday 25 Dec and Google now shows your regular hours 10:00–18:00 (on the same day last year, your listing was seen 24 times on Google). Last year you were closed. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 24 kertaa). Viime vuonna olitte kiinni. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### Boxing Day, Sat 26 Dec 2026

- Google shows: 09:00–14:00 (regular hours) · seen 20 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Mikko, Boxing Day is on Saturday 26 Dec and Google now shows your regular hours, open 09:00–14:00 (on the same day last year, your listing was seen 20 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Boxing Day 26 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, tapaninpäivä on lauantaina 26.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 9–14 (viime vuonna samana päivänä tietonne nähtiin Googlessa 20 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: tapaninpäivä 26.12 kiinni.

</details>

### Between Christmas and New Year, Tue 29 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 23 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, the day between Christmas and New Year is on Tuesday 29 Dec and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 23 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: the day between Christmas and New Year 29 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, välipäivä on tiistaina 29.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 23 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: välipäivä 29.12 kiinni.

</details>

### Between Christmas and New Year, Wed 30 Dec 2026

- Google shows: 10:00–18:00 (regular hours) · seen 23 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Mikko, the day between Christmas and New Year is on Wednesday 30 Dec and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 23 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: the day between Christmas and New Year 30 Dec closed.

<details><summary>Finnish</summary>

> Hei Mikko, välipäivä on keskiviikkona 30.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 23 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: välipäivä 30.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 10:00–18:00 (regular hours) · seen 15 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Mikko, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 10:00–18:00 (on the same day last year, your listing was seen 15 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Mikko, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 10–18 (viime vuonna samana päivänä tietonne nähtiin Googlessa 15 kertaa). Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

## Pub Kulma (`FI-D0010`)

Oskar · bar_pub · Helsinki · channel: **WHATSAPP** · language: Swedish · contact window 10-12

### Ice hockey home game, Sat 21 Nov 2026

- Google shows: 14:00–03:00 (regular hours)
- Proposal: **14:00–05:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the ice hockey home game is on Saturday 21 Nov and Google now shows your regular hours, open 14:00–03:00. On your last event night (10 Jan) you were open 14:00–05:00. We suggest: the ice hockey home game 21 Nov open 14:00–05:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller lördag 21/11 och Google visar nu era vanliga öppettider: öppet 14–3. Senaste evenemangskvällen (10/1) hade ni öppet 14–5. Vi föreslår: evenemangskvällen 21/11 öppet 14–5.

</details>

### Concert, Arena, Mon 30 Nov 2026

- Google shows: 15:00–01:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the concert, Arena is on Monday 30 Nov and Google now shows your regular hours, open 15:00–01:00. On your last event night (27 Apr) you were open 15:00–03:00. We suggest: the concert, Arena 30 Nov open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller måndag 30/11 och Google visar nu era vanliga öppettider: öppet 15–1. Senaste evenemangskvällen (27/4) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 30/11 öppet 15–3.

</details>

### Show, Arena, Fri 4 Dec 2026

- Google shows: 14:00–03:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the show, Arena is on Friday 4 Dec and Google now shows your regular hours, open 14:00–03:00. On your last event night (27 Apr) you were open 15:00–03:00. We suggest: the show, Arena 4 Dec open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller fredag 4/12 och Google visar nu era vanliga öppettider: öppet 14–3. Senaste evenemangskvällen (27/4) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 4/12 öppet 15–3.

</details>

### Ice hockey home game, Mon 7 Dec 2026

- Google shows: 15:00–01:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Oskar, the ice hockey home game is on Monday 7 Dec and Google now shows your regular hours, open 15:00-01:00. On your last event night (27 Apr) you were open 15:00-03:00. We suggest: the ice hockey home game 7 Dec open 15:00-03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller måndag 7/12 och Google visar nu era vanliga öppettider: öppet 15-1. Senaste evenemangskvällen (27/4) hade ni öppet 15-3. Vi föreslår: evenemangskvällen 7/12 öppet 15-3.

</details>

### Concert, Arena, Fri 11 Dec 2026

- Google shows: 14:00–03:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Oskar, the concert, Arena is on Friday 11 Dec and Google now shows your regular hours, open 14:00–03:00. On your last event night (27 Apr) you were open 15:00–03:00. We suggest: the concert, Arena 11 Dec open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller fredag 11/12 och Google visar nu era vanliga öppettider: öppet 14–3. Senaste evenemangskvällen (27/4) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 11/12 öppet 15–3.

</details>

### Show, Arena, Thu 17 Dec 2026

- Google shows: 15:00–01:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the show, Arena is on Thursday 17 Dec and Google now shows your regular hours, open 15:00–01:00. On your last event night (27 Apr) you were open 15:00–03:00. We suggest: the show, Arena 17 Dec open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller torsdag 17/12 och Google visar nu era vanliga öppettider: öppet 15–1. Senaste evenemangskvällen (27/4) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 17/12 öppet 15–3.

</details>

### Ice hockey home game, Sun 20 Dec 2026

- Google shows: 15:00–00:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Oskar, the ice hockey home game is on Sunday 20 Dec and Google now shows your regular hours, open 15:00–00:00. On your last event night (27 Apr) you were open 15:00–03:00. We suggest: the ice hockey home game 20 Dec open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller söndag 20/12 och Google visar nu era vanliga öppettider: öppet 15–0. Senaste evenemangskvällen (27/4) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 20/12 öppet 15–3.

</details>

### Ice hockey home game, Tue 22 Dec 2026

- Google shows: 15:00–01:00 (regular hours)
- Proposal: **15:00–03:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the ice hockey home game is on Tuesday 22 Dec and Google now shows your regular hours, open 15:00–01:00. On your last event night (18 Mar) you were open 15:00–03:00. We suggest: the ice hockey home game 22 Dec open 15:00–03:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller tisdag 22/12 och Google visar nu era vanliga öppettider: öppet 15–1. Senaste evenemangskvällen (18/3) hade ni öppet 15–3. Vi föreslår: evenemangskvällen 22/12 öppet 15–3.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 14:00–03:00 (regular hours) · seen 61 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Oskar, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 14:00–03:00 (on the same day last year, your listing was seen 61 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Swedish</summary>

> Hej Oskar, juldagen infaller fredag 25/12 och Google visar nu era vanliga öppettider: öppet 14–3 (samma dag förra året visades ni 61 gånger på Google). Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: juldagen 25/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 14:00–03:00 (regular hours) · seen 45 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Oskar, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 14:00–03:00 (on the same day last year, your listing was seen 45 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Oskar, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 14–3 (samma dag förra året visades ni 45 gånger på Google). Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: nyårsdagen 1/1 stängt.

</details>

### Concert, Arena, Sat 2 Jan 2027

- Google shows: 14:00–03:00 (regular hours)
- Proposal: **14:00–05:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Oskar, the concert, Arena is on Saturday 2 Jan and Google now shows your regular hours, open 14:00–03:00. On your last event night (10 Jan) you were open 14:00–05:00. We suggest: the concert, Arena 2 Jan open 14:00–05:00.

<details><summary>Swedish</summary>

> Hej Oskar, evenemangskvällen infaller lördag 2/1 och Google visar nu era vanliga öppettider: öppet 14–3. Senaste evenemangskvällen (10/1) hade ni öppet 14–5. Vi föreslår: evenemangskvällen 2/1 öppet 14–5.

</details>

### Epiphany Eve, Tue 5 Jan 2027

- Google shows: 15:00–01:00 (regular hours) · seen 33 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Oskar, Epiphany Eve is on Tuesday 5 Jan and Google now shows your regular hours, open 15:00–01:00 (on the same day last year, your listing was seen 33 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Epiphany Eve 5 Jan closed.

<details><summary>Swedish</summary>

> Hej Oskar, trettondagsafton infaller tisdag 5/1 och Google visar nu era vanliga öppettider: öppet 15–1 (samma dag förra året visades ni 33 gånger på Google). Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: trettondagsafton 5/1 stängt.

</details>

## Tilitoimisto Otso (`FI-D0012`)

Laura · accounting_office · Jyväskylä · channel: **EMAIL** · language: Finnish · **standing permission for holidays** · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · seen 3 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · seen 3 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Eve, Thu 31 Dec 2026

- Google shows: 08:30–16:30 (regular hours) · seen 5 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed · **applied by standing permission**

> Hi Laura, New Year's Eve is on Thursday 31 Dec and Google now shows your regular hours, open 08:30–16:30 (on the same day last year, your listing was seen 5 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: New Year's Eve 31 Dec closed.

<details><summary>Finnish</summary>

> Hei Laura, uudenvuodenaatto on torstaina 31.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30 (viime vuonna samana päivänä tietonne nähtiin Googlessa 5 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenaatto 31.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:30–16:30 (regular hours) · seen 4 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Laura, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 08:30–16:30 (regular hours) · seen 3 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed · **applied by standing permission**

> Hi Laura, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 08:30–16:30. Last year you were closed, but no special hours are set for this year. We suggest: Epiphany 6 Jan closed.

<details><summary>Finnish</summary>

> Hei Laura, loppiainen on keskiviikkona 6.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8.30–16.30. Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: loppiainen 6.1 kiinni.

</details>

## Leikkimaa Onni (`FI-D0014`)

Anna · indoor_playground · Kuopio · channel: **APP_PUSH** · language: Finnish · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 12:00–19:00 (regular hours) · seen 9 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Anna, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 12:00–19:00 (on the same day last year, your listing was seen 9 times on Google). In 2024 you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Finnish</summary>

> Hei Anna, jouluaatto on torstaina 24.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 12–19 (viime vuonna samana päivänä tietonne nähtiin Googlessa 9 kertaa). Vuonna 2024 olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: jouluaatto 24.12 kiinni.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 12:00–19:00 (regular hours) · seen 11 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: Gemini · Validation: passed

> Hi Anna, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 12:00–19:00 (on the same day last year, your listing was seen 11 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Anna, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 12–19 (viime vuonna samana päivänä tietonne nähtiin Googlessa 11 kertaa). Viime vuonna olitte kiinni, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty. Ehdotamme: joulupäivä 25.12 kiinni.

</details>

## Kahvila Kipinä (`FI-D0017`)

Aino · cafe · Turku · channel: **SMS** · language: Finnish · contact window 12-16

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:00–17:00 (regular hours) · seen 33 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Aino, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–17:00 (on the same day last year, your listing was seen 33 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Day 25 Dec closed.

<details><summary>Finnish</summary>

> Hei Aino, joulupäivä on perjantaina 25.12 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8–17 (viime vuonna samana päivänä tietonne nähtiin Googlessa 33 kertaa). Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: joulupäivä 25.12 kiinni.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:00–17:00 (regular hours) · seen 29 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Aino, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:00–17:00 (on the same day last year, your listing was seen 29 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Finnish</summary>

> Hei Aino, uudenvuodenpäivä on perjantaina 1.1 ja Google näyttää nyt tavalliset aukioloaikanne: auki klo 8–17 (viime vuonna samana päivänä tietonne nähtiin Googlessa 29 kertaa). Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin? Ehdotamme: uudenvuodenpäivä 1.1 kiinni.

</details>

## Bakeri Fjord (`NO-D0009`)

Marte · bakery · Bergen · channel: **SMS** · language: Norwegian · contact window 08-10

### Christmas Day, Fri 25 Dec 2026

- Google shows: 07:00–18:00 (regular hours) · seen 13 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Marte, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 07:00–18:00 (on the same day last year, your listing was seen 13 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Norwegian</summary>

> Hei Marte, første juledag er fredag 25.12 og Google viser nå de vanlige åpningstidene deres: åpent 7–18 (samme dag i fjor ble dere vist 13 ganger på Google). I fjor hadde dere stengt, men ingen avvikende åpningstider er lagt inn i år. Vi foreslår: første juledag 25.12 stengt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 07:00–18:00 (regular hours) · seen 5 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Marte, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 07:00–18:00 (on the same day last year, your listing was seen 5 times on Google). In 2025 you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Norwegian</summary>

> Hei Marte, første nyttårsdag er fredag 1.1 og Google viser nå de vanlige åpningstidene deres: åpent 7–18 (samme dag i fjor ble dere vist 5 ganger på Google). I 2025 hadde dere stengt, men ingen avvikende åpningstider er lagt inn i år. Vi foreslår: første nyttårsdag 1.1 stengt.

</details>

## Kafé Linnea (`SE-D0008`)

Maria · cafe · Stockholm · channel: **EMAIL** · language: Swedish · contact window 08-10

### St Lucy's Day, Sun 13 Dec 2026

- Google shows: 10:00–17:00 (regular hours) · seen 43 times on Google on the same day last year
- Proposal: **07:00–18:00**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: template · Validation: passed

> Hi Maria, St Lucy's Day is on Sunday 13 Dec and Google now shows your regular hours, open 10:00–17:00 (on the same day last year, your listing was seen 43 times on Google). In 2024 you were open 07:00–18:00, but no special hours are set for this year. We suggest: St Lucy's Day 13 Dec open 07:00–18:00.

<details><summary>Swedish</summary>

> Hej Maria, luciadagen infaller söndag 13/12 och Google visar nu era vanliga öppettider: öppet 10–17 (samma dag förra året visades ni 43 gånger på Google). År 2024 hade ni öppet 7–18, men inga avvikande tider är inlagda i år. Vi föreslår: luciadagen 13/12 öppet 7–18.

</details>

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 08:00–18:00 (regular hours) · seen 118 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 08:00–18:00 (on the same day last year, your listing was seen 118 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: Christmas Eve 24 Dec closed.

<details><summary>Swedish</summary>

> Hej Maria, julafton infaller torsdag 24/12 och Google visar nu era vanliga öppettider: öppet 8–18 (samma dag förra året visades ni 118 gånger på Google). Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: julafton 24/12 stängt.

</details>

### Christmas Day, Fri 25 Dec 2026

- Google shows: 08:00–18:00 (regular hours) · seen 69 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **medium**
- Written by: Gemini · Validation: passed

> Hi Maria, Christmas Day is on Friday 25 Dec and Google now shows your regular hours, open 08:00–18:00 (on the same day last year, your listing was seen 69 times on Google). In 2024 you were closed, but no special hours are set for this year. We suggest: Christmas Day 25 Dec closed.

<details><summary>Swedish</summary>

> Hej Maria, juldagen infaller fredag 25/12 och Google visar nu era vanliga öppettider: öppet 8–18 (samma dag förra året visades ni 69 gånger på Google). År 2024 hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: juldagen 25/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 08:00–18:00 (regular hours) · seen 43 times on Google on the same day last year
- Proposal: **closed**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 08:00–18:00 (on the same day last year, your listing was seen 43 times on Google). Last year you were closed, but no special hours are set for this year. We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Maria, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 8–18 (samma dag förra året visades ni 43 gånger på Google). Förra året hade ni stängt, men inga avvikande tider är inlagda i år. Vi föreslår: nyårsdagen 1/1 stängt.

</details>

### Epiphany, Wed 6 Jan 2027

- Google shows: 08:00–18:00 (regular hours) · seen 85 times on Google on the same day last year
- Proposal: **10:00–16:00**, from the owner's own hours for this day in an earlier season, confidence **high**
- Written by: template · Validation: passed

> Hi Maria, Epiphany is on Wednesday 6 Jan and Google now shows your regular hours, open 08:00–18:00 (on the same day last year, your listing was seen 85 times on Google). Last year you were open 10:00–16:00, but no special hours are set for this year. We suggest: Epiphany 6 Jan open 10:00–16:00.

<details><summary>Swedish</summary>

> Hej Maria, trettondedag jul infaller onsdag 6/1 och Google visar nu era vanliga öppettider: öppet 8–18 (samma dag förra året visades ni 85 gånger på Google). Förra året hade ni öppet 10–16, men inga avvikande tider är inlagda i år. Vi föreslår: trettondedag jul 6/1 öppet 10–16.

</details>

## Restaurang Fyren (`SE-D0016`)

Per · restaurant · Malmö · channel: **EMAIL** · language: Swedish · contact window 16-20

### Christmas Eve, Thu 24 Dec 2026

- Google shows: 11:00–23:00 (regular hours) · seen 11 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Per, Christmas Eve is on Thursday 24 Dec and Google now shows your regular hours, open 11:00–23:00 (on the same day last year, your listing was seen 11 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: Christmas Eve 24 Dec closed.

<details><summary>Swedish</summary>

> Hej Per, julafton infaller torsdag 24/12 och Google visar nu era vanliga öppettider: öppet 11–23 (samma dag förra året visades ni 11 gånger på Google). De flesta liknande företag i området har stängt då och inga avvikande tider är inlagda för er, så stämmer det för er också? Vi föreslår: julafton 24/12 stängt.

</details>

### New Year's Day, Fri 1 Jan 2027

- Google shows: 11:00–23:00 (regular hours) · seen 5 times on Google on the same day last year
- Proposal: **closed**, from similar businesses (no history of its own), confidence **low**
- Written by: template · Validation: passed

> Hi Per, New Year's Day is on Friday 1 Jan and Google now shows your regular hours, open 11:00–23:00 (on the same day last year, your listing was seen 5 times on Google). Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too? We suggest: New Year's Day 1 Jan closed.

<details><summary>Swedish</summary>

> Hej Per, nyårsdagen infaller fredag 1/1 och Google visar nu era vanliga öppettider: öppet 11–23 (samma dag förra året visades ni 5 gånger på Google). De flesta liknande företag i området har stängt då och inga avvikande tider är inlagda för er, så stämmer det för er också? Vi föreslår: nyårsdagen 1/1 stängt.

</details>

## Flagged for a person (no message to the owner)

- **Pizzeria Torni** (`FI-D0011`): The listing still looks open, but 6 recent signals say this place has closed. A person should confirm before anything is sent.
