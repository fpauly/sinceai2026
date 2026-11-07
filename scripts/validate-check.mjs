// Deterministic tests for lib/validate.ts (stages C3 + C12, DESIGN 9.4 and 0 "v2").
// Usage: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/validate-check.mjs
//
// Node 24 strips the types from lib/validate.ts on import, so this runs without a build step.
// The v1 fixtures mirror the seed data (data/seed.ts): rye_shine holiday hours, its Saturday
// conflict with the website, autokorjaamo's phone conflict, kukkakauppa's stale week.
// The v2 fixtures mirror a special-day issue for FI-D0001 (Kahvila Aurora) and a needs_human
// flag for FI-D0011 (Pizzeria Torni). A good draft must pass; a bad one must fail for the
// reason we expect. The hours grammar is also cross-checked against lib/hours.ts on a corpus,
// so the copy in validate.ts cannot drift from the one the app uses.

import { validateSuggestion } from "../lib/validate.ts";
import { isValidHours } from "../lib/hours.ts";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function listing(source, overrides = {}) {
  return {
    _id: `rye_shine:${source}`,
    business_id: "rye_shine",
    source,
    opening_hours: {
      mon: "10:00-18:00",
      tue: "10:00-18:00",
      wed: "10:00-18:00",
      thu: "10:00-18:00",
      fri: "10:00-18:00",
      sat: "10:00-18:00",
      sun: "closed",
      ...(overrides.opening_hours ?? {}),
    },
    holiday_hours: {
      "2025-12-24": "10:00-14:00",
      "2025-12-25": "closed",
      "2025-12-26": "closed",
      "2026-01-01": "closed",
      "2026-01-06": "closed",
    },
    phone: overrides.phone ?? "+358 2 100 4567",
    description: overrides.description ?? "Sourdough and rye bakery on Eerikinkatu.",
    field_updated_at: {
      opening_hours: "2025-12-20",
      holiday_hours: "2025-12-20",
      description: "2023-05-01",
      ...(overrides.field_updated_at ?? {}),
    },
  };
}

const ryeListings = [
  listing("finder"),
  listing("google"),
  listing("website", { opening_hours: { sat: "10:00-14:00" }, field_updated_at: { opening_hours: "2026-10-20" } }),
];

// ---------- fixtures ----------

const holidayDates = ["2026-12-24", "2026-12-25", "2026-12-26", "2027-01-01", "2027-01-06"];

