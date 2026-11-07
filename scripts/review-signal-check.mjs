#!/usr/bin/env node
// Deterministic tests for the review-signal rule (stage C9, DESIGN 8/9.2).
// Usage: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/review-signal-check.mjs
//
// The Gemini classifier is injected, so this needs no key and no network. The rule must:
//   - pass only the last 30 days of reviews to the classifier (dates are code's job),
//   - create one medium review_signal issue when the classifier signals and cites real reviews,
//   - stay quiet on no signal, on a signal without evidence, and on a too-old review.

import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, next) {
    const base = specifier.startsWith("@/")
      ? resolve(ROOT, specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (base && !/\.[cm]?[jt]s$/.test(base)) {
      for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
        if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
      }
    }
    return next(specifier, context);
  },
});

const { makeReviewSignal, REVIEW_WINDOW_DAYS } = await import("../lib/rules/reviewSignal.ts");

const TODAY = "2026-12-10";
const business = { _id: "rye_shine", name: "Rye & Shine Bakery", category: "bakery", city: "Turku" };
const listings = [
  {
    _id: "rye_shine:google",
    business_id: "rye_shine",
    source: "google",
    opening_hours: { mon: "08:00-18:00", tue: "08:00-18:00", wed: "08:00-18:00", thu: "08:00-18:00", fri: "08:00-18:00", sat: "10:00-18:00", sun: "closed" },
    holiday_hours: {},
    phone: "+358 2 100 4567",
    description: "Sourdough and rye bakery on Eerikinkatu.",
    field_updated_at: { opening_hours: "2025-12-20", holiday_hours: "2025-12-20", description: "2023-05-01" },
  },
];
const reviews = [
  { _id: "rev_fresh", business_id: "rye_shine", date: "2026-11-28", rating: 2, text: "Came on Saturday at 3 pm and the door was locked, although Google said open until 18." },
  { _id: "rev_stale", business_id: "rye_shine", date: "2026-06-02", rating: 4, text: "Nice place for a quick coffee." },
  { _id: "rev_boundary_old", business_id: "rye_shine", date: "2026-11-10", rating: 5, text: "Exactly 30 days before today." },
  { _id: "rev_boundary_new", business_id: "rye_shine", date: "2026-11-11", rating: 5, text: "29 days before today." },
];

function ctx(overrides = {}) {
  return { business, listings, reviews, today: TODAY, ...overrides };
}

const NO_SIGNAL = { signal: false, type: "other", evidence_review_ids: [], summary: "" };
const closedSignal = {
  signal: true,
  type: "closed_when_open",
  evidence_review_ids: ["rev_fresh"],
  summary: "A customer found the bakery closed during its listed Saturday hours.",
};

let passed = 0;
let failed = 0;
const check = (ok, message) => {
  if (ok) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
};

// 1. a signal with evidence becomes one medium issue with the cited review only
{
  const rule = makeReviewSignal(async () => closedSignal);
  const drafts = await rule(ctx());
  const draft = drafts[0];
  check(drafts.length === 1, `a signal creates 1 issue (got ${drafts.length})`);
  check(draft?.type === "review_signal" && draft.severity === "medium", "the issue is review_signal / medium");
  check(draft?.fingerprint === "rye_shine:review_signal:closed_when_open", "the fingerprint names the signal type");
  check(draft?.evidence?.signal_type === "closed_when_open" && draft.evidence.summary === closedSignal.summary, "evidence keeps the type and summary");
  check(
    draft?.evidence?.reviews?.length === 1 && draft.evidence.reviews[0]._id === "rev_fresh",
    "evidence cites only the review the classifier used",
  );
}

// 2. only the last 30 days reach the classifier (2026-11-11 and later), dates are code's job
{
  let seen = [];
  const rule = makeReviewSignal(async (_business, recent) => {
    seen = recent.map((review) => review._id);
    return NO_SIGNAL;
  });
  await rule(ctx());
  check(
    seen.join(",") === "rev_fresh,rev_boundary_new",
    `only reviews newer than 30 days are classified (got ${seen.join(",") || "none"})`,
  );
  check(REVIEW_WINDOW_DAYS === 30, "the window is 30 days");
}

// 3. no signal -> no issue (the normal case, and the no-key fallback)
{
  const rule = makeReviewSignal(async () => NO_SIGNAL);
  check((await rule(ctx())).length === 0, "no signal creates no issue");
}

// 4. a signal without a real evidence id is not trusted
{
  const rule = makeReviewSignal(async () => ({ ...closedSignal, evidence_review_ids: ["rev_missing"] }));
  check((await rule(ctx())).length === 0, "a signal without cited reviews creates no issue");
}

// 5. no recent reviews -> the classifier is not called at all
{
  let called = false;
  const rule = makeReviewSignal(async () => {
    called = true;
    return closedSignal;
  });
  const drafts = await rule(ctx({ reviews: [{ _id: "old", business_id: "rye_shine", date: "2026-06-02", rating: 5, text: "Old." }] }));
  check(drafts.length === 0 && !called, "no recent reviews means no classifier call");
}

// 6. a real signal from the Pizzeria fixture keeps its own date and fingerprint
{
  const pizzeria = {
    ...business,
    _id: "pizzeria_port_arthur",
    name: "Pizzeria Port Arthur",
  };
  const moved = {
    signal: true,
    type: "moved",
    evidence_review_ids: ["rev_pizza"],
    summary: "Two customers say the pizzeria moved to Puolalankatu.",
  };
  const rule = makeReviewSignal(async () => moved);
  const drafts = await rule(
    ctx({
      business: pizzeria,
      reviews: [{ _id: "rev_pizza", business_id: "pizzeria_port_arthur", date: "2026-12-01", rating: 2, text: "The old address was empty; a note said they moved." }],
    }),
  );
  check(
    drafts[0]?.fingerprint === "pizzeria_port_arthur:review_signal:moved",
    "a moved signal gets its own fingerprint",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
