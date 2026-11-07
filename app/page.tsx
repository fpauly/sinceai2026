import Link from "next/link";

// Public home: three ways into the demo, in demo order. The team's progress board lives at /team.
// The /try links are plain <a> on purpose: Next's <Link> prefetches visible links in production,
// and a prefetch of /try would create a demo copy for every page view (review #100, #102).
const ENTRIES = [
  {
    href: "/try?b=FI-D0001",
    plain: true,
    title: "Kahvila Aurora’s SMS",
    text: "Your own copy. Christmas Eve, closing at 13:00 like last year: see what customers will see, approve, and watch it publish to our Yext sandbox.",
  },
  {
    href: "/try?b=FI-D0010",
    plain: true,
    title: "Be the owner: Pub Kulma’s WhatsApp",
    text: "Your own copy of the chat. Reply by text or by voice, then confirm with one tap.",
  },
  {
    href: "/dashboard",
    plain: false,
    title: "Fonecta’s dashboard",
    text: "Every business at a glance: the daily check, open suggestions, and businesses that need a person.",
  },
]

const CARD = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">Fonecta Connect · Ajantasa</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Opening hours that stay up to date</h1>
        <p className="mt-2 leading-7 text-zinc-600">
          Connect notices when Google will show the wrong hours on a special day and suggests the exact fix. Code detects,
          AI explains, and the owner decides with one tap, by text or by voice. No login.
        </p>
      </header>
      <nav aria-label="Try the demo" className="flex flex-col gap-3">
        {ENTRIES.map((entry) => {
          const inner = <>
            <span className="block font-semibold">{entry.title} →</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-600">{entry.text}</span>
          </>;
          return entry.plain
            ? <a key={entry.href} href={entry.href} className={CARD}>{inner}</a>
            : <Link key={entry.href} href={entry.href} className={CARD}>{inner}</Link>;
        })}
      </nav>
      <p className="text-xs leading-5 text-zinc-500">
        All data is Fonecta’s synthetic dataset. Messages are simulated, not sent. Each “own copy” is private to you and
        deleted after 6 hours. Kahvila Aurora publishes to our Yext sandbox; Pub Kulma is saved in the demo only. Team Hocus Focus, Since AI Hackathon 2026.
      </p>
      </div>
    </main>
  );
}
