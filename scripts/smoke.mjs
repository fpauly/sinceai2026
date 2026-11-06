// End-to-end smoke test against a RUNNING app (npm run dev) with a real MongoDB.
// Usage: npm run smoke            (default http://localhost:3000)
//        SMOKE_URL=http://localhost:3123 npm run smoke
//
// Steps whose API route does not exist yet (404) are SKIPPED, so this works at every milestone.
// Each lane extends this file with checks for its own routes (shared file: use a shared/* PR).
// WARNING: it calls /api/seed, which wipes the database named in your .env.local.

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
let failed = 0;
let passed = 0;
let skipped = 0;

const ok = (msg) => { passed++; console.log(`  ✓ ${msg}`); };
const bad = (msg) => { failed++; console.log(`  ✗ ${msg}`); };
const skip = (msg) => { skipped++; console.log(`  - SKIP ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

async function call(method, path) {
  const res = await fetch(BASE + path, { method });
  if (res.status === 404) return { missing: true };
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

// ---------- M1: seed ----------
async function seed() {
  console.log("M1 seed");
  const r = await call("POST", "/api/seed");
  if (r.missing) return bad("/api/seed missing");
  check(r.status === 200 && r.json?.ok, `POST /api/seed → 200 ok (got ${r.status})`);
  const c = r.json?.counts ?? {};
  check(c.businesses === 8 && c.listings === 24 && c.reviews === 12,
    `seed counts 8/24/12 (got ${c.businesses}/${c.listings}/${c.reviews})`);
}

// ---------- M2: detection (rules 1, 2, 4) — TASKS.md lane C acceptance table ----------
const EXPECTED_ISSUES = [
  "rye_shine|missing_holiday_hours|2026-12-24,2026-12-25,2026-12-26,2027-01-01,2027-01-06",
  "rye_shine|cross_platform_conflict|opening_hours.sat",
  "rye_shine|stale_field|description",
  "parturi_linnankatu|missing_holiday_hours|2026-12-24,2026-12-25,2026-12-26,2027-01-01,2027-01-06",
  "autokorjaamo_skanssi|cross_platform_conflict|phone",
  "kukkakauppa_kauppatori|stale_field|opening_hours",
  "kirjakauppa_aurajoki|cross_platform_conflict|opening_hours.sat",
  "kuntosali_itaharju|missing_holiday_hours|2027-01-01",
];

function issueKey(i) {
  const e = i.evidence ?? {};
  const detail = i.type === "missing_holiday_hours" ? (e.dates ?? []).join(",") : e.field;
  return `${i.business_id}|${i.type}|${detail}`;
}

async function detect() {
  console.log("M2 detect");
  const r = await call("POST", "/api/detect");
  if (r.missing) return skip("/api/detect not implemented yet");
  check(r.status === 200 && r.json?.ok, `POST /api/detect → 200 ok (got ${r.status})`);
  // M6 adds review_signal issues; rules 1, 2, 4 are checked exactly.
  const created = (r.json?.created ?? []).filter((i) => i.type !== "review_signal");
  const got = new Set(created.map(issueKey));
  // A rule that produced no issues at all is treated as "not implemented yet" and skipped.
  const typesSeen = new Set(created.map((i) => i.type));
  for (const type of new Set(EXPECTED_ISSUES.map((k) => k.split("|")[1]))) {
    if (!typesSeen.has(type)) { skip(`${type} rule not implemented yet`); continue; }
    for (const k of EXPECTED_ISSUES.filter((k) => k.split("|")[1] === type)) check(got.has(k), `issue ${k}`);
  }
  const extra = [...got].filter((k) => !EXPECTED_ISSUES.includes(k));
  check(extra.length === 0, `no unexpected issues${extra.length ? ": " + extra.join("; ") : ""}`);
  check(!created.some((i) => i.business_id === "leipomo_martti"), "leipomo_martti has 0 issues");

  const again = await call("POST", "/api/detect");
  check((again.json?.created ?? []).length === 0, "second /api/detect creates 0 new issues");
}

// ---------- add later milestones below (suggest, owner view, decide, dashboard) ----------

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  try {
    await fetch(BASE);
  } catch {
    console.log(`Cannot reach ${BASE}. Start the app first: npm run dev`);
    process.exit(2);
  }
  await seed();
  await detect();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}

main();