const holidayIssue = {
  _id: "issue_holiday",
  business_id: "rye_shine",
  type: "missing_holiday_hours",
  severity: "high",
  evidence: {
    dates: holidayDates,
    holiday_names: {
      "2026-12-24": "Christmas Eve",
      "2026-12-25": "Christmas Day",
      "2026-12-26": "Boxing Day",
      "2027-01-01": "New Year's Day",
      "2027-01-06": "Epiphany",
    },
    last_year: {
      "2025-12-24": "10:00-14:00",
      "2025-12-25": "closed",
      "2025-12-26": "closed",
      "2026-01-01": "closed",
      "2026-01-06": "closed",
    },
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: `rye_shine:missing_holiday_hours:${holidayDates.join(",")}`,
};

const lastYearHours = {
  "2026-12-24": "10:00-14:00",
  "2026-12-25": "closed",
  "2026-12-26": "closed",
  "2027-01-01": "closed",
  "2027-01-06": "closed",
};

const satConflictIssue = {
  _id: "issue_sat",
  business_id: "rye_shine",
  type: "cross_platform_conflict",
  severity: "high",
  evidence: {
    field: "opening_hours.sat",
    values: [
      { source: "finder", value: "10:00-18:00", updated_at: "2025-12-20" },
      { source: "google", value: "10:00-18:00", updated_at: "2025-12-20" },
      { source: "website", value: "10:00-14:00", updated_at: "2026-10-20" },
    ],
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: "rye_shine:cross_platform_conflict:opening_hours.sat",
};

const phoneConflictIssue = {
  _id: "issue_phone",
  business_id: "autokorjaamo_skanssi",
  type: "cross_platform_conflict",
  severity: "high",
  evidence: {
    field: "phone",
    values: [
      { source: "finder", value: "+358 2 100 7781", updated_at: null },
      { source: "google", value: "+358 2 100 7718", updated_at: null },
      { source: "website", value: "+358 2 100 7781", updated_at: null },
    ],
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: "autokorjaamo_skanssi:cross_platform_conflict:phone",
};

const staleDescriptionIssue = {
  _id: "issue_description",
  business_id: "rye_shine",
  type: "stale_field",
  severity: "low",
  evidence: {
    field: "description",
    oldest_update: "2023-05-01",
    days_old: 1319,
    stale_sources: ["finder", "google", "website"],
    current_value: "Sourdough and rye bakery on Eerikinkatu.",
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: "rye_shine:stale_field:description",
};

const staleWeekIssue = {
  _id: "issue_week",
  business_id: "kukkakauppa_kauppatori",
  type: "stale_field",
  severity: "low",
  evidence: {
    field: "opening_hours",
    oldest_update: "2024-05-14",
    days_old: 940,
    stale_sources: ["finder", "google", "website"],
    current_value: { mon: "09:00-18:00", tue: "09:00-18:00", wed: "09:00-18:00", thu: "09:00-18:00", fri: "09:00-18:00", sat: "09:00-15:00", sun: "closed" },
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: "kukkakauppa_kauppatori:stale_field:opening_hours",
};

const reviewPhoneIssue = {
  _id: "issue_review_phone",
  business_id: "rye_shine",
  type: "review_signal",
  severity: "medium",
  evidence: {
    signal_type: "wrong_phone",
    summary: "Two reviews say the listed phone number does not answer.",
    reviews: [{ _id: "rev_rye_shine_1", date: "2026-11-28", rating: 2, text: "The number on Google doesn't work." }],
  },
  status: "open",
  created_at: "2026-12-10T08:00:00Z",
  fingerprint: "rye_shine:review_signal:wrong_phone",
};

/** v2: one likely-wrong special day for the demo protagonist (FI-D0001 Kahvila Aurora). */
const specialDayIssue = {
  _id: "issue_special",
  business_id: "FI-D0001",
  type: "special_day_hours",
  severity: "high",
  evidence: {
    date: "2026-12-24",
    day_key: "XMAS_EVE",
    day_name: { en: "Christmas Eve", local: "Jouluaatto" },
    weekday: "thu",
    displayed_hours: "07:30-18:00",
    displayed_from: "regular",
    proposed_hours: "10:00-14:00",
    basis: "LAST_YEAR",
    basis_detail: { last_year: { date: "2025-12-24", hours: "10:00-14:00", entered_at: "2025-12-01T08:00:00" } },
    confidence: "high",
  },
  status: "open",
  created_at: "2026-11-06T08:00:00Z",
  fingerprint: "FI-D0001:special_day_hours:2026-12-24",
};

/** v2: a flag for Connect staff (FI-D0011 Pizzeria Torni), never an owner suggestion. */
const needsHumanIssue = {
  _id: "issue_flag",
  business_id: "FI-D0011",
  type: "needs_human",
  severity: "high",
  evidence: {
    reason: "closed_for_good",
    summary: "Five recent reviews say the pizzeria has closed for good.",
    signals: ["2026-09-25 review: \"This place has closed down permanently.\""],
  },
  status: "open",
  created_at: "2026-11-06T08:00:00Z",
  fingerprint: "FI-D0011:needs_human:closed_for_good",
};

/** A draft with the fallback template's shape and a valid 2-sentence message in EN and FI. */
function draft(field, value, overrides = {}) {
  return {
    proposed_change: { field, value },
    reason: "No hours are set for the coming holidays, so this copies your own hours from last year.",
    confidence: "high",
    message: {
      en: "Hi Liisa, your hours for the coming holidays aren't set anywhere yet. Shall I publish the same hours as last year?",
      fi: "Hei Liisa, pyhien aukioloajat puuttuvat vielä. Julkaisenko samat ajat kuin viime vuonna?",
    },
    ...overrides,
  };
}

// ---------- cases ----------

const cases = [
  {
    name: "good: holiday hours copying last year",
    draft: draft("holiday_hours", { ...lastYearHours }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "bad: invents a holiday date",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-27": "closed" }),
    issue: holidayIssue,
    ok: false,
    expect: "invents the date 2026-12-27",
  },
  {
    name: "bad: misses a holiday date",
    draft: draft("holiday_hours", {
      "2026-12-24": "10:00-14:00",
      "2026-12-25": "closed",
      "2026-12-26": "closed",
      "2027-01-01": "closed",
    }),
    issue: holidayIssue,
    ok: false,
    expect: "missing the date 2027-01-06",
  },
  {
    name: "bad: hours without leading zero",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "8:00-14:00" }),
    issue: holidayIssue,
    ok: false,
    expect: "not \"HH:MM-HH:MM\"",
  },
  {
    name: "good: past midnight is a valid interval (18:00-02:00)",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "18:00-02:00" }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "good: several intervals in one day",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "10:00-14:00,17:00-22:00" }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "good: the 24 h convention (00:00-23:59)",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "00:00-23:59" }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "bad: intervals overlap",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "10:00-14:00,13:00-18:00" }),
    issue: holidayIssue,
    ok: false,
    expect: "overlap or are out of order",
  },
  {
    name: "bad: intervals are out of order",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "17:00-22:00,10:00-14:00" }),
    issue: holidayIssue,
    ok: false,
    expect: "overlap or are out of order",
  },
  {
    name: "bad: hour out of range",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "24:00-02:00" }),
    issue: holidayIssue,
    ok: false,
    expect: "not \"HH:MM-HH:MM\"",
  },
  {
    name: "bad: en dash instead of a hyphen",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-12-24": "10:00\u201314:00" }),
    issue: holidayIssue,
    ok: false,
    expect: "not \"HH:MM-HH:MM\"",
  },
  {
    name: "bad: holiday date is not a real date",
    draft: draft("holiday_hours", { ...lastYearHours, "2026-13-01": "closed" }),
    issue: holidayIssue,
    ok: false,
    expect: "not a date",
  },
  {
    name: "bad: wrong field for a holiday issue",
    draft: draft("description", "We are closed for Christmas."),
    issue: holidayIssue,
    ok: false,
    expect: "but a missing_holiday_hours issue needs \"holiday_hours\"",
  },
  {
    name: "good: Saturday conflict resolved with the newest source",
    draft: draft("opening_hours", { sat: "10:00-14:00" }, { confidence: "high" }),
    issue: satConflictIssue,
    ok: true,
  },
  {
    name: "bad: Saturday value no source shows",
    draft: draft("opening_hours", { sat: "09:00-17:00" }),
    issue: satConflictIssue,
    ok: false,
    expect: "no source shows",
  },
  {
    name: "bad: conflict draft changes a day that is not in conflict",
    draft: draft("opening_hours", { sat: "10:00-14:00", sun: "12:00-16:00" }),
    issue: satConflictIssue,
    ok: false,
    expect: "not in conflict",
  },
  {
    name: "good: phone conflict uses the majority number",
    draft: draft("phone", "+358 2 100 7781", { confidence: "medium" }),
    issue: phoneConflictIssue,
    ok: true,
  },
  {
    name: "bad: phone value no source shows",
    draft: draft("phone", "+358 2 100 9999"),
    issue: phoneConflictIssue,
    ok: false,
    expect: "no source shows",
  },
  {
    name: "bad: phone value is not a phone number",
    draft: draft("phone", "call the shop"),
    issue: phoneConflictIssue,
    ok: false,
    expect: "phone number",
  },
  {
    name: "good: stale description re-confirms the current text",
    draft: draft("description", "Sourdough and rye bakery on Eerikinkatu.", { confidence: "medium" }),
    issue: staleDescriptionIssue,
    ok: true,
  },
  {
    name: "bad: stale description is empty",
    draft: draft("description", "   "),
    issue: staleDescriptionIssue,
    ok: false,
    expect: "empty description",
  },
  {
    name: "good: stale week re-confirms all seven days",
    draft: draft(
      "opening_hours",
      { mon: "09:00-18:00", tue: "09:00-18:00", wed: "09:00-18:00", thu: "09:00-18:00", fri: "09:00-18:00", sat: "09:00-15:00", sun: "closed" },
      { confidence: "medium" },
    ),
    issue: staleWeekIssue,
    ok: true,
  },
  {
    name: "bad: opening hours use a day name that is not a day",
    draft: draft("opening_hours", { monday: "09:00-18:00" }),
    issue: staleWeekIssue,
    ok: false,
    expect: "not a day",
  },
  {
    name: "good: review signal proposes a valid phone number",
    draft: draft("phone", "+358 2 100 4567", { confidence: "low" }),
    issue: reviewPhoneIssue,
    ok: true,
  },
  {
    name: "bad: field is not one of the four allowed fields",
    draft: draft("weather", "sunny"),
    issue: holidayIssue,
    ok: false,
    expect: "not an allowed field",
  },
  {
    name: "bad: message has three sentences",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: {
        en: "Hi Liisa. Your holiday hours aren't set. Shall I publish last year's hours?",
        fi: "Hei Liisa, pyhien aukioloajat puuttuvat. Julkaisenko viime vuoden ajat?",
      },
    }),
    issue: holidayIssue,
    ok: false,
    expect: "message.en has 3 sentences",
  },
  {
    name: "bad: the owner's language is missing",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: { en: "Hi Liisa, shall I publish last year's hours?" },
    }),
    issue: holidayIssue,
    ok: false,
    expect: "owner's language",
  },
  {
    name: "bad: empty reason",
    draft: draft("holiday_hours", { ...lastYearHours }, { reason: " " }),
    issue: holidayIssue,
    ok: false,
    expect: "reason is empty",
  },
  {
    name: "bad: confidence is not high/medium/low",
    draft: draft("holiday_hours", { ...lastYearHours }, { confidence: "very high" }),
    issue: holidayIssue,
    ok: false,
    expect: "confidence is \"very high\"",
  },
  {
    name: "good: a single sentence without final punctuation is fine",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: { en: "Hi Liisa, shall I publish last year's hours?", fi: "Hei Liisa, julkaisenko viime vuoden ajat?" },
    }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "good: dotted dates in the message are not sentence breaks",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: {
        en: "Hi Liisa, shall I publish last year's hours for 24.12.2026 and 1.1.2027?",
        fi: "Hei Liisa, julkaisenko viime vuoden ajat ajalle 24.12.2026 ja 1.1.2027?",
      },
    }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "bad: holiday hours value is not an object",
    draft: draft("holiday_hours", "closed"),
    issue: holidayIssue,
    ok: false,
    expect: "not a holiday hours object",
  },
  {
    name: "good: v2 special day with the code's hours and a suggestion line",
    draft: draft("holiday_hours", { "2026-12-24": "10:00-14:00" }, {
      message: {
        en: "Christmas Eve is coming and Google still shows your regular Thursday hours. Last year you opened 10:00-14:00. We suggest 10:00-14:00 on 24 December.",
        fi: "Jouluaatto on tulossa ja Google näyttää yhä torstain normaalit ajat. Viime vuonna avasit 10:00-14:00. Ehdotamme 10:00-14:00 ajalle 24.12.",
      },
    }),
    issue: specialDayIssue,
    ok: true,
  },
  {
    name: "bad: special day invents a second date",
    draft: draft("holiday_hours", { "2026-12-24": "10:00-14:00", "2026-12-25": "closed" }),
    issue: specialDayIssue,
    ok: false,
    expect: "invents the date 2026-12-25",
  },
  {
    name: "bad: special day changes the hours lib/predict decided",
    draft: draft("holiday_hours", { "2026-12-24": "10:00-15:00" }),
    issue: specialDayIssue,
    ok: false,
    expect: "but the code decided",
  },
  {
    name: "bad: special day misses its date",
    draft: draft("holiday_hours", { "2026-12-25": "closed" }),
    issue: specialDayIssue,
    ok: false,
    expect: "missing the date 2026-12-24",
  },
  {
    name: "bad: special day proposed as opening hours",
    draft: draft("opening_hours", { thu: "10:00-14:00" }),
    issue: specialDayIssue,
    ok: false,
    expect: "but a special_day_hours issue needs \"holiday_hours\"",
  },
  {
    name: "bad: needs_human never becomes an owner suggestion",
    draft: draft("holiday_hours", { "2026-12-24": "closed" }),
    issue: needsHumanIssue,
    ok: false,
    expect: "go to Connect staff",
  },
  {
    name: "good: Swedish owner language (en + sv)",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: {
        en: "Hi Aleksi, your holiday hours aren't set anywhere yet. Shall I publish the same hours as last year?",
        sv: "Hej Aleksi, dina helgdagsöppettider är inte ifyllda ännu. Ska jag publicera samma tider som i fjol?",
      },
    }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "good: three sentences when the last one is the suggestion line",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: {
        en: "Your holiday hours aren't set anywhere yet. Last year you opened 10:00-14:00 on Christmas Eve. We suggest the same hours this year.",
        fi: "Pyhien aukioloajat puuttuvat vielä. Viime vuonna avasit jouluaattona 10:00-14:00. Ehdotamme samoja aikoja tänä vuonna.",
      },
    }),
    issue: holidayIssue,
    ok: true,
  },
  {
    name: "bad: four sentences even with the suggestion line",
    draft: draft("holiday_hours", { ...lastYearHours }, {
      message: {
        en: "Hi Liisa. Your holiday hours aren't set anywhere yet. Last year you opened 10:00-14:00. We suggest the same hours this year.",
        fi: "Hei Liisa. Pyhien aukioloajat puuttuvat. Viime vuonna avasit 10:00-14:00. Ehdotamme samoja aikoja.",
      },
    }),
    issue: holidayIssue,
    ok: false,
    expect: "at most 2 plus the suggestion line",
  },
];

