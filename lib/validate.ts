import type { Day, HolidayHours, Issue, Listing, OpeningHours, ValidationResult } from "@/types";
import type {
  CrossPlatformConflictEvidence,
  MissingHolidayHoursEvidence,
  ReviewSignalEvidence,
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
//   4. every hours value is "closed" or "HH:MM-HH:MM" with close after open
//   5. holiday dates are exactly the dates in the issue evidence (nothing invented, nothing missing)
//   6. for a conflict, the proposed value is one actually seen in the sources
//   7. messages are non-empty and at most 2 sentences per language
//
// This file has no runtime imports on purpose: `node scripts/validate-check.mjs` runs it directly
// (Node strips the type-only imports), so the pure checks are testable without a build step.

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

const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PHONE_RE = /^\+?[\d\s\-()./]+$/;

const MAX_SENTENCES = 2;

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

/** null when the value is usable hours; otherwise what is wrong with it. */
function hoursProblem(value: unknown): string | null {
  if (value === "closed") return null;
  if (typeof value !== "string") return "is not hours (expected \"HH:MM-HH:MM\" or \"closed\")";
  const m = HOURS_RE.exec(value);
  if (!m) return `is "${value}", not "HH:MM-HH:MM" or "closed"`;
  if (m[2] <= m[1]) return `is "${value}", which closes before it opens`;
  return null;
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

/** Sentence count for the "max 2 sentences" rule. A message without punctuation counts as one.
 *  Dots between digits (dotted dates, Finnish "klo 10.00") are not sentence breaks. */
function sentenceCount(text: string): number {
  const trimmed = text.trim().replace(/(?<=\d)\.(?=\d)/g, "");
  if (!trimmed) return 0;
  const enders = trimmed.match(/[.!?]+(?=\s|$)/g);
  return Math.max(1, enders?.length ?? 0);
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

  // 1a. reason + confidence
  if (typeof draft.reason !== "string" || !draft.reason.trim()) {
    problems.push("reason is empty");
  }
  if (!CONFIDENCES.has(String(draft.confidence))) {
    problems.push(`confidence is "${String(draft.confidence)}", not high, medium or low`);
  }

  // 1b. message in both languages, max 2 sentences each
  const message: unknown = draft.message;
  if (!isPlainObject(message)) {
    problems.push("message is missing");
  } else {
    for (const lang of ["en", "fi"] as const) {
      const text = message[lang];
      if (typeof text !== "string" || !text.trim()) {
        problems.push(`message.${lang} is empty`);
        continue;
      }
      const n = sentenceCount(text);
      if (n > MAX_SENTENCES) {
        problems.push(`message.${lang} has ${n} sentences, at most ${MAX_SENTENCES} are allowed`);
      }
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
