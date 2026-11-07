// Export the customer messages Connect would send, from the REAL suggestions in the database,
// to docs/customer-messages.md (Fonecta deliverable, DESIGN 18; stage A7).
//
// Usage:
//   node scripts/export-messages.mjs           export what is in the DB now
//   node scripts/export-messages.mjs --fresh   first run the chain on a running app:
//                                              POST /api/seed, /api/detect, /api/suggest
//                                              (wipes your DB; app at EXPORT_URL or localhost:3000)
// Reads MONGODB_URI / MONGODB_DB from .env.local. Never prints keys.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const BASE = process.env.EXPORT_URL ?? "http://localhost:3000";
const OUT = "docs/customer-messages.md";
const fresh = process.argv.includes("--fresh");

async function post(path) {
  const res = await fetch(BASE + path, { method: "POST" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(`POST ${path} -> ${res.status} ${json?.error ?? ""}`);
  return json;
}

if (fresh) {
  try {
    await fetch(BASE);
  } catch {
    console.error(`Cannot reach ${BASE}. Start the app first: npm run dev`);
    process.exit(2);
  }
  await post("/api/seed");
  const d = await post("/api/detect");
  const s = await post("/api/suggest");
  console.log(`fresh run: ${d.created.length} issues, ${s.created.length} suggestions`);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is missing from .env.local");
  process.exit(1);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB || "ajantasa");
const [businesses, issues, suggestions] = await Promise.all([
  db.collection("businesses").find().toArray(),
  db.collection("issues").find().toArray(),
  db.collection("suggestions").find().toArray(),
]);
await client.close();

// ---------- formatting ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const SOURCE = { finder: "Finder", google: "Google", website: "own website" };
const CHANNEL = { whatsapp: "WhatsApp", voice: "Voice call", sms: "SMS", app: "Connect app" };
const TYPE = {
  missing_holiday_hours: "Missing holiday hours",
  cross_platform_conflict: "Listings disagree",
  stale_field: "Not updated for over a year",
  review_signal: "Reviews point to wrong information",
};
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const date = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
};
const hours = (h) => (h === "closed" ? "closed" : String(h).replace("-", "–"));
const quote = (text) => String(text).split("\n").map((l) => `> ${l}`).join("\n");

function keyLabel(key) {
  if (DAY[key]) return DAY[key];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? date(key) : key;
}

function showValue(value) {
  if (value && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${keyLabel(k)} ${hours(v)}`).join(", ");
  }
  return String(value);
}

/** "the data that told Connect", one line per fact. */
function evidenceLines(issue) {
  const e = issue.evidence ?? {};
  switch (issue.type) {
    case "missing_holiday_hours": {
      const names = e.holiday_names ?? {};
      const last = Object.entries(e.last_year ?? {});
      return [
        `Upcoming holidays with no hours on any listing: ${(e.dates ?? []).map((d) => `${names[d] ?? d} (${date(d)})`).join(", ")}`,
        last.length
          ? `Last season's hours on the listings: ${last.map(([d, h]) => `${date(d)} ${hours(h)}`).join(", ")}`
          : "Last season's hours for these dates: **none** (no history for them, see docs/no-history.md)",
      ];
    }
    case "cross_platform_conflict":
      return [
        `Field: \`${e.field}\``,
        ...(e.values ?? []).map(
          (v) => `${SOURCE[v.source] ?? v.source}: ${hours(v.value)}${v.updated_at ? ` (updated ${date(v.updated_at)})` : ""}`,
        ),
      ];
    case "stale_field":
      return [
        `Field: \`${e.field}\`, last updated ${date(e.oldest_update)} (${e.days_old} days ago) on ${(e.stale_sources ?? []).map((s) => SOURCE[s] ?? s).join(", ")}`,
      ];
    case "review_signal":
      return [`${e.summary ?? ""}`, ...(e.reviews ?? []).map((r) => `Review ${r.date}, ${r.rating}★: "${r.text}"`)];
    default:
      return [JSON.stringify(e)];
  }
}

// ---------- document ----------

