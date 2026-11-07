"use client";

// Fonecta dashboard (TASKS C7, DESIGN 12): one row per business, and the "Run daily check"
// button that POSTs /api/detect then /api/suggest. All DB access stays in /api/businesses.
// Rows link to the owner view (mobile, no login); the contact preview arrives with lane D.

import { useCallback, useEffect, useState } from "react";
import type { Severity } from "@/types";
import type { BusinessesResponse } from "@/types/api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: BusinessesResponse }
  | { status: "error"; message: string };

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-700",
};

const DECISION_LABEL: Record<string, string> = {
  accepted: "accepted",
  edited: "edited",
  ignored: "ignored",
  auto: "applied automatically",
};

function categoryLabel(category: string): string {
  const words = category.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** POST a route that returns { ok, created } and return how many rows it created. */
async function postCreated(path: string): Promise<number> {
  const res = await fetch(path, { method: "POST" });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; created?: unknown[]; error?: string }
    | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.created?.length ?? 0;
}

export default function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/businesses", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as BusinessesResponse;
      setState({ status: "ready", rows });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Request failed" });
    }
  }, []);

  useEffect(() => {
    // Initial load; setState happens after the await inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function runDailyCheck() {
    setBusy(true);
    setLog(null);
    try {
      const issues = await postCreated("/api/detect");
      const suggestions = await postCreated("/api/suggest");
      setLog(`Daily check done: ${issues} new issue(s), ${suggestions} new suggestion(s).`);
      await load();
    } catch (err) {
      setLog(`Daily check failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  const rows = state.status === "ready" ? state.rows : [];
  const withIssues = rows.filter((row) => row.open_issues.high + row.open_issues.medium + row.open_issues.low > 0);
  const totalOpen = rows.reduce(
    (sum, row) => sum + row.open_issues.high + row.open_issues.medium + row.open_issues.low,
    0,
  );
  const flagged = rows.filter((row) => (row.needs_human?.count ?? 0) > 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Fonecta dashboard</h1>
        <p className="mt-1 text-zinc-600">
          One row per business. Run the daily check to detect what is out of date and write the suggestions. Opening a business gives you a private copy, so your answers never change the shared demo.
          Staff-only flags (for example a business that has closed for good) are listed as “needs a person” and are never sent to the owner.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runDailyCheck}
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Running daily check…" : "Run daily check"}
        </button>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40"
        >
          Reload
        </button>
        {state.status === "ready" && (
          <span className="text-sm text-zinc-500">
            {rows.length} businesses · {totalOpen} open issue(s) at {withIssues.length} business(es)
            {flagged.length > 0 ? ` · ${flagged.length} need a person` : ""}
          </span>
        )}
      </div>

      {log && <p className="-mt-2 text-sm text-zinc-600">{log}</p>}

      {state.status === "loading" && <p role="status" className="text-zinc-500">Loading businesses…</p>}
      {state.status === "error" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load the businesses: {state.message}
        </p>
      )}

      {state.status === "ready" && rows.length === 0 && (
        <p className="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-600">
          No businesses yet. Seed the demo data with <code className="font-mono">POST /api/seed</code>.
        </p>
      )}

      {state.status === "ready" && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="p-3 font-medium">Business</th>
                <th className="p-3 font-medium">Open issues</th>
                <th className="p-3 font-medium">Needs a person</th>
                <th className="p-3 font-medium">Last decision</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = row.open_issues.high + row.open_issues.medium + row.open_issues.low;
                return (
                  <tr key={row.business._id} className="border-t border-zinc-200 align-top">
                    <td className="p-3">
                      <a
                        href={`/try?b=${encodeURIComponent(row.business._id)}&to=owner`}
                        className="font-medium underline underline-offset-2"
                      >
                        {row.business.name}
                      </a>
                      <div className="text-xs text-zinc-500">
                        {categoryLabel(row.business.category)} · {row.business.city}
                      </div>
                    </td>
                    <td className="p-3">
                      {open === 0 ? (
                        <span className="text-emerald-600">Up to date ✓</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {(["high", "medium", "low"] as const)
                            .filter((severity) => row.open_issues[severity] > 0)
                            .map((severity) => (
                              <span
                                key={severity}
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[severity]}`}
                              >
                                {row.open_issues[severity]} {severity}
                              </span>
                            ))}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.needs_human ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                          {row.needs_human.count} ·{" "}
                          {row.needs_human.reasons.map((reason) => reason.replace(/_/g, " ")).join(", ")}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.last_decision ? (
                        <>
                          <span className="font-medium">
                            {DECISION_LABEL[row.last_decision.decision] ?? row.last_decision.decision}
                          </span>{" "}
                          <span className="text-zinc-500">{row.last_decision.field.replace(/_/g, " ")}</span>
                          <div className="text-xs text-zinc-500">{row.last_decision.decided_at.slice(0, 10)}</div>
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <a href={`/try?b=${encodeURIComponent(row.business._id)}&to=owner`} className="text-sm underline underline-offset-2">
                        Review →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
