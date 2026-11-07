// API contracts shared between lanes (see TASKS.md).
// Change these only via a small PR that everyone is told about.

import type {
  Business,
  Confidence,
  Day,
  DayKey,
  HolidayHistoryEntry,
  LearnedDecision,
  PeerBenchmark,
  Profile,
  SpecialDay,
  Decision,
  DecidedVia,
  HolidayHours,
  Hours,
  Issue,
  Listing,
  OpeningHours,
  Review,
  Severity,
  Source,
  Suggestion,
  TrackedField,
  ValidationResult,
} from "@/types";

// ---------- Issue evidence (written by lane C, read by lane A and D) ----------
// One shape per issue type. Fingerprints are fixed so dedupe/ignore works across runs.

/** ONE issue per business, grouping all missing dates.
 *  fingerprint: `${business_id}:missing_holiday_hours:${dates.join(",")}` */
export interface MissingHolidayHoursEvidence {
  dates: string[]; // upcoming holiday dates (within 30 days of today) with no hours on ANY listing, sorted
  holiday_names: Record<string, string>; // date -> "Christmas Eve"
  last_year: HolidayHours; // same month-day one year earlier, from any listing, e.g. {"2025-12-24":"08:00-14:00"}; {} if none
}

/** ONE issue per conflicting field.
 *  fingerprint: `${business_id}:cross_platform_conflict:${field}` */
export interface CrossPlatformConflictEvidence {
  field: `opening_hours.${Day}` | "phone";
  values: {
    source: Source;
    value: string;
    updated_at: string | null; // field_updated_at.opening_hours for hours; null for phone (not tracked)
  }[];
}

/** ONE issue per tracked field, if ANY listing's field_updated_at is > 365 days before today.
 *  fingerprint: `${business_id}:stale_field:${field}` */
export interface StaleFieldEvidence {
  field: TrackedField;
  oldest_update: string; // oldest field_updated_at across listings
  days_old: number;
  stale_sources: Source[];
  current_value: unknown; // value from the most recently updated listing
}

/** ONE issue per signal type (M6).
 *  fingerprint: `${business_id}:review_signal:${type}` */
export interface ReviewSignalEvidence {
  signal_type: "closed_when_open" | "wrong_phone" | "moved" | "other";
  summary: string; // from Gemini classification
  reviews: Pick<Review, "_id" | "date" | "rating" | "text">[];
}

// ---------- v2 evidence (DESIGN 0 "v2"; written by lane C from lib/predict, read by A and D) ----------

/** ONE issue per business and special day where what Google shows is likely wrong.
 *  fingerprint: `${business_id}:special_day_hours:${date}` */
export interface SpecialDayHoursEvidence {
  date: string;
  day_key: DayKey;
  day_name: { en: string; local: string }; // "Christmas Eve" / "Jouluaatto"
  weekday: Day;
  displayed_hours: Hours; // what Google shows now
  displayed_from: "exception" | "regular"; // an entered exception, or the regular weekday hours
  proposed_hours: Hours; // decided by code (lib/predict); the suggestion proposes exactly this
  basis: PredictBasis;
  basis_detail: BasisDetail;
  confidence: Confidence;
  expected_search_views?: number; // priority (analytics), optional
}

/** ONE issue per business and reason; shown to Connect staff, never sent to the owner.
 *  fingerprint: `${business_id}:needs_human:${reason}` */
export interface NeedsHumanEvidence {
  reason: "closed_for_good" | "seasonal_closure" | "other";
  summary: string; // one sentence for staff
  signals: string[]; // the data behind it, e.g. "3 reviews in Oct say the place is closed"
  dates?: string[]; // special days affected, if any
}

export type IssueEvidence =
  | MissingHolidayHoursEvidence
  | CrossPlatformConflictEvidence
  | StaleFieldEvidence
  | ReviewSignalEvidence
  | SpecialDayHoursEvidence
  | NeedsHumanEvidence;

// ---------- v2 prediction contract (lib/predict, lane A; used by detection C11 and the scorer A10) ----------

/** The scorer's actions (DESIGN 9.5). */
export type PredictAction = "SUGGEST" | "NO_ACTION" | "FLAG";

/** Where the proposed hours come from, strongest first. */
export type PredictBasis = "OWNER_EDIT" | "LAST_YEAR" | "SHOPPING_CENTRE" | "PEERS" | "REGULAR";

/** The data behind a prediction, for the message and the "why" line. Only the used part is set. */
export interface BasisDetail {
  owner_edit?: { date: string; hours: Hours }; // the owner's own past decision (learning)
  last_year?: { date: string; hours: Hours; entered_at: string };
  shopping_centre?: { business_id: string; name: string; hours: Hours };
  peers?: { n: number; share_closed: number; share_special: number; hours: Hours | null };
}

export interface Prediction {
  action: PredictAction;
  hours?: Hours; // required for SUGGEST
  basis?: PredictBasis;
  detail?: BasisDetail;
  confidence?: Confidence;
  flag_reason?: NeedsHumanEvidence["reason"]; // for FLAG
}

/** Everything lib/predict may look at for ONE business and ONE special day. Pure: no DB, no clock. */
export interface PredictContext {
  today: string; // DEMO_DATE; only data entered before it may be used
  business: Business;
  profile: Profile;
  day: SpecialDay;
  history: HolidayHistoryEntry[]; // this business's exception history
  centre?: { business: Business; profile: Profile; history: HolidayHistoryEntry[] } | null;
  peers: PeerBenchmark[]; // rows for this business's country, city tier and segment
  learned?: LearnedDecision[]; // preferences.learned (the owner's past edits / declines)
  closure_signals?: ClosureSignal[]; // reviews and publisher edits that may say "closed for good"
}

