import type { Day, Source } from "@/types";
import { DAYS } from "@/types";
import type { CrossPlatformConflictEvidence, DraftIssue, Rule } from "@/types/api";

// Rule 2 (DESIGN 8): the same field differs between sources — one issue per field.
// Covered fields: opening_hours.<day> (all seven days) and phone (types/api.ts).
//
// The evidence is "the data that told Connect": every value we saw for that field, with the source
// that shows it and when that source last updated its opening hours (null for phone, which we do
// not track). Lane A uses it to prefer the most recently updated source and to say why.
//
// Pure: no DB, no clock, no network.

interface ConflictValue {
  source: Source;
  value: string;
  updated_at: string | null;
}

function conflictIssue(
  businessId: string,
  field: `opening_hours.${Day}` | "phone",
  values: ConflictValue[],
): DraftIssue | undefined {
  const distinct = new Set(values.map((v) => v.value.trim()));
  if (values.length < 2 || distinct.size < 2) return undefined;

  const evidence = { field, values } satisfies CrossPlatformConflictEvidence;
  return {
    business_id: businessId,
    type: "cross_platform_conflict",
    severity: "high",
    evidence,
    // Fixed shape (types/api.ts) so dedupe and "ignore" work across runs.
    fingerprint: `${businessId}:cross_platform_conflict:${field}`,
  };
}

export const crossPlatformConflict: Rule = ({ business, listings }) => {
  const issues: DraftIssue[] = [];
  if (listings.length < 2) return issues; // nothing to compare

  // Stable order, so the evidence array is identical on every run.
  const sorted = [...listings].sort((a, b) => a.source.localeCompare(b.source));

  for (const day of DAYS) {
    const values: ConflictValue[] = [];
    for (const listing of sorted) {
      const hours = listing.opening_hours?.[day];
      if (typeof hours !== "string" || !hours.trim()) continue;
      values.push({
        source: listing.source,
        value: hours,
        updated_at: listing.field_updated_at?.opening_hours ?? null,
      });
    }
    const issue = conflictIssue(business._id, `opening_hours.${day}`, values);
    if (issue) issues.push(issue);
  }

  const phones: ConflictValue[] = [];
  for (const listing of sorted) {
    if (typeof listing.phone !== "string" || !listing.phone.trim()) continue;
    // Phone has no per-field timestamp in the data model (types/index.ts TrackedField).
    phones.push({ source: listing.source, value: listing.phone, updated_at: null });
  }
  const phoneIssue = conflictIssue(business._id, "phone", phones);
  if (phoneIssue) issues.push(phoneIssue);

  return issues;
};
