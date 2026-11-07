// Shared types for Ajantasa. See DESIGN.md section 7, and section 0 "v2" for the Fonecta dataset.
// Dates are ISO strings "YYYY-MM-DD". Hours are "closed" or one or more "HH:MM-HH:MM" intervals joined
// by "," (v2: "10:00-14:00,17:00-22:00", past midnight "18:00-02:00", 24 h "00:00-23:59").
// Parse, compare and convert hours only with lib/hours.ts.

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type Hours = string; // "closed" | "HH:MM-HH:MM[,HH:MM-HH:MM]" (see lib/hours.ts)
export type OpeningHours = Record<Day, Hours>;
export type HolidayHours = Record<string, Hours>; // date -> hours

export type Source = "finder" | "google" | "website";
export const SOURCES: readonly Source[] = ["finder", "google", "website"];

export type Language = "en" | "fi" | "sv" | "nb"; // v1 seed uses en + fi; v2 owners also sv (SE) and nb (NO)
export type Channel = "whatsapp" | "voice" | "sms" | "app";

export type Category =
  | "cafe"
  | "hair_salon"
  | "car_repair"
  | "florist"
  | "restaurant"
  | "bookshop"
  | "gym"
  | "bakery"
  | "other"; // v2: the dataset's exact type is in Business.segment

export interface Business {
  _id: string;
  name: string;
  owner_name: string;
  category: Category;
  city: string;
  preferred_channel: Channel;
  language: Language;
  yext_entity_id?: string | null; // entity in our Yext sandbox (mapping TBD)

  // ---- v2 (Fonecta dataset, DESIGN 0 "v2"); absent on the v1 seed ----
  country?: Country;
  segment?: string; // dataset business type, e.g. "cafe", "lunch_restaurant" (categories.csv)
  city_tier?: CityTier; // for peer benchmarks
  shopping_centre_id?: string | null; // the centre the business is in (its hours are a strong signal)
  is_shopping_centre?: boolean;
  permanently_closed?: boolean; // published as closed for good
  reopen_date?: string | null; // seasonal business with a published winter break
  connect_since?: string; // "YYYY-MM-DD"; a recent date means little or no history
  contact?: Contact; // customer_contacts.csv
  publishers?: Publisher[]; // listings.json: where the hours show (step 5 confirmation)
}

// ---------- v2: Fonecta dataset ----------

export type Country = "FI" | "SE" | "NO";
export type CityTier = "capital" | "large_city" | "town" | "ski_resort";
export type ContactChannel = "EMAIL" | "SMS" | "WHATSAPP" | "APP_PUSH";

/** How and whether to contact the owner (customer_contacts.csv). */
export interface Contact {
  first_name: string;
  channel: ContactChannel;
  language: Language; // the owner's language; messages are also written in English for the demo
  best_contact_window: string; // e.g. "12-16"
  standing_permission_holidays: boolean; // apply holiday suggestions without asking, then inform
  opted_out: boolean; // never send suggestions
}

/** One publisher a business is live on (listings.json). */
export interface Publisher {
  id: string; // e.g. "GOOGLEMYBUSINESS"
  name: string; // e.g. "Google (Search & Maps)"
  status: string; // e.g. "LIVE"
  typical_update_seconds: number; // how fast a change usually shows there
}

/** v2: the business's published hours (the Yext entity): ONE profile per business, not 3 listings.
 *  What Google shows on a date = the exception if one is entered, else the regular hours of that weekday. */
export interface Profile {
  _id: string; // = business_id
  business_id: string;
  regular_hours: OpeningHours;
  holiday_hours: HolidayHours; // exceptions already entered (resolved: "isRegularHours" -> that weekday's hours)
  updated_at?: string; // ISO datetime of our last write
}

export type DayKey =
  | "XMAS_EVE" | "XMAS_DAY" | "BOXING_DAY" | "DEC23" | "INTERDAY" | "NYE" | "NEW_YEARS_DAY"
  | "EPIPHANY_EVE" | "EPIPHANY" | "INDEPENDENCE_DAY" | "FATHERS_DAY" | "MOTHERS_DAY" | "LUCIA"
  | "BLACK_FRIDAY" | "ALL_SAINTS" | "MAUNDY_THURSDAY" | "GOOD_FRIDAY" | "EASTER_SATURDAY"
  | "EASTER_SUNDAY" | "EASTER_MONDAY" | "MAY_EVE" | "MAY_DAY" | "ASCENSION" | "PENTECOST_EVE"
  | "PENTECOST" | "WHIT_MONDAY" | "NATIONAL_DAY" | "MIDSUMMER_EVE" | "MIDSUMMER_DAY"
  | "EVENT" | "SCHOOL_BREAK";
export type DayType = "PUBLIC_HOLIDAY" | "EVE" | "OBSERVANCE" | "COMMERCIAL" | "BETWEEN_HOLIDAYS";

