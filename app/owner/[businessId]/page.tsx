"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AutomaticallyApplied, contactChannel, contactLanguage, contactName, decisionLabel, groupTitle, sortByDate } from "@/app/owner/contact-details";
import ChannelSyncRow from "@/components/ChannelSyncRow";
import type { AppliedResult } from "@/types";
import NotificationCard from "@/components/NotificationCard";
import type { DecideResponse, OwnerViewResponse } from "@/types/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: OwnerViewResponse }
  | { status: "not-found" }
  | { status: "error" };

function OwnerView() {
  const { businessId } = useParams<{ businessId: string }>();
  return <BusinessView key={businessId} businessId={businessId} />;
}

function BusinessView({ businessId }: { businessId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [publication, setPublication] = useState<{ id: string; applied: AppliedResult | null | undefined; receivedAt: number; label: string } | null>(null);

  function decided(result: DecideResponse) {
    const ignored = result.suggestion.decision === "ignored";
    setNotice(ignored ? `${decisionLabel(result.suggestion)}: suggestion declined. Your information was not changed.` : null);
    setPublication(ignored ? null : { id: result.suggestion._id, applied: result.suggestion.applied, receivedAt: Date.now(), label: decisionLabel(result.suggestion) });
    setState((current) => current.status === "ready" ? {
      status: "ready", data: { ...current.data, suggestions: current.data.suggestions.filter((item) => item._id !== result.suggestion._id) },
    } : current);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (response.status === 404) {
          setState({ status: "not-found" });
          return;
        }
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

  if (state.status === "loading") return <p role="status" className="py-12">Loading your business…</p>;
  if (state.status === "error") return (
    <div className="py-12"><h1 className="text-2xl font-semibold">Unable to load your business</h1><p role="alert" className="mt-3 text-sm text-zinc-600">Please check your connection and try again.</p><button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }} className="mt-4 min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white">Try again</button></div>
  );

  if (state.status === "not-found") return (
    <div className="py-12"><h1 className="text-2xl font-semibold">Business not found</h1><p className="mt-3 text-sm text-zinc-600">Check the link or return to the demo.</p><Link href="/" className="mt-4 inline-block underline">Back to demo</Link></div>
  );

  const { data } = state;
  const suggestions = sortByDate(data.suggestions);

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Fonecta Connect</p>
        <p className="mt-5 text-sm text-zinc-500">{data.business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hi {contactName(data.business)}!</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{data.suggestions.length ? "A few details need your attention. You decide what changes." : "There are no suggestions waiting for your review."}</p>
      </header>
      {data.business.contact && <p className="mb-4 text-xs text-zinc-500">Contact channel: {contactChannel(data.business)} · Language: {{ en: "English", fi: "Finnish", sv: "Swedish", nb: "Norwegian" }[contactLanguage(data.business)]}</p>}
      {data.business.contact?.opted_out && <p className="mb-4 rounded-xl bg-zinc-100 p-3 text-sm">Not contacted. You have opted out of suggestion messages.</p>}
      {!!data.automatically_applied?.length && <div className="mb-4"><AutomaticallyApplied suggestions={sortByDate(data.automatically_applied)} language={contactLanguage(data.business)} /></div>}
      {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900">{notice}</p>}
      {publication && <ChannelSyncRow key={publication.id} changeLabel={publication.label} applied={publication.applied} receivedAt={publication.receivedAt} business={data.business} />}
      {suggestions.length ? (
        <section aria-label="Suggestions to review" className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-100 p-3">
          <h2 className="px-1 text-lg font-semibold">{groupTitle(suggestions)}</h2>
          {suggestions.map((suggestion) => <NotificationCard key={suggestion._id} suggestion={suggestion} listings={data.listings} profile={data.profile} businessName={data.business.name} language={contactLanguage(data.business)} onDecidedAction={decided} />)}
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-white px-4 py-10 text-center"><h2 className="text-xl font-semibold">Nothing waiting for review</h2><p className="mt-2 text-sm leading-6 text-zinc-600">There is nothing to review right now.</p></section>
      )}
      <footer className="mt-8 text-center text-xs leading-5 text-zinc-500">Your business. Your decision.<br />Connect helps you keep everyone informed.</footer>
    </>
  );
}

export default function OwnerPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto w-full max-w-[390px]">
        <Suspense fallback={<p role="status">Loading your business…</p>}><OwnerView /></Suspense>
      </div>
    </main>
  );
}
