// Run after npm run smoke, with the dev server running:
// node --env-file=.env.local 'app/api/suggestions/[id]/decide/smoke.mjs'
// Own-lane API checks. Fixtures have no Yext mapping and are removed in finally.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const base = process.env.SMOKE_URL ?? "http://localhost:3000";
assert.equal(process.env.MONGODB_DB, "ajantasa_d", "Use the lane D demo database for this test");
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);
const businessId = `d3_test_${randomUUID()}`;
const ids = [];
const sources = ["finder", "google", "website"];
const opening = { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "10:00-14:00", sun: "closed" };

async function fixture(name, change = { field: "holiday_hours", value: { "2026-12-24": "09:00-13:00" } }) {
  const id = `${businessId}:${name}`;
  ids.push(id);
  const issue = {
    _id: id, business_id: businessId, type: "missing_holiday_hours", severity: "high",
    evidence: { dates: ["2026-12-24"], holiday_names: { "2026-12-24": "Christmas Eve" }, last_year: {} },
    status: "suggested", created_at: "2026-12-10T08:00:00Z", fingerprint: `${id}:fingerprint`,
  };
  const suggestion = {
    _id: id, issue_id: id, business_id: businessId, proposed_change: change,
    reason: "Holiday hours are missing", confidence: "low",
    message: { en: "Would these holiday hours suit you?", fi: "Sopisivatko nämä pyhäaukioloajat?" },
    audio_url: null, decision: null, decided_via: null, decided_at: null,
  };
  await db.collection("issues").insertOne(issue);
  await db.collection("suggestions").insertOne(suggestion);
  return id;
}

