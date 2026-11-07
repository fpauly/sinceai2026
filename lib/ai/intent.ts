import "server-only";
import { z } from "zod";
import type { Day, Hours, OpeningHours, Suggestion } from "@/types";
import { DAYS } from "@/types";
import type { IntentResult } from "@/types/api";
import { generateJson, geminiConfigured } from "@/lib/ai/gemini";

// Parse the owner's spoken (or typed) reply to one suggestion (DESIGN 9.3, used by lane B's voice
// reply route). Gemini only classifies the reply and extracts what the owner said; code builds the
// edited value, checks it, and writes the confirmation text, so nothing is invented.
//  - intent "edit" -> edited_value has the same shape as proposed_change.value (full value, the
//    owner's changes merged in) and is shown for a final tap before saving
//  - no key / Gemini error / anything we cannot turn into a valid value -> a conservative keyword
//    match ("yes", "ignore it"), otherwise "unclear" (the UI then asks for a tap)
// Never throws.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const Extracted = z.object({
  intent: z.enum(["accept", "edit", "ignore", "unclear"]),
  changes: z.array(
    z.object({
      key: z.string(), // a date or day key from proposed_value
      closed: z.boolean(),
      open: z.string().nullable(), // "HH:MM" (24 h) or null when not said
      close: z.string().nullable(),
    }),
  ),
  new_text: z.string().nullable(), // for phone / description edits
});
type Extracted = z.infer<typeof Extracted>;

const SYSTEM = `You read a small business owner's reply to a suggested change to their public listing and extract what they want. You do not decide anything yourself.

You get the suggested change (field + proposed_value, with labels for its keys) and the owner's reply (English or Finnish, possibly a speech transcript with errors).

Return JSON:
- intent: "accept" (agrees with the suggestion as it is), "edit" (agrees but changes something), "ignore" (does not want it, "no", "skip", "leave it"), or "unclear" (anything else, a question, or you are not sure)
- changes: only for "edit" and hours fields. One entry per key the owner changes. key MUST be one of the keys of proposed_value (match "the 26th", "Boxing Day", "Saturday" to the right key using the labels). closed: true if they say it is closed that day. open / close: the times they say, as 24-hour "HH:MM" (so "11" -> "11:00", "3 pm" -> "15:00"); null for a time they did not say. Never fill in a time they did not say.
- new_text: only for "edit" of a phone number or description: the new value exactly as said; otherwise null.

If the reply mentions a day or date that is not one of the keys, use "unclear".`;

/** Parse the owner's reply to `suggestion`. `openingHours` (the business's regular week) lets a
 *  reply like "11 on the 26th" keep the usual closing time when the proposal for that day is closed. */
export async function parseIntent(
  suggestion: Pick<Suggestion, "proposed_change">,
  transcript: string,
  openingHours?: Partial<OpeningHours>,
): Promise<IntentResult> {
  const text = transcript.trim();
  if (!text) return unclear();

  // A short typed edit ("24.12 8-12", "8.30–13", "closed") is read by code first: fast, no LLM needed.
  const typed = typedEdit(text, suggestion);
  if (typed) return toResult(typed, suggestion, openingHours);

  if (geminiConfigured()) {
    try {
      const extracted = await generateJson({
        system: SYSTEM,
        prompt: JSON.stringify(
          {
            field: suggestion.proposed_change.field,
            proposed_value: suggestion.proposed_change.value,
            key_labels: keyLabels(suggestion.proposed_change.value),
            owner_reply: text,
          },
          null,
          2,
        ),
        schema: Extracted,
        temperature: 0,
      });
      return toResult(extracted, suggestion, openingHours);
    } catch (err) {
      console.warn(`[intent] Gemini failed, using keywords (${err instanceof Error ? err.message : err})`);
    }
  }
  return keywordIntent(text);
}

// ---------- code side: build and check the value, write the confirmation ----------

function toResult(
  x: Extracted,
  suggestion: Pick<Suggestion, "proposed_change">,
  openingHours?: Partial<OpeningHours>,
): IntentResult {
  if (x.intent === "accept") return { intent: "accept", confirmation_text: "Great, I'll publish it as suggested. Tap to confirm." };
  if (x.intent === "ignore") return { intent: "ignore", confirmation_text: "OK, I'll leave it as it is and won't ask about this again." };
  if (x.intent !== "edit") return unclear();

  const { field, value } = suggestion.proposed_change;

  if (field === "phone" || field === "description") {
    const newText = x.new_text?.trim();
    if (!newText) return unclear();
    return { intent: "edit", edited_value: newText, confirmation_text: `Got it: ${newText}. Tap to confirm.` };
  }

  if ((field !== "holiday_hours" && field !== "opening_hours") || !isRecord(value) || x.changes.length === 0) {
    return unclear();
  }
  const proposed = value as Record<string, Hours>;
  const edited: Record<string, Hours> = { ...proposed };
  const said: string[] = [];
  for (const ch of x.changes) {
    if (!(ch.key in proposed)) return unclear(); // never add a date/day that was not proposed
    const hours = buildHours(ch, proposed[ch.key], usualHours(ch.key, openingHours));
    if (!hours) return unclear();
    edited[ch.key] = hours;
    said.push(`${label(ch.key)} ${hours === "closed" ? "closed" : hours.replace("-", "–")}`);
  }
  return {
    intent: "edit",
    edited_value: edited,
    confirmation_text: `Got it: ${said.join(", ")}, the rest as suggested. Tap to confirm.`,
  };
}

