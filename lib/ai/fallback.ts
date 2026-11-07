import type {
  Business,
  Category,
  Confidence,
  Day,
  HolidayHours,
  Hours,
  Issue,
  Listing,
  OpeningHours,
  Preferences,
  Source,
  TrackedField,
} from "@/types";
import { DAYS } from "@/types";
import type {
  CrossPlatformConflictEvidence,
  MissingHolidayHoursEvidence,
  ReviewSignalEvidence,
  StaleFieldEvidence,
  SuggestionDraft,
  TypedProposedChange,
} from "@/types/api";

// Step 2 (Suggest) without an LLM: one template per issue type, EN + FI, in Fonecta Connect's voice.
// Used when Gemini is off, fails, or produces an invalid suggestion (DESIGN 9, 9.4).
//
// Every proposed value comes from the issue evidence or the listings, never invented:
//  - missing holiday hours: copy last year's hours for the same day; with no history, the
//    category's common pattern (confidence low, message phrased as a question)
//  - conflict: the most recently updated source (majority value for phone)
//  - stale field / review signal: re-confirm the current value
// Messages are max 2 sentences per language and avoid "." inside sentences (abbreviations,
// dotted dates), so the sentence count in lib/validate.ts stays honest.

// ---------- labels ----------

const HOLIDAY_FI: Record<string, string> = {
  "12-06": "itsenäisyyspäivä",
  "12-24": "jouluaatto",
  "12-25": "joulupäivä",
  "12-26": "tapaninpäivä",
  "01-01": "uudenvuodenpäivä",
  "01-06": "loppiainen",
};

const CATEGORY: Record<Category, { en: string; fi: string }> = {
  cafe: { en: "cafés", fi: "kahvilat" },
  hair_salon: { en: "hair salons", fi: "parturit ja kampaamot" },
  car_repair: { en: "car repair shops", fi: "autokorjaamot" },
  florist: { en: "florists", fi: "kukkakaupat" },
  restaurant: { en: "restaurants", fi: "ravintolat" },
  bookshop: { en: "bookshops", fi: "kirjakaupat" },
  gym: { en: "gyms", fi: "kuntosalit" },
  bakery: { en: "bakeries", fi: "leipomot" },
  other: { en: "similar businesses", fi: "vastaavat yritykset" },
};

const SOURCE_EN: Record<Source, string> = { finder: "Finder", google: "Google", website: "your website" };
const SOURCE_FI_IN: Record<Source, string> = { finder: "Finderissä", google: "Googlessa", website: "verkkosivuillasi" };
const SOURCE_FI: Record<Source, string> = { finder: "Finder", google: "Google", website: "verkkosivusi" };

const DAY_EN: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_EN_LONG: Record<Day, string> = {
  mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays",
};
const DAY_FI: Record<Day, string> = { mon: "ma", tue: "ti", wed: "ke", thu: "to", fri: "pe", sat: "la", sun: "su" };
const DAY_FI_ESSIVE: Record<Day, string> = {
  mon: "maanantaisin", tue: "tiistaisin", wed: "keskiviikkoisin", thu: "torstaisin",
  fri: "perjantaisin", sat: "lauantaisin", sun: "sunnuntaisin",
};

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FI = [
  "tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu",
  "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu",
];

const FIELD_LABEL: Record<string, { en: string; fi: string }> = {
  opening_hours: { en: "opening hours", fi: "aukioloajat" },
  holiday_hours: { en: "holiday hours", fi: "pyhäpäivien aukioloajat" },
  description: { en: "description", fi: "yrityksen kuvaus" },
  phone: { en: "phone number", fi: "puhelinnumero" },
};

// ---------- small helpers (pure) ----------

const showHours = (h: Hours, lang: "en" | "fi") =>
  h === "closed" ? (lang === "en" ? "closed" : "suljettu") : h.replace("-", "–");

