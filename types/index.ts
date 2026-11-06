// Shared types for Ajantasa. See DESIGN.md section 7.
// Dates are ISO strings "YYYY-MM-DD". Hours are "HH:MM-HH:MM" or "closed".

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type Hours = string; // "HH:MM-HH:MM" | "closed"
export type OpeningHours = Record<Day, Hours>;
export type HolidayHours = Record<string, Hours>; // date -> hours

export type Source = "finder" | "google" | "website";
export const SOURCES: readonly Source[] = ["finder", "google", "website"];

export type Language = "en" | "fi";
export type Channel = "voice" | "sms" | "app";

export type Category =
  | "cafe"
  | "hair_salon"
  | "car_repair"
  | "florist"
  | "restaurant"
  | "bookshop"
  | "gym"
  | "bakery";

export interface Business {
  _id: string;
  name: string;
  owner_name: string;
  category: Category;
  city: string;
  preferred_channel: Channel;
  language: Language;
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

export type IssueType =
  | "missing_holiday_hours"
  | "cross_platform_conflict"
  | "review_signal"
  | "stale_field";

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
export type Decision = "accepted" | "edited" | "ignored";
export type DecidedVia = "tap" | "voice";

export interface ProposedChange {
  field: string; // e.g. "holiday_hours", "opening_hours", "phone", "description"
  value: unknown;
}

export interface Suggestion {
  _id: string;
  issue_id: string;
  business_id: string;
  proposed_change: ProposedChange;
  reason: string;
  confidence: Confidence;
  message: Record<Language, string>;
  audio_url: string | null;
  decision: Decision | null;
  decided_via: DecidedVia | null;
  decided_at: string | null;
}

export interface Preferences {
  _id: string; // = business_id
  business_id: string;
  ignored_fingerprints: string[];
  notes: string[];
}
