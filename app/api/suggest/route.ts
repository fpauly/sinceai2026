import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import { fallbackSuggestion } from "@/lib/ai/fallback";
import type { Business, Issue, Listing, Preferences, Suggestion } from "@/types";
import type { ApiError, SuggestResponse } from "@/types/api";

// POST /api/suggest[?businessId=] — step 2 (Suggest).
// For every `open` issue: build a suggestion, store it, and mark the issue `suggested`.
// For now the suggestion comes from the fallback templates (lib/ai/fallback.ts); Gemini and
// lib/validate.ts are added in stage A4, learning and standing permissions in A5.
export async function POST(req: Request) {
  try {
    const businessId = new URL(req.url).searchParams.get("businessId");
    const c = await collections();

    const issues = await c.issues
      .find({ status: "open", ...(businessId ? { business_id: businessId } : {}) })
      .sort({ created_at: 1 })
      .toArray();
    if (issues.length === 0) return Response.json({ ok: true, created: [] } satisfies SuggestResponse);

    const ids = [...new Set(issues.map((i) => i.business_id))];
    const [businesses, listings, prefs] = await Promise.all([
      c.businesses.find({ _id: { $in: ids } }).toArray(),
      c.listings.find({ business_id: { $in: ids } }).toArray(),
      c.preferences.find({ business_id: { $in: ids } }).toArray(),
    ]);
    const businessById = new Map<string, Business>(businesses.map((b) => [b._id, b]));
    const prefsById = new Map<string, Preferences>(prefs.map((p) => [p.business_id, p]));
    const listingsById = new Map<string, Listing[]>();
    for (const l of listings) listingsById.set(l.business_id, [...(listingsById.get(l.business_id) ?? []), l]);

    const created: Suggestion[] = [];
    for (const issue of issues) {
      const suggestion = await suggestOne(issue, businessById, listingsById, prefsById);
      if (suggestion) created.push(suggestion);
    }
    return Response.json({ ok: true, created } satisfies SuggestResponse);
  } catch (err) {
    console.error("[suggest] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Suggest failed" } satisfies ApiError,
      { status: 500 },
    );
  }
}

async function suggestOne(
  issue: Issue,
  businessById: Map<string, Business>,
  listingsById: Map<string, Listing[]>,
  prefsById: Map<string, Preferences>,
): Promise<Suggestion | null> {
  const business = businessById.get(issue.business_id);
  if (!business) {
    console.warn(`[suggest] issue ${issue._id}: business ${issue.business_id} not found, skipped`);
    return null;
  }

  let draft;
  try {
    draft = fallbackSuggestion(business, issue, listingsById.get(business._id) ?? [], prefsById.get(business._id) ?? null);
  } catch (err) {
    console.error(`[suggest] issue ${issue._id}: fallback failed, skipped`, err);
    return null;
  }

  const c = await collections();
  // Claim the issue first so two parallel runs never create two suggestions for it.
  const claimed = await c.issues.updateOne({ _id: issue._id, status: "open" }, { $set: { status: "suggested" } });
  if (claimed.modifiedCount === 0) return null;

  const suggestion: Suggestion = {
    _id: randomUUID(),
    issue_id: issue._id,
    business_id: business._id,
    ...draft,
    source: "fallback",
    audio_url: null,
    decision: null,
    decided_via: null,
    decided_at: null,
    applied: null,
  };
  try {
    await c.suggestions.insertOne(suggestion);
  } catch (err) {
    await c.issues.updateOne({ _id: issue._id }, { $set: { status: "open" } }); // release the claim
    throw err;
  }
  return suggestion;
}
