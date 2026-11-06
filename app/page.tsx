import ResetDemoButton from "@/components/ResetDemoButton";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ajantasa</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Keeps your business information up to date, everywhere.
        </p>
      </div>
      <nav className="flex flex-col gap-2 text-sm">
        <span className="text-zinc-500">Coming in later milestones:</span>
        <span>/dashboard — Fonecta support view</span>
        <span>/owner/cafe_aura — Liisa&apos;s owner view</span>
      </nav>
      <ResetDemoButton />
    </main>
  );
}
