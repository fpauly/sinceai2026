"use client";

import { useState } from "react";

export default function ResetDemoButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function reset() {
    setState("loading");
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? res.statusText);
      setDetail(
        `${json.counts.businesses} businesses, ${json.counts.listings} listings, ${json.counts.reviews} reviews`,
      );
      setState("done");
    } catch (e) {
      setDetail(e instanceof Error ? e.message : "Failed");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={reset}
        disabled={state === "loading"}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {state === "loading" ? "Resetting…" : "Reset demo data"}
      </button>
      {state === "done" && <p className="text-sm text-green-700 dark:text-green-400">Seeded: {detail}</p>}
      {state === "error" && <p className="text-sm text-red-700 dark:text-red-400">Error: {detail}</p>}
    </div>
  );
}
