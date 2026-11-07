import { applyDecision, DecisionError, decisionRequestSchema } from "@/lib/apply";
import type { ApiError } from "@/types/api";
import { connection } from "next/server";
import { collections } from "@/lib/db";

// Return only the submitted choice, never private lease tokens or processing state.
export async function GET(_request: Request, ctx: RouteContext<"/api/suggestions/[id]/decide">) {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const { id } = await ctx.params;
    const c = await collections();
    const suggestion = await c.suggestions.findOne({ _id: id });
    if (!suggestion) return Response.json({ ok: false, error: "Suggestion not found" } satisfies ApiError, { status: 404, headers });
    const pending = (suggestion as typeof suggestion & { _decision?: { request?: unknown } })._decision;
    if (suggestion.decision !== null || !pending) return new Response(null, { status: 204, headers });
    const parsed = decisionRequestSchema.safeParse(pending.request);
    if (!parsed.success) throw new Error("Invalid saved decision");
    return Response.json(parsed.data, { headers });
  } catch {
    return Response.json({ ok: false, error: "Could not check your previous decision. Please try again." } satisfies ApiError, { status: 500, headers });
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/suggestions/[id]/decide">) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Expected a JSON decision" } satisfies ApiError, { status: 400 }); }
  const parsed = decisionRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid decision request" } satisfies ApiError, { status: 400 });
  try {
    const { id } = await ctx.params;
    return Response.json(await applyDecision(id, parsed.data));
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof DecisionError ? error.message : "Could not complete the decision. Reload to check its status before retrying." } satisfies ApiError,
      { status: error instanceof DecisionError ? error.status : 500 });
  }
}
