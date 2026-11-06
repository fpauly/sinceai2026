import { collections } from "@/lib/db";
import { businesses, listings, reviews, preferences } from "@/data/seed";

// POST /api/seed — reset the database and load mock data.
export async function POST() {
  try {
    const c = await collections();

    await Promise.all([
      c.businesses.deleteMany({}),
      c.listings.deleteMany({}),
      c.reviews.deleteMany({}),
      c.issues.deleteMany({}),
      c.suggestions.deleteMany({}),
      c.preferences.deleteMany({}),
    ]);

    await Promise.all([
      c.businesses.insertMany(businesses),
      c.listings.insertMany(listings),
      c.reviews.insertMany(reviews),
      c.preferences.insertMany(preferences),
    ]);

    await Promise.all([
      c.listings.createIndex({ business_id: 1 }),
      c.reviews.createIndex({ business_id: 1, date: -1 }),
      c.issues.createIndex({ business_id: 1, status: 1 }),
      c.issues.createIndex({ fingerprint: 1 }),
      c.suggestions.createIndex({ business_id: 1, decision: 1 }),
      c.suggestions.createIndex({ issue_id: 1 }),
    ]);

    return Response.json({
      ok: true,
      counts: {
        businesses: businesses.length,
        listings: listings.length,
        reviews: reviews.length,
        preferences: preferences.length,
      },
    });
  } catch (err) {
    console.error("[seed] failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}