/** A hint that the business may have closed for good (reviews.json, publisher_suggestions.json). */
export type ClosureSignal =
  | { source: "review"; date: string; text: string } // date: ISO datetime of the review
  | { source: "publisher"; date: string; field: string }; // a Google/Apple/Bing user edit; field "closed" or "hours"

export type Predict = (ctx: PredictContext) => Prediction;

// ---------- Proposed change (written by lane A, applied by lane D) ----------
// `value` is MERGED into each listing's field (holiday/opening hours) or REPLACES it (phone/description).

export type TypedProposedChange =
  | { field: "holiday_hours"; value: HolidayHours } // merge: {"2026-12-24":"08:00-14:00", ...}
  | { field: "opening_hours"; value: Partial<Record<Day, Hours>> } // merge: {"mon":"closed"}
  | { field: "phone"; value: string }
  | { field: "description"; value: string };

/** Typical mapping, issue type -> proposed field:
 *  missing_holiday_hours -> holiday_hours
 *  cross_platform_conflict opening_hours.<day> -> opening_hours {<day>: value}; phone -> phone
 *  stale_field <f> -> same field <f> (re-confirm current value; for description, suggest a fresher text)
 *  review_signal closed_when_open -> opening_hours; wrong_phone -> phone; moved/other -> description */
export type ProposedFieldValue = HolidayHours | Partial<OpeningHours> | string;

// ---------- Detection (lane C) ----------

/** Input every rule receives. Rules are pure: no DB, no clock, no network. */
export interface RuleContext {
  business: Business;
  listings: Listing[];
  reviews: Review[];
  today: string; // DEMO_DATE, "YYYY-MM-DD"
}

/** What a rule returns. runDetection adds _id, status "open" and created_at. */
export type DraftIssue = Omit<Issue, "_id" | "status" | "created_at">;

export type Rule = (ctx: RuleContext) => DraftIssue[];

// POST /api/detect[?businessId=]
export interface DetectResponse {
  ok: true;
  created: Issue[]; // new issues only (duplicates and ignored fingerprints skipped)
}

// ---------- AI (lane A) ----------

/** What Gemini (or the fallback template) produces for one issue. */
export type SuggestionDraft = Pick<
  Suggestion,
  "proposed_change" | "reason" | "confidence" | "message"
>;

// lib/ai/reviews.ts output (DESIGN 9.2)
export interface ReviewClassification {
  signal: boolean;
  type: "closed_when_open" | "wrong_phone" | "moved" | "other";
  evidence_review_ids: string[];
  summary: string;
}

// lib/ai/intent.ts output (DESIGN 9.3)
export interface IntentResult {
  intent: "accept" | "edit" | "ignore" | "unclear";
  edited_value?: unknown;
  confirmation_text: string;
}

// POST /api/suggest[?businessId=]
export interface SuggestResponse {
  ok: true;
  created: Suggestion[];
}

// ---------- Owner view + apply (lane D) ----------

export type SuggestionWithIssue = Suggestion & { issue: Issue };

// GET /api/businesses/[id]
export interface OwnerViewResponse {
  business: Business;
  listings: Listing[];
  suggestions: SuggestionWithIssue[]; // undecided only (decision === null)
}

// POST /api/suggestions/[id]/decide
export interface DecideRequest {
  decision: Exclude<Decision, "auto">;
  edited_value?: unknown; // required when decision === "edited"
  via: Exclude<DecidedVia, "standing_permission">;
  standing_permission?: boolean; // "do this automatically next time"
}

export interface DecideResponse {
  ok: true;
  suggestion: Suggestion; // includes `applied` (Yext result + published_to)
  synced_sources: Source[]; // our listings that were updated; [] when ignored
}

// ---------- Validation (DESIGN 9.4, lib/validate.ts) ----------

/** Pure, deterministic. Used by /api/suggest on every draft (Gemini or fallback). */
export type ValidateSuggestion = (
  draft: SuggestionDraft,
  issue: Issue,
  listings: Listing[],
) => ValidationResult;

// ---------- Yext (DESIGN 10b, lib/yext/index.ts, lane B) ----------

/** Lane D's lib/apply.ts calls this; it never throws. */
export type PublishChange = (
  business: Business,
  change: TypedProposedChange,
) => Promise<YextPublishResult>;

export type YextPublishResult =
  | { yext: true; published_to: string[] }
  | { yext: false; published_to: string[]; error: string };

// ---------- Dashboard (lane C) ----------

// GET /api/businesses
export interface BusinessSummary {
  business: Business;
  open_issues: Record<Severity, number>; // status open or suggested
  last_decision: {
    decision: Decision;
    field: string;
    decided_at: string;
  } | null;
}

export type BusinessesResponse = BusinessSummary[];

// ---------- Voice (lane B) ----------

// POST /api/suggestions/[id]/tts
export interface TtsResponse {
  audio_url: string; // data: URL or /path, playable by <audio>
}

// POST /api/voice/reply (multipart: audio, suggestionId)
export interface VoiceReplyResponse {
  transcript: string;
  intent: IntentResult;
}

// ---------- Errors ----------

export interface ApiError {
  ok: false;
  error: string;
}
