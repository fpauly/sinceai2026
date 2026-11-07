import { collections } from "@/lib/db";
import { businesses, listings, reviews, preferences } from "@/data/seed";
import { fonectaDemo } from "@/data/fonecta";

// POST /api/seed — reset the database and load mock data.
//   /api/seed                  the v1 Turku seed (the demo until the v2 switch)
//   /api/seed?source=fonecta   the committed extract of Fonecta's dataset (stage C10)
export async function POST(request: Request) {
  const source = new URL(request.url).searchParams.get("source") ?? "seed";
  try {
    if (source === "fonecta") return await seedFonecta();
    if (source !== "seed") {
      return Response.json({ ok: false, error: `Unknown seed source "${source}"` }, { status: 400 });
    }
    return await seedV1();
  } catch (err) {
    console.error("[seed] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}

async function clearEverything(c: Awaited<ReturnType<typeof collections>>) {
  await Promise.all([
    c.businesses.deleteMany({}),
    c.listings.deleteMany({}),
    c.reviews.deleteMany({}),
    c.issues.deleteMany({}),
    c.suggestions.deleteMany({}),
    c.preferences.deleteMany({}),
    c.profiles.deleteMany({}),
    c.holiday_history.deleteMany({}),
    c.special_days.deleteMany({}),
    c.peers.deleteMany({}),
    c.publisher_suggestions.deleteMany({}),
  ]);
}

async function v1Indexes(c: Awaited<ReturnType<typeof collections>>) {
  await Promise.all([
    c.listings.createIndex({ business_id: 1 }),
    c.reviews.createIndex({ business_id: 1, date: -1 }),
    c.issues.createIndex({ business_id: 1, status: 1 }),
    c.issues.createIndex({ fingerprint: 1 }),
    c.suggestions.createIndex({ business_id: 1, decision: 1 }),
    c.suggestions.createIndex({ issue_id: 1 }),
  ]);
}

async function seedV1() {
  const c = await collections();
  await clearEverything(c);

  await Promise.all([
    c.businesses.insertMany(businesses),
    c.listings.insertMany(listings),
    c.reviews.insertMany(reviews),
    c.preferences.insertMany(preferences),
  ]);

  await v1Indexes(c);

  return Response.json({
    ok: true,
    counts: {
      businesses: businesses.length,
      listings: listings.length,
      reviews: reviews.length,
      preferences: preferences.length,
    },
  });
}

async function seedFonecta() {
  const demo = fonectaDemo;
  if (demo.businesses.length === 0) {
    return Response.json(
      { ok: false, error: "data/fonecta/demo.json is empty; run scripts/import-fonecta.mjs" },
      { status: 500 },
    );
  }

  const c = await collections();
  await clearEverything(c);

  await Promise.all([
    c.businesses.insertMany(demo.businesses),
    c.profiles.insertMany(demo.profiles),
    c.holiday_history.insertMany(demo.holiday_history),
    c.special_days.insertMany(demo.special_days),
    c.peers.insertMany(demo.peers),
    c.reviews.insertMany(demo.reviews),
    c.publisher_suggestions.insertMany(demo.publisher_suggestions),
  ]);

  // Issues and suggestions are created per demo run, so only their lookup indexes are needed.
  await Promise.all([
    v1Indexes(c),
    c.issues.createIndex({ business_id: 1, type: 1 }),
    c.profiles.createIndex({ business_id: 1 }),
    c.holiday_history.createIndex({ business_id: 1, date: -1 }),
    c.special_days.createIndex({ country: 1, date: 1 }),
    c.peers.createIndex({ country: 1, city_tier: 1, segment: 1, day_key: 1 }),
    c.publisher_suggestions.createIndex({ business_id: 1, date: -1 }),
  ]);

  return Response.json({
    ok: true,
    source: "fonecta",
    counts: {
      businesses: demo.businesses.length,
      profiles: demo.profiles.length,
      holiday_history: demo.holiday_history.length,
      special_days: demo.special_days.length,
      peers: demo.peers.length,
      reviews: demo.reviews.length,
      publisher_suggestions: demo.publisher_suggestions.length,
    },
  });
}
