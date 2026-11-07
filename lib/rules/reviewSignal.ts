import type { Business, Listing, Review } from "@/types";
import type { DraftIssue, Rule, RuleContext, ReviewClassification } from "@/types/api";
import { addDays } from "@/lib/holidays";

// Rule 3, the optional review signal (DESIGN 8 and 9.2, stage C9).
//
// The code picks the reviews of the last 30 days (dates are never the LLM's job), lane A's
// classifyReviews reads only the text, and a signal with real evidence becomes one `review_signal`
// issue. Anything uncertain — no signal, a signal without the reviews it cites — means: do nothing.
// The owner is nagged only when a customer stated a concrete fact that contradicts the listing.
//
// The classifier is injected so the rule can be tested without Gemini, and so lib/rules/index.ts is
// the only place that pulls in the AI wrapper (the factory itself imports no server code).

export const REVIEW_WINDOW_DAYS = 30;

export type ClassifyReviews = (
  business: Business,
  reviews: Review[],
  listings: Listing[],
) => Promise<ReviewClassification>;

export function makeReviewSignal(classify: ClassifyReviews): Rule {
  return async (ctx: RuleContext): Promise<DraftIssue[]> => {
    const recent = (ctx.reviews ?? []).filter(
      (review) => review.date > addDays(ctx.today, -REVIEW_WINDOW_DAYS),
    );
    if (recent.length === 0) return [];

    const result = await classify(ctx.business, recent, ctx.listings ?? []);
    if (!result.signal) return [];

    // A classification must point at the reviews it used; otherwise it is not evidence.
    const citedIds = new Set(result.evidence_review_ids);
    const cited = recent.filter((review) => citedIds.has(review._id));
    if (cited.length === 0) return [];

    return [
      {
        business_id: ctx.business._id,
        type: "review_signal",
        severity: "medium",
        evidence: {
          signal_type: result.type,
          summary: result.summary || "Customers report that the listing is wrong.",
          reviews: cited.map(({ _id, date, rating, text }) => ({ _id, date, rating, text })),
        },
        fingerprint: `${ctx.business._id}:review_signal:${result.type}`,
      },
    ];
  };
}
