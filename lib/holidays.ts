// Finnish public holidays for the demo window (DESIGN 8), plus pure calendar helpers.
// Lane C owns this file. A live source can replace the list later (stage C8); it stays the fallback.
//
// The list is hardcoded on purpose: the demo must be deterministic, and detection never asks an
// LLM or a network for dates. Everything here is calendar maths on ISO strings ("YYYY-MM-DD"),
// with no clock: the caller passes `today` (DEMO_DATE via lib/config.ts).

export interface Holiday {
  date: string; // "YYYY-MM-DD"
  name: string; // English: the demo is in English (DEMO_LANGUAGE=en)
  name_fi: string; // for Finnish messages
}

/** Six holidays covering 2026-12-10 + 30 days, the demo window. Keep sorted by date. */
export const HOLIDAYS: readonly Holiday[] = [
  { date: "2026-12-06", name: "Independence Day", name_fi: "itsenäisyyspäivä" },
  { date: "2026-12-24", name: "Christmas Eve", name_fi: "jouluaatto" },
  { date: "2026-12-25", name: "Christmas Day", name_fi: "joulupäivä" },
  { date: "2026-12-26", name: "Boxing Day", name_fi: "tapaninpäivä" },
  { date: "2027-01-01", name: "New Year's Day", name_fi: "uudenvuodenpäivä" },
  { date: "2027-01-06", name: "Epiphany", name_fi: "loppiainen" },
];

/** "Within the next 30 days" in DESIGN 8: today < date <= today + 30 days. */
export const WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** `iso` moved by `days` days (calendar maths, no clock). */
export function addDays(iso: string, days: number): string {
  return toIso(toMs(iso) + days * DAY_MS);
}

/** The same month-day one year earlier: "2026-12-24" -> "2025-12-24" (29 Feb -> 28 Feb). */
export function lastYearDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const targetYear = year - 1;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDayOfMonth)));
  return date.toISOString().slice(0, 10);
}

/** Holidays strictly after `today` and no later than `today + days`, sorted by date. */
export function upcomingHolidays(today: string, days = WINDOW_DAYS): Holiday[] {
  const end = addDays(today, days);
  return HOLIDAYS.filter((h) => h.date > today && h.date <= end).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/** The holiday on `date`, if it is one. */
export function holidayOn(date: string): Holiday | undefined {
  return HOLIDAYS.find((h) => h.date === date);
}
