// Export the customer messages Connect would send, from the REAL suggestions in the database,
// to docs/customer-messages.md (Fonecta deliverable, DESIGN 18; stages A7, A12).
//
// Usage:
//   node scripts/export-messages.mjs           export what is in the DB now
//   node scripts/export-messages.mjs --fresh   first run the chain on a running app:
//                                              POST /api/seed, /api/detect, /api/suggest
//                                              (wipes your DB; app at EXPORT_URL or localhost:3000)
// Reads MONGODB_URI / MONGODB_DB / DEMO_DATE from .env.local. Never prints keys.
// The follow-ups (after approve / edit / decline / standing permission) come from lib/ai/specialDay.ts,
// so Node runs that TypeScript file directly; the hook below resolves its "@/..." imports.

import { registerHooks } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";

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
const { followUp, ownerLanguage } = await import("../lib/ai/specialDay.ts");

if (existsSync(resolve(ROOT, ".env.local"))) process.loadEnvFile(resolve(ROOT, ".env.local"));

const BASE = process.env.EXPORT_URL ?? "http://localhost:3000";
const OUT = resolve(ROOT, "docs/customer-messages.md");
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
const WEEKDAY = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const LANG = { en: "English", fi: "Finnish", sv: "Swedish", nb: "Norwegian" };
const BASIS = {
  LAST_YEAR: "the owner's own hours for this day in an earlier season",
  SHOPPING_CENTRE: "the shopping centre's hours (the store keeps the centre's hours on that weekday)",
  PEERS: "similar businesses (no history of its own)",
  OWNER_EDIT: "the owner's own earlier edit in Connect",
};
const FLAG = { closed_for_good: "signs that it has closed for good (user edits on Google / Apple / Bing, or a recent review)" };

const date = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
};
const hours = (h) => (h === "closed" ? "closed" : String(h).replaceAll("-", "–").replaceAll(",", ", "));
const quote = (text) => String(text).split("\n").map((l) => `> ${l}`).join("\n");
const isCentre = (b) => /-M\d+$/.test(b._id);

// ---------- rows ----------

const byId = new Map(businesses.map((b) => [b._id, b]));
const issueById = new Map(issues.map((i) => [i._id, i]));
const rows = suggestions
  .map((s) => ({ s, issue: issueById.get(s.issue_id), business: byId.get(s.business_id) }))
  .filter((r) => r.issue && r.business && r.issue.type === "special_day_hours")
  .sort(
    (a, b) =>
      (a.business._id === "FI-D0001" ? 0 : 1) - (b.business._id === "FI-D0001" ? 0 : 1) ||
      a.business._id.localeCompare(b.business._id) ||
      String(a.issue.evidence.date).localeCompare(String(b.issue.evidence.date)),
  );
const flagged = issues.filter((i) => i.type === "needs_human").map((i) => ({ issue: i, business: byId.get(i.business_id) })).filter((r) => r.business);
const withRows = new Set(rows.map((r) => r.business._id));
const flaggedIds = new Set(flagged.map((r) => r.business._id));
const quiet = businesses.filter((b) => !isCentre(b) && !withRows.has(b._id) && !flaggedIds.has(b._id));

const bySource = rows.reduce((acc, r) => ((acc[r.s.source ?? "?"] = (acc[r.s.source ?? "?"] ?? 0) + 1), acc), {});
const valid = rows.filter((r) => r.s.validation?.ok).length;
const auto = rows.filter((r) => r.s.decision === "auto").length;
const languages = [...new Set(rows.flatMap((r) => Object.keys(r.s.message ?? {})))];
const demoDate = process.env.DEMO_DATE || "2026-11-06";

// ---------- document ----------

const out = [];
out.push(
  "# Customer messages",
  "",
  "The messages Fonecta Connect sends to business owners, **exported from real suggestions** the app made on Fonecta's dataset",
  "(`node scripts/export-messages.mjs --fresh`: `/api/seed` → `/api/detect` → `/api/suggest`). Do not edit by hand; re-export instead.",
  "",
  `- Demo date ("today"): **${date(demoDate)}**, the dataset's snapshot`,
  `- Exported: ${new Date().toISOString().slice(0, 10)}, ${rows.length} messages for ${withRows.size} businesses, in ${languages.map((l) => LANG[l] ?? l).join(", ")}`,
  `- Written by: ${Object.entries(bySource).map(([k, n]) => `${n} × ${k === "gemini" ? "Gemini" : k === "fallback" ? "template" : k}`).join(", ")}`,
  `- Validated by code (\`lib/validate.ts\`): ${valid} of ${rows.length} passed`,
  `- Applied without asking (standing permission), then the owner is informed: ${auto}`,
  flagged.length ? `- Flagged for a person, no message: ${flagged.map((r) => r.business.name).join(", ")}` : "",
  quiet.length ? `- No message (Google already shows the right hours): ${quiet.map((b) => b.name).join(", ")}` : "",
  "",
  "## How a message is made",
  "",
  "1. **Code detects and decides** (`lib/predict`, the same code that writes `predictions_2026.csv`): for each special day, what Google shows now and",
  "   what it should show, from the owner's own earlier entries, the shopping centre, or similar businesses. See `docs/predict.md`.",
  "2. **Gemini writes** the message in English and in the owner's language, in Fonecta's style: the day and date, what Google shows now,",
  "   what the proposal is based on, then a last line \"We suggest: …\". It never changes a date, a time or a number.",
  "3. **Code validates** every draft (only that date, exactly the decided hours, at most 2 sentences plus the suggestion line).",
  "   If Gemini fails or its draft is invalid, the template in `lib/ai/specialDay.ts` is used. It says the same thing.",
  "4. **The owner decides** on their channel: approve, edit or decline with one tap, no login. Nothing is published without that,",
  "   except when the owner gave a standing permission; then Connect applies it and tells them (follow-ups below).",
  "",
  "Low confidence (no history of its own) turns the basis sentence into a question.",
  "",
);

