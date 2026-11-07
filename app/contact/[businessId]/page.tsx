"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AutomaticallyApplied, ContactWindow, OwnerMessage, contactChannel, contactLanguage, contactName, decisionLabel, formatDate, groupTitle, sortByDate } from "@/app/owner/contact-details";
import ReplyBox from "@/app/contact/ReplyBox";
import ChannelSyncRow from "@/components/ChannelSyncRow";
import Reveal from "@/components/Reveal";
import { showHours } from "@/lib/hours";
import type { IssueType, Language } from "@/types";
import type { DecideResponse, OwnerViewResponse, SuggestionWithIssue } from "@/types/api";

const titles: Record<IssueType, string> = {
  missing_holiday_hours: "Your holiday hours",
  cross_platform_conflict: "Different details across channels",
  stale_field: "A detail worth checking",
  review_signal: "A customer noticed a change",
  special_day_hours: "Your hours for a special day",
  needs_human: "A detail worth checking",
};
const labels: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
  finder: "Finder", google: "Google", website: "Website",
  opening_hours: "Opening hours", holiday_hours: "Holiday hours", phone: "Phone", description: "Description",
};

function label(key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const date = new Date(`${key}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(date);
  }
  return labels[key] ?? key.replaceAll("_", " ");
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "Not set";
  if (value === "closed") return "Closed";
  if (typeof value === "string") return value.trim() ? showHours(value, "Closed") : value;
  if (Array.isArray(value)) return value.map(valueText).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${label(key)}: ${valueText(item)}`).join("; ");
  return String(value);
}

function evidenceLines(suggestion: SuggestionWithIssue): string[] {
  const evidence = suggestion.issue.evidence;
  switch (suggestion.issue.type) {
    case "missing_holiday_hours":
      return [
        `Upcoming holidays: ${valueText(evidence.holiday_names ?? evidence.dates)}.`,
        evidence.last_year && typeof evidence.last_year === "object" && Object.keys(evidence.last_year).length
          ? `Last season: ${valueText(evidence.last_year)}.` : "No previous holiday hours are available.",
      ];
    case "cross_platform_conflict":
      return Array.isArray(evidence.values) ? evidence.values.map((item: { source?: string; value?: unknown; updated_at?: string | null }) =>
        `${label(item.source ?? "Source")}: ${valueText(item.value)}${item.updated_at ? ` (updated ${label(item.updated_at)})` : ""}.`) : [];
    case "stale_field":
      return [`${label(String(evidence.field ?? "Information"))} last updated: ${valueText(evidence.oldest_update)}.`, `Current details: ${valueText(evidence.current_value)}.`];
    case "review_signal":
      return Array.isArray(evidence.reviews) ? evidence.reviews.map((review: { date?: string; text?: string }) =>
        `${review.date ? `${label(review.date)}: ` : ""}${review.text ?? ""}`) : [];
    default:
      return [];
  }
}

