import type { Day, HolidayHours, Issue, Listing, OpeningHours, ValidationResult } from "@/types";
import type {
  CrossPlatformConflictEvidence,
  MissingHolidayHoursEvidence,
  ReviewSignalEvidence,
  SpecialDayHoursEvidence,
  StaleFieldEvidence,
  SuggestionDraft,
  TypedProposedChange,
  ValidateSuggestion,
} from "@/types/api";

// Deterministic suggestion validation (DESIGN 9.4, stage C3).
//
// Answers the judges' question "how are wrong suggestions prevented?": every draft, whether it
// came from Gemini or from lib/ai/fallback.ts, must pass through validateSuggestion() before the
// owner sees it. Nothing here uses an LLM, a clock or the network — the same draft always gets the
// same verdict, so lane A can safely fall back to a template when this says `ok: false`.
//
// Checked, in order:
//   1. the draft has a shape we can store (field, value, reason, confidence, EN + FI message)
//   2. `field` is one of the four fields in types/api.ts, and it is the field this issue type asks for
//   3. `value` has the right shape for that field (hours, phone, description)
//   4. every hours value is "closed" or one or more "HH:MM-HH:MM" intervals: several intervals
//      ("10:00-14:00,17:00-22:00"), past midnight ("18:00-02:00") and "00:00-23:59" (24 h) are fine,
//      overlapping or out-of-order intervals are not (the same grammar as lib/hours.ts)
//   5. holiday dates are exactly the dates in the issue evidence (nothing invented, nothing missing);
//      for a v2 special day the proposal carries exactly that date and exactly the hours lib/predict
//      decided (the LLM explains, it never changes the numbers)
//   6. for a conflict, the proposed value is one actually seen in the sources
//   7. `needs_human` issues never produce an owner suggestion (they go to Connect staff)
//   8. messages are non-empty, English plus the owner's language (fi / sv / nb), at most 2 sentences
//      plus an optional last "We suggest …" line
//
// This file has no runtime imports on purpose: `node scripts/validate-check.mjs` runs it directly
// (Node strips the type-only imports), so the pure checks are testable without a build step.
// The hours grammar is therefore repeated here; validate-check.mjs cross-checks it against
// lib/hours.ts on a corpus of values so the two cannot drift silently.

// ---------- allowed values (module-local so the file stays import-free at runtime) ----------

/** Every Day in types/index.ts, exhaustively (the Record type makes tsc catch a missing one). */
const DAY_KEYS: Record<Day, true> = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

/** The `field` values allowed in a proposed change (types/api.ts TypedProposedChange). */
const FIELD_KEYS: Record<TypedProposedChange["field"], true> = {
  holiday_hours: true,
  opening_hours: true,
  phone: true,
  description: true,
};

const FIELDS = new Set<string>(Object.keys(FIELD_KEYS));
const DAYS_SET = new Set<string>(Object.keys(DAY_KEYS));

const CONFIDENCES = new Set(["high", "medium", "low"]);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PHONE_RE = /^\+?[\d\s\-()./]+$/;

const MAX_SENTENCES = 2;

/** Languages a message can use: English (always) plus the owner's (fi / sv / nb). */
const MESSAGE_LANGS = ["en", "fi", "sv", "nb"] as const;
const OWNER_LANGS = ["fi", "sv", "nb"] as const;

/** The optional last line of a v2 message, in the languages the demo can send. */
const SUGGESTION_LINE =
  /^(we suggest|we recommend|ehdotamme|suosittelemme|vi föreslår|vi rekommenderar|vi foreslår|vi anbefaler)\b/i;

// ---------- small helpers ----------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Real calendar date in "YYYY-MM-DD" (rejects 2026-02-30, 2026-13-01, 2026-1-1). */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** One open interval in minutes from midnight; past midnight makes `end` > 1440 (like lib/hours.ts). */
interface Span {
  start: number;
  end: number;
}

/** Parse our hours grammar. A problem keeps the reason ("format" vs "order") for the message. */
function parseHourSpans(value: string): { spans: Span[] } | { problem: "format" | "order" } {
  if (value.trim() === "closed") return { spans: [] };
  const spans: Span[] = [];
  let previousEnd = -1;
  for (const part of value.trim().split(",")) {
    const [a, b, extra] = part.split("-");
    if (extra !== undefined || !a || !b || !TIME_RE.test(a) || !TIME_RE.test(b)) {
      return { problem: "format" };
    }
    const start = Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5));
    let end = Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5));
    if (a === "00:00" && b === "23:59") end = 1439; // 24 h, the dataset's convention
    else if (end <= start) end += 1440; // past midnight, e.g. 18:00-02:00
    if (start < previousEnd) return { problem: "order" }; // overlapping or out of order
    spans.push({ start, end });
    previousEnd = end;
  }
  return { spans };
}

