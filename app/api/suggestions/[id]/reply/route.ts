import { z } from "zod";
import { collections } from "@/lib/db";
import { parseIntent } from "@/lib/ai/intent";
import type { ApiError, IntentResult } from "@/types/api";

const reply = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

// Parse only: text and future voice transcripts share this route. A separate confirmation
// POST to /decide is always required; parsing never applies, learns or claims a decision.
export async function POST(request: Request, ctx: RouteContext<"/api/suggestions/[id]/reply">) {
  const headers = { "Cache-Control": "no-store" };
  const error = (message: string, status: number) => Response.json({ ok: false, error: message } satisfies ApiError, { status, headers });
  let body: unknown;
  try { body = await request.json(); }
  catch { return error("Expected a JSON reply", 400); }
  const parsed = reply.safeParse(body);
  if (!parsed.success) return error("Enter a reply of 1–2000 characters", 400);
  try {
    const { id } = await ctx.params;
    const c = await collections();
    const suggestion = await c.suggestions.findOne({ _id: id });
    if (!suggestion) return error("Suggestion not found", 404);
    if (suggestion.decision !== null || "_decision" in suggestion) return error("This suggestion is already decided or has an unfinished save. Open the owner view to check it.", 409);
    const [business, issue, profile, listing] = await Promise.all([
      c.businesses.findOne({ _id: suggestion.business_id }),
      c.issues.findOne({ _id: suggestion.issue_id, business_id: suggestion.business_id }),
      c.profiles.findOne({ business_id: suggestion.business_id }),
      c.listings.findOne({ business_id: suggestion.business_id, source: "website" }),
    ]);
    if (!business || !issue) return error("Business or issue not found", 404);
    if (business.contact?.opted_out || issue.type === "needs_human" || !["open", "suggested"].includes(issue.status)) return error("This suggestion is not available for a text reply", 409);
    const intent: IntentResult = await parseIntent(suggestion, parsed.data.text, profile?.regular_hours ?? listing?.opening_hours);
    return Response.json(intent, { headers });
  } catch {
    return error("Could not understand the reply. Please use the owner view.", 500);
  }
}
