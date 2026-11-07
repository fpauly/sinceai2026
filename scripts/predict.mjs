// Run lib/predict on Fonecta's full dataset and write predictions for their scorer (DESIGN 9.5, stage A10).
//
//   node scripts/predict.mjs                 2026 season -> predictions_2026.csv (repo root, submitted)
//   node scripts/predict.mjs --season 2025   back-test, snapshot 6 Nov 2025 -> FONECTA/.../outputs/predictions_2025.csv
//   options: --data <dataset dir>  --out <file>
//
// Then score it (Python 3, standard library):
//   python3 FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py --predictions predictions_2026.csv
//   python3 FONECTA/FONECTA_CONNECT_SUGGESTS_2026/evaluation/evaluate.py \
//     --predictions FONECTA/FONECTA_CONNECT_SUGGESTS_2026/outputs/predictions_2025.csv \
//     --labels FONECTA/FONECTA_CONNECT_SUGGESTS_2026/labels/dev_labels_2025_backtest.csv
//
// Needs the dataset unzipped at FONECTA/FONECTA_CONNECT_SUGGESTS_2026/ (not committed). Uses only data
// entered before the snapshot date. Node 24 runs lib/ (TypeScript) directly via type stripping;
// the hook below resolves its "@/..." and extension-less imports.

import { registerHooks } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve the app's imports ("@/..." and extension-less "../hours") to .ts files, so lib/ runs unchanged.
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

const { predict } = await import("../lib/predict/index.ts");
const { fromYextDay, fromYextWeek } = await import("../lib/hours.ts");

// ---------- arguments ----------

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const season = Number(arg("--season") ?? 2026);
if (season !== 2026 && season !== 2025) throw new Error("--season must be 2026 or 2025");
const DATA = resolve(arg("--data") ?? resolve(ROOT, "FONECTA/FONECTA_CONNECT_SUGGESTS_2026"));
const today = season === 2026 ? "2026-11-06" : "2025-11-06";
const targetsFile = resolve(DATA, "evaluation", season === 2026 ? "targets_2026.csv" : "targets_2025_backtest.csv");
const out = resolve(arg("--out") ?? (season === 2026 ? resolve(ROOT, "predictions_2026.csv") : resolve(DATA, "outputs/predictions_2025.csv")));
if (!existsSync(targetsFile)) {
  console.error(`Dataset not found at ${DATA}. Unzip it to FONECTA/FONECTA_CONNECT_SUGGESTS_2026/ (TASKS.md).`);
  process.exit(2);
}

// ---------- tiny readers (the dataset is plain CSV / JSON / JSONL) ----------

