import type { HolidayHours, Listing } from "@/types";
import type { DraftIssue, MissingHolidayHoursEvidence, Rule } from "@/types/api";
import { lastYearDate, upcomingHolidays } from "@/lib/holidays";

// Rule 1 (DESIGN 8): a Finnish public holiday falls within the next 30 days and no listing has
// holiday hours for it. One issue per business, grouping every missing date (types/api.ts).
//
// The evidence is "the data that told Connect" (step 1 of the demo):
//   dates          the upcoming holidays with no hours on any channel, sorted
//   holiday_names  date -> English name, for the message lane A writes
//   last_year      the same days one year earlier, copied from the listing whose holiday hours
//                  were updated most recently; {} when the business has no history (parturi case)
//
// Pure: no DB, no clock (ctx.today), no network. The proposal that answers this issue is lane A's
// job; this rule only says what is missing and why.

/** Last year's hours for `date`, from the most recently updated listing that has them. */
function lastYearHours(listings: Listing[], date: string): string | undefined {
  const freshestFirst = [...listings].sort((a, b) =>
    (b.field_updated_at?.holiday_hours ?? "").localeCompare(a.field_updated_at?.holiday_hours ?? ""),
  );
  for (const listing of freshestFirst) {
    const value = listing.holiday_hours?.[date];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export const missingHolidayHours: Rule = ({ business, listings, today }) => {
  // A date counts as covered as soon as ONE channel has hours for it (DESIGN 8 rule 1).
  const missing = upcomingHolidays(today).filter(
    (holiday) => !listings.some((listing) => listing.holiday_hours?.[holiday.date] !== undefined),
  );
  if (missing.length === 0) return [];

  const dates = missing.map((h) => h.date).sort();
  const holiday_names: Record<string, string> = {};
  for (const holiday of missing) holiday_names[holiday.date] = holiday.name;

  const last_year: HolidayHours = {};
  for (const date of dates) {
    const previous = lastYearDate(date);
    const value = lastYearHours(listings, previous);
    if (value !== undefined) last_year[previous] = value;
  }

  const evidence = {
    dates,
    holiday_names,
    last_year,
  } satisfies MissingHolidayHoursEvidence;

  const issue: DraftIssue = {
    business_id: business._id,
    type: "missing_holiday_hours",
    severity: "high",
    evidence,
    // Fixed shape (types/api.ts) so dedupe and "ignore" work across runs.
    fingerprint: `${business._id}:missing_holiday_hours:${dates.join(",")}`,
  };
  return [issue];
};
