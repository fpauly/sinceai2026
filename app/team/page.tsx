import type { Metadata } from "next";
import ProgressBoard from "@/components/ProgressBoard";

// Team tool: build progress and demo controls (reset, detect, suggest). Not linked from the app.
export const metadata: Metadata = { title: "Ajantasa · team board", robots: { index: false, follow: false } };

export default function TeamBoard() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Ajantasa · team board</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Build progress and demo controls. Not linked from the app.
        </p>
      </header>
      <ProgressBoard />
    </main>
  );
}