function csv(file) {
  const text = readFileSync(resolve(DATA, file), "utf8").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell || row.length) endRow();
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const json = (file) => JSON.parse(readFileSync(resolve(DATA, file), "utf8"));
const jsonl = (file) =>
  readFileSync(resolve(DATA, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const num = (s) => (s === "" ? 0 : Number(s));

// ---------- load ----------

const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const entities = new Map(
  json("data/entities.json").response.entities.map((e) => [e.meta.id, e]),
);
const tiers = new Map(csv("data/cities.csv").map((r) => [r.city, r.city_tier]));

// Regular hours as published at the snapshot (handles seasonal versions).
const regularVersions = new Map();
for (const r of jsonl("data/regular_hours_history.jsonl")) {
  const list = regularVersions.get(r.entity_id) ?? [];
  list.push(r);
  regularVersions.set(r.entity_id, list);
}
const regularCache = new Map();
function regularAt(id) {
  const cached = regularCache.get(id);
  if (cached) return cached;
  const versions = (regularVersions.get(id) ?? []).filter((v) => v.effective_from === "before-2024" || v.effective_from < today);
  const best = versions.sort((a, b) => key(a).localeCompare(key(b))).at(-1);
  const week = fromYextWeek(best?.hours ?? {});
  regularCache.set(id, week);
  return week;
  function key(v) {
    return v.effective_from === "before-2024" ? "0000" : v.effective_from;
  }
}

// Exception history. `is_regular` entries keep the flag; predict resolves them with today's regular week.
const history = new Map();
for (const r of jsonl("data/holiday_hours_history.jsonl")) {
  const isRegular = r.holidayHours?.isRegularHours === true;
  const entry = {
    _id: `${r.entity_id}:${r.date}:${r.entered_at}`,
    business_id: r.entity_id,
    date: r.date,
    day_key: r.day_key,
    hours: isRegular ? regularAt(r.entity_id)[WEEKDAY[new Date(`${r.date}T00:00:00Z`).getUTCDay()]] : fromYextDay(r.holidayHours),
    is_regular: isRegular,
    entered_at: r.entered_at,
    source: r.source,
  };
  const list = history.get(r.entity_id) ?? [];
  list.push(entry);
  history.set(r.entity_id, list);
}

const peers = new Map();
for (const r of csv("data/peer_benchmarks.csv")) {
  const k = `${r.country}:${r.city_tier}:${r.segment}`;
  const list = peers.get(k) ?? [];
  list.push({
    _id: `${k}:${r.day_key}`,
    country: r.country,
    city_tier: r.city_tier,
    segment: r.segment,
    day_key: r.day_key,
    n_entity_days: num(r.n_entity_days),
    share_no_exception_entered: num(r.share_no_exception_entered),
    share_entered_closed: num(r.share_entered_closed),
    share_entered_special_hours: num(r.share_entered_special_hours),
    share_entered_regular: num(r.share_entered_regular),
    closed_share_among_entered: num(r.closed_share_among_entered),
    median_open_special: r.median_open_special || null,
    median_close_special: r.median_close_special || null,
  });
  peers.set(k, list);
}

const signals = new Map();
const addSignal = (id, s) => signals.set(id, [...(signals.get(id) ?? []), s]);
for (const r of json("data/reviews.json").response.reviews) {
  addSignal(r.locationId, { source: "review", date: new Date(r.publisherDate).toISOString(), text: r.content ?? "" });
}
for (const s of json("data/publisher_suggestions.json").response.suggestions) {
  addSignal(s.locationId, { source: "publisher", date: s.dateCreated, field: s.fieldName });
}

const calendar = new Map(csv("data/calendar_special_days.csv").map((r) => [`${r.country}:${r.date}:${r.day_key}`, r]));

// ---------- build contexts ----------

const profiles = new Map();
function profileOf(id) {
  let p = profiles.get(id);
  if (!p) {
    // What Google shows at the snapshot: entries entered before it (latest wins), else the regular week.
    const latest = new Map();
    for (const e of history.get(id) ?? []) {
      if (e.entered_at >= today) continue;
      const cur = latest.get(e.date);
      if (!cur || e.entered_at > cur.entered_at) latest.set(e.date, e);
    }
    const holiday = {};
    for (const [date, e] of latest) {
      holiday[date] = e.hours;
    }
    p = { _id: id, business_id: id, regular_hours: regularAt(id), holiday_hours: holiday };
    profiles.set(id, p);
  }
  return p;
}

/** The Business fields lib/predict reads (the rest are for the app). */
function businessOf(e) {
  return {
    _id: e.meta.id,
    name: e.name,
    owner_name: "",
    category: "other",
    city: e.address.city,
    preferred_channel: "app",
    language: "en",
    country: e.meta.countryCode,
    segment: e.c_segment,
    city_tier: tiers.get(e.address.city),
    shopping_centre_id: e.c_shoppingCenterEntityId ?? null,
    permanently_closed: e.closed === true,
  };
}

function dayOf(t) {
  const c = calendar.get(`${t.country}:${t.date}:${t.day_key}`);
  return {
    _id: `${t.country}:${t.date}`,
    country: t.country,
    date: t.date,
    weekday: WEEKDAY[new Date(`${t.date}T00:00:00Z`).getUTCDay()],
    day_key: t.day_key,
    day_type: t.day_type,
    day_class: c?.day_class ?? "",
    name_local: c?.name_local ?? t.day_key,
    name_en: c?.name_en ?? t.day_key,
    official_public_holiday: c?.official_public_holiday === "1",
  };
}

// ---------- predict ----------

const CONF = { high: 0.9, medium: 0.7, low: 0.5 };
const lines = ["entity_id,date,action,hours,confidence"];
const counts = {};
for (const t of csv(targetsFile.slice(DATA.length + 1))) {
  const e = entities.get(t.entity_id);
  if (!e) continue;
  const centreEntity = e.c_shoppingCenterEntityId ? entities.get(e.c_shoppingCenterEntityId) : undefined;
  /** @type {import("../types/api").PredictContext} */
  const ctx = {
    today,
    business: businessOf(e),
    profile: profileOf(e.meta.id),
    day: dayOf(t),
    history: history.get(e.meta.id) ?? [],
    centre: centreEntity
      ? { business: businessOf(centreEntity), profile: profileOf(centreEntity.meta.id), history: history.get(centreEntity.meta.id) ?? [] }
      : null,
    peers: peers.get(`${e.meta.countryCode}:${tiers.get(e.address.city)}:${e.c_segment}`) ?? [],
    closure_signals: signals.get(e.meta.id) ?? [],
  };
  const p = predict(ctx);
  if (process.env.PREDICT_DEBUG && t.entity_id.startsWith(process.env.PREDICT_DEBUG)) console.log(t.entity_id, t.date, p.action, p.hours ?? "", p.basis ?? "", JSON.stringify(p.detail ?? {}));
  const tag = p.action === "SUGGEST" ? `SUGGEST:${p.basis}` : p.action;
  counts[tag] = (counts[tag] ?? 0) + 1;
  if (p.action === "NO_ACTION") continue;
  lines.push([t.entity_id, t.date, p.action, p.hours ?? "", p.confidence ? CONF[p.confidence] : ""].join(","));
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`season ${season} (snapshot ${today}): ${lines.length - 1} actions -> ${out}`);
console.log(Object.entries(counts).sort().map(([k, n]) => `  ${k} ${n}`).join("\n"));
