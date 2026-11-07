import { randomUUID } from "node:crypto";
import { collections } from "@/lib/db";
import { generateSuggestion } from "@/lib/ai/suggest";
import { hasStandingPermission } from "@/lib/ai/learning";
import { applyDecision } from "@/lib/apply";
import type { Business, Issue, Listing, Preferences, Suggestion } from "@/types";
import type { ApiError, SuggestResponse } from "@/types/api";

// POST /api/suggest[?businessId=] — step 2 (Suggest).
// For every `open` issue: build a suggestion (Gemini words + code-picked value, checked by
// lib/validate.ts, template as fallback), store it with `source` and `validation`, and mark the
// issue `suggested`. Learning (A5): the owner's earlier edits shape the proposal (lib/ai/learning.ts),
// and a VALID suggestion the owner gave standing permission for is applied right away through D's
// applyDecision (decision "auto"); the owner is still told afterwards. Invalid ones never auto-apply.

const CONCURRENCY = 4; // Gemini calls in flight at once

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
    const ctx: Ctx = {
      businessById: new Map<string, Business>(businesses.map((b) => [b._id, b])),
      prefsById: new Map<string, Preferences>(prefs.map((p) => [p.business_id, p])),
      listingsById: new Map<string, Listing[]>(),
    };
    for (const l of listings) ctx.listingsById.set(l.business_id, [...(ctx.listingsById.get(l.business_id) ?? []), l]);

    // Keep the order of `issues` in the response, whatever order the calls finish in.
    const results: (Suggestion | null)[] = new Array(issues.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < issues.length) {
        const i = next++;
        results[i] = await suggestOne(issues[i], ctx);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, issues.length) }, worker));

    const created = results.filter((s): s is Suggestion => s !== null);
    return Response.json({ ok: true, created } satisfies SuggestResponse);
  } catch (err) {
    console.error("[suggest] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Suggest failed" } satisfies ApiError,
      { status: 500 },
    );
  }
}

interface Ctx {
  businessById: Map<string, Business>;
  listingsById: Map<string, Listing[]>;
  prefsById: Map<string, Preferences>;
}

async function suggestOne(issue: Issue, ctx: Ctx): Promise<Suggestion | null> {
  const business = ctx.businessById.get(issue.business_id);
  if (!business) {
    console.warn(`[suggest] issue ${issue._id}: business ${issue.business_id} not found, skipped`);
    return null;
  }

  const c = await collections();
  // Claim the issue first so two parallel runs never create two suggestions for it.
  const claimed = await c.issues.updateOne({ _id: issue._id, status: "open" }, { $set: { status: "suggested" } });
  if (claimed.modifiedCount === 0) return null;

  const prefs = ctx.prefsById.get(business._id) ?? null;
  let suggestion: Suggestion;
  try {
    const { draft, source, validation } = await generateSuggestion(
      business,
      issue,
      ctx.listingsById.get(business._id) ?? [],
      prefs,
    );
    suggestion = {
      _id: randomUUID(),
      issue_id: issue._id,
      business_id: business._id,
      ...draft,
      source,
      validation,
      audio_url: null,
      decision: null,
      decided_via: null,
      decided_at: null,
      applied: null,
    };
    await c.suggestions.insertOne(suggestion);
  } catch (err) {
    await c.issues.updateOne({ _id: issue._id }, { $set: { status: "open" } }); // release the claim
    console.error(`[suggest] issue ${issue._id}: failed, left open`, err);
    return null;
  }

  // Standing permission: apply a valid suggestion now; on any problem it simply waits for the owner.
  if (suggestion.validation?.ok && hasStandingPermission(prefs, issue.type, suggestion.proposed_change.field)) {
    try {
      const { suggestion: applied } = await applyDecision(suggestion._id, { decision: "accepted", via: "tap" }, { auto: true });
      return applied;
    } catch (err) {
      console.warn(`[suggest] issue ${issue._id}: standing permission apply failed, waiting for the owner`, err);
    }
  }
  return suggestion;
}