const dateEn = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_EN[m - 1]} ${y}`;
};
const monthEn = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_EN[m - 1]} ${y}`;
};
/** "lokakuussa 2026" */
const monthFiIn = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_FI[m - 1]}ssa ${y}`;
};
/** "toukokuun 2024" */
const monthFiGen = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_FI[m - 1]}n ${y}`;
};

/** "a", "a and b", "a, b and c" */
function list(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Weekday of an ISO date (calendar maths only, no clock). */
function weekday(iso: string): Day {
  const js = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return DAYS[(js + 6) % 7];
}

/** The listing whose `field` was updated most recently (the best guess for the current value). */
function freshest(listings: Listing[], field: TrackedField): Listing | undefined {
  return [...listings].sort((a, b) =>
    (b.field_updated_at?.[field] ?? "").localeCompare(a.field_updated_at?.[field] ?? ""),
  )[0];
}

/** "Mon–Fri 09:00–18:00, Sat 09:00–15:00, Sun closed" (consecutive equal days grouped). */
function showWeek(week: Partial<OpeningHours>, lang: "en" | "fi"): string {
  const names = lang === "en" ? DAY_EN : DAY_FI;
  const parts: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const h = week[DAYS[i]];
    let j = i;
    while (j + 1 < DAYS.length && week[DAYS[j + 1]] === h) j++;
    if (h !== undefined) {
      const days = i === j ? names[DAYS[i]] : `${names[DAYS[i]]}–${names[DAYS[j]]}`;
      parts.push(`${days} ${showHours(h, lang)}`);
    }
    i = j + 1;
  }
  return parts.join(", ");
}

/** Short quote of a text without its final punctuation (keeps the sentence count right). */
const quote = (text: string) => `“${text.trim().replace(/[.!?]+$/, "")}”`;

// ---------- 1. missing holiday hours ----------

/** Common pattern when there is no history: a short Christmas Eve (until 14:00 at the latest),
 *  closed on the other public holidays. */
function categoryPattern(date: string, regular: OpeningHours | undefined): Hours {
  if (!date.endsWith("-12-24")) return "closed";
  const usual = regular?.[weekday(date)];
  const m = usual ? /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(usual) : null;
  if (!m || m[1] >= "14:00") return "closed";
  const close = m[2] < "14:00" ? m[2] : "14:00";
  return `${m[1]}-${close}`;
}

/** "Christmas Eve 10:00–14:00; closed on Christmas Day and Boxing Day" */
function describeHolidays(value: HolidayHours, names: (d: string) => string, lang: "en" | "fi"): string {
  const dates = Object.keys(value).sort();
  const open = dates.filter((d) => value[d] !== "closed").map((d) => `${names(d)} ${showHours(value[d], lang)}`);
  const closed = dates.filter((d) => value[d] === "closed").map(names);
  const parts = [...open];
  if (closed.length) {
    parts.push(lang === "en" ? `closed on ${list(closed, "and")}` : `${list(closed, "ja")} suljettu`);
  }
  return parts.join("; ");
}

