import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { fonectaDemo } from "@/data/fonecta";
import type { Issue, Preferences, Suggestion } from "@/types";

// A private copy of one demo business for each visitor (the QR code in the video opens /try).
// Each visitor answers their own copy, so many people can try it at once and every scan starts
// fresh. Copies have ids starting with "try-", are hidden from the dashboard and the daily check,
// never link to Yext, and are deleted by MongoDB 6 hours after creation (TTL index on expires_at).

export const COPY_PREFIX = "try-";
export const isDemoCopy = (businessId: string) => businessId.startsWith(COPY_PREFIX);
export const TRY_TEMPLATES = ["FI-D0010", "FI-D0001"] as const; // Pub Kulma (WhatsApp), Kahvila Aurora (SMS)
const LIFETIME_MS = 6 * 60 * 60 * 1000;
const COLLECTIONS = ["businesses", "profiles", "holiday_history", "issues", "suggestions", "preferences"] as const;

let ttlReady: Promise<unknown> | null = null;
function ensureTtl() {
  ttlReady ??= getDb().then((db) => Promise.all(COLLECTIONS.map((name) => db.collection(name).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }))));
  return ttlReady;
}

export type DemoCopy = { ok: true; businessId: string } | { ok: false; error: string };

/** Copies a template business with its waiting suggestions, reset to their original proposals. */
export async function createDemoCopy(templateId: (typeof TRY_TEMPLATES)[number]): Promise<DemoCopy> {
  const business = fonectaDemo.businesses.find((b) => b._id === templateId);
  const profile = fonectaDemo.profiles.find((p) => p.business_id === templateId);
  if (!business || !profile) return { ok: false, error: "This demo business is not available." };

  const db = await getDb();
  await ensureTtl();
  const issues = await db.collection<Issue>("issues").find({ business_id: templateId, type: "special_day_hours" }).toArray();
  if (issues.length === 0) return { ok: false, error: "The demo is being prepared. Please try again in a minute." };
  const suggestions = await db.collection<Suggestion>("suggestions").find({ business_id: templateId, issue_id: { $in: issues.map((i) => i._id) } }).toArray();
  if (suggestions.length === 0) return { ok: false, error: "The demo is being prepared. Please try again in a minute." };

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
    businesses: [{ ...business, _id: id, yext_entity_id: null, demo_copy_of: templateId, expires_at }],
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
  return { ok: true, businessId: id };
}
