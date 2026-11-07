"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NotificationCard from "@/components/NotificationCard";
import { ownerMocks } from "./mock";

function OwnerView() {
  const { businessId } = useParams<{ businessId: string }>();
  const data = ownerMocks[businessId];

  if (!data) return (
    <div className="py-12"><h1 className="text-2xl font-semibold">Business not found</h1><p className="mt-3 text-sm text-zinc-600">This business is not included in the owner preview.</p><Link href="/owner/rye_shine" className="mt-4 inline-block underline">Open Rye &amp; Shine Bakery</Link></div>
  );

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Fonecta Connect</p>
        <p className="mt-5 text-sm text-zinc-500">{data.business.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hi {data.business.owner_name}!</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{data.suggestions.length ? "A few details need your attention. You decide what changes." : "Your business information is looking good."}</p>
      </header>
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Demo preview · Sample suggestions. No changes will be published.</div>
      {data.suggestions.length ? (
        <section aria-label="Suggestions to review" className="space-y-4">
          {data.suggestions.map((suggestion) => <NotificationCard key={suggestion._id} suggestion={suggestion} listings={data.listings} />)}
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-white px-4 py-10 text-center"><h2 className="text-xl font-semibold">Everything is up to date ✅</h2><p className="mt-2 text-sm leading-6 text-zinc-600">There is nothing to review right now.</p></section>
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
