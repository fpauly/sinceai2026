// D12: run with the dev server and the lane D database. No Yext entity mapping.
// node --env-file=.env.local 'app/api/suggestions/[id]/reply/smoke.mjs'
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
const base = process.env.SMOKE_URL ?? "http://localhost:3000";
assert.equal(process.env.MONGODB_DB, "ajantasa_d");
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB);
const id = `d12_test_${randomUUID()}`;
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

async function reply(key, body, raw = false) {
  const response = await fetch(`${base}/api/suggestions/${encodeURIComponent(key)}/reply`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body),
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, data: await response.json() };
}
async function snapshot() {
  return Promise.all(["issues", "suggestions", "profiles", "preferences"].map(name => db.collection(name).find({ business_id: id }).sort({ _id: 1 }).toArray()));
}
try {
  await db.collection("businesses").insertOne({ _id: id, name: "D12 test", owner_name: "Test", language: "en", category: "cafe", city: "Helsinki", country: "FI", contact: { first_name: "Test", channel: "SMS", language: "fi", best_contact_window: "12-16", standing_permission_holidays: false, opted_out: false } });
  await db.collection("profiles").insertOne({ _id: id, business_id: id, regular_hours: regular, holiday_hours: {} });
  const key = await fixture();
  const before = await snapshot();
  for (const [text, expected] of [["yes", "accept"], ["no thanks", "ignore"], ["What is the weather on Mars?", "unclear"]]) {
    const result = await reply(key, { text });
    assert.equal(result.status, 200);
    assert.equal(result.data.intent, expected);
    assert.ok(result.data.confirmation_text);
    assert.deepEqual(await snapshot(), before, "Parsing must never write a decision or profile");
  }
  const edit = await reply(key, { text: "24.12 8–12" });
  assert.equal(edit.status, 200);
  if (edit.data.intent === "edit") assert.deepEqual(edit.data.edited_value, { "2026-12-24": "08:00-12:00" });
  else {
    assert.equal(edit.data.intent, "unclear");
    console.log("LIMITATION: hours text uses the Edit fallback without a successful Gemini parse");
  }
  assert.deepEqual(await snapshot(), before);
  for (const body of [{}, { text: " " }, { text: "a".repeat(2001) }, { text: "yes", decision: "accepted" }]) assert.equal((await reply(key, body)).status, 400);
  assert.equal((await reply(key, "{", true)).status, 400);
  assert.equal((await reply(`${id}:missing`, { text: "yes" })).status, 404);
  const hidden = await fixture();
  await db.collection("issues").updateOne({ _id: hidden }, { $set: { type: "needs_human" } });
  assert.equal((await reply(hidden, { text: "yes" })).status, 409);
  const pending = await fixture();
  await db.collection("suggestions").updateOne({ _id: pending }, { $set: { _decision: { token: "private" } } });
  assert.equal((await reply(pending, { text: "yes" })).status, 409);
  await db.collection("businesses").updateOne({ _id: id }, { $set: { "contact.opted_out": true } });
  assert.equal((await reply(key, { text: "yes" })).status, 409);
  await db.collection("businesses").updateOne({ _id: id }, { $set: { "contact.opted_out": false } });
  console.log("PASS parse-only accept/decline/unclear, input bounds, staff/opt-out/pending protections, no DB mutation");

  // Only a separate, explicit confirmation can apply the previously parsed choice.
  const confirmed = await fetch(`${base}/api/suggestions/${encodeURIComponent(key)}/decide`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "accepted", via: "tap" }),
  });
  assert.equal(confirmed.status, 200);
  assert.equal((await db.collection("profiles").findOne({ _id: id })).holiday_hours["2026-12-24"], "10:00-14:00");
  assert.equal((await reply(key, { text: "yes" })).status, 409);
  const decline = await fixture();
  const profile = await db.collection("profiles").findOne({ _id: id });
  const declined = await fetch(`${base}/api/suggestions/${encodeURIComponent(decline)}/decide`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "ignored", via: "tap" }),
  });
  assert.equal(declined.status, 200);
  assert.deepEqual(await db.collection("profiles").findOne({ _id: id }), profile);
  console.log("PASS separate confirmation applies once, decided replies rejected, confirmed decline leaves hours unchanged");
} finally {
  for (const name of ["issues", "suggestions", "preferences", "profiles"]) await db.collection(name).deleteMany({ business_id: id });
  await db.collection("businesses").deleteOne({ _id: id });
  await client.close();
}
