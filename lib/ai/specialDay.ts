import type { Business, Day, Hours, Issue } from "@/types";
import type { SpecialDayHoursEvidence, SuggestionDraft } from "@/types/api";
import { parseHours, formatHours } from "@/lib/hours";
import { cycleOf } from "@/lib/predict";

// v2 messages for `special_day_hours` (DESIGN 0 "v2", stage A11), without an LLM.
// Fonecta's style (their quickstart example): the day and date, what Google shows now, what the
// proposal is based on, then the exact proposal on a last "We suggest: …" line.
// English (the demo language) + the owner's language (fi / sv / nb).
//
// Every value comes from the issue evidence, which lib/predict filled: nothing is invented here.
// At most 2 sentences + the "We suggest" line (lib/validate.ts). Dates are written "24.12" (no
// trailing dot: a dot followed by a space would end the sentence) and "24/12" in Swedish.

export type OwnerLang = "fi" | "sv" | "nb";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY: Record<"en" | OwnerLang, Record<Day, string>> = {
  en: { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" },
  fi: { mon: "maanantaina", tue: "tiistaina", wed: "keskiviikkona", thu: "torstaina", fri: "perjantaina", sat: "lauantaina", sun: "sunnuntaina" },
  sv: { mon: "måndag", tue: "tisdag", wed: "onsdag", thu: "torsdag", fri: "fredag", sat: "lördag", sun: "söndag" },
  nb: { mon: "mandag", tue: "tirsdag", wed: "onsdag", thu: "torsdag", fri: "fredag", sat: "lørdag", sun: "søndag" },
};

/** The owner's language for the second message: the contact's, else by country. */
export function ownerLanguage(business: Business): OwnerLang {
  const l = business.contact?.language ?? business.language;
  if (l === "fi" || l === "sv" || l === "nb") return l;
  return business.country === "SE" ? "sv" : business.country === "NO" ? "nb" : "fi";
}

export function firstName(business: Business): string {
  return business.contact?.first_name || business.owner_name || business.name;
}

// ---------- formatting ----------

/** "07:30-13:00" -> "7.30–13" (Nordic style); several intervals joined with the local "and". */
function nordicHours(h: Hours, and: string): string {
  const p = parseHours(h);
  if (!p || !p.length) return h;
  const t = (x: string) => {
    const [hh, mm] = x.split(":");
    return `${Number(hh)}${mm === "00" ? "" : `.${mm}`}`;
  };
  const parts = formatHours(p).split(",").map((iv) => iv.split("-").map(t).join("–"));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`;
}

function englishHours(h: Hours): string {
  const p = parseHours(h);
  if (!p || !p.length) return h;
  const parts = formatHours(p).split(",").map((iv) => iv.replace("-", "–"));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "open 7.30–13" / "closed", per language. */
function state(h: Hours, lang: "en" | OwnerLang): string {
  const closed = parseHours(h)?.length === 0;
  switch (lang) {
    case "en":
      return closed ? "closed" : `open ${englishHours(h)}`;
    case "fi":
      return closed ? "kiinni" : `auki klo ${nordicHours(h, "ja")}`;
    case "sv":
      return closed ? "stängt" : `öppet ${nordicHours(h, "och")}`;
    case "nb":
      return closed ? "stengt" : `åpent ${nordicHours(h, "og")}`;
  }
}

function dateText(iso: string, lang: "en" | OwnerLang): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (lang === "en") return `${d} ${MONTHS_EN[m - 1]}`;
  return lang === "sv" ? `${d}/${m}` : `${d}.${m}`;
}

const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Day names as written inside a sentence, per language (the calendar only has the country's own
 *  language, and a Finnish business can have a Swedish-speaking owner). */
const DAY_NAMES: Partial<Record<string, Record<OwnerLang, string>>> = {
  XMAS_EVE: { fi: "jouluaatto", sv: "julafton", nb: "julaften" },
  XMAS_DAY: { fi: "joulupäivä", sv: "juldagen", nb: "første juledag" },
  BOXING_DAY: { fi: "tapaninpäivä", sv: "annandag jul", nb: "andre juledag" },
  DEC23: { fi: "aatonaatto", sv: "dagen före julafton", nb: "lillejulaften" },
  INTERDAY: { fi: "välipäivä", sv: "mellandagen", nb: "romjulsdagen" },
  NYE: { fi: "uudenvuodenaatto", sv: "nyårsafton", nb: "nyttårsaften" },
  NEW_YEARS_DAY: { fi: "uudenvuodenpäivä", sv: "nyårsdagen", nb: "første nyttårsdag" },
  EPIPHANY_EVE: { fi: "loppiaisaatto", sv: "trettondagsafton", nb: "trettendagsaften" },
  EPIPHANY: { fi: "loppiainen", sv: "trettondedag jul", nb: "hellig tre kongers dag" },
  INDEPENDENCE_DAY: { fi: "itsenäisyyspäivä", sv: "självständighetsdagen", nb: "Finlands uavhengighetsdag" },
  FATHERS_DAY: { fi: "isänpäivä", sv: "fars dag", nb: "farsdag" },
  MOTHERS_DAY: { fi: "äitienpäivä", sv: "mors dag", nb: "morsdag" },
  LUCIA: { fi: "Lucian päivä", sv: "luciadagen", nb: "luciadagen" },
  BLACK_FRIDAY: { fi: "Black Friday", sv: "Black Friday", nb: "Black Friday" },
  ALL_SAINTS: { fi: "pyhäinpäivä", sv: "alla helgons dag", nb: "allehelgensdag" },
  EVENT: { fi: "tapahtumailta", sv: "evenemangskvällen", nb: "arrangementskvelden" },
  SCHOOL_BREAK: { fi: "koululoman päivä", sv: "skollovsdagen", nb: "skoleferiedagen" },
};

/** English names that read badly inside a sentence. */
const EN_NAMES: Partial<Record<string, string>> = { DEC23: "the day before Christmas Eve", INTERDAY: "the day between Christmas and New Year" };

function dayName(ev: SpecialDayHoursEvidence, lang: "en" | OwnerLang): string {
  if (lang === "en") return EN_NAMES[ev.day_key] ?? ev.day_name.en;
  return DAY_NAMES[ev.day_key]?.[lang] ?? lower(ev.day_name.local);
}

// ---------- the basis sentence ----------

type Basis =
  | { kind: "last_year"; hours: Hours; when: "last_year" | { year: number } | { event: string; date: string } }
  | { kind: "centre"; name: string; hours: Hours }
  | { kind: "peers" }
  | { kind: "owner"; hours: Hours };

function basisOf(ev: SpecialDayHoursEvidence): Basis {
  const d = ev.basis_detail ?? {};
  if (ev.basis === "OWNER_EDIT" && d.owner_edit) return { kind: "owner", hours: d.owner_edit.hours };
  if (ev.basis === "SHOPPING_CENTRE" && d.shopping_centre) {
    return { kind: "centre", name: d.shopping_centre.name, hours: d.shopping_centre.hours };
  }
  if (ev.basis === "LAST_YEAR" && d.last_year) {
    const ly = d.last_year;
    if (ev.day_key === "EVENT" || ev.day_key === "SCHOOL_BREAK") {
      return { kind: "last_year", hours: ly.hours, when: { event: ev.day_key, date: ly.date } };
    }
    const back = cycleOf(ev.date) - cycleOf(ly.date);
    return { kind: "last_year", hours: ly.hours, when: back <= 1 ? "last_year" : { year: Number(ly.date.slice(0, 4)) } };
  }
  return { kind: "peers" };
}

function basisSentence(b: Basis, lang: "en" | OwnerLang): string {
  if (b.kind === "owner") {
    return {
      en: `Last time you set it to ${state(b.hours, "en")} yourself.`,
      fi: `Viime kerralla merkitsit itse: ${state(b.hours, "fi")}.`,
      sv: `Förra gången angav du själv ${state(b.hours, "sv")}.`,
      nb: `Sist gang la du selv inn ${state(b.hours, "nb")}.`,
    }[lang];
  }
  if (b.kind === "centre") {
    return {
      en: `${b.name} is ${state(b.hours, "en")} that day, but no special hours are set for you.`,
      fi: `${b.name} on silloin ${state(b.hours, "fi")}, mutta teille ei ole merkitty poikkeusaikoja.`,
      sv: `${b.name} har då ${state(b.hours, "sv")}, men inga avvikande tider är inlagda för er.`,
      nb: `${b.name} har da ${state(b.hours, "nb")}, men ingen avvikende tider er lagt inn for dere.`,
    }[lang];
  }
  if (b.kind === "peers") {
    return {
      en: "Most similar businesses nearby are closed that day and nothing is set for you, so is that right for you too?",
      fi: "Useimmat vastaavat yritykset alueellanne ovat silloin kiinni, eikä teille ole merkitty poikkeusaikoja, joten pitääkö tämä paikkansa teilläkin?",
      sv: "De flesta liknande företag i området har stängt då och inga avvikande tider är inlagda för er, så stämmer det för er också?",
      nb: "De fleste lignende bedrifter i området har stengt da og ingen avvikende tider er lagt inn for dere, så stemmer det for dere også?",
    }[lang];
  }
  const w = b.when;
  if (w === "last_year") {
    return {
      en: `Last year you were ${state(b.hours, "en")}, but no special hours are set for this year.`,
      fi: `Viime vuonna olitte ${state(b.hours, "fi")}, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty.`,
      sv: `Förra året hade ni ${state(b.hours, "sv")}, men inga avvikande tider är inlagda i år.`,
      nb: `I fjor hadde dere ${state(b.hours, "nb")}, men ingen avvikende åpningstider er lagt inn i år.`,
    }[lang];
  }
  if ("year" in w) {
    return {
      en: `In ${w.year} you were ${state(b.hours, "en")}, but no special hours are set for this year.`,
      fi: `Vuonna ${w.year} olitte ${state(b.hours, "fi")}, mutta tälle vuodelle poikkeusaikoja ei ole vielä merkitty.`,
      sv: `År ${w.year} hade ni ${state(b.hours, "sv")}, men inga avvikande tider är inlagda i år.`,
      nb: `I ${w.year} hadde dere ${state(b.hours, "nb")}, men ingen avvikende åpningstider er lagt inn i år.`,
    }[lang];
  }
  const event = w.event === "EVENT";
  const when = dateText(w.date, lang);
  return {
    en: `On your last ${event ? "event night" : "school-holiday day"} (${when}) you were ${state(b.hours, "en")}.`,
    fi: `${event ? "Edellisenä tapahtumailtana" : "Edellisellä koululomalla"} (${when}) olitte ${state(b.hours, "fi")}.`,
    sv: `${event ? "Senaste evenemangskvällen" : "Under senaste skollovet"} (${when}) hade ni ${state(b.hours, "sv")}.`,
    nb: `${event ? "Forrige arrangementskveld" : "I forrige skoleferie"} (${when}) hadde dere ${state(b.hours, "nb")}.`,
  }[lang];
}

// ---------- the message ----------

function message(business: Business, ev: SpecialDayHoursEvidence, lang: "en" | OwnerLang): string {
  const name = firstName(business);
  const day = dayName(ev, lang);
  const date = dateText(ev.date, lang);
  const wd = WEEKDAY[lang][ev.weekday];
  const regular = ev.displayed_from === "regular";
  const shown = state(ev.displayed_hours, lang);
  const first = {
    en: `Hi ${name}, ${day} is on ${wd} ${date} and Google now shows ${regular ? "your regular hours" : "the special hours you entered"}, ${shown}.`,
    fi: `Hei ${name}, ${day} on ${wd} ${date} ja Google näyttää nyt ${regular ? "tavalliset aukioloaikanne" : "merkitsemänne poikkeusajat"}: ${shown}.`,
    sv: `Hej ${name}, ${day} infaller ${wd} ${date} och Google visar nu ${regular ? "era vanliga öppettider" : "de avvikande tider ni lagt in"}: ${shown}.`,
    nb: `Hei ${name}, ${day} er ${wd} ${date} og Google viser nå ${regular ? "de vanlige åpningstidene deres" : "de avvikende tidene dere la inn"}: ${shown}.`,
  }[lang];
  const suggest = {
    en: `We suggest: ${day} ${date} ${state(ev.proposed_hours, "en")}.`,
    fi: `Ehdotamme: ${day} ${date} ${state(ev.proposed_hours, "fi")}.`,
    sv: `Vi föreslår: ${day} ${date} ${state(ev.proposed_hours, "sv")}.`,
    nb: `Vi foreslår: ${day} ${date} ${state(ev.proposed_hours, "nb")}.`,
  }[lang];
  return `${first} ${basisSentence(basisOf(ev), lang)} ${suggest}`;
}

/** One English sentence for the owner card and the staff view: what the proposal is based on. */
function reasonOf(ev: SpecialDayHoursEvidence): string {
  const b = basisOf(ev);
  const shown = englishHours(ev.displayed_hours);
  const now = `Google now shows ${ev.displayed_hours === "closed" ? "closed" : shown} for ${dayName(ev, "en")}`;
  const entered = (h: Hours) => (parseHours(h)?.length === 0 ? "were closed" : `entered ${englishHours(h)}`);
  switch (b.kind) {
    case "owner":
      return `${now}, and last time you ${parseHours(b.hours)?.length === 0 ? "set it to closed" : `set ${englishHours(b.hours)}`} yourself.`;
    case "centre":
      return `${now}, and ${b.name} is ${state(b.hours, "en")} that day.`;
    case "peers":
      return `${now}, and most similar businesses nearby are closed that day (no history of your own).`;
    case "last_year":
      if (b.when === "last_year") return `${now}, and last year you ${entered(b.hours)} on the same day.`;
      if ("year" in b.when) return `${now}, and in ${b.when.year} you ${entered(b.hours)} on the same day.`;
      return `${now}, and on your last ${b.when.event === "EVENT" ? "event night" : "school-holiday day"} you were ${state(b.hours, "en")}.`;
  }
}

/** The template draft for one special-day issue. */
export function specialDaySuggestion(business: Business, issue: Issue): SuggestionDraft {
  const ev = issue.evidence as unknown as SpecialDayHoursEvidence;
  const lang = ownerLanguage(business);
  return {
    proposed_change: { field: "holiday_hours", value: { [ev.date]: ev.proposed_hours } },
    reason: reasonOf(ev),
    confidence: ev.confidence,
    message: { en: message(business, ev, "en"), [lang]: message(business, ev, lang) },
  };
}
