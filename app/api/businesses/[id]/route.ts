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

    const [listings, pending, issues] = await Promise.all([
      c.listings.find({ business_id: id }).sort({ source: 1 }).toArray(),
      c.suggestions.find({ business_id: id, decision: { $eq: null, $exists: true } }).sort({ _id: 1 }).toArray(),
      c.issues.find({ business_id: id }).toArray(),
    ]);
    const byId = new Map(issues.map((issue) => [issue._id, issue]));
    const suggestions: SuggestionWithIssue[] = [];
    for (const suggestion of pending) {
      const issue = byId.get(suggestion.issue_id);
      if (issue) suggestions.push({ ...suggestion, issue });
    }

    return Response.json({ business, listings, suggestions } satisfies OwnerViewResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "Could not load your business. Please try again." } satisfies ApiError, { status: 500 });
  }
}
