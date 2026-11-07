import type { DraftIssue, Rule, RuleContext } from "@/types/api";
import type { ClosureSignal } from "@/types/api";
import { addDays } from "@/lib/holidays";
import { displayedHours } from "@/lib/hours";
import { closureSignals, predict } from "@/lib/predict";

// Detection v2 (DESIGN.md section 0 "v2", stage C11): for every special day in the window, ask
// lib/predict what should happen, and turn its answer into an issue.
//
//   SUGGEST -> `special_day_hours` for the owner, with the data behind the proposal in the evidence
//   FLAG    -> one `needs_human` issue per reason for Connect staff (never sent to the owner)
//   NO_ACTION -> nothing
//
// Pure: no DB, no clock (ctx.today), no network. The hours come from lib/predict, never from the LLM.
// Shopping centres are context for the businesses inside them, not customers, so they get no issues.

/** 7 Nov 2026 – 6 Jan 2027 from DEMO_DATE 2026-11-06: the dataset's scored window (DESIGN 9.5). */
const WINDOW_DAYS = 61;

function signalsFor(ctx: RuleContext): ClosureSignal[] {
  const fromReviews: ClosureSignal[] = (ctx.reviews ?? []).map((review) => ({
    source: "review",
    date: review.date,
    text: review.text,
  }));
  const fromPublishers: ClosureSignal[] = (ctx.publisher_suggestions ?? []).map((row) => ({
    source: "publisher",
    date: row.date,
    field: row.field,
  }));
  return [...fromReviews, ...fromPublishers];
}

/** One line per signal that lib/predict actually counted, for the staff view. */
function signalNotes(signals: ClosureSignal[]): string[] {
  return signals.map((signal) =>
    signal.source === "review"
      ? `review ${signal.date}: "${signal.text.length > 90 ? `${signal.text.slice(0, 87)}…` : signal.text}"`
      : `publisher edit ${signal.date}: field "${signal.field}"`,
  );
}

export const specialDays: Rule = (ctx: RuleContext): DraftIssue[] => {
  const { business, profile, today } = ctx;
  if (!profile || business.is_shopping_centre) return [];

  const days = (ctx.special_days ?? []).filter(
    (day) =>
      day.country === business.country &&
      (!day.business_id || day.business_id === business._id) && // country calendar, or this business's event day
      day.date > today &&
      day.date <= addDays(today, WINDOW_DAYS),
  );
  if (days.length === 0) return [];

  const signals = signalsFor(ctx);
  const drafts: DraftIssue[] = [];
  const flagged: string[] = [];

  for (const day of days) {
    const prediction = predict({
      today,
      business,
      profile,
      day,
      history: ctx.history ?? [],
      centre: ctx.centre ?? null,
      peers: ctx.peers ?? [],
      learned: ctx.learned ?? [],
      closure_signals: signals,
    });

    if (prediction.action === "SUGGEST" && prediction.hours) {
      const shown = displayedHours(profile, day.date);
      const expectedViews = business.search_views_by_day_key?.[day.day_key];
      drafts.push({
        business_id: business._id,
        type: "special_day_hours",
        severity: prediction.confidence === "high" ? "high" : "medium",
        evidence: {
          date: day.date,
          day_key: day.day_key,
          day_name: { en: day.name_en, local: day.name_local },
          weekday: day.weekday,
          displayed_hours: shown.hours,
          displayed_from: shown.from,
          proposed_hours: prediction.hours,
          basis: prediction.basis ?? "REGULAR",
          basis_detail: prediction.detail ?? {},
          confidence: prediction.confidence ?? "medium",
          ...(expectedViews !== undefined ? { expected_search_views: expectedViews } : {}),
        },
        fingerprint: `${business._id}:special_day_hours:${day.date}`,
      });
    } else if (prediction.action === "FLAG") {
      flagged.push(day.date);
    }
  }

  if (flagged.length > 0) {
    const reason = "closed_for_good";
    const counted = closureSignals(signals, today);
    const notes = signalNotes(counted);
    drafts.push({
      business_id: business._id,
      type: "needs_human",
      severity: "high",
      evidence: {
        reason,
        summary:
          `The listing still looks open, but ${notes.length} recent signal${notes.length === 1 ? "" : "s"} ` +
          "say this place has closed. A person should confirm before anything is sent.",
        signals: notes,
        dates: flagged.sort(),
      },
      fingerprint: `${business._id}:needs_human:${reason}`,
    });
  }

  return drafts;
};
