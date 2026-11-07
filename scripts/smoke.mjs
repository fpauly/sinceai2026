// End-to-end smoke test against a RUNNING app (npm run dev) with a real MongoDB.
// Usage: npm run smoke            (default http://localhost:3000)
//        SMOKE_URL=http://localhost:3123 npm run smoke
//
// Steps whose API route does not exist yet (404) are SKIPPED, so this works at every milestone.
// Each lane extends this file with checks for its own routes (shared file: use a shared/* PR).
// WARNING: it calls /api/seed, which wipes the database named in your .env.local. The v2 block
// runs last and re-seeds the v1 demo data, so it leaves the database in the demo state.

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

// ---------- M8: dashboard (lane C) ----------
async function dashboard() {
  console.log("M8 dashboard");
  const r = await call("GET", "/api/businesses");
  if (r.missing) return skip("/api/businesses not implemented yet");
  const rows = Array.isArray(r.json) ? r.json : [];
  check(r.status === 200 && rows.length === 8, `GET /api/businesses → 8 rows (got ${r.status}, ${rows.length})`);
  const rye = rows.find((row) => row?.business?._id === "rye_shine");
  check(!!rye, "rye_shine is in the list");
  check(!!rye?.open_issues && typeof rye.open_issues.high === "number", "row counts open_issues by severity");
  check(!!rye && "last_decision" in rye, "row has last_decision");

  const page = await fetch(`${BASE}/dashboard`);
  check(
    page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html"),
    `GET /dashboard → 200 html (got ${page.status})`,
  );
}

// ---------- v2 (Fonecta dataset): seed the demo cast and check detection (C13) ----------
async function v2() {
  console.log("v2 seed + detect (Fonecta dataset)");
  const r = await call("POST", "/api/seed?source=fonecta");
  if (r.missing) return skip("/api/seed?source=fonecta not implemented yet");
  check(r.status === 200 && r.json?.ok, `POST /api/seed?source=fonecta → 200 ok (got ${r.status})`);
  const c = r.json?.counts ?? {};
  check(
    c.businesses === 32 && c.profiles === 32,
    `v2 cast 32 businesses / 32 profiles (got ${c.businesses}/${c.profiles})`,
  );
  check(
    c.holiday_history >= 1000 && c.special_days >= 240 && c.peers >= 400 &&
      c.reviews >= 200 && c.publisher_suggestions >= 40,
    `v2 extract has history/calendar/peers/reviews/publisher edits (got ${c.holiday_history}/${c.special_days}/${c.peers}/${c.reviews}/${c.publisher_suggestions})`,
  );

  const d = await call("POST", "/api/detect");
  if (d.missing) return skip("/api/detect not implemented yet");
  check(d.status === 200 && d.json?.ok, `v2 POST /api/detect → 200 ok (got ${d.status})`);
  const issues = d.json?.created ?? [];
  const types = [...new Set(issues.map((i) => i.type))];
  check(issues.length > 0, `v2 detection creates issues (got ${issues.length})`);
  check(
    types.every((t) => t === "special_day_hours" || t === "needs_human"),
    `v2 issue types are special_day_hours / needs_human (got ${types.join(", ") || "none"})`,
  );

  const per = (id, type) => issues.filter((i) => i.business_id === id && i.type === type);
  const torni = per("FI-D0011", "needs_human");
  check(
    torni.length === 1 && torni[0]?.evidence?.reason === "closed_for_good",
    "FI-D0011 is flagged closed_for_good",
  );
  check(per("FI-D0011", "special_day_hours").length === 0, "FI-D0011 gets no owner suggestion");
  check(
    per("FI-D0013", "special_day_hours").length === 0 && per("FI-D0013", "needs_human").length === 0,
    "FI-D0013 (already entered) gets 0 issues",
  );
  check(
    per("NO-D0015", "special_day_hours").length === 0 && per("NO-D0015", "needs_human").length === 0,
    "NO-D0015 (24/7 gym) gets 0 issues",
  );
  check(per("FI-D0001", "special_day_hours").length > 0, "FI-D0001 gets special-day suggestions");
  check(per("FI-D0017", "special_day_hours").length > 0, "FI-D0017 (no history) gets special-day suggestions");

  const again = await call("POST", "/api/detect");
  check((again.json?.created ?? []).length === 0, "second v2 /api/detect creates 0 new issues");

  // Leave the database on the v1 demo data (DESIGN 0 "v2": the seed is still the demo until V2).
  await call("POST", "/api/seed");
}

// ---------- add later milestones below (suggest, owner view, decide) ----------

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
  await dashboard();
  await v2();
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}

main();
