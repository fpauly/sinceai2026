"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { EditConfirmation } from "@/components/NotificationCard";
import type { ApiError, DecideRequest, DecideResponse, IntentResult, SuggestionWithIssue } from "@/types/api";

export default function ReplyBox({ suggestion, onDecidedAction }: {
  suggestion: SuggestionWithIssue;
  onDecidedAction: (result: DecideResponse, receivedAt: number) => void;
}) {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertainSave, setUncertainSave] = useState(false);
  const submitting = useRef(false);
  const ownerUrl = `/owner/${encodeURIComponent(suggestion.business_id)}`;

  async function interpret() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null); setIntent(null);
    try {
      const response = await fetch(`/api/suggestions/${encodeURIComponent(suggestion._id)}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      const result: IntentResult | ApiError = await response.json();
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Could not read the reply");
      setIntent(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not read the reply. Please use Edit.");
    } finally { submitting.current = false; setBusy(false); }
  }

  async function confirm() {
    if (submitting.current || uncertainSave || !intent || intent.intent === "unclear") return;
    submitting.current = true;
    setBusy(true); setError(null);
    const request: DecideRequest = {
      decision: intent.intent === "accept" ? "accepted" : intent.intent === "ignore" ? "ignored" : "edited",
      via: "tap", ...(intent.intent === "edit" ? { edited_value: intent.edited_value } : {}),
    };
    try {
      const response = await fetch(`/api/suggestions/${encodeURIComponent(suggestion._id)}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
      });
      const result: DecideResponse | ApiError = await response.json();
      if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error : "Could not save the decision");
      onDecidedAction(result, Date.now());
    } catch {
      setUncertainSave(true);
      setError("We could not confirm the save status. Open the owner view to check or finish your previous decision before trying again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className="mt-4 rounded-xl border border-zinc-200 p-3">
    {!uncertainSave && !intent && <form onSubmit={(event) => { event.preventDefault(); void interpret(); }}>
      <label className="block text-sm font-medium">Reply to this suggestion
        <textarea required maxLength={2000} rows={2} disabled={busy} value={text} onChange={(event) => setText(event.target.value)} placeholder="Yes, no thanks, or your preferred hours" className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-normal disabled:opacity-50" />
      </label>
      <button disabled={busy || !text.trim()} type="submit" className="mt-2 min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Reading reply…" : "Review reply"}</button>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Reply applies only to the suggestion above. Nothing is saved until you confirm.</p>
    </form>}
    {!uncertainSave && intent && <>
      <p className="break-words text-sm"><span className="font-medium">Your reply:</span> {text}</p>
      {intent.intent === "unclear" ? <><p role="status" className="mt-2 text-sm">We couldn’t confidently understand that reply. Use Edit to choose your hours.</p><button disabled={busy} type="button" onClick={() => setIntent(null)} className="mt-2 min-h-11 rounded-lg border border-zinc-300 px-3 text-sm">Try another reply</button></>
        : intent.intent === "ignore" ? <section aria-label="Confirm decline" className="mt-3 text-sm">
          <p>Decline this suggestion? Your published hours will stay unchanged.</p>
          <div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} type="button" onClick={() => setIntent(null)} className="min-h-11 rounded-lg border border-zinc-300 px-3">Back</button><button disabled={busy} type="button" onClick={() => { void confirm(); }} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-white disabled:opacity-50">Confirm decline</button></div>
        </section>
        : <EditConfirmation proposedValue={suggestion.proposed_change.value} finalValue={intent.intent === "edit" ? intent.edited_value : suggestion.proposed_change.value} standingPermission={false} busy={busy} onConfirmAction={() => { void confirm(); }} onBackAction={() => setIntent(null)} />}
    </>}
    {error && <p role="alert" className="mt-2 break-words text-sm text-red-700">{error}</p>}
    <Link href={ownerUrl} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-emerald-800 underline">{uncertainSave ? "Check previous decision in owner view →" : "Edit in owner view →"}</Link>
  </div>;
}
