import type { Language } from "@/types";

// Server-side config read from env. "today" for all rules is DEMO_DATE so the demo is deterministic.
export function demoDate(): string {
  const d = process.env.DEMO_DATE;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return "2026-12-10";
}

export function demoLanguage(): Language {
  return process.env.DEMO_LANGUAGE === "fi" ? "fi" : "en";
}