/** One special day in one country (calendar_special_days.csv). */
export interface SpecialDay {
  _id: string; // `${country}:${date}`
  country: Country;
  date: string;
  weekday: Day;
  day_key: DayKey;
  day_type: DayType;
  day_class: string; // MAJOR, EVE_MAJOR, EVE_MINOR, SOFT, INTER, OBS, COMM
  name_local: string;
  name_en: string;
  official_public_holiday: boolean;
}

export type HistorySource = "OWNER_UI" | "CONNECT_SUGGESTION" | "FONECTA_SUPPORT" | "API_INTEGRATION";

/** One exception-hours entry from the past (holiday_hours_history.jsonl). Several rows for one date:
 *  the latest `entered_at` wins; an entry entered on or after the date did not help that day. */
export interface HolidayHistoryEntry {
  _id: string;
  business_id: string;
  date: string;
  day_key: DayKey;
  hours: Hours; // resolved; when `is_regular` it is that weekday's regular hours at the time
  is_regular: boolean; // the owner said "regular hours" for that day
  entered_at: string; // ISO datetime
  source: HistorySource;
}

/** What similar businesses entered on a day (peer_benchmarks.csv, cells with >= 10 businesses). */
export interface PeerBenchmark {
  _id: string; // `${country}:${city_tier}:${segment}:${day_key}`
  country: Country;
  city_tier: CityTier;
  segment: string;
  day_key: DayKey;
  n_entity_days: number;
  share_no_exception_entered: number;
  share_entered_closed: number;
  share_entered_special_hours: number;
  share_entered_regular: number;
  closed_share_among_entered: number;
  median_open_special: string | null; // "HH:MM"
  median_close_special: string | null;
}

export type TrackedField = "opening_hours" | "holiday_hours" | "description";

export interface Listing {
  _id: string; // `${business_id}:${source}`
  business_id: string;
  source: Source;
  opening_hours: OpeningHours;
  holiday_hours: HolidayHours;
  phone: string;
  description: string;
  field_updated_at: Record<TrackedField, string>;
}

export interface Review {
  _id: string;
  business_id: string;
  date: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
}

/** v2: a publisher (Google/Apple/Bing) user edit waiting for confirmation (publisher_suggestions.json).
 *  `field` "closed" is what lib/predict reads as a closure signal. */
export interface PublisherSuggestion {
  _id: string;
  business_id: string;
  date: string; // dateCreated, "YYYY-MM-DD"
  field: string; // fieldName, e.g. "closed" or "hours"
  status: string; // WAITING_ON_CUSTOMER, EXPIRED, …
  publisher_id: string;
}

export type IssueType =
  | "missing_holiday_hours"
  | "cross_platform_conflict"
  | "review_signal"
  | "stale_field"
  | "special_day_hours" // v2: what Google shows on a special day is likely wrong (SUGGEST)
  | "needs_human"; // v2: a person should look (FLAG), e.g. closed for good; never sent to the owner

export type Severity = "high" | "medium" | "low";
export type IssueStatus = "open" | "suggested" | "resolved" | "ignored";

export interface Issue {
  _id: string;
  business_id: string;
  type: IssueType;
  severity: Severity;
  evidence: Record<string, unknown>;
  status: IssueStatus;
  created_at: string; // ISO datetime
  fingerprint: string;
}

export type Confidence = "high" | "medium" | "low";
export type Decision = "accepted" | "edited" | "ignored" | "auto"; // auto = standing permission
export type DecidedVia = "tap" | "voice" | "standing_permission";

export interface ProposedChange {
  field: string; // e.g. "holiday_hours", "opening_hours", "phone", "description"
  value: unknown;
}

/** English is always there (the demo language). v1 also fills `fi`; v2 also the owner's language. */
export type Messages = { en: string } & Partial<Record<Exclude<Language, "en">, string>>;

export interface Suggestion {
  _id: string;
  issue_id: string;
  business_id: string;
  proposed_change: ProposedChange;
  reason: string;
  confidence: Confidence;
  message: Messages;
  source?: "gemini" | "fallback";
  validation?: ValidationResult;
  audio_url: string | null;
  decision: Decision | null;
  decided_via: DecidedVia | null;
  decided_at: string | null;
  applied?: AppliedResult | null; // set after step 5 (Apply)
}

/** Result of lib/validate.ts (DESIGN 9.4). */
export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

/** What happened when a change was applied (DESIGN 10b). */
export interface AppliedResult {
  yext: boolean; // true = written to the Yext sandbox
  published_to: string[]; // where the owner is told it shows, e.g. ["Google", "Apple Maps", "Finder"]
  error?: string;
  at: string; // ISO datetime
}

/** One owner decision, remembered for the next suggestion (DESIGN 7, Learning). */
export interface LearnedDecision {
  issue_type: IssueType;
  field: string;
  proposed: unknown;
  final: unknown; // what was applied; null when ignored
  decision: Decision;
  at: string;
}

/** "Do this automatically next time" (DESIGN 11). */
export interface StandingPermission {
  issue_type: IssueType;
  field: string;
}

export interface Preferences {
  _id: string; // = business_id
  business_id: string;
  ignored_fingerprints: string[];
  learned?: LearnedDecision[];
  standing_permissions?: StandingPermission[];
  notes: string[];
}
