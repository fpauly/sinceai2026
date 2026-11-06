"use client";

// Live progress board for the team (home page). Everything here is detected automatically:
// it probes whether routes/pages exist and reads DB counts from /api/status.
// Lanes don't need to edit this file; their work turns items green when it lands on main.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Lane = "A" | "B" | "C" | "D" | "all" | "A+C" | "A+D" | "extra";

interface Status {
  ok: boolean;
  demo_date: string;
  db: { ok: boolean; name: string; error?: string };
  counts?: { businesses: number; listings: number; reviews: number };
  issues?: { total: number; by_type: Record<string, number>; by_status: Record<string, number> };
  suggestions?: {
    total: number; decided: number; by_decision: Record<string, number>;
    validated: number; applied: number; applied_yext: number;
  };
  ignored_fingerprints?: number;
  learned?: number;
  standing_permissions?: number;
}

// Route probe: a missing route gives Next's HTML 404. 405 (wrong method) or any JSON reply means it exists.
const PROBES = {
  detect: "/api/detect",
  suggest: "/api/suggest",
  businesses: "/api/businesses",
  business: "/api/businesses/rye_shine",
  decide: "/api/suggestions/_probe/decide",
  tts: "/api/suggestions/_probe/tts",
  voiceReply: "/api/voice/reply",
  dashboardPage: "/dashboard",
  ownerPage: "/owner/rye_shine",
  contactPage: "/contact/rye_shine",
} as const;
type ProbeKey = keyof typeof PROBES;
type Probes = Record<ProbeKey, boolean>;

async function probe(path: string): Promise<boolean> {
  try {
    const res = await fetch(path, { method: "GET", cache: "no-store" });
    if (res.status !== 404) return true;
    return (res.headers.get("content-type") ?? "").includes("application/json");
  } catch {
    return false;
  }
}

interface Item {
  label: string;
  done: boolean;
  detail?: string;
  href?: string;
}

interface Milestone {
  id: string;
  title: string;
  lane: Lane;
  items: Item[];
}

function milestones(s: Status | null, p: Probes | null): Milestone[] {
  const t = s?.issues?.by_type ?? {};
  const n = (k: string) => t[k] ?? 0;
  const rule124 = n("missing_holiday_hours") + n("cross_platform_conflict") + n("stale_field");
  const sug = s?.suggestions;
  const has = (k: ProbeKey) => !!p?.[k];

  return [
    {
      id: "M1", title: "Foundation", lane: "all",
      items: [
        { label: "Database connected", done: !!s?.db.ok, detail: s ? (s.db.ok ? s.db.name : s.db.error) : undefined },
        { label: "Demo data seeded", done: (s?.counts?.businesses ?? 0) > 0, detail: s?.counts ? `${s.counts.businesses} businesses, ${s.counts.listings} listings, ${s.counts.reviews} reviews` : undefined },
      ],
    },
    {
      id: "1", title: "Detect", lane: "C",
      items: [
        { label: "POST /api/detect", done: has("detect") },
        { label: "Holiday / conflict / stale issues found", done: rule124 > 0, detail: `${rule124} issues (8 expected after seed)` },
      ],
    },
    {
      id: "2", title: "Suggest", lane: "A+C",
      items: [
        { label: "POST /api/suggest", done: has("suggest") },
        { label: "Suggestions generated", done: (sug?.total ?? 0) > 0, detail: `${sug?.total ?? 0} suggestions` },
        { label: "Suggestions validated by code", done: (sug?.validated ?? 0) > 0, detail: `${sug?.validated ?? 0} validated` },
      ],
    },
    {
      id: "3", title: "Contact", lane: "D",
      items: [
        { label: "Message preview page", done: has("contactPage"), href: has("contactPage") ? "/contact/rye_shine" : undefined },
      ],
    },
    {
      id: "4", title: "Decide", lane: "D",
      items: [
        { label: "GET /api/businesses/[id]", done: has("business") },
        { label: "Owner page (no login)", done: has("ownerPage"), href: has("ownerPage") ? "/owner/rye_shine" : undefined },
        { label: "POST /api/suggestions/[id]/decide", done: has("decide") },
        { label: "Owner made a decision", done: (sug?.decided ?? 0) > 0, detail: `${sug?.decided ?? 0} decided, ${s?.ignored_fingerprints ?? 0} ignored remembered` },
      ],
    },
    {
      id: "5", title: "Apply (Yext)", lane: "B",
      items: [
        { label: "Change applied after a decision", done: (sug?.applied ?? 0) > 0, detail: `${sug?.applied ?? 0} applied` },
        { label: "Written to the Yext sandbox", done: (sug?.applied_yext ?? 0) > 0, detail: `${sug?.applied_yext ?? 0} via Yext` },
      ],
    },
    {
      id: "L", title: "Learn", lane: "A+D",
      items: [
        { label: "Owner decisions remembered", done: (s?.learned ?? 0) > 0, detail: `${s?.learned ?? 0} learned` },
        { label: "Standing permission given", done: (s?.standing_permissions ?? 0) > 0, detail: `${s?.standing_permissions ?? 0}` },
      ],
    },
    {
      id: "M8", title: "Dashboard", lane: "C",
      items: [
        { label: "GET /api/businesses", done: has("businesses") },
        { label: "Dashboard page", done: has("dashboardPage"), href: has("dashboardPage") ? "/dashboard" : undefined },
      ],
    },
    {
      id: "+", title: "Extras", lane: "extra",
      items: [
        { label: "Voice message (TTS)", done: has("tts") },
        { label: "Voice reply (STT)", done: has("voiceReply") },
        { label: "Review signal issues", done: n("review_signal") > 0, detail: `${n("review_signal")}` },
      ],
    },
  ];
}

