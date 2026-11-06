import "server-only";
import { MongoClient, type Db, type Collection } from "mongodb";
import type {
  Business,
  Listing,
  Review,
  Issue,
  Suggestion,
  Preferences,
} from "@/types";

// Singleton MongoClient, reused across hot reloads in dev.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");
  if (!globalForMongo._mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      appName: "ajantasa",
    });
    globalForMongo._mongoClientPromise = client.connect().catch((err) => {
      globalForMongo._mongoClientPromise = undefined; // allow retry
      throw err;
    });
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || "ajantasa");
}

export async function collections(): Promise<{
  businesses: Collection<Business>;
  listings: Collection<Listing>;
  reviews: Collection<Review>;
  issues: Collection<Issue>;
  suggestions: Collection<Suggestion>;
  preferences: Collection<Preferences>;
}> {
  const db = await getDb();
  return {
    businesses: db.collection<Business>("businesses"),
    listings: db.collection<Listing>("listings"),
    reviews: db.collection<Review>("reviews"),
    issues: db.collection<Issue>("issues"),
    suggestions: db.collection<Suggestion>("suggestions"),
    preferences: db.collection<Preferences>("preferences"),
  };
}