// ---------- runner ----------

let passed = 0;
let failed = 0;

for (const c of cases) {
  const listings = c.issue.business_id === "rye_shine" ? ryeListings : [listing("finder")];
  const result = validateSuggestion(c.draft, c.issue, listings);
  const text = result.problems.join(" | ");
  const verdictOk = result.ok === c.ok;
  const problemsOk = c.ok ? result.problems.length === 0 : result.problems.length > 0;
  const expectOk = c.expect ? text.toLowerCase().includes(c.expect.toLowerCase()) : true;
  const pass = verdictOk && problemsOk && expectOk;

  if (pass) {
    passed++;
    console.log(`  ✓ ${c.name}${c.ok ? "" : ` → ${text}`}`);
  } else {
    failed++;
    console.log(`  ✗ ${c.name}`);
    console.log(`      expected ok=${c.ok}${c.expect ? ` with "${c.expect}"` : ""}, got ok=${result.ok}`);
    console.log(`      problems: ${text || "(none)"}`);
  }
}

// Sanity check on the fixtures themselves: every day name and holiday date above is valid input.
const dayProblems = validateSuggestion(
  draft("opening_hours", Object.fromEntries(DAYS.map((d) => [d, "00:00-23:59"])), { confidence: "medium" }),
  staleWeekIssue,
  ryeListings,
);
if (dayProblems.ok) {
  passed++;
  console.log("  ✓ all seven day keys are accepted in an opening hours proposal");
} else {
  failed++;
  console.log(`  ✗ day keys rejected: ${dayProblems.problems.join(" | ")}`);
}

