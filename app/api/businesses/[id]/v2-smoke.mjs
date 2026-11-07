// D10 integration checks: isolated profile-only fixtures, no Yext mapping, always cleaned up.
// node --env-file=.env.local 'app/api/businesses/[id]/v2-smoke.mjs'
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
const base = process.env.SMOKE_URL ?? "http://localhost:3000";
assert.equal(process.env.MONGODB_DB, "ajantasa_d");
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB);
const id = `d10_test_${randomUUID()}`;
let count = 0;
const regular = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => [day, "09:00-17:00"]));
async function fixture() {
  const key = `${id}:${count++}`;
  const issue = { _id: key, business_id: id, type: "special_day_hours", severity: "high", status: "suggested", created_at: "2026-11-06T08:00:00Z", fingerprint: key,
    evidence: { date: "2026-12-24", day_key: "XMAS_EVE", day_name: { en: "Christmas Eve", local: "jouluaatto" }, weekday: "thu", displayed_hours: "09:00-17:00", displayed_from: "regular", proposed_hours: "10:00-14:00", basis: "LAST_YEAR", confidence: "high", basis_detail: { last_year: { date: "2025-12-24", hours: "10:00-14:00", entered_at: "2025-12-01T08:00:00Z" } } } };
  const suggestion = { _id: key, issue_id: key, business_id: id, proposed_change: { field: "holiday_hours", value: { "2026-12-24": "10:00-14:00" } }, reason: "Last year's hours", confidence: "high", message: { en: "These are last year's hours. We suggest: 24 Dec 10:00–14:00", fi: "Nämä ovat viime vuoden ajat. Ehdotamme: 24.12 10–14" }, audio_url: null, decision: null, decided_at: null, decided_via: null };
  await db.collection("issues").insertOne(issue);
  await db.collection("suggestions").insertOne(suggestion);
  return key;
}
async function decide(key, decision, edited_value) {
  const res = await fetch(`${base}/api/suggestions/${encodeURIComponent(key)}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, via: "tap", ...(edited_value ? { edited_value } : {}) }) });
  return { status: res.status, body: await res.json() };
}
try {
  await db.collection("businesses").insertOne({ _id: id, name: "D10 fixture", owner_name: "Legacy", language: "en", category: "cafe", city: "Helsinki", country: "FI", contact: { first_name: "Aleksi", channel: "SMS", language: "fi", best_contact_window: "12-16", standing_permission_holidays: true, opted_out: false } });
  await db.collection("profiles").insertOne({ _id: id, business_id: id, regular_hours: regular, holiday_hours: { "2026-12-25": "closed" } });
  const accepted = await fixture();
  const result = await decide(accepted, "accepted");
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.synced_sources, []);
  assert.equal(result.body.suggestion.applied.yext, false);
  const profile = await db.collection("profiles").findOne({ _id: id });
  assert.deepEqual(profile.holiday_hours, { "2026-12-25": "closed", "2026-12-24": "10:00-14:00" });
  assert.deepEqual(profile.regular_hours, regular);
  assert.equal(profile.updated_at, result.body.suggestion.decided_at);
  const edited = await fixture();
  for (const value of [{ "2026-12-25": "closed" }, { "2026-12-24": "closed", "2026-12-25": "closed" }]) {
    assert.equal((await decide(edited, "edited", value)).status, 400);
  }
  assert.equal((await decide(edited, "edited", { "2026-12-24": "18:00-02:00" })).status, 200);
  assert.equal((await db.collection("profiles").findOne({ _id: id })).holiday_hours["2026-12-24"], "18:00-02:00");
  const ignored = await fixture();
  const before = await db.collection("profiles").findOne({ _id: id });
  assert.equal((await decide(ignored, "ignored")).status, 200);
  assert.deepEqual(await db.collection("profiles").findOne({ _id: id }), before);
  console.log("PASS profile-only acceptance, date-scoped overnight edit, ignore and existing profile preservation");

  // Generate one real v2 suggestion under standing permission; no external entity is mapped.
  const automatic = await fixture();
  await db.collection("suggestions").deleteOne({ _id: automatic });
  await db.collection("issues").updateOne({ _id: automatic }, { $set: { status: "open" } });
  const generated = await fetch(`${base}/api/suggest?businessId=${id}`, { method: "POST" });
  assert.equal(generated.status, 200);
  const created = (await generated.json()).created;
  assert.equal(created.length, 1);
  assert.equal(created[0].decision, "auto");
  assert.equal(created[0].decided_via, "standing_permission");
  assert.equal((await db.collection("profiles").findOne({ _id: id })).holiday_hours["2026-12-24"], "10:00-14:00");
  const hidden = await fixture();
  await db.collection("issues").updateOne({ _id: hidden }, { $set: { type: "needs_human" } });
  const pending = await fixture();
  await db.collection("suggestions").updateOne({ _id: pending }, { $set: { _decision: { token: "private" } } });
  const owner = await (await fetch(`${base}/api/businesses/${id}`)).json();
  assert.equal(owner.profile.business_id, id);
  assert.equal(owner.listings.length, 0);
  assert.deepEqual(owner.suggestions.map(s => s._id), [pending]);
  assert.ok(!("_decision" in owner.suggestions[0]));
  assert.equal(owner.automatically_applied.length, 1);
  assert.equal(owner.automatically_applied[0].decision, "auto");
  assert.ok(owner.automatically_applied.every(s => s.issue.type !== "needs_human" && !("_decision" in s)));
  console.log("PASS real standing-permission auto-apply, owner profile and automatic history, staff issues and private state hidden");
} finally {
  for (const name of ["issues", "suggestions", "preferences", "profiles", "listings"]) await db.collection(name).deleteMany({ business_id: id });
  await db.collection("businesses").deleteOne({ _id: id });
  await client.close();
}