/** Owner's words -> "HH:MM-HH:MM" | "closed" | null (not enough to build valid hours). */
function buildHours(
  ch: Extracted["changes"][number],
  proposed: Hours | undefined,
  usual: Hours | undefined,
): Hours | null {
  if (ch.closed) return "closed";
  const open = ch.open ?? null;
  const close = ch.close ?? null;
  if ((open && !HHMM.test(open)) || (close && !HHMM.test(close))) return null;
  if (!open && !close) return null;
  // A missing bound comes from the proposal for that key, else the usual hours for that weekday.
  const base = [proposed, usual].find((h) => h && h !== "closed" && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(h));
  const [baseOpen, baseClose] = base ? base.split("-") : [null, null];
  const o = open ?? baseOpen;
  const c = close ?? baseClose;
  if (!o || !c || c <= o) return null;
  return `${o}-${c}`;
}

/** Usual hours for a key: a day key directly, a date key via its weekday. */
function usualHours(key: string, week?: Partial<OpeningHours>): Hours | undefined {
  if (!week) return undefined;
  if ((DAYS as readonly string[]).includes(key)) return week[key as Day];
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return week[DAYS[(new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7]];
  return undefined;
}

// ---------- typed edits, read by code ----------

const CLOSED_WORDS = /^(closed|kiinni|suljettu|stängt|stengt)$/i;
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?`;
const RANGE = new RegExp(`^${TIME}\\s*-\\s*${TIME}$`);
const DATE = /^(\d{1,2})[./](\d{1,2})\.?$/;

/** "24.12 8-12", "8.30–13", "24/12 closed", "kiinni": one hours change for an hours suggestion with
 *  ONE key (the v2 special day). A date, if written, must be that key's day and month. Anything else
 *  (other words, several days, a question) -> null, and Gemini or the keywords take over. */
function typedEdit(text: string, suggestion: Pick<Suggestion, "proposed_change">): Extracted | null {
  const { field, value } = suggestion.proposed_change;
  if ((field !== "holiday_hours" && field !== "opening_hours") || !isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  const key = keys[0];
  const tokens = text.replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-").replace(/[.!]+$/, "").trim().split(/\s+/);
  if (tokens.length > 2) return null;
  let rest = tokens;
  const d = DATE.exec(tokens[0]);
  if (tokens.length === 2) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    if (Number(d[1]) !== Number(key.slice(8, 10)) || Number(d[2]) !== Number(key.slice(5, 7))) return null;
    rest = tokens.slice(1);
  }
  const word = rest[0];
  if (CLOSED_WORDS.test(word)) return { intent: "edit", changes: [{ key, closed: true, open: null, close: null }], new_text: null };
  const r = RANGE.exec(word);
  if (!r) return null;
  const hhmm = (h: string, m?: string) => (Number(h) <= 23 ? `${h.padStart(2, "0")}:${m ?? "00"}` : null);
  const open = hhmm(r[1], r[2]);
  const close = hhmm(r[3], r[4]);
  if (!open || !close) return null;
  return { intent: "edit", changes: [{ key, closed: false, open, close }], new_text: null };
}

// ---------- keyword fallback (no Gemini) ----------

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|sounds good|go ahead|do it|please do|correct|that's right|kyllä|joo|juu|käy|ok kiitos|kyllä kiitos)[.! ]*$/i;
const NO = /^(no|nope|ignore( it)?|skip( it)?|leave it|not now|don't|no thanks|ei|ei kiitos|älä)[.! ]*$/i;

function keywordIntent(text: string): IntentResult {
  if (YES.test(text)) return { intent: "accept", confirmation_text: "Great, I'll publish it as suggested. Tap to confirm." };
  if (NO.test(text)) return { intent: "ignore", confirmation_text: "OK, I'll leave it as it is and won't ask about this again." };
  return unclear();
}

// ---------- small helpers ----------

function unclear(): IntentResult {
  return { intent: "unclear", confirmation_text: "Sorry, I didn't quite get that. Please tap one of the buttons." };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES: Record<Day, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const HOLIDAYS: Record<string, string> = {
  "12-06": "Independence Day", "12-24": "Christmas Eve", "12-25": "Christmas Day",
  "12-26": "Boxing Day", "01-01": "New Year's Day", "01-06": "Epiphany",
};

/** "26 Dec (Boxing Day)" for a date key, "Saturday" for a day key. */
function label(key: string): string {
  if (key in DAY_NAMES) return DAY_NAMES[key as Day];
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const base = `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}`;
  const holiday = HOLIDAYS[`${m[1]}-${m[2]}`];
  return holiday ? `${base} (${holiday})` : base;
}

function keyLabels(value: unknown): Record<string, string> {
  return isRecord(value) ? Object.fromEntries(Object.keys(value).map((k) => [k, label(k)])) : {};
}
