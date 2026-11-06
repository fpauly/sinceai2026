import "server-only";
import type { PublishChange, YextPublishResult } from "@/types/api";

// Step 5 (Apply): write an accepted change to our Yext sandbox. Owned by lane B (DESIGN 10b).
//
// STUB until lane B implements it (sandbox details are TBD from Fonecta).
// The signature is final, so lane D can already call it from lib/apply.ts.
// It never throws: on any problem it returns { yext: false, error } and the change
// is still saved in MongoDB by the caller.

const CHANNELS = ["Google", "Apple Maps", "Bing", "Finder"];

export const publishChange: PublishChange = async (business, change) => {
  if (!process.env.YEXT_API_KEY) {
    const result: YextPublishResult = {
      yext: false,
      published_to: CHANNELS,
      error: "Yext not configured (YEXT_API_KEY missing); saved locally only",
    };
    return result;
  }
  // TODO lane B: call the Yext sandbox API for business.yext_entity_id with `change`.
  void business;
  void change;
  return { yext: false, published_to: CHANNELS, error: "Yext publishing not implemented yet" };
};
