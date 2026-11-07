import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Collection, UpdateFilter } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { validateSuggestion } from "@/lib/validate";
import { publishChange } from "@/lib/yext";
import type { AppliedResult, Issue, LearnedDecision, Preferences, Suggestion } from "@/types";
import type { DecideRequest, DecideResponse, TypedProposedChange } from "@/types/api";

export class DecisionError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export const decisionRequestSchema = z.object({
  decision: z.enum(["accepted", "edited", "ignored"]),
  via: z.enum(["tap", "voice"]),
  edited_value: z.unknown().optional(),
  standing_permission: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "edited" && value.edited_value === undefined) {
    ctx.addIssue({ code: "custom", message: "An edited value is required" });
  }
  if (value.standing_permission && value.decision === "ignored") {
    ctx.addIssue({ code: "custom", message: "Ignoring a suggestion cannot grant automatic permission" });
  }
});

const hours = z.string().refine((value) => {
  if (value === "closed") return true;
  const match = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.exec(value);
  return !!match && value.slice(0, 5) < value.slice(6);
}, "Invalid opening hours");
const date = z.iso.date();
const changes = z.discriminatedUnion("field", [
  z.object({ field: z.literal("holiday_hours"), value: z.record(date, hours).refine((v) => Object.keys(v).length > 0) }),
  z.object({ field: z.literal("opening_hours"), value: z.partialRecord(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), hours).refine((v) => Object.keys(v).length > 0) }),
  z.object({ field: z.literal("phone"), value: z.string().regex(/^\+?[\d\s\-()./]+$/).refine((v) => { const n = v.replace(/\D/g, "").length; return n >= 5 && n <= 15; }) }),
  z.object({ field: z.literal("description"), value: z.string().trim().min(1) }),
]);

// Private persistence metadata, stripped from API responses. A lease permits recovery
// after a server crash without adding processing states to the shared public contracts.
type ProcessingSuggestion = Suggestion & { _decision?: {
  request: DecideRequest;
  token: string;
  lease_until: string;
  at: string;
  publishing?: boolean;
  publication?: AppliedResult;
} };

function checkEditScope(issue: Issue, change: TypedProposedChange, original: Suggestion["proposed_change"]) {
  const evidence = issue.evidence;
  const keys = typeof change.value === "object" ? Object.keys(change.value).sort() : [];
  let field: string | undefined;
  let allowedKeys: string[] | undefined;
  if (issue.type === "missing_holiday_hours") {
    field = "holiday_hours";
    if (!Array.isArray(evidence.dates) || !evidence.dates.length || !evidence.dates.every((v) => date.safeParse(v).success)) {
      throw new DecisionError("The issue has no valid holiday dates to edit", 400);
    }
    allowedKeys = [...new Set(evidence.dates as string[])].sort();
  } else if (issue.type === "cross_platform_conflict") {
    if (evidence.field === "phone") field = "phone";
    else if (typeof evidence.field === "string" && /^opening_hours\.(mon|tue|wed|thu|fri|sat|sun)$/.test(evidence.field)) {
      field = "opening_hours";
      allowedKeys = [evidence.field.split(".")[1]];
    }
  } else if (issue.type === "stale_field") {
    if (["opening_hours", "holiday_hours", "description"].includes(String(evidence.field))) field = String(evidence.field);
    if (field === "opening_hours" || field === "holiday_hours") {
      allowedKeys = evidence.current_value && typeof evidence.current_value === "object"
        ? Object.keys(evidence.current_value).sort() : [];
    }
  } else if (issue.type === "review_signal") {
    field = evidence.signal_type === "closed_when_open" ? "opening_hours"
      : evidence.signal_type === "wrong_phone" ? "phone"
      : ["moved", "other"].includes(String(evidence.signal_type)) ? "description" : undefined;
  }
  if (!field || change.field !== field) throw new DecisionError("The edited field does not match the issue", 400);
  if (!allowedKeys && typeof change.value === "object") {
    allowedKeys = original.value && typeof original.value === "object" ? Object.keys(original.value).sort() : [];
  }
  if (allowedKeys && !isDeepStrictEqual(keys, allowedKeys)) {
    throw new DecisionError("Only the days or dates identified by this issue may be edited", 400);
  }
}

/** Shared decision handler for the owner route; lane A can reuse this orchestration.
 *  `auto`: applied under the owner's standing permission (A5, /api/suggest); only with "accepted",
 *  recorded as decision "auto" via "standing_permission". The same validation runs. */