function missingHolidayHours(business: Business, issue: Issue, listings: Listing[]): SuggestionDraft {
  const ev = issue.evidence as unknown as MissingHolidayHoursEvidence;
  const dates = [...ev.dates].sort();
  const lastYear = ev.last_year ?? {};
  const regular = freshest(listings, "opening_hours")?.opening_hours;

  const value: HolidayHours = {};
  let fromHistory = 0;
  for (const d of dates) {
    const prev = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    if (lastYear[prev]) {
      value[d] = lastYear[prev];
      fromHistory++;
    } else {
      value[d] = categoryPattern(d, regular);
    }
  }

  const nameEn = (d: string) => ev.holiday_names?.[d] ?? dateEn(d);
  const nameFi = (d: string) => HOLIDAY_FI[d.slice(5)] ?? nameEn(d);
  const span = (n: (d: string) => string) =>
    dates.length === 1 ? n(dates[0]) : `${n(dates[0])} – ${n(dates[dates.length - 1])}`;
  const plural = dates.length > 1;
  const cat = CATEGORY[business.category];
  const enList = describeHolidays(value, nameEn, "en");
  const fiList = describeHolidays(value, nameFi, "fi");

  const enIntro = plural
    ? `Hi ${business.owner_name}, the holidays (${span(nameEn)}) are coming up and your hours for them aren't set anywhere yet`
    : `Hi ${business.owner_name}, ${nameEn(dates[0])} is coming up and your hours for it aren't set anywhere yet`;
  const fiIntro = plural
    ? `Hei ${business.owner_name}, pyhät (${span(nameFi)}) lähestyvät, eikä aukioloaikoja ole vielä merkitty mihinkään`
    : `Hei ${business.owner_name}, ${nameFi(dates[0])} lähestyy, eikä aukioloaikaa ole vielä merkitty mihinkään`;

  let confidence: Confidence;
  let reason: string;
  let en: string;
  let fi: string;
  if (fromHistory === dates.length) {
    confidence = "high";
    reason = "No hours are set for the coming holidays on any channel, so this copies your own hours from the same days last year.";
    en = `${enIntro}. Shall I publish the same hours as last year: ${enList}?`;
    fi = `${fiIntro}. Julkaisenko samat ajat kuin viime vuonna: ${fiList}?`;
  } else if (fromHistory === 0) {
    confidence = "low";
    reason = `No hours are set for the coming holidays and there are no hours from last year to copy, so this follows what most ${cat.en} do.`;
    en = `${enIntro}, and I can't find last year's hours for ${plural ? "them" : "it"}. Shall I use what most ${cat.en} do: ${enList}?`;
    fi = `${fiIntro}, enkä löydä viime vuoden aikoja. Käytänkö samaa kuin useimmat ${cat.fi}: ${fiList}?`;
  } else {
    confidence = "medium";
    reason = `No hours are set for the coming holidays; this copies your hours from last year where they exist and uses what most ${cat.en} do for the rest.`;
    en = `${enIntro}. Shall I publish these, based on last year where I have it: ${enList}?`;
    fi = `${fiIntro}. Julkaisenko nämä viime vuoden pohjalta: ${fiList}?`;
  }

  return { proposed_change: { field: "holiday_hours", value }, reason, confidence, message: { en, fi } };
}

// ---------- 2. cross-platform conflict ----------

interface ValueGroup {
  value: string;
  sources: Source[];
  updated_at: string | null; // newest update among these sources
}

function groupValues(values: CrossPlatformConflictEvidence["values"]): ValueGroup[] {
  const groups = new Map<string, ValueGroup>();
  for (const v of values) {
    const g = groups.get(v.value) ?? { value: v.value, sources: [], updated_at: null };
    g.sources.push(v.source);
    if (v.updated_at && (!g.updated_at || v.updated_at > g.updated_at)) g.updated_at = v.updated_at;
    groups.set(v.value, g);
  }
  return [...groups.values()];
}

