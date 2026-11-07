import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { fonectaDemo } from "@/data/fonecta";
import type { Issue, Preferences, Suggestion } from "@/types";

// A private copy of one demo business for each visitor (the QR code in the video opens /try).
// Each visitor answers their own copy, so many people can try it at once and every scan starts
// fresh. Copies have ids starting with "try-", are hidden from the dashboard and the daily check,
// keep the template's Yext link (only Kahvila Aurora has one, so Aurora copies publish to the real
// Yext sandbox for step 5, #105), and are deleted by MongoDB 6 hours after creation (TTL on expires_at).

export const COPY_PREFIX = "try-";
export const isDemoCopy = (businessId: string) => businessId.startsWith(COPY_PREFIX);
export const DEFAULT_TEMPLATE = "FI-D0010"; // Pub Kulma (WhatsApp, voice replies): the QR code in the video
/** Any business of Fonecta's demo cast can be copied (#107); never a copy. */
export const isDemoTemplate = (id: string) => !isDemoCopy(id) && fonectaDemo.businesses.some((b) => b._id === id);
const LIFETIME_MS = 6 * 60 * 60 * 1000;
const COLLECTIONS = ["businesses", "profiles", "holiday_history", "issues", "suggestions", "preferences"] as const;

let ttlReady: Promise<unknown> | null = null;
function ensureTtl() {
  ttlReady ??= getDb().then((db) => Promise.all(COLLECTIONS.map((name) => db.collection(name).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }))));
  return ttlReady;
}

/** copied: false means there is nothing to change (no suggestion waiting), so the original page opens. */
export type DemoCopy = { ok: true; businessId: string; copied: boolean } | { ok: false; error: string };

/** Copies a template business with its waiting suggestions, reset to their original proposals. */
export async function createDemoCopy(templateId: string): Promise<DemoCopy> {
  const business = fonectaDemo.businesses.find((b) => b._id === templateId);
  const profile = fonectaDemo.profiles.find((p) => p.business_id === templateId);
  if (!business || !profile) return { ok: false, error: "This demo business is not available." };

  const db = await getDb();
  await ensureTtl();
  const allIssues = await db.collection<Issue>("issues").find({ business_id: templateId, type: "special_day_hours" }).toArray();
  const allSuggestions = await db.collection<Suggestion>("suggestions").find({ business_id: templateId, issue_id: { $in: allIssues.map((i) => i._id) } }).toArray();
  if (allIssues.length > 0 && allSuggestions.length === 0) return { ok: false, error: "The demo is being prepared. Please try again in a minute." };
  // changes applied by standing permission stay as they are; only suggestions an owner answers are copied
  const suggestions = allSuggestions.filter((s) => s.decision !== "auto");
  const issues = allIssues.filter((i) => suggestions.some((s) => s.issue_id === i._id));
  // nothing waiting by design (already right, closed for good, or all applied automatically): nothing to protect
  if (suggestions.length === 0) return { ok: true, businessId: templateId, copied: false };

  const templatePrefs = await db.collection<Preferences>("preferences").findOne({ business_id: templateId });

  const id = `${COPY_PREFIX}${randomBytes(5).toString("hex")}`;
  const expires_at = new Date(Date.now() + LIFETIME_MS);
  const issueIds = new Map(issues.map((issue) => [issue._id, randomUUID()]));
  const swap = (text: string) => text.split(templateId).join(id);

  const copies = {
    // the copy owns its preferences from the start, so decisions in the copy also expire
    preferences: [{
      _id: id, business_id: id, ignored_fingerprints: [], notes: [], ...(templatePrefs ? { learned: templatePrefs.learned ?? [], standing_permissions: templatePrefs.standing_permissions ?? [] } : {}), expires_at,
    }],
    businesses: [{ ...business, _id: id, yext_entity_id: business.yext_entity_id ?? null, demo_copy_of: templateId, expires_at }],
    profiles: [{ ...profile, _id: id, business_id: id, expires_at }],
    holiday_history: fonectaDemo.holiday_history
      .filter((h) => h.business_id === templateId)
      .map((h) => ({ ...h, _id: swap(h._id), business_id: id, expires_at })),
    issues: issues.map((issue) => ({
      ...issue, _id: issueIds.get(issue._id)!, business_id: id, fingerprint: swap(issue.fingerprint), status: "suggested", expires_at,
    })),
    suggestions: suggestions.filter((s) => issueIds.has(s.issue_id)).map((s) => {
      const issue = issues.find((i) => i._id === s.issue_id)!;
      const ev = issue.evidence as { date?: string; proposed_hours?: string };
      // the original proposal, even if a visitor edited the template before
      const proposed_change = ev.date && ev.proposed_hours ? { field: "holiday_hours", value: { [ev.date]: ev.proposed_hours } } : s.proposed_change;
      const rest: Record<string, unknown> = { ...s };
      delete rest._decision;
      return {
        ...rest, _id: randomUUID(), issue_id: issueIds.get(s.issue_id)!, business_id: id, proposed_change,
        decision: null, decided_via: null, decided_at: null, applied: null, expires_at,
      };
    }),
  };
  // businesses last: the copy only becomes visible once everything it needs exists
  for (const name of ["preferences", "profiles", "holiday_history", "issues", "suggestions", "businesses"] as const) {
    const docs = copies[name] as Record<string, unknown>[];
    if (docs.length) await db.collection(name).insertMany(docs as never[]);
  }
  return { ok: true, businessId: id, copied: true };
}
