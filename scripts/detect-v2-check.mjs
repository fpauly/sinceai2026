#!/usr/bin/env node
// Acceptance check for detection v2 (stage C11) against the committed extract.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/detect-v2-check.mjs
//
// Runs the pure special-day rule with today = 2026-11-06 (the dataset's snapshot) and checks the
// C11 acceptance (TASKS.md): FI-D0013 and NO-D0015 get nothing, FI-D0011 is flagged as closed for
// good (no owner suggestion), FI-D0001 and FI-D0017 get suggestions. No DB and no dev server needed.

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve "@/..." and extension-less imports to .ts files, the same way scripts/predict.mjs does.
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

const { specialDays } = await import("../lib/rules/specialDays.ts");
const { isValidHours } = await import("../lib/hours.ts");

const TODAY = "2026-11-06";
const demo = JSON.parse(readFileSync(resolve(ROOT, "data/fonecta/demo.json"), "utf8"));

const byId = (rows, id) => rows.filter((row) => (row.business_id ?? row._id) === id);

function contextFor(id) {
  const business = demo.businesses.find((row) => row._id === id);
  if (!business) throw new Error(`no business ${id} in data/fonecta/demo.json`);
  const profile = demo.profiles.find((row) => row.business_id === id);
  const centreId = business.shopping_centre_id;
  const centreBusiness = centreId ? demo.businesses.find((row) => row._id === centreId) : undefined;
  const centreProfile = centreId ? demo.profiles.find((row) => row.business_id === centreId) : undefined;
  return {
    business,
    profile,
    listings: [],
    reviews: byId(demo.reviews, id),
    today: TODAY,
    history: byId(demo.holiday_history, id),
    special_days: demo.special_days,
    peers: demo.peers.filter(
      (row) => row.country === business.country && row.city_tier === business.city_tier && row.segment === business.segment,
    ),
    centre:
      centreBusiness && centreProfile
        ? { business: centreBusiness, profile: centreProfile, history: byId(demo.holiday_history, centreBusiness._id) }
        : null,
    publisher_suggestions: byId(demo.publisher_suggestions, id),
    learned: [],
  };
}

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

const drafts = new Map(demo.businesses.map((business) => [business._id, specialDays(contextFor(business._id))]));
const of = (id, type) => (drafts.get(id) ?? []).filter((draft) => draft.type === type);

console.log("C11 detection v2, today = 2026-11-06\n");

// The no-history business and the one that is already right must stay quiet.
check(of("FI-D0013", "special_day_hours").length === 0 && of("FI-D0013", "needs_human").length === 0,
  "FI-D0013 (already entered) gets 0 issues");
check(of("NO-D0015", "special_day_hours").length === 0 && of("NO-D0015", "needs_human").length === 0,
  "NO-D0015 (24/7 gym) gets 0 issues");

// Closed for good: a staff flag, never a suggestion to the owner.
const torniFlags = of("FI-D0011", "needs_human");
check(torniFlags.length === 1, `FI-D0011 gets 1 needs_human issue (got ${torniFlags.length})`);
check(torniFlags[0]?.evidence?.reason === "closed_for_good", "FI-D0011 flag reason is closed_for_good");
check((torniFlags[0]?.evidence?.signals ?? []).length > 0, "FI-D0011 flag carries the signals behind it");
check(of("FI-D0011", "special_day_hours").length === 0, "FI-D0011 gets no owner suggestion");

// The protagonist and the no-history case must get suggestions.
check(of("FI-D0001", "special_day_hours").length > 0, "FI-D0001 gets at least one special-day suggestion");
check(of("FI-D0017", "special_day_hours").length > 0, "FI-D0017 (no history) gets at least one special-day suggestion");

// C14: the suggestion carries what was at stake on that day last season, from the parquet.
const auroraEve = of("FI-D0001", "special_day_hours").find((draft) => draft.evidence.date === "2026-12-24");
check(!!auroraEve, "FI-D0001 has a Christmas Eve suggestion");
check(
  typeof auroraEve?.evidence?.expected_search_views === "number" && auroraEve.evidence.expected_search_views > 0,
  `FI-D0001's Christmas Eve evidence carries last year's Google search views (got ${auroraEve?.evidence?.expected_search_views})`,
);

// Every suggestion must carry usable evidence: one date in the window, valid hours, a basis.
const windowEnd = "2027-01-06";
let evidenceProblems = 0;
for (const [id, list] of drafts) {
  for (const draft of list.filter((row) => row.type === "special_day_hours")) {
    const ev = draft.evidence ?? {};
    if (!(ev.date > TODAY && ev.date <= windowEnd)) evidenceProblems++;
    if (!isValidHours(ev.proposed_hours)) evidenceProblems++;
    if (!isValidHours(ev.displayed_hours)) evidenceProblems++;
    if (!["OWNER_EDIT", "LAST_YEAR", "SHOPPING_CENTRE", "PEERS", "REGULAR"].includes(ev.basis)) evidenceProblems++;
    if (draft.fingerprint !== `${id}:special_day_hours:${ev.date}`) evidenceProblems++;
  }
}
check(evidenceProblems === 0, `every special-day draft has a valid date, hours, basis and fingerprint (${evidenceProblems} problems)`);

console.log("\nPer business:");
for (const [id, list] of drafts) {
  if (list.length === 0) continue;
  const suggestions = list.filter((row) => row.type === "special_day_hours");
  const flag = list.find((row) => row.type === "needs_human");
  const bases = [...new Set(suggestions.map((row) => row.evidence.basis))].join(",") || "—";
  console.log(
    `  ${id.padEnd(8)} suggestions ${String(suggestions.length).padStart(2)}` +
      `${flag ? "  FLAG closed_for_good" : ""}  bases: ${bases}`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
