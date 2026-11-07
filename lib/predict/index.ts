import type { Hours, HolidayHistoryEntry, OpeningHours, PeerBenchmark } from "@/types";
import type { BasisDetail, ClosureSignal, Prediction, PredictContext } from "@/types/api";
import { displayedHours, normalizeHours, sameHours, weekdayOf } from "../hours";

// lib/predict: ONE business + ONE special day -> SUGGEST + hours, NO_ACTION or FLAG (DESIGN 0 "v2", stage A10).
// Shared by detection (C11, the app) and scripts/predict.mts (predictions_2026.csv for Fonecta's scorer),
// so the score measures exactly what the demo shows.
//
// Pure: no DB, no clock, no network. Only data entered before `ctx.today` is used (honest back-test).
// Code decides the hours here; the AI only writes the message about them later.
//
// Order, strongest first:
//   0. closed for good?          reviews / user edits say so, listing still open      -> FLAG
//   1. owner's own past edit     same calendar day, from preferences.learned            -> OWNER_EDIT
//   2. shopping centre           centre entered hours for the date and the store keeps
//                                the centre's regular hours on that weekday             -> SHOPPING_CENTRE
//   3. last year                 what the owner entered for the same day last season,
//                                else the season before                                 -> LAST_YEAR
//   4. peers                     most similar businesses close that day                 -> PEERS ("closed" only)
// The result is a SUGGEST only when it differs from what Google shows today.
//
// Measured with Fonecta's scorer (evaluation/evaluate.py, dev split):
//   2026 season 61.6 (baseline 54.5) · 2025 back-test 56.7 (baseline 53.2). See docs/predict.md.

/** Words in reviews that mean "closed for good" (fi, sv, nb, en); same list as Fonecta's baseline. */
const CLOSED_FOR_GOOD = ["lopettanut", "pysyvästi", "stängt för gott", "permanent", "lagt ned", "stengt for godt", "closed down"];
const REVIEW_WINDOW_DAYS = 150;

/** Peer rule: suggest "closed" when most peers who entered something closed, and enough of them did. */
const PEER_MIN_CLOSED_AMONG_ENTERED = 0.7;
const PEER_MIN_SHARE_CLOSED = 0.15;

/** Day keys without a fixed counterpart last year (different events / break dates). */
const NO_LAST_YEAR = new Set(["EVENT", "SCHOOL_BREAK"]);

export function predict(ctx: PredictContext): Prediction {
  const { business, profile, day, today } = ctx;

  // 0. Closed for good: a human checks, Connect does not message the owner.
  const closure = closureSignals(ctx.closure_signals ?? [], today);
  if (closure.length && !business.permanently_closed) {
    return { action: "FLAG", flag_reason: "closed_for_good", confidence: "medium" };
  }

  const shown = displayedHours(profile, day.date).hours;
  const regular = regularOn(profile.regular_hours, day.date);
  const proposal = propose(ctx, regular, shown);
  if (!proposal) return { action: "NO_ACTION" };
  if (sameHours(proposal.hours, shown)) return { action: "NO_ACTION", basis: proposal.basis, detail: proposal.detail };
  return { action: "SUGGEST", ...proposal };
}

/** The closure signals that count: user edits marking the place closed, and recent reviews saying so. */
export function closureSignals(signals: ClosureSignal[], today: string): ClosureSignal[] {
  const end = Date.parse(`${today}T00:00:00`);
  const start = end - REVIEW_WINDOW_DAYS * 86_400_000;
  return signals.filter((s) => {
    const t = Date.parse(s.date.length === 10 ? `${s.date}T00:00:00` : s.date);
    if (!(t < end)) return false;
    if (s.source === "publisher") return s.field === "closed";
    const text = s.text.toLowerCase();
    return t > start && CLOSED_FOR_GOOD.some((w) => text.includes(w));
  });
}

type Proposal = Required<Pick<Prediction, "hours" | "basis" | "detail" | "confidence">>;

