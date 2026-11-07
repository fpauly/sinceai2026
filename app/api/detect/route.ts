import { runDetection } from "@/lib/rules";
import type { ApiError, DetectResponse } from "@/types/api";

// POST /api/detect[?businessId=] — step 1 (Detect).
// Runs every rule against DEMO_DATE, stores the new issues and returns them. Running it again
// creates nothing for issues that are already open, suggested or ignored.
export async function POST(req: Request) {
  try {
    const businessId = new URL(req.url).searchParams.get("businessId") ?? undefined;
    const created = await runDetection(businessId);
    return Response.json({ ok: true, created } satisfies DetectResponse);
  } catch (err) {
    console.error("[detect] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Detection failed" } satisfies ApiError,
      { status: 500 },
    );
  }
}
