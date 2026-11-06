import { connection } from "next/server";
import { collections } from "@/lib/db";
import { demoDate } from "@/lib/config";

// GET /api/status — read-only DB snapshot for the progress board on "/".
export async function GET() {
  await connection(); // always run at request time (never prerender a DB query)

  const dbName = process.env.MONGODB_DB || "ajantasa";
  try {
    const c = await collections();
    const [businesses, listings, reviews, issueTypes, issueStatuses, suggestionDecisions, prefs, validated, applied, appliedYext] =
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
      ]);

    const toMap = (rows: { _id: string | null; n: number }[]) =>
      Object.fromEntries(rows.map((r) => [r._id ?? "none", r.n]));
    const byDecision = toMap(suggestionDecisions);
    const suggestionsTotal = suggestionDecisions.reduce((s, r) => s + r.n, 0);

    return Response.json({
      ok: true,
      demo_date: demoDate(),
      db: { ok: true, name: dbName },
      counts: { businesses, listings, reviews },
      issues: {
        total: issueTypes.reduce((s, r) => s + r.n, 0),
        by_type: toMap(issueTypes),
        by_status: toMap(issueStatuses),
      },
      suggestions: {
        total: suggestionsTotal,
        decided: suggestionsTotal - (byDecision.none ?? 0),
        by_decision: byDecision,
        validated,
        applied,
        applied_yext: appliedYext,
      },
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
