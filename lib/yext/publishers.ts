import type { Business, Publisher } from "@/types";

// Step 5 confirmation: where a published change shows, and how fast (DESIGN 10b).
// Pure and client-safe, so the owner view can use it too.

// Businesses without publisher data (the v1 seed). From Yext's publishers for Finnish locations;
// Finder is updated by us.
const DEFAULT_PUBLISHED_TO = ["Google", "Apple Maps", "Bing", "Facebook", "Finder"];

/** Publishers that are live for this business, fastest first. Opted-out and waiting ones are left out. */
export function livePublishers(business: Pick<Business, "publishers">): Publisher[] {
  return (business.publishers ?? [])
    .filter((p) => p.status === "LIVE")
    .sort((a, b) => a.typical_update_seconds - b.typical_update_seconds);
}

/** The names the owner is told about. */
export function publishedTo(business: Pick<Business, "publishers">): string[] {
  if (!business.publishers) return DEFAULT_PUBLISHED_TO;
  return livePublishers(business).map((p) => p.name);
}

/** 120 -> "about 2 minutes", 172800 -> "about 2 days". */
export function updateSpeedText(seconds: number): string {
  const unit = (n: number, word: string) => `about ${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds < 3600) return unit(Math.max(1, Math.round(seconds / 60)), "minute");
  if (seconds < 86400) return unit(Math.round(seconds / 3600), "hour");
  return unit(Math.round(seconds / 86400), "day");
}