function propose(ctx: PredictContext, regular: Hours, shown: Hours): Proposal | null {
  const { day, today } = ctx;

  // 1. The owner's own decision on the same calendar day last time (learning, stage A5 extends this).
  const edit = ownerEdit(ctx);
  if (edit) {
    return { hours: edit.hours, basis: "OWNER_EDIT", detail: { owner_edit: edit }, confidence: "high" };
  }

  // 2. Shopping centre: its entered hours, if the store normally keeps the centre's hours that weekday.
  const centre = ctx.centre;
  if (centre) {
    const entry = latestEntry(centre.history, day.date, today);
    if (entry && !entry.is_regular && sameHours(regularOn(centre.profile.regular_hours, day.date), regular)) {
      return {
        hours: normalizeHours(entry.hours),
        basis: "SHOPPING_CENTRE",
        detail: { shopping_centre: { business_id: centre.business._id, name: centre.business.name, hours: normalizeHours(entry.hours) } },
        confidence: "high",
      };
    }
  }

  // 3. Last season, else the one before.
  if (!NO_LAST_YEAR.has(day.day_key)) {
    for (const back of [1, 2]) {
      const entry = lastSeasonEntry(ctx.history, day.day_key, cycleOf(day.date) - back, today);
      if (!entry) continue;
      const hours = entry.is_regular ? regular : normalizeHours(entry.hours);
      return {
        hours,
        basis: "LAST_YEAR",
        detail: { last_year: { date: entry.date, hours, entered_at: entry.entered_at } },
        confidence: back === 1 ? "high" : "medium",
      };
    }
  }

  // 4. Peers: only "closed", and only when similar businesses clearly close that day.
  const peer = peerRow(ctx.peers, day.day_key);
  if (
    peer &&
    shown !== "closed" &&
    peer.closed_share_among_entered >= PEER_MIN_CLOSED_AMONG_ENTERED &&
    peer.share_entered_closed >= PEER_MIN_SHARE_CLOSED
  ) {
    return {
      hours: "closed",
      basis: "PEERS",
      detail: {
        peers: {
          n: peer.n_entity_days,
          share_closed: peer.closed_share_among_entered,
          share_special: peer.share_entered_special_hours,
          hours: "closed",
        },
      },
      confidence: "low",
    };
  }
  return null;
}

// ---------- helpers ----------

/** Season of a date: Feb–Dec belong to that year, January to the year before (Christmas–Epiphany is one season). */
export function cycleOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 2 ? y : y - 1;
}

function regularOn(week: Partial<OpeningHours> | undefined, date: string): Hours {
  return normalizeHours(week?.[weekdayOf(date)] ?? "closed");
}

/** Latest entry for `date` entered before `today` (several rows for one date: the latest wins). */
function latestEntry(history: HolidayHistoryEntry[], date: string, today: string): HolidayHistoryEntry | null {
  let best: HolidayHistoryEntry | null = null;
  for (const e of history) {
    if (e.date !== date || !(e.entered_at < today)) continue;
    if (!best || e.entered_at > best.entered_at) best = e;
  }
  return best;
}

/** The entry for the same day key in season `cycle` (the latest date of that season that has one). */
function lastSeasonEntry(
  history: HolidayHistoryEntry[],
  dayKey: string,
  cycle: number,
  today: string,
): HolidayHistoryEntry | null {
  const dates = [...new Set(history.filter((e) => e.day_key === dayKey && cycleOf(e.date) === cycle).map((e) => e.date))].sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const entry = latestEntry(history, dates[i], today);
    if (entry) return entry;
  }
  return null;
}

function peerRow(peers: PeerBenchmark[], dayKey: string): PeerBenchmark | null {
  return peers.find((p) => p.day_key === dayKey) ?? null;
}

/** The owner's own edit for the same calendar day (MM-DD) in an earlier season, newest first. */
function ownerEdit(ctx: PredictContext): NonNullable<BasisDetail["owner_edit"]> | null {
  const md = ctx.day.date.slice(5);
  const edits = (ctx.learned ?? [])
    .filter((l) => l.decision === "edited" && l.field === "holiday_hours" && l.at < ctx.today)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const l of edits) {
    if (!l.final || typeof l.final !== "object") continue;
    for (const [date, hours] of Object.entries(l.final as Record<string, unknown>)) {
      if (date.slice(5) === md && date < ctx.day.date && typeof hours === "string") {
        return { date, hours: normalizeHours(hours) };
      }
    }
  }
  return null;
}

