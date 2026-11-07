import { businesses, listings } from "@/data/seed";
import type { OwnerViewResponse, SuggestionWithIssue } from "@/types/api";

// D1 fixtures only. D2 replaces these with GET /api/businesses/[id].
const dates = ["2026-12-24", "2026-12-25", "2026-12-26", "2027-01-01", "2027-01-06"];
const holidayNames = ["Christmas Eve", "Christmas Day", "Boxing Day", "New Year's Day", "Epiphany"];

function holidaySuggestion(businessId: string, hasHistory: boolean): SuggestionWithIssue {
  const issueId = `${businessId}:holiday-demo`;
  return {
    _id: `${issueId}:suggestion`, issue_id: issueId, business_id: businessId,
    proposed_change: {
      field: "holiday_hours",
      value: Object.fromEntries(dates.map((date, i) => [date, hasHistory && i === 0 ? "10:00-14:00" : "closed"])),
    },
    reason: hasHistory
      ? "These five holidays have no hours set on Finder, Google or your website. The proposed hours follow last season."
      : "These five holidays have no hours set, and we have no previous holiday hours to follow.",
    confidence: hasHistory ? "high" : "low",
    message: {
      en: hasHistory
        ? "Hi Liisa! Shall we use last season's hours for the upcoming holidays?"
        : "Hi Sanna! Would you like to close on these holidays, or choose different hours?",
      fi: hasHistory ? "Hei Liisa! Käytetäänkö tulevina pyhinä viime kauden aukioloaikoja?" : "Hei Sanna! Haluatko sulkea pyhiksi vai valita muut aukioloajat?",
    },
    source: "fallback", audio_url: null, decision: null, decided_via: null, decided_at: null,
    issue: {
      _id: issueId, business_id: businessId, type: "missing_holiday_hours", severity: "high",
      evidence: {
        dates, holiday_names: Object.fromEntries(dates.map((date, i) => [date, holidayNames[i]])),
        last_year: hasHistory ? { "2025-12-24": "10:00-14:00", "2025-12-25": "closed", "2025-12-26": "closed", "2026-01-01": "closed", "2026-01-06": "closed" } : {},
      },
      status: "suggested", created_at: "2026-12-10T08:00:00Z",
      fingerprint: `${businessId}:missing_holiday_hours:${dates.join(",")}`,
    },
  };
}

const saturdaySuggestion: SuggestionWithIssue = {
  _id: "rye_shine:saturday-demo:suggestion", issue_id: "rye_shine:saturday-demo", business_id: "rye_shine",
  proposed_change: { field: "opening_hours", value: { sat: "10:00-14:00" } },
  reason: "Your website was updated on 20 October 2026 and shows an earlier Saturday closing time than Finder and Google.",
  confidence: "medium",
  message: { en: "Your Saturday hours differ across channels. Shall we use your website's 10:00–14:00 hours everywhere?", fi: "Lauantain aukioloajat eroavat kanavissa. Käytetäänkö verkkosivujesi aikaa 10–14 kaikkialla?" },
  source: "fallback", audio_url: null, decision: null, decided_via: null, decided_at: null,
  issue: {
    _id: "rye_shine:saturday-demo", business_id: "rye_shine", type: "cross_platform_conflict", severity: "high",
    evidence: { field: "opening_hours.sat", values: [
      { source: "finder", value: "10:00-18:00", updated_at: "2025-12-20" },
      { source: "google", value: "10:00-18:00", updated_at: "2025-12-20" },
      { source: "website", value: "10:00-14:00", updated_at: "2026-10-20" },
    ] },
    status: "suggested", created_at: "2026-12-10T08:00:00Z", fingerprint: "rye_shine:cross_platform_conflict:opening_hours.sat",
  },
};

export const ownerMocks: Record<string, OwnerViewResponse> = Object.fromEntries(
  businesses.filter((b) => ["rye_shine", "parturi_linnankatu", "leipomo_martti"].includes(b._id)).map((business) => [business._id, {
    business,
    listings: listings.filter((listing) => listing.business_id === business._id),
    suggestions: business._id === "rye_shine"
      ? [holidaySuggestion(business._id, true), saturdaySuggestion]
      : business._id === "parturi_linnankatu" ? [holidaySuggestion(business._id, false)] : [],
  }]),
);