/** null when the value is usable hours; otherwise what is wrong with it. */
function hoursProblem(value: unknown): string | null {
  if (value === "closed") return null;
  if (typeof value !== "string") return "is not hours (expected \"HH:MM-HH:MM\" or \"closed\")";
  const parsed = parseHourSpans(value);
  if ("spans" in parsed) return null;
  if (parsed.problem === "order") {
    return `is "${value}", whose intervals overlap or are out of order`;
  }
  return `is "${value}", not "HH:MM-HH:MM" or "closed"`;
}

/** Same hours after parsing, so "09:00-17:00" and "9:00-17:00" never pass as different. */
function sameHourSpans(a: string, b: string): boolean {
  const left = parseHourSpans(a);
  const right = parseHourSpans(b);
  if ("problem" in left || "problem" in right) return false;
  return (
    left.spans.length === right.spans.length &&
    left.spans.every((span, i) => span.start === right.spans[i].start && span.end === right.spans[i].end)
  );
}

/** null when the value looks like a phone number; otherwise what is wrong with it. */
function phoneProblem(value: unknown): string | null {
  if (typeof value !== "string") return "is not a phone number string";
  const trimmed = value.trim();
  if (!trimmed) return "is an empty phone number";
  if (!PHONE_RE.test(trimmed)) return `is "${value}", which has characters a phone number cannot have`;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return `is "${value}", which has too few digits for a phone number`;
  if (digits.length > 15) return `is "${value}", which has too many digits for a phone number`;
  return null;
}

/** Sentences for the message limit. A message without punctuation counts as one; dots between
 *  digits (dotted dates, Finnish "klo 10.00") are not sentence breaks. */
function sentences(text: string): string[] {
  const trimmed = text.trim().replace(/(?<=\d)\.(?=\d)/g, "");
  if (!trimmed) return [];
  return trimmed.split(/(?<=[.!?])\s+/).filter((part) => part.length > 0);
}

/** null when the message respects the limit: 2 sentences, or 3 when the last one is the
 *  "We suggest …" line (DESIGN v2 message style). */
function sentenceLimitProblem(text: string): string | null {
  const list = sentences(text);
  const last = list[list.length - 1] ?? "";
  const limit = SUGGESTION_LINE.test(last) ? MAX_SENTENCES + 1 : MAX_SENTENCES;
  if (list.length <= limit) return null;
  return limit === MAX_SENTENCES + 1
    ? `has ${list.length} sentences, at most 2 plus the suggestion line are allowed`
    : `has ${list.length} sentences, at most ${MAX_SENTENCES} are allowed`;
}

/** Compare values ignoring spacing (phone numbers are written with or without spaces). */
const comparable = (value: string) => value.replace(/\s+/g, "").trim();

// ---------- issue evidence helpers ----------

function evidenceDates(issue: Issue): string[] {
  const ev = issue.evidence as Partial<MissingHolidayHoursEvidence> | undefined;
  return Array.isArray(ev?.dates) ? ev.dates.filter(isIsoDate) : [];
}

function conflictEvidence(issue: Issue): Partial<CrossPlatformConflictEvidence> {
  return (issue.evidence ?? {}) as Partial<CrossPlatformConflictEvidence>;
}

/** The field this issue type asks for; undefined = accept any allowed field. */
function expectedField(issue: Issue): TypedProposedChange["field"] | undefined {
  switch (issue.type) {
    case "missing_holiday_hours":
      return "holiday_hours";
    case "special_day_hours":
      return "holiday_hours";
    case "needs_human":
      return undefined;
    case "cross_platform_conflict": {
      const field = conflictEvidence(issue).field;
      if (field === "phone") return "phone";
      if (typeof field === "string" && field.startsWith("opening_hours.")) return "opening_hours";
      return undefined;
    }
    case "stale_field": {
      const field = (issue.evidence as Partial<StaleFieldEvidence> | undefined)?.field;
      return field === "opening_hours" || field === "holiday_hours" || field === "description"
        ? field
        : undefined;
    }
    case "review_signal": {
      const type = (issue.evidence as Partial<ReviewSignalEvidence> | undefined)?.signal_type;
      if (type === "closed_when_open") return "opening_hours";
      if (type === "wrong_phone") return "phone";
      if (type === "moved" || type === "other") return "description";
      return undefined;
    }
    default:
      return undefined;
  }
}

