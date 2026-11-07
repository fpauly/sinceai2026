import { connection } from "next/server";
import { MAX_AUDIO_BYTES, transcribe, voiceAvailable } from "@/lib/voice/stt";
import type { ApiError } from "@/types/api";

// GET /api/voice/transcribe — { available }: the voice button shows only when this is true.
export async function GET() {
  await connection(); // read the key at request time, never at build time
  return Response.json({ available: voiceAvailable() }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/voice/transcribe — multipart form with one `audio` file → { ok: true, text }.
// Transcription only: the text then goes through /api/suggestions/[id]/reply like a typed reply,
// and nothing is saved until the owner confirms with a tap.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (error: string, status: number) => Response.json({ ok: false, error } satisfies ApiError, { status, headers });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return fail("Expected a recording", 400); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return fail("Expected a recording", 400);
  if (audio.type && !audio.type.startsWith("audio/") && audio.type !== "video/webm") return fail("Expected an audio recording", 400);
  if (audio.size > MAX_AUDIO_BYTES) return fail("The recording is too long. Please keep it short.", 413);

  const result = await transcribe(audio);
  if (!result.ok) return fail(result.error, 502);
  return Response.json({ ok: true, text: result.text }, { headers });
}