const byId = new Map(businesses.map((b) => [b._id, b]));
const issueById = new Map(issues.map((i) => [i._id, i]));
const rows = suggestions
  .map((s) => ({ s, issue: issueById.get(s.issue_id), business: byId.get(s.business_id) }))
  .filter((r) => r.issue && r.business)
  .sort(
    (a, b) =>
      (a.business._id === "rye_shine" ? 0 : 1) - (b.business._id === "rye_shine" ? 0 : 1) ||
      a.business.name.localeCompare(b.business.name) ||
      (SEVERITY_ORDER[a.issue.severity] ?? 9) - (SEVERITY_ORDER[b.issue.severity] ?? 9),
  );

const bySource = rows.reduce((acc, r) => ((acc[r.s.source ?? "?"] = (acc[r.s.source ?? "?"] ?? 0) + 1), acc), {});
const valid = rows.filter((r) => r.s.validation?.ok).length;
const demoDate = process.env.DEMO_DATE || "2026-12-10";
const quiet = businesses.filter((b) => !rows.some((r) => r.business._id === b._id)).map((b) => b.name);

const out = [];
out.push(
  "# Customer messages",
  "",
  "The messages Fonecta Connect sends to business owners, **exported from real suggestions** generated by the app",
  "(`node scripts/export-messages.mjs --fresh`: seed → `/api/detect` → `/api/suggest`). Do not edit by hand; re-export instead.",
  "",
  `- Demo date ("today" for detection): **${date(demoDate)}**`,
  `- Exported: ${new Date().toISOString().slice(0, 10)}, ${rows.length} suggestions for ${new Set(rows.map((r) => r.business._id)).size} businesses`,
  `- Written by: ${Object.entries(bySource).map(([k, n]) => `${n} × ${k === "gemini" ? "Gemini" : k === "fallback" ? "template (fallback)" : k}`).join(", ")}`,
  `- Validated by code (\`lib/validate.ts\`): ${valid} of ${rows.length} passed`,
  quiet.length ? `- No message (nothing to fix): ${quiet.join(", ")}` : "",
  "",
  "## How a message is made",
  "",
  "1. **Code detects** the issue and collects the evidence (holiday calendar, last season's hours, the three listings).",
  "2. **Code proposes** the value and the confidence: last year's hours for the same days; for a conflict, the most recently updated listing (majority for phone);",
  "   with no history, the common pattern for the category with confidence *low*.",
  "3. **Gemini writes** the reason and the message in English and Finnish, from that evidence and proposal.",
  "4. **Code validates** every draft (hours format, only the issue's dates, only values seen in the sources, at most 2 sentences).",
  "   If Gemini fails or its draft is invalid, a fixed template from `lib/ai/fallback.ts` is used instead.",
  "5. **The owner decides**: accept, edit or ignore with one tap (or a voice reply). Nothing is published without that, except a standing permission the owner gave.",
  "",
  "The demo is in English; the Finnish version is stored for every message (`message.fi`).",
  "",
);

let current = null;
for (const { s, issue, business } of rows) {
  if (business._id !== current) {
    current = business._id;
    out.push(
      `## ${business.name}`,
      "",
      `${business.owner_name} · ${business.category.replace("_", " ")} · ${business.city} · channel: **${CHANNEL[business.preferred_channel] ?? business.preferred_channel}**`,
      "",
    );
  }
  const v = s.validation;
  out.push(
    `### ${TYPE[issue.type] ?? issue.type} (${issue.severity})`,
    "",
    "**The data that told Connect**",
    "",
    ...evidenceLines(issue).map((l) => `- ${l}`),
    "",
    `**Proposed change:** \`${s.proposed_change.field}\` → ${showValue(s.proposed_change.value)}  `,
    `**Confidence:** ${s.confidence}${s.confidence === "low" ? " (shown to the owner as \"please check\")" : ""} · **Written by:** ${s.source === "gemini" ? "Gemini" : "template"} · **Validation:** ${v ? (v.ok ? "passed" : `failed: ${v.problems.join("; ")}`) : "not run"}  `,
    `**Why:** ${s.reason}`,
    "",
    "**Message (English)**",
    "",
    quote(s.message.en),
    "",
    "<details><summary>Finnish version</summary>",
    "",
    quote(s.message.fi),
    "",
    "</details>",
    "",
  );
}

mkdirSync("docs", { recursive: true });
writeFileSync(OUT, out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"));
console.log(`wrote ${OUT}: ${rows.length} messages (${Object.entries(bySource).map(([k, n]) => `${k} ${n}`).join(", ")}), ${valid} valid`);