function crossPlatformConflict(business: Business, issue: Issue): SuggestionDraft {
  const ev = issue.evidence as unknown as CrossPlatformConflictEvidence;
  const groups = groupValues(ev.values);
  const isPhone = ev.field === "phone";
  const day = isPhone ? null : (ev.field.split(".")[1] as Day);
  const show = (v: string, lang: "en" | "fi") => (isPhone ? v : showHours(v, lang));

  // Pick: the strictly newest source; otherwise (tie or no dates, always for phone) the majority value.
  const dated = groups.filter((g) => g.updated_at).sort((a, b) => b.updated_at!.localeCompare(a.updated_at!));
  const newestWins = !isPhone && dated.length > 0 && (dated.length === 1 || dated[0].updated_at! > dated[1].updated_at!);
  const bySize = [...groups].sort((a, b) => b.sources.length - a.sources.length);
  const majorityWins = bySize.length === 1 || bySize[0].sources.length > bySize[1].sources.length;
  const pick = newestWins ? dated[0] : bySize[0];
  const others = groups.filter((g) => g !== pick);

  const proposed_change: TypedProposedChange = isPhone
    ? { field: "phone", value: pick.value }
    : { field: "opening_hours", value: { [day!]: pick.value } };

  const confidence: Confidence = newestWins ? "high" : majorityWins ? "medium" : "low";

  // "your website says 10:00–14:00 but Finder and Google say 10:00–18:00"
  const sayEn = (g: ValueGroup) => {
    const who = list(g.sources.map((s) => SOURCE_EN[s]), "and");
    const verb = isPhone ? (g.sources.length > 1 ? "show" : "shows") : g.sources.length > 1 ? "say" : "says";
    return `${who} ${verb} ${show(g.value, "en")}`;
  };
  const sayFi = (g: ValueGroup) => `${list(g.sources.map((s) => SOURCE_FI_IN[s]), "ja")} ${show(g.value, "fi")}`;
  const whatEn = isPhone ? "for your phone number" : `for ${DAY_EN_LONG[day!]}`;
  const whatFi = isPhone ? "puhelinnumerosi on" : `aukioloaika ${DAY_FI_ESSIVE[day!]} on`;
  const pickWhoEn = list(pick.sources.map((s) => SOURCE_EN[s]), "and");
  const pickWhoFi = list(pick.sources.map((s) => SOURCE_FI[s]), "ja");

  const en1 = `Hi ${business.owner_name}, ${whatEn} ${sayEn(pick)} but ${list(others.map(sayEn), "and")}`;
  const fi1 = `Hei ${business.owner_name}, ${whatFi} ${sayFi(pick)}, mutta ${list(others.map(sayFi), "ja")}`;

  let reason: string;
  let en2: string;
  let fi2: string;
  if (newestWins) {
    reason = `${capitalize(pickWhoEn)} ${pick.sources.length > 1 ? "were" : "was"} updated most recently (${dateEn(pick.updated_at!)}), so ${pick.sources.length > 1 ? "their" : "its"} value is most likely the current one.`;
    en2 = `${capitalize(pickWhoEn)} ${pick.sources.length > 1 ? "were" : "was"} updated most recently (${monthEn(pick.updated_at!)}), so shall I use ${show(pick.value, "en")} everywhere?`;
    fi2 = `${capitalize(pickWhoFi)} on päivitetty viimeksi (${monthFiIn(pick.updated_at!)}), joten päivitänkö kaikkialle ${show(pick.value, "fi")}?`;
  } else if (majorityWins) {
    reason = `${capitalize(pickWhoEn)} agree on this value, against ${list(others.flatMap((g) => g.sources.map((s) => SOURCE_EN[s])), "and")}.`;
    en2 = `Shall I use ${show(pick.value, "en")} everywhere, as most of your listings do?`;
    fi2 = `Päivitänkö kaikkialle ${show(pick.value, "fi")}, kuten useimmissa ilmoituksissasi?`;
  } else {
    reason = "Your listings disagree and none of them is clearly newer, so please check which value is right.";
    en2 = `Which one is right, ${show(pick.value, "en")}?`;
    fi2 = `Kumpi on oikein, ${show(pick.value, "fi")}?`;
  }

  return { proposed_change, reason, confidence, message: { en: `${en1}. ${en2}`, fi: `${fi1}. ${fi2}` } };
}

// ---------- 3. stale field ----------

