"use client";

import { useState } from "react";
import type { IssueType, Listing } from "@/types";
import type { SuggestionWithIssue } from "@/types/api";

const titles: Record<IssueType, string> = {
  missing_holiday_hours: "Set your holiday hours",
  cross_platform_conflict: "Match your opening hours",
  stale_field: "Check your business information",
  review_signal: "A customer noticed a change",
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
  if (typeof value === "string") return value.replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/, "$1–$2");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${label(key)}: ${display(item)}`).join(" · ");
  return String(value);
}

export default function NotificationCard({ suggestion, listings }: { suggestion: SuggestionWithIssue; listings: Listing[] }) {
  const [standingPermission, setStandingPermission] = useState(false);
  const { proposed_change: change } = suggestion;
  const rows: [string, unknown][] = typeof change.value === "object" && change.value !== null
    ? Object.entries(change.value) : [[change.field, change.value]];

  function current(listing: Listing, key: string): unknown {
    if (change.field === "holiday_hours") return listing.holiday_hours[key];
    if (change.field === "opening_hours") return Object.entries(listing.opening_hours).find(([day]) => day === key)?.[1];
    if (change.field === "phone") return listing.phone;
    if (change.field === "description") return listing.description;
    return undefined;
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${confidenceStyles[suggestion.confidence]}`}>
        {suggestion.confidence === "low" ? "Low confidence · please check" : `${suggestion.confidence === "high" ? "High" : "Medium"} confidence`}
      </span>
      <h2 className="mt-3 text-xl font-semibold tracking-tight">{titles[suggestion.issue.type]}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-700">{suggestion.message.en}</p>
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
                {listings.map((listing) => <p key={listing._id} className="text-xs leading-5 text-zinc-600">{label(listing.source)}: {display(current(listing, key))}</p>)}
              </div>
              <span aria-hidden="true" className="pt-5 text-zinc-400">→</span>
              <div className="min-w-0 break-words"><p className="mb-1 text-xs text-zinc-500">Proposed</p><p className="font-medium text-emerald-800">{display(value)}</p></div>
            </div>
          </div>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-5 text-zinc-600">
        <input type="checkbox" checked={standingPermission} onChange={(event) => setStandingPermission(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-emerald-700" />
        Do this automatically next time
      </label>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {([ ["accepted", "✓ Accept"], ["edited", "✎ Edit"], ["ignored", "× Ignore"] ] as const).map(([decision, text]) => (
          <button key={decision} type="button" onClick={() => console.info("[D1 preview]", { suggestionId: suggestion._id, decision, standing_permission: standingPermission })}
            className={`min-h-11 rounded-xl px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${decision === "accepted" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
            {text}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Preview only. Actions are not saved yet.</p>
      <details className="mt-3 text-xs text-zinc-500"><summary className="cursor-pointer py-1">Also available in Finnish</summary><p lang="fi" className="mt-1 leading-5">{suggestion.message.fi}</p></details>
    </article>
  );
}
