// API contracts shared between lanes (see TASKS.md).
// Change these only via a small PR that everyone is told about.

import type {
  Business,
  Decision,
  DecidedVia,
  Issue,
  Listing,
  Review,
  Severity,
  Source,
  Suggestion,
} from "@/types";

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
  decision: Decision;
  edited_value?: unknown; // required when decision === "edited"
  via: DecidedVia;
}

export interface DecideResponse {
  ok: true;
  suggestion: Suggestion;
  synced_sources: Source[]; // listings that were updated; [] when ignored
}

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
