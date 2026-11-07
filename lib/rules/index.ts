import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import { demoDate } from "@/lib/config";
import type {
  Business,
  HolidayHistoryEntry,
  Issue,
  PeerBenchmark,
  Preferences,
  Profile,
  PublisherSuggestion,
  SpecialDay,
} from "@/types";
import type { DraftIssue, Rule, RuleContext } from "@/types/api";
import { crossPlatformConflict } from "./crossPlatformConflict";
import { missingHolidayHours } from "./missingHolidayHours";
import { specialDays } from "./specialDays";
import { staleField } from "./staleField";

// Detection entry point (step 1 of the demo). Loads the data once, runs every rule for every
// business, and stores the new issues. Rules stay pure (ctx in, drafts out); all DB access is here.
//
// Two rule sets, chosen per business by the data it has:
//   - v1 seed: three listings per business -> missing holiday hours, conflicts, stale fields
//   - v2 dataset: one Profile per business  -> lib/predict per special day (C11)
// So the old seed chain keeps working while the app moves to Fonecta's data (DESIGN 0 "v2").
//
// Skips a draft whose fingerprint is remembered as ignored (preferences.ignored_fingerprints,
// DESIGN 7) or already exists as an open/suggested issue, so running the check twice creates
// nothing new (TASKS.md acceptance test).

/** Every v1 rule, in the order they run. */
export const rules: readonly Rule[] = [missingHolidayHours, crossPlatformConflict, staleField];

/** v2 rules: used instead of `rules` when a business has a Profile. */
export const v2Rules: readonly Rule[] = [specialDays];

function groupByBusiness<T extends { business_id: string }>(rows: T[]): Map<string, T[]> {
  const byId = new Map<string, T[]>();
  for (const row of rows) byId.set(row.business_id, [...(byId.get(row.business_id) ?? []), row]);
  return byId;
}

/** Run every rule (for one business, or all) and insert the new issues. Returns what it created. */
export async function runDetection(businessId?: string): Promise<Issue[]> {
  const c = await collections();
  const today = demoDate(); // DEMO_DATE: rules never read the clock

  // All businesses, so a shopping centre is always available as context. 32 rows at most.
  const allBusinesses = await c.businesses.find().sort({ _id: 1 }).toArray();
  const businesses = businessId ? allBusinesses.filter((b) => b._id === businessId) : allBusinesses;
  if (businesses.length === 0) return [];

  const [listings, reviews, preferences, active, profiles, holidayHistory, specialDaysRows, peers, publisherSuggestions] =
    await Promise.all([
      c.listings.find().toArray(),
      c.reviews.find().toArray(),
      c.preferences.find().toArray(),
      c.issues.find({ status: { $in: ["open", "suggested"] } }).toArray(),
      c.profiles.find().toArray(),
      c.holiday_history.find().toArray(),
      c.special_days.find().toArray(),
      c.peers.find().toArray(),
      c.publisher_suggestions.find().toArray(),
    ]);

  const businessesById = new Map(allBusinesses.map((business) => [business._id, business]));
  const profilesByBusiness = new Map(profiles.map((profile) => [profile.business_id, profile]));
  const listingsByBusiness = groupByBusiness(listings);
  const reviewsByBusiness = groupByBusiness(reviews);
  const historyByBusiness = groupByBusiness(holidayHistory);
  const suggestionsByBusiness = groupByBusiness(publisherSuggestions);
  const prefsByBusiness = new Map(preferences.map((prefs) => [prefs.business_id, prefs]));
  const ignored = new Set(preferences.flatMap((p) => p.ignored_fingerprints ?? []));
  const known = new Set(active.map((issue) => issue.fingerprint));

  const created: Issue[] = [];
  for (const business of businesses) {
    const profile = profilesByBusiness.get(business._id);
    const ctx: RuleContext = {
      business,
      listings: listingsByBusiness.get(business._id) ?? [],
      reviews: reviewsByBusiness.get(business._id) ?? [],
      today,
      ...(profile ? v2Context(business, profile, businessesById, profilesByBusiness, historyByBusiness, suggestionsByBusiness, prefsByBusiness, specialDaysRows, peers) : {}),
    };
    const ruleSet = profile ? v2Rules : rules;
    for (const rule of ruleSet) {
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

/** The v2 part of a rule context: profile, history, calendar, peers and the closure signals. */
function v2Context(
  business: Business,
  profile: Profile,
  businessesById: Map<string, Business>,
  profilesByBusiness: Map<string, Profile>,
  historyByBusiness: Map<string, HolidayHistoryEntry[]>,
  suggestionsByBusiness: Map<string, PublisherSuggestion[]>,
  prefsByBusiness: Map<string, Preferences>,
  specialDaysRows: SpecialDay[],
  peers: PeerBenchmark[],
): Partial<RuleContext> {
  const centreId = business.shopping_centre_id;
  const centreBusiness = centreId ? businessesById.get(centreId) : undefined;
  const centreProfile = centreId ? profilesByBusiness.get(centreId) : undefined;
  return {
    profile,
    history: historyByBusiness.get(business._id) ?? [],
    special_days: specialDaysRows,
    peers: peers.filter(
      (row) => row.country === business.country && row.city_tier === business.city_tier && row.segment === business.segment,
    ),
    centre:
      centreBusiness && centreProfile
        ? {
            business: centreBusiness,
            profile: centreProfile,
            history: historyByBusiness.get(centreBusiness._id) ?? [],
          }
        : null,
    publisher_suggestions: suggestionsByBusiness.get(business._id) ?? [],
    learned: prefsByBusiness.get(business._id)?.learned ?? [],
  };
}