// The hours grammar is duplicated in validate.ts (so it stays import-free at runtime); this
// corpus keeps the copy honest against lib/hours.ts, the parser the app actually uses.
// validate.ts is deliberately stricter about the *written* format: it rejects "8:00-14:00" and
// "10:00–14:00" (en dash), which lib/hours.ts normalises when reading, so the corpus only holds
// canonical values — the ones the app writes.
const HOURS_CORPUS = [
  "closed",
  "10:00-14:00",
  "10:00-14:00,17:00-22:00",
  "18:00-02:00",
  "00:00-23:59",
  "10:00-10:00",
  "14:00-10:00",
  "23:59-00:00",
  "09:00-12:00,13:00-17:00",
  "10:00-14:00,13:00-18:00",
  "17:00-22:00,10:00-14:00",
  "24:00-02:00",
  "10:00-14:00,",
  "10:00",
  "10:00-14:00,17:00",
];

let drift = 0;
for (const hours of HOURS_CORPUS) {
  const result = validateSuggestion(
    draft("holiday_hours", { ...lastYearHours, "2026-12-24": hours }),
    holidayIssue,
    ryeListings,
  );
  const validatorSays = !result.problems.some((p) => p.includes('proposed_change.value["2026-12-24"]'));
  const libSays = isValidHours(hours);
  if (validatorSays !== libSays) {
    drift++;
    failed++;
    console.log(
      `  ✗ hours "${hours}": validate.ts ${validatorSays ? "accepts" : "rejects"}, lib/hours.ts ${libSays ? "accepts" : "rejects"}`,
    );
  }
}
if (!drift) {
  passed++;
  console.log(`  ✓ the hours grammar matches lib/hours.ts on ${HOURS_CORPUS.length} values`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