function staleField(business: Business, issue: Issue, listings: Listing[]): SuggestionDraft {
  const ev = issue.evidence as unknown as StaleFieldEvidence;
  const field = ev.field;
  const current = ev.current_value ?? freshest(listings, field)?.[field];
  const label = FIELD_LABEL[field];
  const where = list(ev.stale_sources.map((s) => SOURCE_EN[s]), "and");
  const reason = `Your ${label.en} ${field === "description" ? "was" : "were"} last updated on ${dateEn(ev.oldest_update)} (on ${where}), over a year ago.`;

  let proposed_change: TypedProposedChange;
  let enQ: string;
  let fiQ: string;
  if (field === "opening_hours") {
    const week = current as OpeningHours;
    proposed_change = { field, value: week };
    enQ = `Are they still ${showWeek(week, "en")}?`;
    fiQ = `Ovatko ne yhä ${showWeek(week, "fi")}?`;
  } else if (field === "holiday_hours") {
    const hh = current as HolidayHours;
    proposed_change = { field, value: hh };
    enQ = "Can you check that they are still right?";
    fiQ = "Voitko tarkistaa, ovatko ne yhä oikein?";
  } else {
    const text = String(current ?? "");
    proposed_change = { field: "description", value: text };
    enQ = `Is ${quote(text)} still right?`;
    fiQ = `Pitääkö ${quote(text)} yhä paikkansa?`;
  }

  const en = `Hi ${business.owner_name}, your ${label.en} ${field === "description" ? "hasn't" : "haven't"} been updated since ${monthEn(ev.oldest_update)}. ${enQ}`;
  const fiVerb = field === "description" ? "ei ole päivittynyt" : "eivät ole päivittyneet";
  const fi = `Hei ${business.owner_name}, ${label.fi} ${fiVerb} ${monthFiGen(ev.oldest_update)} jälkeen. ${fiQ}`;

  return { proposed_change, reason, confidence: "medium", message: { en, fi } };
}

// ---------- 4. review signal ----------

function reviewSignal(business: Business, issue: Issue, listings: Listing[]): SuggestionDraft {
  const ev = issue.evidence as unknown as ReviewSignalEvidence;
  const fresh = (f: TrackedField) => freshest(listings, f);
  let proposed_change: TypedProposedChange;
  let label: { en: string; fi: string };
  if (ev.signal_type === "closed_when_open") {
    proposed_change = { field: "opening_hours", value: fresh("opening_hours")?.opening_hours ?? {} };
    label = FIELD_LABEL.opening_hours;
  } else if (ev.signal_type === "wrong_phone") {
    proposed_change = { field: "phone", value: listings[0]?.phone ?? "" };
    label = FIELD_LABEL.phone;
  } else {
    proposed_change = { field: "description", value: fresh("description")?.description ?? "" };
    label = FIELD_LABEL.description;
  }
  const n = ev.reviews?.length ?? 0;
  return {
    proposed_change,
    reason: `${n} recent review${n === 1 ? "" : "s"} suggest${n === 1 ? "s" : ""} your ${label.en} may be out of date: ${ev.summary}`,
    confidence: "low",
    message: {
      en: `Hi ${business.owner_name}, recent reviews suggest your ${label.en} may be out of date. Can you check it?`,
      fi: `Hei ${business.owner_name}, tuoreiden arvostelujen mukaan ${label.fi} voi olla vanhentunut. Voitko tarkistaa sen?`,
    },
  };
}

// ---------- entry point ----------

/** Deterministic suggestion for one issue. Never throws for the four known issue types. */
export function fallbackSuggestion(
  business: Business,
  issue: Issue,
  listings: Listing[],
  prefs: Preferences | null,
): SuggestionDraft {
  void prefs; // learned decisions and standing permissions are used from stage A5
  switch (issue.type) {
    case "missing_holiday_hours":
      return missingHolidayHours(business, issue, listings);
    case "cross_platform_conflict":
      return crossPlatformConflict(business, issue);
    case "stale_field":
      return staleField(business, issue, listings);
    case "review_signal":
      return reviewSignal(business, issue, listings);
    case "special_day_hours":
    case "needs_human":
      throw new Error(`no template for ${issue.type} yet (stage A11)`);
  }
}
