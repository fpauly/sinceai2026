import "server-only";

// Speech to text for voice replies (DESIGN 10, B8). The only place that calls ElevenLabs STT.
// Never throws: on any problem it returns { ok: false, error }, and the owner can still type or tap.
// The transcript is then read by the same code as a typed reply (/api/suggestions/[id]/reply).

const TIMEOUT_MS = 20000;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // about a minute of compressed speech

export type Transcript = { ok: true; text: string } | { ok: false; error: string };

export async function transcribe(audio: Blob): Promise<Transcript> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, error: "Voice replies are not configured here. Please type your reply." };
  if (audio.size === 0) return { ok: false, error: "No sound was recorded. Please try again." };
  if (audio.size > MAX_AUDIO_BYTES) return { ok: false, error: "The recording is too long. Please keep it short." };

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", audio, "reply");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Speech recognition failed (${res.status}). Please type your reply.` };
    const body = (await res.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    return text ? { ok: true, text } : { ok: false, error: "We couldn't hear any words. Please try again." };
  } catch {
    return { ok: false, error: "Speech recognition didn't answer in time. Please type your reply." };
  }
}
