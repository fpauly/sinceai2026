// Read-only proof of Yext access: `node scripts/yext-check.mjs [entityId]`.
// Prints what the sandbox holds for an entity. Never prints the API key.

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const key = process.env.YEXT_API_KEY;
const base = process.env.YEXT_API_BASE || "https://sbx-api.yextapis.com";
const entityId = process.argv[2] || process.env.YEXT_ACCOUNT_ID || "SinceAI03";

if (!key) {
  console.error("YEXT_API_KEY is missing from .env.local (the key is in the team chat).");
  process.exit(1);
}

const url = new URL(`/v2/accounts/me/entities/${encodeURIComponent(entityId)}`, base);
url.searchParams.set("api_key", key);
url.searchParams.set("v", "20261107");

const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  const detail = body.meta?.errors?.map((e) => e.message).join("; ");
  console.error(`Yext returned ${res.status}${detail ? `: ${detail}` : ""}`);
  process.exit(1);
}

const { name, hours = {}, mainPhone, description } = body.response;
const { holidayHours = [], ...week } = hours;
const show = (h) => (h.isClosed ? "closed" : (h.openIntervals ?? []).map((i) => `${i.start}-${i.end}`).join(", "));

console.log(`Connected to Yext. Entity ${entityId}: ${name}`);
console.log("\nOpening hours");
for (const [day, h] of Object.entries(week)) console.log(`  ${day.padEnd(10)} ${show(h)}`);
console.log("\nHoliday hours");
if (holidayHours.length === 0) console.log("  none");
for (const h of holidayHours) console.log(`  ${h.date} ${show(h)}`);
console.log(`\nPhone: ${mainPhone ?? "none"}`);
console.log(`Description: ${description ?? "none"}`);
