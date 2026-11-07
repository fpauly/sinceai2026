import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connection } from "next/server";
import { collections } from "@/lib/db";
import { demoDate } from "@/lib/config";

// GET /api/status — read-only DB snapshot for the progress board on "/".

/** Rows in the committed predictions_2026.csv (the file Fonecta scores), or null if it is missing. */
function predictionRows(): number | null {
  try {
    const file = join(process.cwd(), "predictions_2026.csv");
    if (!existsSync(file)) return null;
    return readFileSync(file, "utf8").split("\n").filter(Boolean).length - 1;
  } catch {
    return null;
  }
}
export async function GET() {
  await connection(); // always run at request time (never prerender a DB query)

  const dbName = process.env.MONGODB_DB || "ajantasa";
  try {
    const c = await collections();
    const [businesses, listings, reviews, issueTypes, issueStatuses, suggestionDecisions, prefs, validated, applied, appliedYext,
      profiles, contacts, suggestionSources, withSearchViews, eventNights] =
      await Promise.all([
        c.businesses.countDocuments(),
        c.listings.countDocuments(),
        c.reviews.countDocuments(),
        c.issues.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$type", n: { $sum: 1 } } }]).toArray(),
        c.issues.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
        c.suggestions.aggregate<{ _id: string | null; n: number }>([{ $group: { _id: "$decision", n: { $sum: 1 } } }]).toArray(),
        c.preferences.aggregate<{ ignored: number; learned: number; standing: number }>([
          { $project: {
            ignored: { $size: { $ifNull: ["$ignored_fingerprints", []] } },
            learned: { $size: { $ifNull: ["$learned", []] } },
            standing: { $size: { $ifNull: ["$standing_permissions", []] } },
          } },
          { $group: { _id: null, ignored: { $sum: "$ignored" }, learned: { $sum: "$learned" }, standing: { $sum: "$standing" } } },
        ]).toArray(),
        c.suggestions.countDocuments({ validation: { $exists: true } }),
        c.suggestions.countDocuments({ applied: { $type: "object" } }),
        c.suggestions.countDocuments({ "applied.yext": true }),
        c.profiles.countDocuments(),
        c.businesses.countDocuments({ contact: { $type: "object" } }),
        c.suggestions.aggregate<{ _id: string | null; n: number }>([{ $group: { _id: "$source", n: { $sum: 1 } } }]).toArray(),
        c.issues.countDocuments({ "evidence.expected_search_views": { $type: "number" } }),
        // special-day issues on an event night or a school break (C15 imports those days)
        c.issues.aggregate<{ n: number }>([
          { $match: { type: "special_day_hours" } },
          { $lookup: { from: "special_days", let: { d: "$evidence.date", k: "$evidence.day_key" }, as: "day", pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$date", "$$d"] }, { $eq: ["$day_key", "$$k"] }] } } },
            { $match: { day_type: { $in: ["EVENT", "SCHOOL_BREAK"] } } },
          ] } },
          { $match: { "day.0": { $exists: true } } },
          { $count: "n" },
        ]).toArray(),
      ]);

    const toMap = (rows: { _id: string | null; n: number }[]) =>
      Object.fromEntries(rows.map((r) => [r._id ?? "none", r.n]));
    const byDecision = toMap(suggestionDecisions);
    const suggestionsTotal = suggestionDecisions.reduce((s, r) => s + r.n, 0);

    return Response.json({
      ok: true,
      demo_date: demoDate(),
      db: { ok: true, name: dbName },
      counts: { businesses, listings, reviews, profiles, contacts },
      issues: {
        total: issueTypes.reduce((s, r) => s + r.n, 0),
        by_type: toMap(issueTypes),
        by_status: toMap(issueStatuses),
        with_search_views: withSearchViews,
        event_nights: eventNights[0]?.n ?? 0,
      },
      suggestions: {
        total: suggestionsTotal,
        decided: suggestionsTotal - (byDecision.none ?? 0),
        by_decision: byDecision,
        validated,
        applied,
        applied_yext: appliedYext,
        by_source: toMap(suggestionSources),
      },
      predictions_2026: predictionRows(),
      ignored_fingerprints: prefs[0]?.ignored ?? 0,
      learned: prefs[0]?.learned ?? 0,
      standing_permissions: prefs[0]?.standing ?? 0,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      demo_date: demoDate(),
      db: { ok: false, name: dbName, error: err instanceof Error ? err.message : "DB error" },
    });
  }
}
