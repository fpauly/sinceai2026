"use client";

import { useEffect, useState, type ReactNode } from "react";
import { livePublishers, updateSpeedText } from "@/lib/yext/publishers";
import type { AppliedResult, Business } from "@/types";

/** Yext confirms the write; publisher visibility below is only a time-based estimate. */
export default function ChannelSyncRow({ applied, business, receivedAt, children }: {
  applied: AppliedResult | null | undefined;
  business: Pick<Business, "publishers">;
  receivedAt: number; // Client timestamp when the successful decision response arrived.
  children?: ReactNode; // Slot for the optional VoiceButton.
}) {
  const [now, setNow] = useState(0);
  const publishers = livePublishers(business);
  const names = [...new Set(applied?.published_to ?? [])];
  const startedAt = receivedAt;
  const confirmed = applied?.yext === true;
  const speeds = names.map((name) => publishers.find((p) => p.name === name)?.typical_update_seconds);
  const validSpeed = (seconds: number | undefined): seconds is number => typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
  const longest = Math.max(0, ...speeds.filter(validSpeed));

  useEffect(() => {
    if (!confirmed || !Number.isFinite(startedAt) || longest === 0) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= startedAt + longest * 1000) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmed, startedAt, longest]);

  const elapsed = now ? Math.max(0, (now - startedAt) / 1000) : 0;
  return <section aria-label="Publication status" className={`mb-5 rounded-xl border p-4 text-sm leading-6 ${confirmed ? "border-emerald-200 bg-white" : "border-amber-200 bg-amber-50"}`}>
    <h2 className="font-semibold">{confirmed ? "Change saved and published via Yext" : "Change saved locally"}</h2>
    <p role="status" className="mt-2 break-words">{confirmed
      ? names.length ? `Published via Yext to: ${names.join(", ")}.` : "Yext confirmed the write. No publication channels were returned."
      : "External publication is not confirmed. Your saved hours have not been verified on publisher sites."}</p>
    {!confirmed && applied?.error && <details className="mt-2 text-xs text-zinc-600"><summary className="cursor-pointer py-1">Publication details</summary><p className="mt-1 break-words">{applied.error}</p></details>}
    {confirmed && names.length > 0 && <>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Estimated visibility based on each channel’s typical update time. Timing starts when this app receives confirmation. Green indicators are estimates, not live confirmation from those sites.</p>
      <ul className="mt-3 space-y-3">{names.map((name, index) => {
        const seconds = speeds[index];
        const timed = validSpeed(seconds) && Number.isFinite(startedAt);
        const reached = timed && elapsed >= seconds;
        return <li key={name} className="flex items-start gap-2">
          <span aria-hidden="true" className={`mt-2 size-2.5 shrink-0 rounded-full ${reached ? "bg-emerald-600" : "bg-zinc-300"}`} />
          <div className="min-w-0"><p className="break-words font-medium">{name}</p>
            <p className="text-xs leading-5 text-zinc-600">{timed
              ? `${reached ? "Typical update time passed" : "Update expected"} · ${updateSpeedText(seconds)}`
              : "Update time unavailable"}</p>
          </div>
        </li>;
      })}</ul>
    </>}
    {children && <div className="mt-3">{children}</div>}
  </section>;
}
