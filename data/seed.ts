// Mock data for the demo. All businesses, people and phone numbers are fictional.
// Designed against DEMO_DATE = 2026-12-10:
//   - "stale" means field_updated_at before 2025-12-10
//   - "recent review" means on/after 2026-11-10
//   - upcoming holidays within 30 days: 2026-12-24, 12-25, 12-26, 2027-01-01, 01-06
// See DESIGN.md section 13 for which business plants which problem.

import type {
  Business,
  HolidayHours,
  Listing,
  OpeningHours,
  Preferences,
  Review,
  Source,
  TrackedField,
} from "@/types";
import { SOURCES } from "@/types";

const RECENT = "2026-10-15"; // a "fresh" update date used for clean fields

function week(
  weekday: string,
  sat: string,
  sun: string,
  overrides: Partial<OpeningHours> = {},
): OpeningHours {
  return {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat,
    sun,
    ...overrides,
  };
}

// Full set of hours for every holiday in the demo window.
function allHolidays(open: string, short: string): HolidayHours {
  return {
    "2026-12-24": short,
    "2026-12-25": "closed",
    "2026-12-26": "closed",
    "2027-01-01": "closed",
    "2027-01-06": open,
  };
}

interface ListingBase {
  opening_hours: OpeningHours;
  holiday_hours: HolidayHours;
  phone: string;
  description: string;
  field_updated_at: Record<TrackedField, string>;
}

interface ListingOverride {
  opening_hours?: Partial<OpeningHours>;
  holiday_hours?: HolidayHours;
  phone?: string;
  description?: string;
  field_updated_at?: Partial<Record<TrackedField, string>>;
}

// Builds the three listings for a business; per-source overrides plant the problems.
function listingsFor(
  businessId: string,
  base: ListingBase,
  overrides: Partial<Record<Source, ListingOverride>> = {},
): Listing[] {
  return SOURCES.map((source) => {
    const o = overrides[source] ?? {};
    return {
      _id: `${businessId}:${source}`,
      business_id: businessId,
      source,
      opening_hours: { ...base.opening_hours, ...o.opening_hours } as OpeningHours,
      holiday_hours: { ...(o.holiday_hours ?? base.holiday_hours) },
      phone: o.phone ?? base.phone,
      description: o.description ?? base.description,
      field_updated_at: { ...base.field_updated_at, ...o.field_updated_at },
    };
  });
}

const fresh = (): Record<TrackedField, string> => ({
  opening_hours: RECENT,
  holiday_hours: RECENT,
  description: RECENT,
});

export const businesses: Business[] = [
  { _id: "cafe_aura", name: "Café Aura", owner_name: "Liisa", category: "cafe", city: "Turku", preferred_channel: "voice", language: "fi" },
  { _id: "parturi_linnankatu", name: "Parturi Kampaamo Linnankatu", owner_name: "Sanna", category: "hair_salon", city: "Turku", preferred_channel: "sms", language: "fi" },
  { _id: "autokorjaamo_skanssi", name: "Autokorjaamo Skanssi", owner_name: "Jari", category: "car_repair", city: "Turku", preferred_channel: "voice", language: "fi" },
  { _id: "kukkakauppa_kauppatori", name: "Kukkakauppa Kauppatori", owner_name: "Aino", category: "florist", city: "Turku", preferred_channel: "app", language: "fi" },
  { _id: "pizzeria_port_arthur", name: "Pizzeria Port Arthur", owner_name: "Marco", category: "restaurant", city: "Turku", preferred_channel: "app", language: "en" },
  { _id: "kirjakauppa_aurajoki", name: "Kirjakauppa Aurajoki", owner_name: "Elina", category: "bookshop", city: "Turku", preferred_channel: "sms", language: "fi" },
  { _id: "kuntosali_itaharju", name: "Kuntosali Itäharju", owner_name: "Tomi", category: "gym", city: "Turku", preferred_channel: "app", language: "fi" },
  { _id: "leipomo_martti", name: "Leipomo Martti", owner_name: "Martti", category: "bakery", city: "Turku", preferred_channel: "voice", language: "fi" },
];

