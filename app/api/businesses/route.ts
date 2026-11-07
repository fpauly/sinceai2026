import { connection } from "next/server";
import { collections } from "@/lib/db";
import type { Severity, Suggestion } from "@/types";
import type { ApiError, BusinessesResponse, BusinessSummary } from "@/types/api";

// GET /api/businesses — the Fonecta dashboard list (DESIGN 11, TASKS C7).
// `connection()` is required: without it the build would try to prerender this DB read.
//
// open_issues counts issues whose status is open or suggested (an issue waiting for the owner's
// decision is still open work). last_decision is the newest decided suggestion of that business.
export async function GET() {
  await connection();
  try {
    const c = await collections();
    const [businesses, issues, decided] = await Promise.all([
      c.businesses.find().sort({ name: 1 }).toArray(),
      c.issues.find({ status: { $in: ["open", "suggested"] } }).toArray(),
      c.suggestions
        .find({ decision: { $ne: null }, decided_at: { $ne: null } })
        .sort({ decided_at: -1 })
        .toArray(),
    ]);

    const openByBusiness = new Map<string, Record<Severity, number>>();
    for (const issue of issues) {
      const counts = openByBusiness.get(issue.business_id) ?? { high: 0, medium: 0, low: 0 };
      counts[issue.severity] += 1;
      openByBusiness.set(issue.business_id, counts);
    }

    // Already sorted newest first, so the first row per business wins.
    const lastByBusiness = new Map<string, Suggestion>();
    for (const suggestion of decided) {
      if (!lastByBusiness.has(suggestion.business_id)) lastByBusiness.set(suggestion.business_id, suggestion);
    }

    const rows: BusinessesResponse = businesses.map((business) => {
      const last = lastByBusiness.get(business._id);
      const summary: BusinessSummary = {
        business,
        open_issues: openByBusiness.get(business._id) ?? { high: 0, medium: 0, low: 0 },
        last_decision:
          last && last.decision && last.decided_at
            ? { decision: last.decision, field: last.proposed_change.field, decided_at: last.decided_at }
            : null,
      };
      return summary;
    });

    return Response.json(rows);
  } catch (err) {
    console.error("[businesses] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not load businesses" } satisfies ApiError,
      { status: 500 },
    );
  }
}
