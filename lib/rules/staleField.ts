import type { Listing, Source, TrackedField } from "@/types";
import type { DraftIssue, Rule, StaleFieldEvidence } from "@/types/api";
import { addDays } from "@/lib/holidays";

// Rule 4 (DESIGN 8): a tracked field has not been updated for over a year. One issue per field.
// Tracked fields are opening_hours, holiday_hours and description (types/index.ts TrackedField);
// phone has no timestamp in the data model, so it cannot be stale.
//
// The evidence is "the data that told Connect":
//   oldest_update   the oldest update date across the sources
//   days_old        how many days before ctx.today that is
//   stale_sources   the sources whose value is older than a year
//   current_value   the value from the most recently updated source (what we would re-confirm)
//
// Pure: no DB, no clock (ctx.today), no network.

/** A field is stale when its update date is more than this many days before today. */
export const STALE_AFTER_DAYS = 365;

const TRACKED_FIELDS: readonly TrackedField[] = ["opening_hours", "holiday_hours", "description"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export const staleField: Rule = ({ business, listings, today }) => {
  // Strictly older than a year: a value updated exactly 365 days ago is still current enough.
  const cutoff = addDays(today, -STALE_AFTER_DAYS);
  const issues: DraftIssue[] = [];

  for (const field of TRACKED_FIELDS) {
    const dated = listings
      .map((listing) => ({ listing, updated: listing.field_updated_at?.[field] }))
      .filter((entry): entry is { listing: Listing; updated: string } =>
        typeof entry.updated === "string" && entry.updated.length > 0,
      );
    if (dated.length === 0) continue;

    const stale = dated.filter((entry) => entry.updated < cutoff);
    if (stale.length === 0) continue;

    const oldest_update = dated.reduce(
      (oldest, entry) => (entry.updated < oldest ? entry.updated : oldest),
      dated[0].updated,
    );

    // The freshest source holds what we would ask the owner to re-confirm; tie-break by source.
    const freshest = [...dated].sort(
      (a, b) => b.updated.localeCompare(a.updated) || a.listing.source.localeCompare(b.listing.source),
    )[0].listing;

    const evidence = {
      field,
      oldest_update,
      days_old: daysBetween(oldest_update, today),
      stale_sources: stale.map((entry) => entry.listing.source).sort() as Source[],
      current_value: freshest[field],
    } satisfies StaleFieldEvidence;

    issues.push({
      business_id: business._id,
      type: "stale_field",
      severity: "low",
      evidence,
      // Fixed shape (types/api.ts) so dedupe and "ignore" work across runs.
      fingerprint: `${business._id}:stale_field:${field}`,
    });
  }

  return issues;
};
