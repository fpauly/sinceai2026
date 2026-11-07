import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import { demoDate } from "@/lib/config";
import type { Issue } from "@/types";
import type { DraftIssue, Rule, RuleContext } from "@/types/api";
import { crossPlatformConflict } from "./crossPlatformConflict";
import { missingHolidayHours } from "./missingHolidayHours";
import { staleField } from "./staleField";

// Detection entry point (step 1 of the demo). Loads the data once, runs every rule for every
// business, and stores the new issues. Rules stay pure (ctx in, drafts out); all DB access is here.
//
// Skips a draft whose fingerprint is remembered as ignored (preferences.ignored_fingerprints,
// DESIGN 7) or already exists as an open/suggested issue, so running the check twice creates
// nothing new (TASKS.md acceptance test).

/** Every rule, in the order they run. New rules are registered here (C9). */
export const rules: readonly Rule[] = [missingHolidayHours, crossPlatformConflict, staleField];

function groupByBusiness<T extends { business_id: string }>(rows: T[]): Map<string, T[]> {
  const byId = new Map<string, T[]>();
  for (const row of rows) byId.set(row.business_id, [...(byId.get(row.business_id) ?? []), row]);
  return byId;
}

/** Run every rule (for one business, or all) and insert the new issues. Returns what it created. */
export async function runDetection(businessId?: string): Promise<Issue[]> {
  const c = await collections();
  const today = demoDate(); // DEMO_DATE: rules never read the clock

  const businesses = await c.businesses
    .find(businessId ? { _id: businessId } : {})
    .sort({ _id: 1 })
    .toArray();
  if (businesses.length === 0) return [];

  const ids = businesses.map((b) => b._id);
  const [listings, reviews, preferences, active] = await Promise.all([
    c.listings.find({ business_id: { $in: ids } }).toArray(),
    c.reviews.find({ business_id: { $in: ids } }).toArray(),
    c.preferences.find({ business_id: { $in: ids } }).toArray(),
    c.issues.find({ business_id: { $in: ids }, status: { $in: ["open", "suggested"] } }).toArray(),
  ]);

  const listingsByBusiness = groupByBusiness(listings);
  const reviewsByBusiness = groupByBusiness(reviews);
  const ignored = new Set(preferences.flatMap((p) => p.ignored_fingerprints ?? []));
  const known = new Set(active.map((issue) => issue.fingerprint));

  const created: Issue[] = [];
  for (const business of businesses) {
    const ctx: RuleContext = {
      business,
      listings: listingsByBusiness.get(business._id) ?? [],
      reviews: reviewsByBusiness.get(business._id) ?? [],
      today,
    };
    for (const rule of rules) {
      let drafts: DraftIssue[];
      try {
        drafts = rule(ctx);
      } catch (err) {
        // One broken rule must not break the daily check for every business.
        console.error(`[detect] ${rule.name || "rule"} failed on ${business._id}`, err);
        continue;
      }
      for (const draft of drafts) {
        if (ignored.has(draft.fingerprint) || known.has(draft.fingerprint)) continue;
        const issue: Issue = {
          _id: randomUUID(),
          ...draft,
          status: "open",
          created_at: new Date().toISOString(),
        };
        await c.issues.insertOne(issue);
        known.add(draft.fingerprint); // also dedupes two rules producing the same fingerprint
        created.push(issue);
      }
    }
  }
  return created;
}
