import { applyDecision, DecisionError, decisionRequestSchema } from "@/lib/apply";
import type { ApiError } from "@/types/api";

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
