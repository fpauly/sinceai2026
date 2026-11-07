import { showHours } from "@/lib/hours";
import type { Business, Language, Messages } from "@/types";
import type { SuggestionWithIssue } from "@/types/api";

export function contactName(business: Business) {
  return business.contact?.first_name || business.owner_name;
}

export function contactLanguage(business: Business): Language {
  return business.contact?.language ?? business.language;
}

export function contactChannel(business: Business): string {
  const channels = { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", APP_PUSH: "App notification" };
  return business.contact ? channels[business.contact.channel] : "WhatsApp";
}

export function OwnerMessage({ message, language }: { message: Messages; language: Language }) {
  const selected = message[language] ? language : "en";
  const alternate = selected === "en" ? (["fi", "sv", "nb"] as const).find((lang) => message[lang]) : "en";
  const names = { en: "English translation", fi: "Also available in Finnish", sv: "Also available in Swedish", nb: "Also available in Norwegian" };
  return <>
    <p lang={selected} className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message[selected]}</p>
    {alternate && <details className="mt-2 text-xs text-zinc-500"><summary className="cursor-pointer py-1">{names[alternate]}</summary><p lang={alternate} className="mt-1 whitespace-pre-wrap leading-5">{message[alternate]}</p></details>}
  </>;
}

/** A simulated timestamp within the stored window; never represents an actual send. */
export function ContactWindow({ business }: { business: Business }) {
  const window = business.contact?.best_contact_window;
  if (!window) return null;
  const match = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(window.trim());
  const start = match ? Number(match[1]) : NaN;
  const end = match ? Number(match[2]) : NaN;
  const valid = start >= 0 && start <= 23 && end >= 0 && end <= 24 && start !== end;
  return <p className="mt-3 text-xs leading-5 text-zinc-500">{valid
    ? `Simulated send at ${String(start).padStart(2, "0")}:00, inside ${contactName(business)}'s ${window} contact window.`
    : `Preferred contact window: ${window}. No send time has been simulated.`}</p>;
}

export function AutomaticallyApplied({ suggestions, language = "en" }: { suggestions: SuggestionWithIssue[]; language?: Language }) {
  if (!suggestions.length) return null;
  return <section aria-label="Automatically applied changes" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6">
    <h2 className="font-semibold">Applied automatically · For your information</h2>
    <p lang={language} className="mt-2">{{
      en: "These changes were saved under your standing permission. No approval is needed.",
      fi: "Nämä muutokset tallennettiin antamallasi ennakkoluvalla. Sinun ei tarvitse hyväksyä niitä uudelleen.",
      sv: "Ändringarna sparades med ditt förhandsgodkännande. Du behöver inte godkänna dem igen.",
      nb: "Endringene ble lagret med din forhåndstillatelse. Du trenger ikke godkjenne dem på nytt.",
    }[language]}</p>
    <ul className="mt-2 space-y-3">{suggestions.map((suggestion) => <li key={suggestion._id} className="break-words">
      {Object.entries(suggestion.proposed_change.value ?? {}).map(([date, hours]) => <p key={date}>{date}: <strong>{typeof hours === "string" ? showHours(hours, "Closed") : String(hours)}</strong></p>)}
      <p className="text-xs text-zinc-600">{suggestion.applied?.yext
        ? `Published via Yext to: ${suggestion.applied.published_to.join(", ")}.`
        : "Saved locally. External publication is not confirmed."}</p>
    </li>)}</ul>
  </section>;
}
