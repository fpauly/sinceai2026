import { connection } from "next/server";
import { collections } from "@/lib/db";
import type { ApiError, OwnerViewResponse, SuggestionWithIssue } from "@/types/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/businesses/[id]">) {
  await connection();

  try {
    const { id } = await ctx.params;
    const c = await collections();
    const business = await c.businesses.findOne({ _id: id });
    if (!business) {
      return Response.json({ ok: false, error: "Business not found" } satisfies ApiError, { status: 404 });
    }

    const [listings, pending, issues, profile, automatic] = await Promise.all([
      c.listings.find({ business_id: id }).sort({ source: 1 }).toArray(),
      c.suggestions.find({ business_id: id, decision: { $eq: null, $exists: true } }).sort({ _id: 1 }).toArray(),
      c.issues.find({ business_id: id }).toArray(),
      c.profiles.findOne({ business_id: id }),
      c.suggestions.find({ business_id: id, decision: "auto" }).sort({ decided_at: -1, _id: 1 }).toArray(),
    ]);
    const byId = new Map(issues.map((issue) => [issue._id, issue]));
    function publicSuggestions(rows: typeof pending): SuggestionWithIssue[] {
      return rows.flatMap((suggestion) => {
        const issue = byId.get(suggestion.issue_id);
        if (!issue || issue.type === "needs_human") return [];
        const publicSuggestion = { ...suggestion };
        delete (publicSuggestion as typeof suggestion & { _decision?: unknown })._decision;
        return [{ ...publicSuggestion, issue }];
      });
    }
    const suggestions = publicSuggestions(pending);
    const automatically_applied = publicSuggestions(automatic);

    return Response.json({ business, listings, suggestions, profile, automatically_applied } satisfies OwnerViewResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "Could not load your business. Please try again." } satisfies ApiError, { status: 500 });
  }
}