/** The values the sources actually show for a conflicting field (evidence first, listings as backup). */
function conflictValues(issue: Issue, listings: Listing[]): string[] {
  const ev = conflictEvidence(issue);
  const fromEvidence = Array.isArray(ev.values)
    ? ev.values.map((v) => (typeof v?.value === "string" ? v.value : "")).filter(Boolean)
    : [];
  if (fromEvidence.length) return fromEvidence;

  // Evidence without values (or a shape we do not know): read the listings directly.
  if (ev.field === "phone") return listings.map((l) => l.phone).filter((p) => typeof p === "string" && p);
  const day = typeof ev.field === "string" ? ev.field.split(".")[1] : undefined;
  if (day && DAYS_SET.has(day)) {
    return listings
      .map((l) => l.opening_hours?.[day as Day])
      .filter((h): h is string => typeof h === "string" && h.length > 0);
  }
  return [];
}

// ---------- value checks per field ----------

function checkHolidayHours(
  value: unknown,
  problems: string[],
): value is HolidayHours {
  if (!isPlainObject(value)) {
    problems.push("proposed_change.value is not a holiday hours object");
    return false;
  }
  const dates = Object.keys(value);
  if (dates.length === 0) {
    problems.push("proposed_change.value has no holiday dates");
    return false;
  }
  for (const date of dates) {
    if (!isIsoDate(date)) {
      problems.push(`proposed_change.value has "${date}", which is not a date (YYYY-MM-DD)`);
      continue;
    }
    const problem = hoursProblem(value[date]);
    if (problem) problems.push(`proposed_change.value["${date}"] ${problem}`);
  }
  return true;
}

function checkOpeningHours(
  value: unknown,
  problems: string[],
): value is Partial<OpeningHours> {
  if (!isPlainObject(value)) {
    problems.push("proposed_change.value is not an opening hours object");
    return false;
  }
  const days = Object.keys(value);
  if (days.length === 0) {
    problems.push("proposed_change.value has no days");
    return false;
  }
  for (const day of days) {
    if (!DAYS_SET.has(day)) {
      problems.push(`proposed_change.value has "${day}", which is not a day (mon..sun)`);
      continue;
    }
    const problem = hoursProblem(value[day]);
    if (problem) problems.push(`proposed_change.value.${day} ${problem}`);
  }
  return true;
}

// ---------- entry point ----------

/**
 * Validate one suggestion draft against the issue it answers and the business's listings.
 * Pure and deterministic: no clock, no DB, no network, no LLM (DESIGN 9.4).
 */
