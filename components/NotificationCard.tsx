"use client";

import { useEffect, useRef, useState } from "react";
import { displayedHours, isValidHours, normalizeHours, showHours } from "@/lib/hours";
import { OwnerMessage } from "@/app/owner/contact-details";
import type { IssueType, Language, Listing, Profile } from "@/types";
import type { ApiError, DecideRequest, DecideResponse, SuggestionWithIssue } from "@/types/api";

const titles: Record<IssueType, string> = {
  missing_holiday_hours: "Set your holiday hours",
  cross_platform_conflict: "Match your opening hours",
  stale_field: "Check your business information",
  review_signal: "A customer noticed a change",
  special_day_hours: "Check your hours for a special day",
  needs_human: "Please check your business details",
};
const confidenceStyles = {
  high: "bg-emerald-50 text-emerald-800",
  medium: "bg-sky-50 text-sky-800",
  low: "bg-amber-50 text-amber-900",
};
const labels: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday", finder: "Finder", google: "Google", website: "Website" };

function label(key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
  }
  return labels[key] ?? key.replaceAll("_", " ");
}

function display(value: unknown): string {
  if (value === undefined || value === null) return "Not set";
  if (value === "closed") return "Closed";
  if (typeof value === "string") return value.trim() ? showHours(value, "Closed") : value;
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${label(key)}: ${display(item)}`).join(" · ");
  return String(value);
}

/** Reusable final confirmation, including for a future voice-parsed edit. */
export function EditConfirmation({ proposedValue, finalValue, standingPermission, busy, onConfirmAction, onBackAction }: {
  proposedValue: unknown; finalValue: unknown; standingPermission: boolean; busy: boolean;
  onConfirmAction: () => void; onBackAction: () => void;
}) {
  return (
    <section aria-label="Confirm your changes" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <h3 className="font-semibold">Confirm your changes</h3>
      <dl className="mt-3 space-y-3 break-words text-sm leading-6">
        <div><dt className="text-xs text-zinc-500">Original suggestion</dt><dd>{display(proposedValue)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Your final choice</dt><dd className="font-medium text-emerald-900">{display(finalValue)}</dd></div>
      </dl>
      {standingPermission && <p className="mt-3 text-xs leading-5 text-emerald-900">You are also giving permission to apply this type of change automatically next time.</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-600">Nothing is saved until you confirm.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onBackAction} className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50">Back to editing</button>
        <button type="button" disabled={busy} onClick={onConfirmAction} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50">Confirm and save</button>
      </div>
    </section>
  );
}

export default function NotificationCard({ suggestion, listings, profile, language = "en", onDecidedAction }: {
  suggestion: SuggestionWithIssue;
  listings: Listing[];
  profile?: Profile | null;
  language?: Language;
  onDecidedAction: (result: DecideResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standingPermission, setStandingPermission] = useState(false);
  const [editMode, setEditMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [multiplePeriods, setMultiplePeriods] = useState<Record<string, boolean>>({});
  const [pendingRequest, setPendingRequest] = useState<DecideRequest | null>(null);
  const [checkingPending, setCheckingPending] = useState(true);
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const previousHours = useRef<Record<string, string>>({});
  const submitting = useRef(false);
  const { proposed_change: change } = suggestion;
  const rows: [string, unknown][] = typeof change.value === "object" && change.value !== null
    ? Object.entries(change.value) : [[change.field, change.value]];

  useEffect(() => {
    const controller = new AbortController();
    async function recover() {
      try {
        const response = await fetch(`/api/suggestions/${encodeURIComponent(suggestion._id)}/decide`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Recovery check failed");
        const request: DecideRequest | null = response.status === 204 ? null : await response.json();
        if (!controller.signal.aborted) { setPendingRequest(request); setRecoveryError(false); }
      } catch {
        if (!controller.signal.aborted) setRecoveryError(true);
      } finally {
        if (!controller.signal.aborted) setCheckingPending(false);
      }
    }
    void recover();
    return () => controller.abort();
  }, [suggestion._id, recoveryAttempt]);

  function current(listing: Listing, key: string): unknown {
    if (change.field === "holiday_hours") return listing.holiday_hours[key];
    if (change.field === "opening_hours") return Object.entries(listing.opening_hours).find(([day]) => day === key)?.[1];
    if (change.field === "phone") return listing.phone;
    if (change.field === "description") return listing.description;
    return undefined;
  }

  const hoursField = change.field === "opening_hours" || change.field === "holiday_hours";
  const finalValue = hoursField ? draft : draft[change.field] ?? "";
  const recoveryBlocked = checkingPending || recoveryError || pendingRequest !== null;

  function startEdit() {
    setMultiplePeriods(Object.fromEntries(rows.map(([key, value]) => [key, typeof value === "string" && value.includes(",")])));
    setDraft(Object.fromEntries(rows.map(([key, value]) => [key, typeof value === "string" ? value : ""])));
    previousHours.current = Object.fromEntries(rows.filter(([, value]) => typeof value === "string" && value !== "closed")) as Record<string, string>;
    setError(null);
    setEditMode("edit");
  }

  function toggleClosed(key: string, closed: boolean) {
    if (closed) previousHours.current[key] = draft[key] ?? "";
    setDraft((current) => ({ ...current, [key]: closed ? "closed" : previousHours.current[key] ?? "" }));
  }

  function reviewEdit() {
    if (hoursField) {
      if (!Object.keys(draft).length || !Object.values(draft).every((value) => value.trim().length > 0 && isValidHours(value))) {
        setError("Enter valid hours without overlapping periods, or mark the day closed. Closing can be after midnight.");
        return;
      }
      setDraft(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, normalizeHours(value)])));
    } else if (!String(finalValue).trim()) {
      setError("Please enter a value before continuing.");
      return;
    }
    setError(null);
    setEditMode("confirm");
  }

  async function decide(decision: DecideRequest["decision"]) {
    await sendDecision({ decision, via: "tap",
      ...(decision === "edited" ? { edited_value: finalValue } : {}),
      standing_permission: decision !== "ignored" && standingPermission,
    });
  }

  async function sendDecision(request: DecideRequest) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/suggestions/${encodeURIComponent(suggestion._id)}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const result: DecideResponse | ApiError = await response.json();
      if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error : "Could not save your decision");
      onDecidedAction(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your decision. Please reload to check its status.");
      setCheckingPending(true);
      setRecoveryAttempt((value) => value + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${confidenceStyles[suggestion.confidence]}`}>
        {suggestion.confidence === "low" ? "Low confidence · please check" : `${suggestion.confidence === "high" ? "High" : "Medium"} confidence`}
      </span>
      <h2 className="mt-3 text-xl font-semibold tracking-tight">{titles[suggestion.issue.type]}</h2>
      <OwnerMessage message={suggestion.message} language={language} />
      <div className="mt-4 rounded-xl bg-zinc-50 p-3">
        <h3 className="text-sm font-semibold">Why this change?</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-600">{suggestion.reason}</p>
        <details className="mt-2 text-xs text-zinc-600">
          <summary className="cursor-pointer py-1 font-medium">See the data behind this</summary>
          <dl className="mt-2 space-y-2 break-words">
            {Object.entries(suggestion.issue.evidence).map(([key, value]) => (
              <div key={key}><dt className="font-semibold capitalize">{label(key)}</dt><dd className="mt-1 leading-5">{Array.isArray(value) ? value.map(display).join(" · ") : display(value)}</dd></div>
            ))}
          </dl>
        </details>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(([key, value]) => (
          <div key={key} className="border-b border-zinc-100 pb-3 text-sm last:border-0">
            <h3 className="mb-2 font-medium">{label(key)}</h3>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              <div className="min-w-0 break-words"><p className="mb-1 text-xs text-zinc-500">Before</p>
                {profile && <p className="text-xs leading-5 text-zinc-600">Published hours: {display(change.field === "holiday_hours" ? displayedHours(profile, key).hours : Object.entries(profile.regular_hours).find(([day]) => day === key)?.[1])}</p>}
                {listings.map((listing) => <p key={listing._id} className="text-xs leading-5 text-zinc-600">{label(listing.source)}: {display(current(listing, key))}</p>)}
              </div>
              <span aria-hidden="true" className="pt-5 text-zinc-400">→</span>
              <div className="min-w-0 break-words"><p className="mb-1 text-xs text-zinc-500">Proposed</p><p className="font-medium text-emerald-800">{display(value)}</p></div>
            </div>
          </div>
        ))}
      </div>
      {checkingPending && <p role="status" className="mt-4 text-sm">Checking for an unfinished decision…</p>}
      {recoveryError && !checkingPending && <div className="mt-4 text-sm"><p role="alert">Could not check your previous decision. Please retry before making changes.</p><button type="button" onClick={() => { setCheckingPending(true); setRecoveryAttempt((n) => n + 1); }} className="mt-2 min-h-11 rounded-lg border border-zinc-300 px-3">Retry check</button></div>}
      {pendingRequest && !checkingPending && !recoveryError && <section aria-label="Unfinished decision" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6">
        <h3 className="font-semibold">Finish saving your previous decision</h3>
        <p className="mt-2">Your previous {pendingRequest.decision === "edited" ? "edit" : pendingRequest.decision === "ignored" ? "ignore decision" : "acceptance"} may already be partly saved. Continue with the same confirmed choice.</p>
        {pendingRequest.decision !== "ignored" && <p className="mt-2 break-words font-medium">{display(pendingRequest.decision === "edited" ? pendingRequest.edited_value : change.value)}</p>}
        {pendingRequest.standing_permission && <p className="mt-2">Your original choice included automatic permission for this type of change.</p>}
        <button type="button" disabled={busy} onClick={() => { void sendDecision(pendingRequest); }} className="mt-3 min-h-11 rounded-lg bg-emerald-700 px-3 font-medium text-white disabled:opacity-50">Finish saving</button>
        <p className="mt-2 text-xs">If another request is still running, wait a minute and try again.</p>
      </section>}
      {!recoveryBlocked && editMode === "edit" && <form onSubmit={(event) => { event.preventDefault(); reviewEdit(); }} className="mt-4 space-y-4 rounded-xl border border-zinc-200 p-3">
        <h3 className="font-semibold">Edit your details</h3>
        {rows.map(([key]) => hoursField ? (
          <fieldset key={key} disabled={busy} className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">{label(key)}</legend>
            <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={draft[key] === "closed"} onChange={(event) => toggleClosed(key, event.target.checked)} className="size-4 accent-emerald-700" />Closed</label>
            {draft[key] !== "closed" && <>
              <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!multiplePeriods[key]} onChange={(event) => setMultiplePeriods((current) => ({ ...current, [key]: event.target.checked }))} disabled={draft[key]?.includes(",")} className="size-4 accent-emerald-700" />Multiple opening periods</label>
              {multiplePeriods[key] ? <label className="block text-xs text-zinc-600">Opening periods
                <input type="text" required value={draft[key] ?? ""} placeholder="10:00-14:00,17:00-22:00" onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900" />
                <span className="mt-1 block leading-5">Separate periods with a comma, for example 10:00-14:00,17:00-22:00. Remove extra periods before switching to single-period editing.</span>
              </label> : <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0 text-xs text-zinc-600">Opens<input type="time" required value={draft[key]?.split("-")[0] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: `${event.target.value}-${current[key]?.split("-")[1] ?? ""}` }))} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900" /></label>
              <label className="min-w-0 text-xs text-zinc-600">Closes<input type="time" required value={draft[key]?.split("-")[1] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: `${current[key]?.split("-")[0] ?? ""}-${event.target.value}` }))} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900" /></label>
              </div>}
              <p className="text-xs leading-5 text-zinc-500">Closing can be after midnight. For 24-hour opening, use 00:00–23:59.</p>
            </>}
          </fieldset>
        ) : (
          <label key={key} className="block text-sm font-medium">{label(key)}
            {change.field === "description" ? <textarea required rows={4} value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 block w-full rounded-lg border border-zinc-300 p-2 font-normal" />
              : <input type="tel" required value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 p-2 font-normal" />}
          </label>
        ))}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setEditMode("view"); setError(null); }} className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white">Review changes</button></div>
      </form>}
      {!recoveryBlocked && editMode === "confirm" && <EditConfirmation proposedValue={change.value} finalValue={finalValue} standingPermission={standingPermission} busy={busy} onConfirmAction={() => { void decide("edited"); }} onBackAction={() => { setEditMode("edit"); setError(null); }} />}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-5 text-zinc-600">
        <input type="checkbox" checked={pendingRequest ? !!pendingRequest.standing_permission : standingPermission} disabled={busy || recoveryBlocked || editMode === "confirm"} onChange={(event) => setStandingPermission(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-emerald-700" />
        Do this automatically next time
      </label>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Permission applies to this type of change when you accept or confirm an edit. Ignoring never grants permission.</p>
      {!recoveryBlocked && editMode === "view" && <div className="mt-4 grid grid-cols-3 gap-2">
        {([ ["accepted", "✓ Accept"], ["edited", "✎ Edit"], ["ignored", "× Ignore"] ] as const).map(([decision, text]) => (
          <button key={decision} type="button" disabled={busy} onClick={() => { if (decision === "edited") startEdit(); else void decide(decision); }}
            className={`min-h-11 rounded-xl px-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${decision === "accepted" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
            {text}
          </button>
        ))}
      </div>}
      {busy && <p role="status" className="mt-2 text-xs text-zinc-600">Saving your decision…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </article>
  );
}
