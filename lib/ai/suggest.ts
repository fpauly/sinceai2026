import "server-only";
import { z } from "zod";
import type { Business, Issue, Listing, Preferences, Suggestion, ValidationResult } from "@/types";
import type { SuggestionDraft } from "@/types/api";
import { fallbackSuggestion } from "@/lib/ai/fallback";
import { generateJson, geminiConfigured } from "@/lib/ai/gemini";
import { validateSuggestion } from "@/lib/validate";

// Step 2 (Suggest), DESIGN 9.1 + 9.4: one suggestion for one issue.
//
// Code decides, Gemini explains:
//  - the proposed value and the confidence come from code (lib/ai/fallback.ts): picking the newest
//    source or the majority value means comparing dates and counts, which the LLM never does
//  - Gemini writes the `reason` and the EN + FI messages from the evidence and that proposal
//  - every draft goes through lib/validate.ts; an invalid Gemini draft or any Gemini error means
//    the template draft is used instead. If even the template fails validation, it is kept with
//    confidence forced to "low" and the problems stored, so the owner sees "please check".

export interface SuggestResult {
  draft: SuggestionDraft;
  source: NonNullable<Suggestion["source"]>;
  validation: ValidationResult;
}

const Words = z.object({
  reason: z.string().min(1),
  message: z.object({ en: z.string().min(1), fi: z.string().min(1) }),
});

const SYSTEM = `You are Fonecta Connect, a friendly assistant that keeps a small business's public listings (Google, Finder, its own website) up to date. You write to the owner.

You get one issue our code found, the evidence, the business's listings, and the change our code proposes. The proposed change is final: never change its values, dates or hours, and never invent new facts.

Write JSON with:
- reason: ONE short English sentence an owner understands, naming the data the proposal is based on (for example last year's holiday hours, or which listing was updated most recently)
- message.en: the message to the owner in English, at most 2 sentences. Greet the owner by first name, say what is missing or different, state the exact proposed hours or value, and ALWAYS say in plain words what the proposal is based on (see why_this_proposal): for example "the same as last year", "your website was updated most recently", "most of your listings show this number" or "what most hair salons do". The owner must see why from the message alone.
- message.fi: the same message in natural Finnish, at most 2 sentences, also saying what the proposal is based on.

Rules:
- Plain, warm language, no jargon, no emojis.
- If why_this_proposal says the hours come from the owner's own earlier change, say so (for example "the hours you chose last time").
- If confidence is "low", phrase the message as a question and make clear it is a common pattern, not the owner's own data.
- Otherwise end with a short yes/no question such as "Shall I publish this everywhere?"
- For a conflict between listings, say what each listing shows (for example: your website says 10:00–14:00 but Google says 10:00–18:00).
- When you quote the owner's description, keep it inside quotation marks “like this”.
- Write hours as 10:00–14:00 and dates as "24 Dec" or the holiday name. Never use dotted dates like 24.12. and no abbreviations with dots (no "e.g.", "approx.").
- Each sentence ends with exactly one ".", "?" or "!"; never use those characters inside a sentence.
- The example_message shows the facts in a plain form; write a better, friendlier version of it.`;

/** Build, validate and return the suggestion for one issue. Never throws. */
export async function generateSuggestion(
  business: Business,
  issue: Issue,
  listings: Listing[],
  prefs: Preferences | null,
): Promise<SuggestResult> {
  const base = fallbackSuggestion(business, issue, listings, prefs);

  if (geminiConfigured()) {
    try {
      const words = await generateJson({ system: SYSTEM, prompt: buildPrompt(business, issue, listings, base), schema: Words });
      const draft: SuggestionDraft = {
        proposed_change: base.proposed_change,
        confidence: base.confidence,
        reason: words.reason.trim(),
        message: { en: words.message.en.trim(), fi: words.message.fi.trim() },
      };
      const validation = validateSuggestion(draft, issue, listings);
      if (validation.ok) return { draft, source: "gemini", validation };
      console.warn(`[suggest] issue ${issue._id}: Gemini draft invalid, using template (${validation.problems.join("; ")})`);
    } catch (err) {
      console.warn(`[suggest] issue ${issue._id}: Gemini failed, using template (${err instanceof Error ? err.message : err})`);
    }
  }

  const validation = validateSuggestion(base, issue, listings);
  const draft = validation.ok ? base : { ...base, confidence: "low" as const };
  if (!validation.ok) {
    console.warn(`[suggest] issue ${issue._id}: template draft invalid too (${validation.problems.join("; ")})`);
  }
  return { draft, source: "fallback", validation };
}

/** The data Gemini needs, as JSON. Only the field this issue is about, per listing. */
function buildPrompt(business: Business, issue: Issue, listings: Listing[], base: SuggestionDraft): string {
  const field = base.proposed_change.field;
  return JSON.stringify(
    {
      business: {
        name: business.name,
        owner_first_name: business.owner_name,
        category: business.category,
        city: business.city,
      },
      issue: { type: issue.type, evidence: issue.evidence },
      listings: listings.map((l) => ({
        source: l.source === "website" ? "own website" : l.source === "finder" ? "Finder" : "Google",
        [field]: (l as unknown as Record<string, unknown>)[field],
        last_updated: field in l.field_updated_at ? l.field_updated_at[field as keyof Listing["field_updated_at"]] : undefined,
      })),
      proposed_change: base.proposed_change,
      confidence: base.confidence,
      why_this_proposal: base.reason,
      example_message: base.message.en,
    },
    null,
    2,
  );
}
