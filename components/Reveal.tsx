"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scrolls its content into view when it appears. The result of a decision is shown at the top of
 * the page while the owner has usually scrolled down to the card they answered, so without this
 * the card just disappears and the result is off screen. Give it a new `key` for every decision.
 */
export default function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, []);
  return <div ref={ref} className="scroll-mt-4">{children}</div>;
}
