import Link from "next/link";

// Public home: three ways into the demo. The team's progress board lives at /team.
const ENTRIES = [
  {
    href: "/contact/FI-D0010",
    title: "Be the owner: Pub Kulma’s WhatsApp",
    text: "Connect suggests the hours for the coming special days. Reply by text or by voice, then confirm with one tap.",
  },
  {
    href: "/contact/FI-D0001",
    title: "Kahvila Aurora’s SMS",
    text: "Christmas Eve, closing at 13:00 like last year. Open the link to see what customers will see, and approve.",
  },
  {
    href: "/dashboard",
    title: "Fonecta’s dashboard",
    text: "Every business at a glance: the daily check, open suggestions, and businesses that need a person.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">Fonecta Connect · Ajantasa</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Opening hours that stay up to date</h1>
        <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-400">
          Connect notices when Google will show the wrong hours on a special day, suggests the exact fix, and the owner
          answers in one tap, by text or by voice. No login.
        </p>
      </header>
      <nav aria-label="Try the demo" className="flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={entry.href} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-zinc-700 dark:bg-zinc-900">
            <span className="block font-semibold">{entry.title} →</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">{entry.text}</span>
          </Link>
        ))}
      </nav>
      <p className="text-xs leading-5 text-zinc-500">
        All data is Fonecta’s synthetic dataset. Messages are simulated, not sent. Team Hocus Focus, Since AI Hackathon 2026.
      </p>
    </main>
  );
}