async function decide(id, body, raw = false) {
  const response = await fetch(`${base}/api/suggestions/${encodeURIComponent(id)}/decide`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

try {
  await db.collection("businesses").insertOne({ _id: businessId, name: "D3 test business", owner_name: "Test", category: "bakery", city: "Turku", language: "en", preferred_channel: "app" });
  await db.collection("listings").insertMany(sources.map((source) => ({
    _id: `${businessId}:${source}`, business_id: businessId, source, opening_hours: opening,
    holiday_hours: { "2025-12-24": "09:00-13:00" }, phone: "+358 2 100 1234", description: "Test bakery",
    field_updated_at: { opening_hours: "2026-10-01", holiday_hours: "2026-10-01", description: "2026-10-01" },
  })));

  const accepted = await fixture("accepted");
  assert.equal((await fetch(`${base}/api/suggestions/${encodeURIComponent(accepted)}/decide`)).status, 204);
  const result = await decide(accepted, { decision: "accepted", via: "tap" });
  assert.equal(result.status, 200);
  assert.equal(result.body.suggestion.decision, "accepted");
  assert.equal(result.body.suggestion.applied.yext, false);
  assert.ok(result.body.suggestion.applied.error);
  assert.deepEqual([...result.body.synced_sources].sort(), [...sources].sort());
  for (const listing of await db.collection("listings").find({ business_id: businessId }).toArray()) {
    assert.equal(listing.holiday_hours["2026-12-24"], "09:00-13:00");
    assert.equal(listing.holiday_hours["2025-12-24"], "09:00-13:00");
    assert.deepEqual(listing.opening_hours, opening);
    assert.equal(listing.field_updated_at.holiday_hours, result.body.suggestion.decided_at.slice(0, 10));
  }
  assert.equal((await db.collection("issues").findOne({ _id: accepted })).status, "resolved");
  assert.equal((await db.collection("suggestions").findOne({ _id: accepted })).decided_via, "tap");
  assert.equal((await decide(accepted, { decision: "ignored", via: "tap" })).status, 409);
  let prefs = await db.collection("preferences").findOne({ _id: businessId });
  assert.equal(prefs.learned.length, 1);
  assert.equal(prefs.learned[0].decision, "accepted");
  assert.deepEqual(prefs.learned[0].proposed, { "2026-12-24": "09:00-13:00" });
  assert.deepEqual(prefs.learned[0].final, prefs.learned[0].proposed);
  assert.equal(prefs.standing_permissions?.length ?? 0, 0);
  console.log("PASS accept: all channels merged, existing data preserved, issue resolved, Yext fallback, replay blocked");

  const ignored = await fixture("ignored");
  const beforeIgnore = await db.collection("listings").find({ business_id: businessId }).toArray();
  const ignoreResult = await decide(ignored, { decision: "ignored", via: "tap" });
  assert.equal(ignoreResult.status, 200);
  assert.deepEqual(ignoreResult.body.synced_sources, []);
  assert.equal(ignoreResult.body.suggestion.applied, null);
  assert.equal((await db.collection("issues").findOne({ _id: ignored })).status, "ignored");
  assert.ok((await db.collection("preferences").findOne({ _id: businessId })).ignored_fingerprints.includes(`${ignored}:fingerprint`));
  assert.deepEqual(await db.collection("listings").find({ business_id: businessId }).toArray(), beforeIgnore);
  prefs = await db.collection("preferences").findOne({ _id: businessId });
  assert.equal(prefs.learned.length, 2);
  assert.equal(prefs.learned.find((item) => item.decision === "ignored").final, null);
  assert.equal(prefs.standing_permissions?.length ?? 0, 0);
  const owner = await (await fetch(`${base}/api/businesses/${businessId}`)).json();
  assert.equal(owner.suggestions.length, 0);
  console.log("PASS ignore: fingerprint stored, listings unchanged, decided cards removed from owner API");

  const concurrent = await fixture("concurrent");
  const results = await Promise.all(["accepted", "ignored"].map((decision) => decide(concurrent, { decision, via: "tap" })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const saved = await db.collection("suggestions").findOne({ _id: concurrent });
  assert.equal((await db.collection("issues").findOne({ _id: concurrent })).status, saved.decision === "ignored" ? "ignored" : "resolved");
  console.log("PASS concurrent decisions: only one request wins");

  const invalid = await fixture("invalid", { field: "holiday_hours", value: { "2026-12-24": "25:00-26:00" } });
  assert.equal((await decide(invalid, { decision: "accepted", via: "tap" })).status, 400);
  assert.equal((await db.collection("suggestions").findOne({ _id: invalid })).decided_at, null);
  assert.equal((await decide(invalid, { decision: "auto", via: "tap" })).status, 400);
  assert.equal((await decide(invalid, { decision: "edited", via: "tap" })).status, 400);
  assert.equal((await decide(invalid, { decision: "accepted", via: "tap", standing_permission: true })).status, 400);
  assert.equal((await decide(invalid, "{", true)).status, 400);
  assert.equal((await decide(`${businessId}:missing`, { decision: "accepted", via: "tap" })).status, 404);
  assert.equal((await decide(invalid, { decision: "ignored", via: "tap", standing_permission: true })).status, 400);
  console.log("PASS malformed JSON, invalid proposals/requests, permission on ignore rejected and missing suggestions");

  const edited = await fixture("edited");
  const edit = await decide(edited, { decision: "edited", via: "tap", edited_value: { "2026-12-24": "11:00-15:00" }, standing_permission: true });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.suggestion.proposed_change.value["2026-12-24"], "11:00-15:00");
  prefs = await db.collection("preferences").findOne({ _id: businessId });
  const editLearning = prefs.learned.find((item) => item.decision === "edited");
  assert.deepEqual(editLearning.proposed, { "2026-12-24": "09:00-13:00" });
  assert.deepEqual(editLearning.final, { "2026-12-24": "11:00-15:00" });
  assert.deepEqual(prefs.standing_permissions, [{ issue_type: "missing_holiday_hours", field: "holiday_hours" }]);
  for (const listing of await db.collection("listings").find({ business_id: businessId }).toArray()) {
    assert.equal(listing.holiday_hours["2026-12-24"], "11:00-15:00");
  }
  const permitted = await fixture("repeat-permission");
  assert.equal((await decide(permitted, { decision: "accepted", via: "tap", standing_permission: true })).status, 200);
  prefs = await db.collection("preferences").findOne({ _id: businessId });
  assert.equal(prefs.standing_permissions.length, 1);
  console.log("PASS edits preserve original/final learning, update listings, opt-in permission stored once");

  // A reload must recover the exact confirmed edit and opt-in flag after a failed save.
  const reloadEdit = await fixture("reload-edit");
  const originalPrefs = await db.collection("preferences").findOne({ _id: businessId });
  await db.collection("preferences").updateOne({ _id: businessId }, { $set: { learned: "broken test data" } });
  const submitted = { decision: "edited", via: "tap", edited_value: { "2026-12-24": "12:00-16:00" }, standing_permission: true };
  assert.equal((await decide(reloadEdit, submitted)).status, 500);
  const pendingResponse = await fetch(`${base}/api/suggestions/${encodeURIComponent(reloadEdit)}/decide`);
  assert.equal(pendingResponse.status, 200);
  assert.equal(pendingResponse.headers.get("cache-control"), "no-store");
  const recoveredRequest = await pendingResponse.json();
  assert.deepEqual(recoveredRequest, submitted); // No lease token or internal state exposed.
  await db.collection("preferences").updateOne({ _id: businessId }, { $set: { learned: originalPrefs.learned } });
  assert.equal((await decide(reloadEdit, recoveredRequest)).status, 200);
  assert.equal((await fetch(`${base}/api/suggestions/${encodeURIComponent(reloadEdit)}/decide`)).status, 204);
  const learnedReload = (await db.collection("preferences").findOne({ _id: businessId })).learned.filter((item) => item.final?.["2026-12-24"] === "12:00-16:00");
  assert.equal(learnedReload.length, 1);
  assert.deepEqual(learnedReload[0].proposed, { "2026-12-24": "09:00-13:00" });
  console.log("PASS failed edit recovered after reload with exact values and permission; no duplicate learning");

  // A real DB write failure must release its lease and permit the same decision to resume.
  const failedIgnore = await fixture("failed-ignore");
  await db.collection("preferences").updateOne({ _id: businessId }, { $set: { ignored_fingerprints: "broken test data" } });
  assert.equal((await decide(failedIgnore, { decision: "ignored", via: "tap" })).status, 500);
  const failed = await db.collection("suggestions").findOne({ _id: failedIgnore });
  assert.equal(failed.decision, null);
  assert.ok(failed._decision.lease_until <= new Date().toISOString());
  const failedOwner = await (await fetch(`${base}/api/businesses/${businessId}`)).json();
  assert.ok(!("_decision" in failedOwner.suggestions.find((s) => s._id === failedIgnore)));
  await db.collection("preferences").updateOne({ _id: businessId }, { $set: { ignored_fingerprints: [] } });
  assert.equal((await decide(failedIgnore, { decision: "ignored", via: "tap" })).status, 200);
  assert.ok(!(await db.collection("suggestions").findOne({ _id: failedIgnore }))._decision);
  console.log("PASS actual DB failure releases lease, same request recovers, private state stays out of owner API");

  async function interrupted(name, extra = {}) {
    const id = await fixture(name);
    await db.collection("suggestions").updateOne({ _id: id }, { $set: { _decision: {
      request: { decision: "accepted", via: "tap" }, token: "interrupted-worker",
      at: new Date(Date.now() - 120_000).toISOString(), lease_until: new Date(Date.now() - 60_000).toISOString(), ...extra,
    } } });
    return id;
  }
  const expired = await interrupted("expired-lease");
  assert.equal((await decide(expired, { decision: "ignored", via: "tap" })).status, 409);
  assert.equal((await decide(expired, { decision: "accepted", via: "tap" })).status, 200);
  const uncertain = await interrupted("uncertain-publication", { publishing: true });
  const recovered = await decide(uncertain, { decision: "accepted", via: "tap" });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.suggestion.applied.yext, false);
  assert.match(recovered.body.suggestion.applied.error, /unconfirmed/);
  assert.ok(!("_decision" in recovered.body.suggestion));
  const published = { yext: true, published_to: ["Test publisher"], at: "2026-11-07T09:00:00.000Z" };
  const persisted = await interrupted("persisted-publication", { publishing: true, publication: published });
  // Simulate a crash after the learning write but before finalizing the suggestion.
  const retryAt = (await db.collection("suggestions").findOne({ _id: persisted }))._decision.at;
  const alreadyLearned = { issue_type: "missing_holiday_hours", field: "holiday_hours", proposed: { "2026-12-24": "09:00-13:00" }, final: { "2026-12-24": "09:00-13:00" }, decision: "accepted", at: retryAt };
  await db.collection("preferences").updateOne({ _id: businessId }, { $addToSet: { learned: alreadyLearned } });
  await db.collection("issues").updateOne({ _id: persisted }, { $set: { status: "resolved" } });
  const finalized = await decide(persisted, { decision: "accepted", via: "tap" });
  assert.equal(finalized.status, 200);
  assert.deepEqual(finalized.body.suggestion.applied, published);
  prefs = await db.collection("preferences").findOne({ _id: businessId });
  assert.equal(prefs.learned.filter((item) => item.at === retryAt).length, 1);
  console.log("PASS expired crash lease, original decision pinned, publication result reused and learning not duplicated on recovery");

  for (const hours of ["10:00-14:00,17:00-22:00", "18:00-02:00", "00:00-23:59"]) {
    for (const decision of ["accepted", "edited"]) {
      const id = await fixture(`hours-${decision}-${hours}`, { field: "holiday_hours", value: { "2026-12-24": hours } });
      const result = await decide(id, { decision, via: "tap", ...(decision === "edited" ? { edited_value: { "2026-12-24": hours } } : {}) });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      for (const listing of await db.collection("listings").find({ business_id: businessId }).toArray()) {
        assert.equal(listing.holiday_hours["2026-12-24"], hours);
      }
    }
  }
  for (const hours of ["25:00-26:00", "10:00-14:00,13:00-16:00", ""]) {
    const id = await fixture(`bad-hours-${hours}`, { field: "holiday_hours", value: { "2026-12-24": hours } });
    const before = await db.collection("listings").find({ business_id: businessId }).toArray();
    for (const decision of ["accepted", "edited"]) {
      assert.equal((await decide(id, { decision, via: "tap", ...(decision === "edited" ? { edited_value: { "2026-12-24": hours } } : {}) })).status, 400);
    }
    assert.deepEqual(await db.collection("listings").find({ business_id: businessId }).toArray(), before);
    assert.equal((await db.collection("suggestions").findOne({ _id: id })).decision, null);
  }
  console.log("PASS split, overnight and 24-hour acceptance/edits; invalid, blank and overlapping hours rejected without writes");

  const invented = await fixture("invented-dates", { field: "holiday_hours", value: { "2026-12-31": "closed" } });
  assert.equal((await decide(invented, { decision: "edited", via: "tap", edited_value: { "2026-12-31": "10:00-14:00" } })).status, 400);
  // Correcting the bad proposal to the actual evidence date is allowed.
  assert.equal((await decide(invented, { decision: "edited", via: "tap", edited_value: { "2026-12-24": "10:00-14:00" } })).status, 200);
  const wrongField = await fixture("wrong-field", { field: "phone", value: "+358 2 100 5678" });
  assert.equal((await decide(wrongField, { decision: "edited", via: "tap", edited_value: "+358 2 100 9999" })).status, 400);
  const wrongDay = await fixture("wrong-day", { field: "opening_hours", value: { mon: "closed" } });
  await db.collection("issues").updateOne({ _id: wrongDay }, { $set: {
    type: "cross_platform_conflict", evidence: { field: "opening_hours.sat", values: [] },
  } });
  assert.equal((await decide(wrongDay, { decision: "edited", via: "tap", edited_value: { mon: "09:00-12:00" } })).status, 400);
  // Owners can choose a new value for the correct day; it need not match a stale source.
  assert.equal((await decide(wrongDay, { decision: "edited", via: "tap", edited_value: { sat: "11:00-15:00" } })).status, 200);
  console.log("PASS edited dates, fields and days match issue evidence; legitimate owner corrections allowed");
} finally {
  await db.collection("suggestions").deleteMany({ _id: { $in: ids } });
  await db.collection("issues").deleteMany({ _id: { $in: ids } });
  await db.collection("listings").deleteMany({ business_id: businessId });
  await db.collection("preferences").deleteOne({ _id: businessId });
  await db.collection("businesses").deleteOne({ _id: businessId });
  await client.close();
}
