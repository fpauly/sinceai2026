#!/usr/bin/env node
// Build data/fonecta/demo.json from Fonecta's dataset (stage C10, DESIGN.md section 0 "v2").
//
// Usage:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/import-fonecta.mjs
//   FONECTA_DIR=/path/to/FONECTA_CONNECT_SUGGESTS_2026 node ... (default: FONECTA/FONECTA_CONNECT_SUGGESTS_2026)
//
// The full dataset (~82 MB) is not committed (.gitignore); this small extract is, so CI and
// teammates without the zip can still seed the demo cast. Regenerate and commit when needed.
//
// What it keeps: the 17 demo storylines (FI-D0001 ... FI-D0017, SE-D0008, SE-D0016, NO-D0009,
// NO-D0015) plus the 15 shopping centres (their hours are a signal for businesses inside them).
// Everything else in the dataset (scoring data, the other ~3,000 businesses) stays out.
//
// Source files: data/entities.json, customer_contacts.csv, listings.json,
// holiday_hours_history.jsonl, regular_hours_history.jsonl, calendar_special_days.csv,
// peer_benchmarks.csv, cities.csv. Hours conversion comes from lib/hours.ts, the one place
// that parses and formats them, so the extract cannot drift from the app.
//
// Output: deterministic (sorted, no timestamps), so re-running it produces no diff.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import {
  fromYextHoliday,
  fromYextWeek,
  isValidHours,
  weekdayOf,
} from "../lib/hours.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = resolve(ROOT, process.env.FONECTA_DIR ?? "FONECTA/FONECTA_CONNECT_SUGGESTS_2026");
const DATA = join(DATASET, "data");
const OUT = join(ROOT, "data/fonecta/demo.json");

// Which dataset entity becomes which Yext sandbox entity (DESIGN.md section 0 "v2": the sandbox
// entity SinceAI03 is set up as Kahvila Aurora). B10 owns the sandbox side.
const YEXT_ENTITY_IDS = { "FI-D0001": "SinceAI03" };

// The dataset's snapshot and scored window (DESIGN 0 "v2").
const SNAPSHOT = "2026-11-06"; // the dataset's "today"
const WINDOW_END = "2027-01-06"; // special days from 7 Nov 2026 to 6 Jan 2027
const PREVIOUS_SEASON = ["2025-11-07", "2026-01-06"];

/** The name of a school break in the owner's language (the calendar has no rows for these). */
const SCHOOL_BREAK_NAME = { fi: "Koulujen loma", sv: "Skolov", nb: "Skoleferie", en: "School break" };

function fail(message) {
  console.error(`import-fonecta: ${message}`);
  process.exit(1);
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(DATA, name), "utf8"));
  } catch (err) {
    fail(`cannot read ${join(DATA, name)} — is the dataset unzipped? (${err.message})`);
  }
}

/** CSV → array of objects. The dataset's files have no quoted commas; assert the width anyway. */
function readCsv(name, expectedColumns, base = DATA) {
  const text = readFileSync(join(base, name), "utf8").trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((s) => s.trim());
  if (header.length !== expectedColumns) fail(`${name}: expected ${expectedColumns} columns, got ${header.length}`);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((s) => s.trim());
    if (cells.length !== header.length) fail(`${name}:${i + 2}: expected ${header.length} cells, got ${cells.length}`);
    return Object.fromEntries(header.map((key, j) => [key, cells[j]]));
  });
}

