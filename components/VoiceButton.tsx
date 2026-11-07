"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Tap to talk, tap again to stop (stops by itself after 15 s). Sends the recording to
// /api/voice/transcribe and hands the text back. It never decides anything by itself:
// the caller reads the text like a typed reply, and the owner confirms with a tap.

const MAX_MS = 15000;
type State = "idle" | "recording" | "reading";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
}

export default function VoiceButton({ onTranscriptAction, disabled = false }: {
  onTranscriptAction: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  // Recording needs a browser with a microphone API; the server render shows nothing.
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
    () => false,
  );
  // Shown only when the server can transcribe (no key on this site: no button at all).
  const [available, setAvailable] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/voice/transcribe", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then((body: { available?: boolean }) => { if (live) setAvailable(body.available === true); })
      .catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); recorder.current?.stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function send(blob: Blob) {
    setState("reading");
    try {
      const form = new FormData();
      form.append("audio", blob, "reply");
      const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const result = (await response.json()) as { ok: boolean; text?: string; error?: string };
      if (!response.ok || !result.ok || !result.text) throw new Error(result.error ?? "We couldn't understand the recording.");
      onTranscriptAction(result.text);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn't understand the recording. Please type your reply.");
    } finally {
      setState("idle");
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        void send(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
      timer.current = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, MAX_MS);
    } catch {
      setError("Microphone access was blocked. Please allow it, or type your reply.");
      setState("idle");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (!supported || !available) return null;
  const label = state === "recording" ? "Stop and send" : state === "reading" ? "Listening…" : "Reply by voice";
  return <div className="mt-2">
    <button type="button" disabled={disabled || state === "reading"} aria-pressed={state === "recording"}
      onClick={() => { if (state === "recording") stop(); else void start(); }}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-50 ${state === "recording" ? "bg-red-700 text-white" : "border border-zinc-300 bg-white text-zinc-900"}`}>
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${state === "recording" ? "animate-pulse bg-white" : "bg-red-600"}`} />
      {label}
    </button>
    {state === "recording" && <p role="status" className="mt-1 text-xs text-zinc-600">Recording… say for example “yes”, “no thanks” or “open 8 to 12”. Tap again to stop.</p>}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}
