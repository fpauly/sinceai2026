import type { Business, Hours, IssueType, LearnedDecision, Preferences, ProposedChange } from "@/types";

// Learning (DESIGN 11, stage A5): what the owner did before shapes the next suggestion.
// Pure helpers over `preferences` (written by D's lib/apply.ts on every decision):
//  - an hours EDIT is the owner's own data: the next proposal for the same day reuses it
//  - a standing permission lets a valid suggestion of that kind be applied without asking
// Declines need nothing here: detection skips ignored fingerprints, so the issue does not come back.

const EDITED = new Set<LearnedDecision["decision"]>(["edited"]);

/** Newest first. */
function decisions(prefs: Preferences | null, field: string): LearnedDecision[] {
  return (prefs?.learned ?? [])
    .filter((l) => l.field === field && EDITED.has(l.decision) && isRecord(l.final))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** The hours the owner set themselves for this date, or the same calendar day (MM-DD) in an earlier year. */
export function ownerHolidayHours(prefs: Preferences | null, date: string): { hours: Hours; from: string } | null {
  for (const l of decisions(prefs, "holiday_hours")) {
    const final = l.final as Record<string, unknown>;
    if (typeof final[date] === "string") return { hours: final[date] as Hours, from: date };
    for (const [d, h] of Object.entries(final)) {
      if (d.slice(5) === date.slice(5) && d < date && typeof h === "string") return { hours: h, from: d };
    }
  }
  return null;
}

/** The value the owner chose last time for one weekday of the regular hours, if they edited it. */
export function ownerOpeningHours(prefs: Preferences | null, day: string): Hours | null {
  for (const l of decisions(prefs, "opening_hours")) {
    const v = (l.final as Record<string, unknown>)[day];
    if (typeof v === "string") return v;
  }
  return null;
}

/** Did the owner say "do this automatically next time" for this kind of change? Either in our UI
 *  (preferences), or, for special-day hours, in Connect's CRM (`contact.standing_permission_holidays`,
 *  customer_contacts.csv: "handle public holidays from now on"). */
export function hasStandingPermission(
  prefs: Preferences | null,
  issueType: IssueType,
  field: ProposedChange["field"],
  business?: Pick<Business, "contact"> | null,
): boolean {
  if (issueType === "special_day_hours" && field === "holiday_hours" && business?.contact?.standing_permission_holidays) {
    return true;
  }
  return (prefs?.standing_permissions ?? []).some((p) => p.issue_type === issueType && p.field === field);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