const LANE_STYLE: Record<Lane, string> = {
  A: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  B: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  D: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  all: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "A+C": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "A+D": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  extra: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function ProgressBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [probes, setProbes] = useState<Probes | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, ...results] = await Promise.all([
      fetch("/api/status", { cache: "no-store" }).then((r) => r.json() as Promise<Status>).catch(() => null),
      ...Object.values(PROBES).map(probe),
    ]);
    setStatus(s);
    setProbes(Object.fromEntries(Object.keys(PROBES).map((k, i) => [k, results[i]])) as Probes);
  }, []);

  useEffect(() => {
    // Initial load + poll; setState happens after the awaits inside refresh().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(label: string, path: string) {
    setBusy(label);
    setLog(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json().catch(() => null);
      const created = Array.isArray(json?.created) ? ` — ${json.created.length} created` : "";
      setLog(`${label}: ${res.ok ? "OK" : `HTTP ${res.status}`}${created}${json?.error ? ` — ${json.error}` : ""}`);
    } catch (e) {
      setLog(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    }
    setBusy(null);
    refresh();
  }

  const ms = milestones(status, probes);
  const all = ms.filter((m) => m.lane !== "extra").flatMap((m) => m.items); // extras don't count
  const doneCount = all.filter((i) => i.done).length;
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Team progress</span>
          <span className="tabular-nums text-zinc-500">{doneCount}/{all.length} · {pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Auto-detected from routes and the database · DEMO_DATE {status?.demo_date ?? "…"} · refreshes every 15 s
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton label="Reset demo" busy={busy} onClick={() => run("Reset demo", "/api/seed")} />
        <ActionButton label="Run detection" busy={busy} disabled={!probes?.detect} onClick={() => run("Run detection", "/api/detect")} />
        <ActionButton label="Generate suggestions" busy={busy} disabled={!probes?.suggest} onClick={() => run("Generate suggestions", "/api/suggest")} />
      </div>
      {log && <p className="-mt-2 text-sm text-zinc-600 dark:text-zinc-400">{log}</p>}

      <ol className="flex flex-col gap-3">
        {ms.map((m) => {
          const d = m.items.filter((i) => i.done).length;
          const complete = d === m.items.length;
          return (
            <li key={m.id} className={`rounded-xl border p-3 ${complete ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-500">{/^\d$/.test(m.id) ? `Step ${m.id}` : m.id}</span>
                <span className="font-medium">{m.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LANE_STYLE[m.lane]}`}>
                  {m.lane === "all" || m.lane === "extra" ? m.lane : `lane ${m.lane}`}
                </span>
                <span className="ml-auto text-xs tabular-nums text-zinc-500">{complete ? "done 🎉" : `${d}/${m.items.length}`}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {m.items.map((i) => (
                  <li key={i.label} className="flex items-start gap-2">
                    <span className={i.done ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>{i.done ? "✓" : "○"}</span>
                    <span className={i.done ? "" : "text-zinc-500"}>
                      {i.href ? <Link href={i.href} className="underline underline-offset-2">{i.label}</Link> : i.label}
                      {i.detail && <span className="ml-1 text-xs text-zinc-500">· {i.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActionButton(props: { label: string; busy: string | null; disabled?: boolean; onClick: () => void }) {
  const loading = props.busy === props.label;
  return (
    <button
      onClick={props.onClick}
      disabled={!!props.busy || props.disabled}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {loading ? `${props.label}…` : props.label}
    </button>
  );
}
