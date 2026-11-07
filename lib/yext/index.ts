import "server-only";
import type { Business, Day, Hours } from "@/types";
import type { PublishChange, TypedProposedChange } from "@/types/api";

// Step 5 (Apply): write an accepted change to our Yext sandbox. Owned by lane B (DESIGN 10b).
//
// This is the only file that talks to Yext. publishChange never throws: on any problem it
// returns { yext: false, error } and the caller still saves the change in MongoDB.
// Never put the request URL in an error or a log: it contains the API key.

const API_VERSION = "20261107";
const TIMEOUT_MS = 8000;

// What the owner is told after a publish. Yext's own publisher list for Finnish locations is in
// DESIGN 10b (the sandbox has no live listings to read this from); Finder is updated by us.
const PUBLISHED_TO = ["Google", "Apple Maps", "Bing", "Facebook", "Finder"];

const YEXT_DAYS: Record<Day, string> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

type YextDayHours = { isClosed: true } | { openIntervals: { start: string; end: string }[] };
type YextHoliday = YextDayHours & { date: string };
type YextHours = Record<string, unknown> & { holidayHours?: YextHoliday[] };
type YextBody = { meta?: { errors?: { message?: string }[] }; response?: { hours?: YextHours } };

/** Our "10:00-18:00" | "closed" -> Yext's day format. */
function toYextDay(hours: Hours): YextDayHours {
  if (hours === "closed") return { isClosed: true };
  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(hours);
  if (!match) throw new Error(`invalid hours value "${hours}"`);
  return { openIntervals: [{ start: match[1], end: match[2] }] };
}

async function yextRequest(entityId: string, init?: RequestInit): Promise<YextBody> {
  const base = process.env.YEXT_API_BASE || "https://sbx-api.yextapis.com";
  const url = new URL(`/v2/accounts/me/entities/${encodeURIComponent(entityId)}`, base);
  url.searchParams.set("api_key", process.env.YEXT_API_KEY ?? "");
  url.searchParams.set("v", API_VERSION);

  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as YextBody;
  if (!res.ok) {
    const detail = body.meta?.errors?.map((e) => e.message).join("; ");
    throw new Error(`Yext returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return body;
}

/** The fields to send. Hours are merged into what Yext holds, so nothing else gets lost. */
async function buildUpdate(entityId: string, change: TypedProposedChange) {
  switch (change.field) {
    case "phone":
      return { mainPhone: change.value.replace(/[\s()-]/g, "") };
    case "description":
      return { description: change.value };
    case "opening_hours": {
      const hours = (await yextRequest(entityId)).response?.hours ?? {};
      for (const [day, value] of Object.entries(change.value)) {
        hours[YEXT_DAYS[day as Day]] = toYextDay(value);
      }
      return { hours };
    }
    case "holiday_hours": {
      const hours = (await yextRequest(entityId)).response?.hours ?? {};
      const kept = (hours.holidayHours ?? []).filter((h) => !(h.date in change.value));
      const added = Object.entries(change.value).map(([date, value]) => ({ date, ...toYextDay(value) }));
      hours.holidayHours = [...kept, ...added].sort((a, b) => a.date.localeCompare(b.date));
      return { hours };
    }
  }
}

export const publishChange: PublishChange = async (business: Business, change) => {
  const failed = (error: string) => ({ yext: false as const, published_to: [], error });

  if (!process.env.YEXT_API_KEY) return failed("Yext not configured (YEXT_API_KEY missing); saved locally only");
  if (!business.yext_entity_id) return failed(`${business.name} has no Yext entity; saved locally only`);

  try {
    const update = await buildUpdate(business.yext_entity_id, change);
    await yextRequest(business.yext_entity_id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    return { yext: true, published_to: PUBLISHED_TO };
  } catch (err) {
    return failed(err instanceof Error ? err.message : "Yext request failed");
  }
};