export const validateSuggestion: ValidateSuggestion = (
  draft: SuggestionDraft,
  issue: Issue,
  listings: Listing[],
): ValidationResult => {
  const problems: string[] = [];

  if (!isPlainObject(draft)) {
    return { ok: false, problems: ["the suggestion is not an object"] };
  }

  // 7. a flag is for Connect staff; the owner is never asked to confirm a closure
  if (issue.type === "needs_human") {
    problems.push("needs_human issues go to Connect staff, so no suggestion may be sent to the owner");
  }

  // 1a. reason + confidence
  if (typeof draft.reason !== "string" || !draft.reason.trim()) {
    problems.push("reason is empty");
  }
  if (!CONFIDENCES.has(String(draft.confidence))) {
    problems.push(`confidence is "${String(draft.confidence)}", not high, medium or low`);
  }

  // 1b. message in English plus the owner's language, max 2 sentences + the suggestion line
  const message: unknown = draft.message;
  if (!isPlainObject(message)) {
    problems.push("message is missing");
  } else {
    const english = message.en;
    if (typeof english !== "string" || !english.trim()) problems.push("message.en is empty");
    const ownerLang = OWNER_LANGS.find(
      (lang) => typeof message[lang] === "string" && (message[lang] as string).trim().length > 0,
    );
    if (!ownerLang) problems.push("message needs the owner's language (fi, sv or nb)");

    for (const lang of MESSAGE_LANGS) {
      const text = message[lang];
      if (text === undefined) continue;
      if (typeof text !== "string" || !text.trim()) {
        if (lang !== "en") problems.push(`message.${lang} is empty`);
        continue;
      }
      const problem = sentenceLimitProblem(text);
      if (problem) problems.push(`message.${lang} ${problem}`);
    }
  }

  // 2. proposed change: allowed field, and the field this issue asks for
  const change: unknown = draft.proposed_change;
  if (!isPlainObject(change)) {
    problems.push("proposed_change is missing");
    return { ok: false, problems };
  }
  const field = change.field;
  const value = change.value;
  if (typeof field !== "string" || !FIELDS.has(field)) {
    problems.push(`proposed_change.field is "${String(field)}", which is not an allowed field`);
    return { ok: false, problems };
  }
  const wanted = expectedField(issue);
  if (wanted && field !== wanted) {
    problems.push(`proposed_change.field is "${field}", but a ${issue.type} issue needs "${wanted}"`);
  }

  // 3 + 4. shape of the value
  if (field === "holiday_hours") checkHolidayHours(value, problems);
  else if (field === "opening_hours") checkOpeningHours(value, problems);
  else if (field === "phone") {
    const problem = phoneProblem(value);
    if (problem) problems.push(`proposed_change.value ${problem}`);
  } else if (field === "description") {
    if (typeof value !== "string" || !value.trim()) {
      problems.push("proposed_change.value is an empty description");
    }
  }

  // 5. holiday dates must be exactly the issue's dates
  if (issue.type === "missing_holiday_hours" && field === "holiday_hours" && isPlainObject(value)) {
    const expected = evidenceDates(issue);
    if (expected.length > 0) {
      const proposed = new Set(Object.keys(value));
      const wantedDates = new Set(expected);
      for (const date of proposed) {
        if (!wantedDates.has(date)) problems.push(`proposed_change invents the date ${date}`);
      }
      for (const date of wantedDates) {
        if (!proposed.has(date)) problems.push(`proposed_change is missing the date ${date}`);
      }
    }
  }

  // 5b. a v2 special day: exactly the issue's date and exactly the hours the code decided
  if (issue.type === "special_day_hours" && field === "holiday_hours" && isPlainObject(value)) {
    const ev = (issue.evidence ?? {}) as Partial<SpecialDayHoursEvidence>;
    if (!isIsoDate(ev.date)) {
      problems.push("issue evidence has no valid date for special_day_hours");
    } else if (hoursProblem(ev.proposed_hours) !== null) {
      problems.push("issue evidence has invalid proposed_hours for special_day_hours");
    } else {
      for (const date of Object.keys(value)) {
        if (date !== ev.date) {
          problems.push(`proposed_change invents the date ${date}; this issue is only about ${ev.date}`);
        }
      }
      if (!(ev.date in value)) {
        problems.push(`proposed_change is missing the date ${ev.date}`);
      } else {
        const proposed = value[ev.date];
        if (typeof proposed !== "string" || !sameHourSpans(proposed, ev.proposed_hours as string)) {
          problems.push(
            `proposed_change.value["${ev.date}"] is "${String(proposed)}", but the code decided "${ev.proposed_hours}"`,
          );
        }
      }
    }
  }

  // 6. a conflict may only be resolved with a value the sources really show
  if (issue.type === "cross_platform_conflict") {
    const sourceValues = conflictValues(issue, listings);
    const seen = sourceValues.map(comparable);
    const ev = conflictEvidence(issue);
    const shown = sourceValues.join(", ");
    if (seen.length > 0) {
      if (field === "opening_hours" && isPlainObject(value)) {
        const day = typeof ev.field === "string" ? ev.field.split(".")[1] : undefined;
        if (day && DAYS_SET.has(day)) {
          for (const key of Object.keys(value)) {
            if (key !== day) {
              problems.push(`proposed_change also changes ${key}, which is not in conflict`);
            }
          }
          const proposed = value[day];
          if (typeof proposed === "string" && !seen.includes(comparable(proposed))) {
            problems.push(
              `proposed_change.value.${day} is "${proposed}", which no source shows (${shown})`,
            );
          }
        }
      }
      if (field === "phone" && typeof value === "string" && !seen.includes(comparable(value))) {
        problems.push(`proposed_change.value is "${value}", which no source shows (${shown})`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
};
