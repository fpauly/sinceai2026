import "server-only";
import { z } from "zod";
import type { Business, Listing, Review } from "@/types";
import type { ReviewClassification } from "@/types/api";
import { generateJson, geminiConfigured } from "@/lib/ai/gemini";

// Rule 3 helper (DESIGN 8, 9.2): does any recent review say the listing is wrong?
// Gemini only reads text. The caller (lib/rules/reviewSignal.ts, lane C) picks the reviews of the
// last 30 days in code; this function never reasons about dates.
// Never throws: on no key, no reviews, any Gemini error, or an answer without valid evidence it
// returns NO_SIGNAL.

export const NO_SIGNAL: ReviewClassification = {
  signal: false,
  type: "other",
  evidence_review_ids: [],
  summary: "",
};

const Answer = z.object({
  signal: z.boolean(),
  type: z.enum(["closed_when_open", "wrong_phone", "moved", "other"]),
  evidence_review_ids: z.array(z.string()),
  summary: z.string(),
});

const SYSTEM = `You check customer reviews of a small business for signs that its public listings (opening hours, phone number, address or description) are wrong.

Flag a signal ONLY when a review states a concrete fact that contradicts the listing or says the listing is out of date:
- "closed_when_open": a customer found the place closed at a time the listing (or Google, a map, the website) said it was open
- "wrong_phone": the listed phone number does not work or belongs to someone else
- "moved": the business has moved to a new address, or the map shows the wrong place
- "other": another concrete factual error in the listing

Do NOT flag opinions about food, service, prices, staff or waiting times, and do not flag a closure the reviewer explains as normal (for example a public holiday).
Use only the reviews given. Do not guess.

Answer with JSON:
- signal: true or false
- type: one of the four types above ("other" when signal is false)
- evidence_review_ids: the ids of the reviews that show the signal (empty when signal is false)
- summary: one short English sentence an owner understands, saying what the reviews report (empty when signal is false)`;

/** Classify recent reviews of one business. */
export async function classifyReviews(
  business: Business,
  reviews: Review[],
  listings: Listing[],
): Promise<ReviewClassification> {
  if (reviews.length === 0 || !geminiConfigured()) return NO_SIGNAL;

  const prompt = JSON.stringify(
    {
      business: { name: business.name, category: business.category, city: business.city },
      listings: listings.map((l) => ({
        source: l.source,
        opening_hours: l.opening_hours,
        phone: l.phone,
        description: l.description,
      })),
      reviews: reviews.map((r) => ({ id: r._id, date: r.date, rating: r.rating, text: r.text })),
    },
    null,
    2,
  );

  try {
    const answer = await generateJson({ system: SYSTEM, prompt, schema: Answer, temperature: 0 });
    return checkAnswer(answer, reviews);
  } catch (err) {
    console.warn(`[reviews] ${business._id}: no classification, using no signal (${err instanceof Error ? err.message : err})`);
    return NO_SIGNAL;
  }
}

/** Code check of Gemini's answer: a signal needs at least one real review id as evidence. */
function checkAnswer(answer: z.infer<typeof Answer>, reviews: Review[]): ReviewClassification {
  if (!answer.signal) return NO_SIGNAL;
  const known = new Set(reviews.map((r) => r._id));
  const ids = [...new Set(answer.evidence_review_ids)].filter((id) => known.has(id));
  const summary = answer.summary.trim();
  if (ids.length === 0 || !summary) return NO_SIGNAL;
  return { signal: true, type: answer.type, evidence_review_ids: ids, summary: summary.slice(0, 300) };
}