export async function applyDecision(id: string, input: DecideRequest, opts: { auto?: boolean } = {}): Promise<DecideResponse> {
  const parsed = decisionRequestSchema.safeParse(input);
  if (!parsed.success) throw new DecisionError("Invalid decision request", 400);
  const request = parsed.data;
  if (opts.auto && request.decision !== "accepted") throw new DecisionError("Only an accepted suggestion can be applied automatically", 400);
  const recorded = opts.auto ? { decision: "auto" as const, via: "standing_permission" as const } : { decision: request.decision, via: request.via };
  const c = await collections();
  const suggestions = c.suggestions as Collection<ProcessingSuggestion>;
  const stored = await suggestions.findOne({ _id: id });
  if (!stored) throw new DecisionError("Suggestion not found", 404);
  const { _decision: previous, ...suggestion } = stored;
  if (suggestion.decision !== null) {
    throw new DecisionError("This suggestion is already decided or being processed. Reload the page.", 409);
  }
  if (previous && !isDeepStrictEqual(previous.request, request)) {
    throw new DecisionError("A previous decision needs to finish. Retry the same decision.", 409);
  }
  const [business, issue, listings] = await Promise.all([
    c.businesses.findOne({ _id: suggestion.business_id }),
    c.issues.findOne({ _id: suggestion.issue_id, business_id: suggestion.business_id }),
    c.listings.find({ business_id: suggestion.business_id }).toArray(),
  ]);
  if (!business || !issue) throw new DecisionError("Business or issue not found", 404);
  if (!previous && issue.status !== "open" && issue.status !== "suggested") throw new DecisionError("This issue is no longer open", 409);

  let change: TypedProposedChange | undefined;
  if (request.decision !== "ignored") {
    const result = changes.safeParse({
      field: suggestion.proposed_change.field,
      value: request.decision === "edited" ? request.edited_value : suggestion.proposed_change.value,
    });
    if (!result.success) throw new DecisionError("The change has invalid fields or values", 400);
    change = result.data;
    if (listings.length === 0) throw new DecisionError("No listings found for this business", 409);
    if (request.decision === "accepted") {
      const validation = validateSuggestion(suggestion, issue, listings);
      if (!validation.ok) throw new DecisionError("This suggestion needs correction before it can be accepted", 400);
    } else checkEditScope(issue, change, suggestion.proposed_change);
  }

  const now = new Date().toISOString();
  const at = previous?.at ?? now;
  const token = randomUUID();
  const progress: NonNullable<ProcessingSuggestion["_decision"]> = {
    ...previous, request, token, at,
    lease_until: new Date(Date.now() + 60_000).toISOString(),
  };
  // Claim or recover an expired lease. Checkpoints and final save enforce ownership.
  const claimed = await suggestions.updateOne(
    { _id: id, decision: { $eq: null, $exists: true }, $or: [
      { _decision: { $exists: false } },
      { "_decision.token": previous?.token ?? "", "_decision.lease_until": { $lte: now } },
    ] },
    { $set: { _decision: progress } },
  );
  if (!claimed.modifiedCount) throw new DecisionError("This suggestion is already being processed. Reload the page.", 409);

  const owned = { _id: id, "_decision.token": token };
  async function checkpoint(fields: Record<string, unknown>) {
    const result = await suggestions.updateOne(owned, { $set: fields });
    if (!result.matchedCount) throw new DecisionError("Decision processing moved to another request. Reload the page.", 409);
  }

  try {
    // Local writes are idempotent, so an interrupted attempt can safely resume.
    let applied: AppliedResult | null = null;
    if (change) {
      const fields: Record<string, string> = {};
      if (change.field === "opening_hours" || change.field === "holiday_hours") {
        for (const [key, value] of Object.entries(change.value)) fields[`${change.field}.${key}`] = value;
      } else fields[change.field] = change.value;
      if (change.field !== "phone") fields[`field_updated_at.${change.field}`] = at.slice(0, 10);
      await c.listings.updateMany({ business_id: business._id }, { $set: fields });
      if (progress.publication) applied = progress.publication;
      else if (progress.publishing) {
        // A crash or DB failure after sending a request leaves its outcome uncertain.
        // Finalize local work honestly; never automatically send the same write again.
        applied = { yext: false, published_to: [], at,
          error: "Previous Yext publication outcome is unconfirmed; saved locally. Check Yext before publishing again." };
      } else {
        await checkpoint({ "_decision.publishing": true });
        applied = { ...await publishChange(business, change), at };
      }
      await checkpoint({ "_decision.publication": applied });
    }
    // The original proposal is still stored until the final save below. A stable timestamp
    // and $addToSet make learning and permission writes safe to replay after a failure.
    const learned: LearnedDecision = {
      issue_type: issue.type, field: suggestion.proposed_change.field,
      proposed: suggestion.proposed_change.value, final: change?.value ?? null,
      decision: recorded.decision, at,
    };
    const additions: NonNullable<UpdateFilter<Preferences>["$addToSet"]> = {
      learned,
      ...(request.decision === "ignored" ? { ignored_fingerprints: issue.fingerprint } : {}),
      ...(request.standing_permission && change ? { standing_permissions: { issue_type: issue.type, field: change.field } } : {}),
    };
    await c.preferences.updateOne({ _id: business._id }, {
      $setOnInsert: { business_id: business._id, notes: [],
        ...(request.decision !== "ignored" ? { ignored_fingerprints: [] } : {}) },
      $addToSet: additions,
    }, { upsert: true });
    await c.issues.updateOne({ _id: issue._id }, { $set: { status: request.decision === "ignored" ? "ignored" : "resolved" } });
    const updated: Suggestion = { ...stored, decision: recorded.decision, decided_via: recorded.via, decided_at: at, applied,
      ...(change ? { proposed_change: change } : {}) };
    delete (updated as ProcessingSuggestion)._decision;
    const finished = await suggestions.updateOne(owned, { $set: {
      decision: updated.decision, decided_via: updated.decided_via, decided_at: at, applied,
      proposed_change: updated.proposed_change,
    }, $unset: { _decision: "" } });
    if (!finished.matchedCount) throw new DecisionError("Decision processing moved to another request. Reload the page.", 409);
    return { ok: true, suggestion: updated, synced_sources: request.decision === "ignored" ? [] : listings.map((listing) => listing.source) };
  } catch (error) {
    // Release immediately on handled failures; process crashes recover after lease expiry.
    await suggestions.updateOne(owned, { $set: { "_decision.lease_until": new Date().toISOString() } }).catch(() => {});
    throw error;
  }
}