export const listings: Listing[] = [
  // Café Aura — triggers all four rules:
  //  1. no hours for Christmas 2026 (had them in 2025)
  //  2. Google says open on Monday, Finder + website say closed (Finder/website updated more recently)
  //  3. recent review: "closed on Monday although Google said open"
  //  4. description last updated 2023-05-01
  ...listingsFor(
    "cafe_aura",
    {
      opening_hours: week("08:00-18:00", "10:00-16:00", "closed", { mon: "closed", fri: "08:00-20:00" }),
      holiday_hours: {
        "2025-12-24": "08:00-14:00",
        "2025-12-25": "closed",
        "2025-12-26": "closed",
        "2027-01-01": "closed",
        "2027-01-06": "10:00-16:00",
      },
      phone: "+358 2 100 4567",
      description: "Cozy café by the river.",
      field_updated_at: { opening_hours: "2026-10-01", holiday_hours: "2026-11-02", description: "2023-05-01" },
    },
    {
      google: {
        opening_hours: { mon: "08:00-18:00" },
        field_updated_at: { opening_hours: "2025-12-15" },
      },
    },
  ),

  // Parturi Kampaamo Linnankatu — no holiday hours at all.
  ...listingsFor("parturi_linnankatu", {
    opening_hours: week("09:00-17:00", "10:00-14:00", "closed", { thu: "09:00-19:00" }),
    holiday_hours: {},
    phone: "+358 2 100 2233",
    description: "Haircuts, colouring and beard trims in the city centre.",
    field_updated_at: fresh(),
  }),

  // Autokorjaamo Skanssi — Google has a different phone number.
  ...listingsFor(
    "autokorjaamo_skanssi",
    {
      opening_hours: week("07:30-16:30", "closed", "closed"),
      holiday_hours: allHolidays("closed", "closed"),
      phone: "+358 2 100 7781",
      description: "Car maintenance, tyre changes and inspections near Skanssi.",
      field_updated_at: fresh(),
    },
    { google: { phone: "+358 2 100 7718", field_updated_at: { opening_hours: "2026-03-20" } } },
  ),

  // Kukkakauppa Kauppatori — opening hours untouched for 2+ years on every channel.
  ...listingsFor("kukkakauppa_kauppatori", {
    opening_hours: week("09:00-18:00", "09:00-15:00", "closed"),
    holiday_hours: allHolidays("10:00-14:00", "09:00-13:00"),
    phone: "+358 2 100 3390",
    description: "Fresh flowers and bouquets at the market square.",
    field_updated_at: { opening_hours: "2024-05-14", holiday_hours: RECENT, description: RECENT },
  }),

  // Pizzeria Port Arthur — listings look fine, but reviews say it moved.
  ...listingsFor("pizzeria_port_arthur", {
    opening_hours: week("11:00-22:00", "12:00-23:00", "12:00-21:00", { fri: "11:00-23:00" }),
    holiday_hours: allHolidays("12:00-21:00", "closed"),
    phone: "+358 2 100 5520",
    description: "Wood-fired pizza in the Port Arthur district.",
    field_updated_at: fresh(),
  }),

  // Kirjakauppa Aurajoki — Saturday hours differ on Google.
  ...listingsFor(
    "kirjakauppa_aurajoki",
    {
      opening_hours: week("10:00-18:00", "10:00-16:00", "closed"),
      holiday_hours: allHolidays("closed", "10:00-13:00"),
      phone: "+358 2 100 6644",
      description: "Independent bookshop with Finnish and English titles.",
      field_updated_at: fresh(),
    },
    {
      google: {
        opening_hours: { sat: "10:00-15:00" },
        field_updated_at: { opening_hours: "2026-02-08" },
      },
    },
  ),

  // Kuntosali Itäharju — Christmas set, New Year's Day missing.
  ...listingsFor("kuntosali_itaharju", {
    opening_hours: week("06:00-22:00", "08:00-20:00", "08:00-20:00"),
    holiday_hours: {
      "2026-12-24": "08:00-12:00",
      "2026-12-25": "closed",
      "2026-12-26": "10:00-18:00",
      "2027-01-06": "10:00-18:00",
    },
    phone: "+358 2 100 8812",
    description: "Gym and group classes in Itäharju.",
    field_updated_at: fresh(),
  }),

  // Leipomo Martti — clean, everything up to date.
  ...listingsFor("leipomo_martti", {
    opening_hours: week("07:00-17:00", "08:00-14:00", "closed"),
    holiday_hours: allHolidays("closed", "07:00-12:00"),
    phone: "+358 2 100 9901",
    description: "Family bakery: rye bread, korvapuusti and Karelian pies.",
    field_updated_at: fresh(),
  }),
];

export const reviews: Review[] = [
  // Café Aura
  { _id: "rev_cafe_aura_1", business_id: "cafe_aura", date: "2026-11-30", rating: 2, text: "Came on Monday morning and it was closed even though Google said open." },
  { _id: "rev_cafe_aura_2", business_id: "cafe_aura", date: "2026-11-18", rating: 5, text: "Lovely cinnamon buns and a great view of the river." },
  { _id: "rev_cafe_aura_3", business_id: "cafe_aura", date: "2026-06-02", rating: 4, text: "Nice terrace in summer." },

  // Pizzeria Port Arthur — moved signal
  { _id: "rev_pizzeria_1", business_id: "pizzeria_port_arthur", date: "2026-12-01", rating: 2, text: "Walked to the old address and it was empty. A note on the door said they moved to Puolalankatu." },
  { _id: "rev_pizzeria_2", business_id: "pizzeria_port_arthur", date: "2026-11-21", rating: 4, text: "Great pizza at the new place, but the map still shows the old location." },

  // Benign recent reviews (should NOT produce a signal)
  { _id: "rev_parturi_1", business_id: "parturi_linnankatu", date: "2026-11-25", rating: 5, text: "Quick and friendly haircut." },
  { _id: "rev_auto_1", business_id: "autokorjaamo_skanssi", date: "2026-11-14", rating: 4, text: "Tyre change done in 30 minutes." },
  { _id: "rev_kukka_1", business_id: "kukkakauppa_kauppatori", date: "2026-12-03", rating: 5, text: "Beautiful bouquet for my mother's birthday." },
  { _id: "rev_kirja_1", business_id: "kirjakauppa_aurajoki", date: "2026-11-28", rating: 5, text: "Great selection and helpful staff." },
  { _id: "rev_kunto_1", business_id: "kuntosali_itaharju", date: "2026-11-12", rating: 4, text: "Good equipment, can get busy in the evenings." },
  { _id: "rev_leipomo_1", business_id: "leipomo_martti", date: "2026-12-05", rating: 5, text: "Best rye bread in Turku." },

  // Old negative review (outside the 30-day window, should be ignored)
  { _id: "rev_leipomo_old", business_id: "leipomo_martti", date: "2026-03-10", rating: 2, text: "Was closed when I arrived, but it was a holiday." },
];

export const preferences: Preferences[] = businesses.map((b) => ({
  _id: b._id,
  business_id: b._id,
  ignored_fingerprints: [],
  notes: [],
}));
