import ProgressBoard from "@/components/ProgressBoard";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Ajantasa</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Keeps your business information up to date, everywhere.
        </p>
      </header>
      <ProgressBoard />
    </main>
  );
}