function Message({ suggestion, language, allowReply, onDecidedAction }: { suggestion: SuggestionWithIssue; language: Language; allowReply: boolean; onDecidedAction: (result: DecideResponse, receivedAt: number) => void }) {
  const lines = evidenceLines(suggestion);
  return (
    <section className="min-w-0 border-b border-zinc-100 pb-4 text-sm leading-6 last:border-0">
      <h3 className="font-semibold text-emerald-800">{formatDate(suggestion.issue.evidence.date) ?? titles[suggestion.issue.type]}</h3>
      <OwnerMessage message={suggestion.message} language={language} />
      <div className="mt-3 border-l-2 border-emerald-600 pl-3">
        <h3 className="text-xs font-semibold text-emerald-800">Proposed change · {label(suggestion.proposed_change.field)}</h3>
        <p className="mt-1 break-words">{valueText(suggestion.proposed_change.value)}</p>
      </div>
      <h3 className="mt-3 font-semibold">Why we’re getting in touch</h3>
      <p className="mt-1 break-words text-zinc-600">{suggestion.reason}</p>
      {suggestion.confidence === "low" && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">Low confidence · please check the proposed details.</p>}
      {lines.length > 0 && <details className="mt-3 text-xs text-zinc-600">
        <summary className="cursor-pointer py-1 font-medium">The data behind this</summary>
        <ul className="mt-1 space-y-2 break-words">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </details>}
      {allowReply ? <ReplyBox suggestion={suggestion} onDecidedAction={onDecidedAction} /> : <Link href={`/owner/${encodeURIComponent(suggestion.business_id)}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-emerald-800 underline">Edit in owner view →</Link>}
    </section>
  );
}

type LoadState = { status: "loading" } | { status: "ready"; data: OwnerViewResponse } | { status: "error" } | { status: "not-found" };

function BusinessChat({ businessId }: { businessId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [lastDecision, setLastDecision] = useState<{ result: DecideResponse; receivedAt: number } | null>(null);
  function decided(result: DecideResponse, receivedAt: number) {
    setLastDecision({ result, receivedAt });
    setState((current) => current.status === "ready" ? { status: "ready", data: {
      ...current.data, suggestions: current.data.suggestions.filter((suggestion) => suggestion._id !== result.suggestion._id),
    } } : current);
  }
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}`, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404) { setState({ status: "not-found" }); return; }
        if (!response.ok) throw new Error("Request failed");
        const data: OwnerViewResponse = await response.json();
        if (!controller.signal.aborted) setState({ status: "ready", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [businessId, attempt]);

  if (state.status === "loading") return <p role="status" className="rounded-xl bg-white p-4 text-sm">Loading your message preview…</p>;
  if (state.status === "error") return (
    <div className="rounded-xl bg-white p-4 text-sm"><p role="alert">We couldn’t load your messages. Please try again.</p><button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }} className="mt-3 min-h-11 rounded-lg bg-emerald-700 px-4 font-medium text-white">Try again</button></div>
  );
  if (state.status === "not-found") return (
    <div className="rounded-xl bg-white p-4 text-sm"><h2 className="font-semibold">Business not found</h2><p className="mt-2">Please check your link.</p><Link href="/" className="mt-3 inline-flex min-h-11 items-center text-emerald-800 underline">Back to demo</Link></div>
  );
  const { data } = state;
  const channel = contactChannel(data.business);
  const language = contactLanguage(data.business);
  const automatic = sortByDate(data.automatically_applied ?? []);
  const suggestions = sortByDate(data.suggestions);
  const optedOut = data.business.contact?.opted_out;
  return <>
    <p className="rounded-lg bg-white/80 px-3 py-2 text-center text-xs text-zinc-600">For {contactName(data.business)} · {data.business.name}<br />{channel} preview · No message has been sent.</p>
    {lastDecision && <Reveal key={lastDecision.result.suggestion._id}>{lastDecision.result.suggestion.decision === "ignored"
      ? <p role="status" className="rounded-xl bg-white p-3 text-sm">{decisionLabel(lastDecision.result.suggestion)}: suggestion declined. Your information was not changed.</p>
      : <ChannelSyncRow key={lastDecision.result.suggestion._id} changeLabel={decisionLabel(lastDecision.result.suggestion)} applied={lastDecision.result.suggestion.applied} receivedAt={lastDecision.receivedAt} business={data.business} />}</Reveal>}
    {optedOut ? <div className="rounded-2xl bg-white p-4 text-sm leading-6"><h2 className="font-semibold">Not contacted</h2><p className="mt-2">This owner has opted out of suggestion messages.</p></div> : suggestions.length || automatic.length ? (
      <article aria-label={`${channel} message`} className="min-w-0 space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        {channel === "Email" && <p className="border-b border-zinc-100 pb-2 text-sm font-semibold">Subject: Your business hours</p>}
        <header className="border-b border-zinc-100 pb-3">
          <h2 className="text-lg font-semibold text-emerald-900">{suggestions.length ? groupTitle(suggestions) : "Your hours have been updated"}</h2>
          {suggestions.length > 1 && <p className="mt-1 text-xs leading-5 text-zinc-600">One message with all your dates. Review each suggestion below.</p>}
          <ContactWindow business={data.business} />
        </header>
        <AutomaticallyApplied suggestions={automatic} language={language} />
        {suggestions.map((suggestion) => <Message key={suggestion._id} suggestion={suggestion} language={language} allowReply={channel === "SMS" || channel === "WhatsApp"} onDecidedAction={decided} />)}
        <Link href={`/owner/${encodeURIComponent(businessId)}`} className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-3 py-2 text-center text-sm font-semibold text-white">{suggestions.length ? "Review your dates →" : "View your updated hours →"}</Link>
        <p className="text-center text-xs text-zinc-500">No login needed. You decide what changes.</p>
      </article>
    ) : <div className="rounded-2xl bg-white p-4 text-sm leading-6"><h2 className="font-semibold">{lastDecision ? "You're all caught up" : "No action needed"}</h2><p className="mt-2">There are no suggestions waiting for your review.</p><Link href={`/owner/${encodeURIComponent(businessId)}`} className="mt-2 inline-flex min-h-11 items-center font-medium text-emerald-800 underline">View your business hours →</Link></div>}
  </>;
}

function ContactChat() {
  const { businessId } = useParams<{ businessId: string }>();
  return <BusinessChat key={businessId} businessId={businessId} />;
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 sm:py-10">
      <div className="mx-auto w-full max-w-[390px]">
        <h1 className="text-center text-xl font-semibold tracking-tight">Your message from Connect</h1>
        <p className="mb-5 mt-2 text-center text-xs leading-5 text-zinc-500">Simulated contact preview · No message has been sent.</p>
        <section aria-label="Contact conversation preview" className="overflow-hidden rounded-[2.5rem] border-[6px] border-zinc-900 bg-zinc-900 shadow-xl">
          <div aria-hidden="true" className="mx-auto my-3 h-1.5 w-20 rounded-full bg-zinc-600" />
          <header className="flex items-center gap-3 bg-emerald-900 px-4 py-4 text-white">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-lg font-semibold">C</span>
            <div className="min-w-0"><p className="font-semibold">Fonecta Connect</p><p className="mt-0.5 text-xs text-emerald-100">Business information updates</p></div>
          </header>
          <div className="min-h-[420px] space-y-4 bg-[#eee8df] px-3 py-5">
            <Suspense fallback={<p role="status" className="rounded-xl bg-white p-4 text-sm">Loading your message preview…</p>}><ContactChat /></Suspense>
          </div>
          <div aria-hidden="true" className="py-3"><div className="mx-auto h-1 w-24 rounded-full bg-zinc-400" /></div>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-zinc-500">Connect spots what needs attention.<br />You stay in control.</p>
      </div>
    </main>
  );
}
