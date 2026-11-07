import type { Day, Hours, OpeningHours, Profile } from "@/types";

// Opening hours, the one place that parses, compares and converts them (DESIGN 0 "v2").
// Pure: no DB, no clock, no network, no runtime imports (Node can run it directly in scripts).
//
// Our format, the same as Fonecta's dataset:
//   "closed" · "09:00-17:00" · "10:00-14:00,17:00-22:00" · "18:00-02:00" (past midnight) · "00:00-23:59" (24 h)
// Yext's format: {"isClosed": true} or {"openIntervals": [{"start": "09:00", "end": "17:00"}, …]}

const DAY_KEYS: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const YEXT_DAYS: Record<Day, string> = {
  mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday", sun: "sunday",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSED_WORDS = new Set(["", "closed", "kiinni", "stängt", "stengt", "suljettu"]);

/** One open interval in minutes from midnight; `end` > `start` (past midnight: end > 1440). */
export interface Interval {
  start: number;
  end: number;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** Lower-case, no spaces, local words for "closed" → "closed", "9:00" → "09:00". Not validated. */
export function normalizeHours(value: string | null | undefined): Hours {
  const s = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
  if (CLOSED_WORDS.has(s)) return "closed";
  return s.replace(/(^|[-,])(\d):/g, "$10$2:");
}

/** Intervals of a valid hours string; null when it is not valid. "closed" → []. */
export function parseHours(value: string | null | undefined): Interval[] | null {
  const h = normalizeHours(value);
  if (h === "closed") return [];
  const out: Interval[] = [];
  for (const part of h.split(",")) {
    const [a, b, extra] = part.split("-");
    if (extra !== undefined || !a || !b || !TIME.test(a) || !TIME.test(b)) return null;
    const start = toMinutes(a);
    let end = toMinutes(b);
    if (a === "00:00" && b === "23:59") end = 1439; // 24 h
    else if (end <= start) end += 1440; // past midnight
    if (end - start <= 0) return null;
    if (out.length && start < out[out.length - 1].end) return null; // overlapping or out of order
    out.push({ start, end });
  }
  return out;
}

export function isValidHours(value: string | null | undefined): boolean {
  return parseHours(value) !== null;
}

export function isClosed(value: string | null | undefined): boolean {
  return normalizeHours(value) === "closed";
}

/** Intervals → "10:00-14:00,17:00-22:00" | "closed". */
export function formatHours(intervals: Interval[]): Hours {
  if (intervals.length === 0) return "closed";
  return intervals.map((i) => (i.start === 0 && i.end === 1439 ? "00:00-23:59" : `${toTime(i.start)}-${toTime(i.end)}`)).join(",");
}

/** Exactly the same hours (after normalising). Invalid strings are only equal to themselves. */
export function sameHours(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parseHours(a);
  const pb = parseHours(b);
  if (!pa || !pb) return normalizeHours(a) === normalizeHours(b);
  return formatHours(pa) === formatHours(pb);
}

/** Same open/closed state and first opening and last closing within `toleranceMin` (the scorer's "near"). */
export function nearHours(a: string, b: string, toleranceMin = 30): boolean {
  const pa = parseHours(a);
  const pb = parseHours(b);
  if (!pa || !pb) return false;
  if (!pa.length || !pb.length) return pa.length === pb.length;
  return Math.abs(pa[0].start - pb[0].start) <= toleranceMin && Math.abs(pa[pa.length - 1].end - pb[pb.length - 1].end) <= toleranceMin;
}

/** "10:00-14:00,17:00-22:00" → "10:00–14:00 and 17:00–22:00"; "closed" → "closed". For messages and UI. */
export function showHours(value: string, closedWord = "closed", and = "and"): string {
  const p = parseHours(value);
  if (!p) return value;
  if (!p.length) return closedWord;
  const parts = formatHours(p).split(",").map((x) => x.replace("-", "–"));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`;
}

// ---------- dates (calendar maths only, no clock) ----------

/** Weekday of an ISO date. */
export function weekdayOf(date: string): Day {
  const js = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return DAY_KEYS[(js + 6) % 7];
}

/** What Google shows on `date`: the entered exception, else the regular hours of that weekday. */
export function displayedHours(profile: Pick<Profile, "regular_hours" | "holiday_hours">, date: string): {
  hours: Hours;
  from: "exception" | "regular";
} {
  const exception = profile.holiday_hours?.[date];
  if (exception !== undefined) return { hours: normalizeHours(exception), from: "exception" };
  return { hours: normalizeHours(profile.regular_hours?.[weekdayOf(date)] ?? "closed"), from: "regular" };
}

// ---------- Yext ----------

export type YextInterval = { start: string; end: string };
export type YextDayHours = { isClosed: true } | { openIntervals: YextInterval[] };
export type YextHolidayHours = { date: string } & ({ isClosed: true } | { openIntervals: YextInterval[] } | { isRegularHours: true });
export type YextWeek = Partial<Record<string, unknown>> & { holidayHours?: YextHolidayHours[] };

/** Our hours → Yext day. Throws on invalid hours (callers validate first). */
export function toYextDay(value: Hours): YextDayHours {
  const p = parseHours(value);
  if (!p) throw new Error(`invalid hours "${value}"`);
  if (!p.length) return { isClosed: true };
  return {
    openIntervals: formatHours(p).split(",").map((iv) => {
      const [start, end] = iv.split("-");
      return { start, end };
    }),
  };
}

/** Yext day (or holiday item) → our hours. Unknown shapes → "closed"; `isRegularHours` → `regular`. */
export function fromYextDay(day: unknown, regular?: Hours): Hours {
  if (!day || typeof day !== "object") return "closed";
  const d = day as { isClosed?: boolean; isRegularHours?: boolean; openIntervals?: YextInterval[] };
  if (d.isRegularHours) return normalizeHours(regular ?? "closed");
  if (d.isClosed || !Array.isArray(d.openIntervals) || d.openIntervals.length === 0) return "closed";
  const h = d.openIntervals.map((iv) => `${iv.start}-${iv.end}`).join(",");
  const p = parseHours(h);
  return p ? formatHours(p) : normalizeHours(h);
}

/** Yext `hours` object → our regular week (missing days → "closed"). */
export function fromYextWeek(hours: YextWeek | null | undefined): OpeningHours {
  const week = {} as OpeningHours;
  for (const day of DAY_KEYS) week[day] = fromYextDay(hours?.[YEXT_DAYS[day]]);
  return week;
}

/** Our regular week → Yext `hours` days (without holidayHours). */
export function toYextWeek(week: Partial<OpeningHours>): Record<string, YextDayHours> {
  const out: Record<string, YextDayHours> = {};
  for (const day of DAY_KEYS) if (week[day] !== undefined) out[YEXT_DAYS[day]] = toYextDay(week[day]!);
  return out;
}

/** Yext holidayHours item → { date, hours } (isRegularHours resolved with the regular week). */
export function fromYextHoliday(item: YextHolidayHours, regular: OpeningHours): { date: string; hours: Hours; is_regular: boolean } {
  const isRegular = "isRegularHours" in item && item.isRegularHours === true;
  return { date: item.date, hours: fromYextDay(item, regular[weekdayOf(item.date)]), is_regular: isRegular };
}

/** { date: hours } → Yext holidayHours items. */
export function toYextHolidays(holidays: Record<string, Hours>): YextHolidayHours[] {
  return Object.keys(holidays)
    .sort()
    .map((date) => ({ date, ...toYextDay(holidays[date]) }));
}
