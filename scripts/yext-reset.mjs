// Restores our Yext sandbox entity to its original state (DESIGN 10b): `node scripts/yext-reset.mjs`.
// Run it before the demo. The sandbox is shared, so this undoes everyone's test writes.
// It writes, reads the entity back, and exits with an error if the result doesn't match.
// Never prints the API key.

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const key = process.env.YEXT_API_KEY;
const base = process.env.YEXT_API_BASE || "https://sbx-api.yextapis.com";
const entityId = "SinceAI03"; // Rye & Shine Bakery

if (!key) {
  console.error("YEXT_API_KEY is missing from .env.local (the key is in the team chat).");
  process.exit(1);
}

const open = { openIntervals: [{ start: "10:00", end: "18:00" }] };
const ORIGINAL_HOURS = {
  monday: open,
  tuesday: open,
  wednesday: open,
  thursday: open,
  friday: open,
  saturday: open,
  sunday: { isClosed: true },
};

const url = new URL(`/v2/accounts/me/entities/${entityId}`, base);
url.searchParams.set("api_key", key);
url.searchParams.set("v", "20261107");

async function yext(init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.meta?.errors?.map((e) => e.message).join("; ");
    console.error(`Yext returned ${res.status}${detail ? `: ${detail}` : ""}`);
    process.exit(1);
  }
  return body.response;
}

await yext({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  // holidayHours must be sent as [] to clear it, and null clears the other two fields.
  body: JSON.stringify({ hours: { ...ORIGINAL_HOURS, holidayHours: [] }, mainPhone: null, description: null }),
});

const after = await yext();
const hoursMatch = Object.entries(ORIGINAL_HOURS).every(
  ([day, hours]) => JSON.stringify(after.hours?.[day]) === JSON.stringify(hours),
);
const clean = hoursMatch && !after.hours?.holidayHours?.length && !after.mainPhone && !after.description;

if (!clean) {
  console.error("Reset was sent, but the entity still doesn't match its original state.");
  process.exit(1);
}
console.log(`Reset ${after.name}: Mon-Sat 10:00-18:00, Sunday closed, no holiday hours, phone or description.`);