// Follow-ups: one example per language, from real suggestions.
const examples = [];
for (const lang of ["en", "fi", "sv", "nb"]) {
  const r = rows.find((x) => (lang === "en" ? x.business._id === "FI-D0001" : ownerLanguage(x.business) === lang) && x.s.decision !== "auto");
  if (r) examples.push({ lang, r });
}
const autoRow = rows.find((x) => x.s.decision === "auto");
out.push(
  "## Follow-ups after the owner answers",
  "",
  "Fixed texts from `lib/ai/specialDay.ts` (`followUp`), no LLM. *Edited* shows an example edit (split hours).",
  "",
);
const EDIT_EXAMPLE = "09:00-12:00,13:00-15:00";
for (const { lang, r } of examples) {
  out.push(
    `**${LANG[lang]}** (${r.business.name}, ${r.issue.evidence.day_name.en} ${date(r.issue.evidence.date)})`,
    "",
    "| Owner | Connect replies |",
    "|---|---|",
    `| approves | ${followUp(r.business, r.issue, "approved", lang)} |`,
    `| edits to ${hours(EDIT_EXAMPLE)} | ${followUp(r.business, r.issue, "edited", lang, EDIT_EXAMPLE)} |`,
    `| declines | ${followUp(r.business, r.issue, "declined", lang)} |`,
    "",
  );
}
if (autoRow) {
  const lang = ownerLanguage(autoRow.business);
  out.push(
    `**Standing permission** (${autoRow.business.name}: "${autoRow.business.contact?.standing_permission_holidays ? "handle public holidays from now on" : "do this automatically next time"}")`,
    "",
    quote(followUp(autoRow.business, autoRow.issue, "auto", "en")),
    "",
    `<details><summary>${LANG[lang]}</summary>`,
    "",
    quote(followUp(autoRow.business, autoRow.issue, "auto", lang)),
    "",
    "</details>",
    "",
  );
}

// Per business.
let current = null;
for (const { s, issue, business } of rows) {
  const lang = ownerLanguage(business);
  if (business._id !== current) {
    current = business._id;
    const c = business.contact ?? {};
    const extras = [
      c.standing_permission_holidays ? "**standing permission for holidays**" : "",
      c.best_contact_window ? `contact window ${c.best_contact_window}` : "",
    ].filter(Boolean);
    out.push(
      `## ${business.name} (\`${business._id}\`)`,
      "",
      `${c.first_name ?? business.owner_name} · ${business.segment ?? business.category} · ${business.city} · channel: **${c.channel ?? business.preferred_channel}** · language: ${LANG[lang]}${extras.length ? ` · ${extras.join(" · ")}` : ""}`,
      "",
    );
  }
  const e = issue.evidence;
  const v = s.validation;
  const views = typeof e.expected_search_views === "number" ? ` · about ${e.expected_search_views} searches expected that day` : "";
  out.push(
    `### ${e.day_name.en}, ${WEEKDAY[e.weekday] ?? e.weekday} ${date(e.date)}`,
    "",
    `- Google shows: ${hours(e.displayed_hours)} (${e.displayed_from === "regular" ? "regular hours" : "special hours entered"})${views}`,
    `- Proposal: **${hours(e.proposed_hours)}**, from ${BASIS[e.basis] ?? e.basis}, confidence **${s.confidence}**`,
    `- Written by: ${s.source === "gemini" ? "Gemini" : "template"} · Validation: ${v ? (v.ok ? "passed" : `failed: ${v.problems.join("; ")}`) : "not run"}${s.decision === "auto" ? " · **applied by standing permission**" : ""}`,
    "",
    quote(s.message.en),
    "",
    `<details><summary>${LANG[lang]}</summary>`,
    "",
    quote(s.message[lang] ?? "(missing)"),
    "",
    "</details>",
    "",
  );
}

if (flagged.length) {
  out.push("## Flagged for a person (no message to the owner)", "");
  for (const { issue, business } of flagged) {
    out.push(`- **${business.name}** (\`${business._id}\`): ${issue.evidence?.summary ?? FLAG[issue.evidence?.reason] ?? "needs a check"}`);
  }
  out.push("");
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"));
console.log(`wrote docs/customer-messages.md: ${rows.length} messages (${Object.entries(bySource).map(([k, n]) => `${k} ${n}`).join(", ")}), ${valid} valid, ${auto} auto`);