function readJsonl(name) {
  return readFileSync(join(DATA, name), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

// ---------- source: businesses ----------

const entities = readJson("entities.json").response.entities;
const cities = readCsv("cities.csv", 5);
const tierByCity = new Map(cities.map((row) => [`${row.country}:${row.city}`, row.city_tier]));

// The demo storylines are the FI/SE/NO ids ending in -Dnnnn (FI-D0001 ... FI-D0017).
const isStoryline = (entity) => /-D\d+$/.test(entity.meta.id);
const isCentre = (entity) => entity.c_entityRole === "SHOPPING_CENTRE";
const wanted = entities
  .filter((entity) => isStoryline(entity) || isCentre(entity))
  .sort((a, b) => a.meta.id.localeCompare(b.meta.id));

if (wanted.filter(isStoryline).length !== 17) {
  fail(`expected 17 demo storylines, found ${wanted.filter(isStoryline).length}`);
}
if (wanted.filter(isCentre).length !== 15) {
  fail(`expected 15 shopping centres, found ${wanted.filter(isCentre).length}`);
}

const storylineIds = new Set(wanted.filter(isStoryline).map((entity) => entity.meta.id));

const contacts = new Map(
  readCsv("customer_contacts.csv", 9).map((row) => [row.entity_id, row]),
);
const publishersByEntity = new Map();
for (const listing of readJson("listings.json").listings) {
  if (!publishersByEntity.has(listing.entityId)) publishersByEntity.set(listing.entityId, []);
  publishersByEntity.get(listing.entityId).push({
    id: listing.publisherId,
    name: listing.publisherName,
    status: listing.status,
    typical_update_seconds: listing.typicalUpdateSpeedSeconds,
  });
}

// The dataset's segment is kept verbatim in Business.segment; category is our coarse label.
const CATEGORY_BY_SEGMENT = {
  cafe: "cafe",
  restaurant: "restaurant",
  lunch_restaurant: "restaurant",
  pizzeria: "restaurant",
  bar_pub: "restaurant",
  seasonal_terrace: "restaurant",
  bakery: "bakery",
  florist: "florist",
  hair_salon: "hair_salon",
  gym: "gym",
  car_repair: "car_repair",
  bookstore: "bookshop",
};

// Our v1 Channel has no email; EMAIL and APP_PUSH both become "app" (Contact keeps the detail).
const CHANNEL = { WHATSAPP: "whatsapp", SMS: "sms", VOICE: "voice", EMAIL: "app", APP_PUSH: "app" };

const businesses = [];
const profiles = [];

for (const entity of wanted) {
  const id = entity.meta.id;
  const country = entity.meta.countryCode;
  const city = entity.address.city;
  const cityTier = tierByCity.get(`${country}:${city}`);
  if (!cityTier) fail(`${id}: no city tier for ${country}:${city} in cities.csv`);

  const contactRow = contacts.get(id);
  const contact = contactRow
    ? {
        first_name: contactRow.contact_first_name,
        channel: contactRow.preferred_channel,
        language: contactRow.preferred_language,
        best_contact_window: contactRow.best_contact_window,
        standing_permission_holidays: contactRow.standing_permission_holidays === "1",
        opted_out: contactRow.opted_out_of_suggestions === "1",
      }
    : undefined;

  const business = {
    _id: id,
    name: entity.name,
    owner_name: contact?.first_name ?? "",
    category: CATEGORY_BY_SEGMENT[entity.c_segment] ?? "other",
    city,
    // v2 uses Business.contact for real; preferred_channel stays for the v1 pages.
    preferred_channel: contact ? (CHANNEL[contact.channel] ?? "app") : "app",
    language: entity.meta.language,
    yext_entity_id: YEXT_ENTITY_IDS[id] ?? null,
    country,
    segment: entity.c_segment,
    city_tier: cityTier,
    shopping_centre_id: entity.c_shoppingCenterEntityId ?? null,
    is_shopping_centre: isCentre(entity),
    permanently_closed: entity.closed === true,
    reopen_date: entity.hours.reopenDate ?? null,
    connect_since: entity.c_connectCustomerSince ?? undefined,
    ...(contact ? { contact } : {}),
    ...(publishersByEntity.has(id) ? { publishers: publishersByEntity.get(id) } : {}),
  };
  businesses.push(business);

  const regularHours = fromYextWeek(entity.hours);
  const holidayHours = {};
  for (const item of entity.hours.holidayHours ?? []) {
    const resolved = fromYextHoliday(item, regularHours);
    holidayHours[resolved.date] = resolved.hours;
  }
  const sortedHolidayHours = Object.fromEntries(
    Object.keys(holidayHours).sort().map((date) => [date, holidayHours[date]]),
  );

  profiles.push({ _id: id, business_id: id, regular_hours: regularHours, holiday_hours: sortedHolidayHours });
}

// ---------- source: reviews and publisher edits (closure signals for lib/predict) ----------

// Only the storylines: these are the reviews messages and closure flags are built from. The
// dataset's dates are epoch milliseconds; our Review.date is an ISO date.
const reviews = readJson("reviews.json").response.reviews
  .filter((row) => storylineIds.has(row.locationId) && (row.content ?? "").trim())
  .map((row) => ({
    _id: `fonecta_${row.id}`,
    business_id: row.locationId,
    date: new Date(row.publisherDate).toISOString().slice(0, 10),
    rating: Math.min(5, Math.max(1, Number(row.rating))),
    text: row.content.trim(),
  }))
  .sort((a, b) => a.business_id.localeCompare(b.business_id) || a.date.localeCompare(b.date) || a._id.localeCompare(b._id));

// Google/Apple/Bing user edits. lib/predict reads `field === "closed"` as a closure signal;
// the rest is kept for the staff view. A new collection (lib/db.ts) keeps Business clean.
const publisherSuggestions = readJson("publisher_suggestions.json").response.suggestions
  .filter((row) => storylineIds.has(row.locationId))
  .map((row) => ({
    _id: row.id,
    business_id: row.locationId,
    date: row.dateCreated,
    field: row.fieldName,
    status: row.status,
    publisher_id: row.publisherId,
  }))
  .sort((a, b) => a.business_id.localeCompare(b.business_id) || a.date.localeCompare(b.date));

// ---------- source: exception history ----------

const regularHistory = new Map();
for (const row of readJsonl("regular_hours_history.jsonl")) {
  if (!regularHistory.has(row.entity_id)) regularHistory.set(row.entity_id, []);
  regularHistory.get(row.entity_id).push(row);
}
for (const rows of regularHistory.values()) {
  // "before-2024" sorts first; the rest are ISO dates.
  rows.sort((a, b) => (a.effective_from === b.effective_from ? 0 : a.effective_from < b.effective_from ? -1 : 1));
}

/** The regular week that was in force on `date`, for resolving isRegularHours honestly. */
function regularWeekOn(entityId, date, current) {
  const rows = regularHistory.get(entityId) ?? [];
  let week = current;
  for (const row of rows) {
    if (row.effective_from === "before-2024" || row.effective_from <= date) week = fromYextWeek(row.hours);
    else break;
  }
  return week;
}

const currentWeek = new Map(profiles.map((profile) => [profile.business_id, profile.regular_hours]));
const wantedIds = new Set(wanted.map((entity) => entity.meta.id));

const history = readJsonl("holiday_hours_history.jsonl")
  .filter((row) => wantedIds.has(row.entity_id))
  .map((row) => {
    const week = regularWeekOn(row.entity_id, row.date, currentWeek.get(row.entity_id));
    const resolved = fromYextHoliday(row.holidayHours, week);
    return {
      _id: `${row.entity_id}:${row.date}:${row.entered_at}`,
      business_id: row.entity_id,
      date: row.date,
      day_key: row.day_key,
      hours: resolved.hours,
      is_regular: resolved.is_regular,
      entered_at: row.entered_at,
      source: row.source,
    };
  })
  .sort((a, b) =>
    a.business_id.localeCompare(b.business_id) ||
    a.date.localeCompare(b.date) ||
    a.entered_at.localeCompare(b.entered_at),
  );


// ---------- source: calendar and peers ----------

const WEEKDAY = { Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu", Friday: "fri", Saturday: "sat", Sunday: "sun" };

const calendarDays = readCsv("calendar_special_days.csv", 9).map((row) => {
  const weekday = WEEKDAY[row.weekday];
  if (!weekday) fail(`calendar_special_days.csv: unknown weekday "${row.weekday}"`);
  if (weekdayOf(row.date) !== weekday) fail(`calendar_special_days.csv: ${row.date} is not a ${row.weekday}`);
  return {
    _id: `${row.country}:${row.date}`,
    country: row.country,
    date: row.date,
    weekday,
    day_key: row.day_key,
    day_type: row.day_type,
    day_class: row.day_class,
    name_local: row.name_local,
    name_en: row.name_en,
    official_public_holiday: row.official_public_holiday === "1",
  };
});

// ---------- source: live public holidays (C8, the bonus live source) ----------

// Nager.Date (MIT): official public holidays per country and year. We use it for the official
// public-holiday part of the calendar only; eves, observances, commercial days, local events and
// school breaks still come from the dataset. DEMO_DATE still defines the window, so detection stays
// deterministic; if the API is unreachable, the dataset rows are used unchanged.
const LIVE_HOLIDAY_COUNTRIES = ["FI", "SE", "NO"];
const LIVE_HOLIDAY_YEARS = [2026, 2027]; // the demo window (7 Nov 2026 – 6 Jan 2027)
const LIVE_HOLIDAY_CACHE = join(DATASET, ".cache");

async function fetchLiveHolidays(year, country) {
  const cached = join(LIVE_HOLIDAY_CACHE, `nager-${year}-${country}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      mkdirSync(LIVE_HOLIDAY_CACHE, { recursive: true });
      writeFileSync(cached, JSON.stringify(rows));
      return rows;
    } catch (err) {
      lastError = err;
    }
  }
  console.warn(`live holidays: ${country} ${year} unavailable (${lastError.message}); using the dataset`);
  return null;
}

/** Confirm the calendar's public holidays from the live API, and correct the flag where it differs. */
async function confirmPublicHolidays(days) {
  const live = new Map(); // "CC:date" -> { local, en }
  let countryYears = 0;
  for (const country of LIVE_HOLIDAY_COUNTRIES) {
    for (const year of LIVE_HOLIDAY_YEARS) {
      const rows = await fetchLiveHolidays(year, country);
      if (!rows) continue;
      countryYears += 1;
      for (const row of rows) live.set(`${country}:${row.date}`, { local: row.localName, en: row.name });
    }
  }

  let confirmed = 0;
  let corrected = 0;
  for (const day of days) {
    if (!LIVE_HOLIDAY_YEARS.includes(Number(day.date.slice(0, 4)))) continue;
    const match = live.get(`${day.country}:${day.date}`);
    if (match) {
      confirmed += 1;
      day.official_public_holiday = true;
      if (match.local) day.name_local = match.local;
      if (match.en) day.name_en = match.en;
    } else if (day.official_public_holiday) {
      // The dataset calls it official, the live source does not (e.g. Christmas Eve in Finland).
      day.official_public_holiday = false;
      corrected += 1;
    }
  }

  if (live.size > 0) {
    const calendarKeys = new Set(days.map((day) => `${day.country}:${day.date}`));
    const missing = [...live.keys()].filter((key) => !calendarKeys.has(key));
    if (missing.length > 0) {
      console.warn(`live holidays: ${missing.length} live dates are not in the calendar (${missing.join(", ")})`);
    }
    console.log(
      `live holidays: ${countryYears} country-years checked, ${confirmed} dates confirmed, ${corrected} corrected, ${missing.length} missing from the calendar`,
    );
  }
  return { countryYears, confirmed, corrected };
}

const liveHolidays = await confirmPublicHolidays(calendarDays);

// Event nights and school breaks (C15): the scorers' targets say which business has one on which
// date, and local_events.json gives the event its name. These rows apply to that business only.
const businessesById = new Map(businesses.map((business) => [business._id, business]));
const localEvents = new Map(readJson("local_events.json").data.map((event) => [event["@id"], event]));
const eventDays = readCsv("targets_2026.csv", 7, join(DATASET, "evaluation"))
  .filter(
    (row) =>
      storylineIds.has(row.entity_id) &&
      (row.day_key === "EVENT" || row.day_key === "SCHOOL_BREAK") &&
      row.date > SNAPSHOT &&
      row.date <= WINDOW_END,
  )
  .map((row) => {
    const business = businessesById.get(row.entity_id);
    if (!business) fail(`targets_2026.csv: no business ${row.entity_id}`);
    const event = row.event_id ? localEvents.get(row.event_id) : undefined;
    if (row.day_key === "EVENT" && !event) fail(`targets_2026.csv: no local event ${row.event_id}`);
    const nameLocal =
      row.day_key === "SCHOOL_BREAK"
        ? (SCHOOL_BREAK_NAME[business.language] ?? SCHOOL_BREAK_NAME.en)
        : (event.name[business.language] ?? event.name.en);
    return {
      _id: `${row.entity_id}:${row.date}:${row.event_id || row.day_key}`,
      country: row.country,
      date: row.date,
      weekday: weekdayOf(row.date),
      day_key: row.day_key,
      day_type: row.day_type,
      day_class: row.day_type,
      name_local: nameLocal,
      name_en: row.day_key === "SCHOOL_BREAK" ? SCHOOL_BREAK_NAME.en : event.name.en,
      official_public_holiday: false,
      business_id: row.entity_id,
      event_id: row.event_id || null,
    };
  });

const specialDays = [...calendarDays, ...eventDays].sort((a, b) => a._id.localeCompare(b._id));

// ---------- source: analytics (what is at stake on each special day, C14) ----------


/** The date on which the same special day (country + day key) fell in the previous season. */
function previousSeasonDate(country, dayKey) {
  const dates = specialDays
    .filter(
      (day) =>
        day.country === country &&
        day.day_key === dayKey &&
        day.date >= PREVIOUS_SEASON[0] &&
        day.date <= PREVIOUS_SEASON[1],
    )
    .map((day) => day.date)
    .sort();
  return dates[dates.length - 1] ?? null;
}

/**
 * Google search views on the same special day last season, per business and day key
 * (analytics_daily.parquet). This is the honest "what was at stake" number for the message:
 * it comes from code, never from the LLM.
 */
async function searchViewsByBusiness() {
  const map = new Map(); // "entity|date" -> { entity, date, day_key }
  for (const day of specialDays) {
    if (day.business_id) continue; // event/school-break rows are business-specific and have no last-season counterpart
    if (!(day.date > SNAPSHOT && day.date <= WINDOW_END)) continue;
    for (const entity of wanted) {
      if (entity.meta.countryCode !== day.country) continue;
      const date = previousSeasonDate(day.country, day.day_key);
      if (date) map.set(`${entity.meta.id}|${date}`, { entity: entity.meta.id, date, day_key: day.day_key });
    }
  }
  if (map.size === 0) return new Map();

  const file = readFileSync(join(DATA, "analytics_daily.parquet"));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const rows = Number((await parquetMetadataAsync(buffer)).num_rows);
  const views = new Map(); // business_id -> { day_key: views }
  const CHUNK = 400_000;
  for (let start = 0; start < rows; start += CHUNK) {
    const chunk = await parquetReadObjects({
      file: buffer,
      columns: ["date", "entity_id", "GOOGLE_SEARCH_VIEWS"],
      rowStart: start,
      rowEnd: Math.min(start + CHUNK, rows),
    });
    for (const row of chunk) {
      const hit = map.get(`${row.entity_id}|${row.date.toISOString().slice(0, 10)}`);
      if (!hit) continue;
      const byKey = views.get(row.entity_id) ?? {};
      byKey[hit.day_key] = (byKey[hit.day_key] ?? 0) + (row.GOOGLE_SEARCH_VIEWS ?? 0);
      views.set(row.entity_id, byKey);
    }
  }
  return views;
}

const viewsByBusiness = await searchViewsByBusiness();
let searchViewCount = 0;
for (const business of businesses) {
  const byKey = viewsByBusiness.get(business._id);
  if (!byKey) continue;
  const positive = Object.fromEntries(
    Object.entries(byKey)
      .filter(([, value]) => value > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  if (Object.keys(positive).length === 0) continue;
  business.search_views_by_day_key = positive;
  searchViewCount += Object.keys(positive).length;
}

// Only the (country, city tier, segment) combinations the demo cast can look up.
const peerKeys = new Set(
  businesses
    .filter((business) => !business.is_shopping_centre)
    .map((business) => `${business.country}:${business.city_tier}:${business.segment}`),
);

const peers = readCsv("peer_benchmarks.csv", 12)
  .filter((row) => peerKeys.has(`${row.country}:${row.city_tier}:${row.segment}`))
  .map((row) => ({
    _id: `${row.country}:${row.city_tier}:${row.segment}:${row.day_key}`,
    country: row.country,
    city_tier: row.city_tier,
    segment: row.segment,
    day_key: row.day_key,
    n_entity_days: Number(row.n_entity_days),
    share_no_exception_entered: Number(row.share_no_exception_entered),
    share_entered_closed: Number(row.share_entered_closed),
    share_entered_special_hours: Number(row.share_entered_special_hours),
    share_entered_regular: Number(row.share_entered_regular),
    closed_share_among_entered: Number(row.closed_share_among_entered),
    median_open_special: row.median_open_special || null,
    median_close_special: row.median_close_special || null,
  }))
  .sort((a, b) => a._id.localeCompare(b._id));

// ---------- checks before writing ----------

const problems = [];
for (const profile of profiles) {
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    if (!isValidHours(profile.regular_hours[day])) problems.push(`${profile._id}: invalid regular hours on ${day}`);
  }
  for (const [date, hours] of Object.entries(profile.holiday_hours)) {
    if (!isValidHours(hours)) problems.push(`${profile._id}: invalid holiday hours on ${date}`);
  }
}
for (const business of businesses) {
  if (storylineIds.has(business._id) && !business.contact) problems.push(`${business._id}: no contact row`);
  if (!business.is_shopping_centre && !business.publishers) problems.push(`${business._id}: no publishers`);
}
for (const row of history) if (!isValidHours(row.hours)) problems.push(`history ${row._id}: invalid hours "${row.hours}"`);
if (new Set(history.map((row) => row._id)).size !== history.length) problems.push("history: duplicate _id");
if (new Set(specialDays.map((day) => day._id)).size !== specialDays.length) problems.push("special_days: duplicate _id");
for (const day of eventDays) {
  if (!(day.business_id && day.date > SNAPSHOT && day.date <= WINDOW_END)) problems.push(`event day ${day._id}: outside the window`);
  if (!day.business_id || !businessesById.has(day.business_id)) problems.push(`event day ${day._id}: unknown business`);
  if (weekdayOf(day.date) !== day.weekday) problems.push(`event day ${day._id}: wrong weekday`);
}
if (eventDays.length === 0) problems.push("event days: none imported");
if (new Set(peers.map((row) => row._id)).size !== peers.length) problems.push("peers: duplicate _id");
for (const review of reviews) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.date)) problems.push(`review ${review._id}: bad date "${review.date}"`);
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    problems.push(`review ${review._id}: bad rating ${review.rating}`);
  }
}
if (new Set(reviews.map((row) => row._id)).size !== reviews.length) problems.push("reviews: duplicate _id");
if (new Set(publisherSuggestions.map((row) => row._id)).size !== publisherSuggestions.length) {
  problems.push("publisher_suggestions: duplicate _id");
}
if (storylineIds.size > 0) {
  const withViews = businesses.filter((business) => business.search_views_by_day_key);
  if (withViews.length === 0) problems.push("analytics: no business got search views");
  if (!withViews.some((business) => business.search_views_by_day_key.XMAS_EVE > 0)) {
    problems.push("analytics: no business has Christmas Eve search views");
  }
}
if (problems.length) fail(`\n  - ${problems.join("\n  - ")}`);

// ---------- write ----------

const counts = {
  businesses: businesses.length,
  profiles: profiles.length,
  holiday_history: history.length,
  special_days: specialDays.length,
  event_days: eventDays.length,
  peers: peers.length,
  reviews: reviews.length,
  publisher_suggestions: publisherSuggestions.length,
  search_views: searchViewCount,
  live_holidays: liveHolidays.confirmed,
  live_holidays_corrected: liveHolidays.corrected,
};

const extract = {
  source: {
    dataset: "Fonecta Connect Suggests – Nordic opening-hours simulator v1.1 (Since AI ry)",
    licence: "code MIT, data CC BY 4.0",
    built_by: "scripts/import-fonecta.mjs (stage C10)",
  },
  counts,
  businesses,
  profiles,
  holiday_history: history,
  special_days: specialDays,
  peers,
  reviews,
  publisher_suggestions: publisherSuggestions,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(extract, null, 2)}\n`);

console.log(`wrote ${OUT}`);
for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
