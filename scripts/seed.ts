import path from "node:path";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  achievements,
  attractions,
  hotelActivities,
  hotelEvents,
  hotelPartners,
  hotels,
  partners,
  users,
  type HotelActivityKind,
  type PlaceType,
  type VerificationMode,
} from "../src/db/schema";
import type { AttractionCategory, PartnerCategory } from "../src/lib/partner-category";
import { writeSeedModels } from "./make-models";

/**
 * Local development seed.
 *
 * Rerunnable by design: every row is matched on a natural key (username, hotel
 * name, attraction name…) and updated in place rather than re-inserted, so
 * running it twice changes nothing. QR tokens are generated only on first
 * insert and never rewritten, so codes printed from an earlier run keep working.
 *
 * The data is shaped to prove the rules rather than to look plausible:
 *   - three hotels with DISJOINT partner sets, so hotel separation is visible;
 *   - attractions both inside and well outside the 5 km radius;
 *   - all three check-in modes (GPS, QR, AR) in use;
 *   - achievements on hotels, attractions and partners alike;
 *   - hotel activities everywhere, so every generated day can include one.
 */

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

/** Batumi, Georgia — all coordinates below are real places in and around it. */
type Place = { lat: number; lng: number };

const HOTEL_A: Place = { lat: 41.6478, lng: 41.6338 };
const HOTEL_B: Place = { lat: 41.6512, lng: 41.6421 };
const HOTEL_C: Place = { lat: 41.6392, lng: 41.6295 };

async function upsertUser(username: string, password: string, role: "user" | "admin") {
  const normalized = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalized))
    .limit(1);

  if (existing) {
    await db.update(users).set({ passwordHash, role }).where(eq(users.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ username: normalized, passwordHash, role })
    .returning({ id: users.id });
  return created.id;
}

type HotelSeed = {
  name: string;
  description: string;
  address: string;
  photo: string;
  location: Place;
  modelPath?: string;
  modelHeight?: number;
};

async function upsertHotel(seed: HotelSeed, createdBy: string) {
  const [existing] = await db
    .select({ id: hotels.id })
    .from(hotels)
    .where(eq(hotels.name, seed.name))
    .limit(1);

  const values = {
    name: seed.name,
    description: seed.description,
    address: seed.address,
    photoPath: `/uploads/hotels/${seed.photo}`,
    latitude: seed.location.lat,
    longitude: seed.location.lng,
    modelPath: seed.modelPath ?? null,
    modelTargetHeightMeters: seed.modelHeight ?? 24,
    createdBy,
  };

  if (existing) {
    // qrToken is deliberately left alone so printed codes stay valid.
    await db.update(hotels).set(values).where(eq(hotels.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(hotels)
    .values({ ...values, qrToken: crypto.randomUUID() })
    .returning({ id: hotels.id });
  return created.id;
}

type AttractionSeed = {
  name: string;
  category: AttractionCategory;
  description: string;
  photo: string;
  location: Place;
  verificationMode?: VerificationMode;
  modelPath?: string;
  modelHeight?: number;
};

async function upsertAttraction(seed: AttractionSeed, createdBy: string) {
  const [existing] = await db
    .select({ id: attractions.id })
    .from(attractions)
    .where(eq(attractions.name, seed.name))
    .limit(1);

  const values = {
    name: seed.name,
    category: seed.category,
    description: seed.description,
    photoPath: `/uploads/attractions/${seed.photo}`,
    latitude: seed.location.lat,
    longitude: seed.location.lng,
    verificationMode: seed.verificationMode ?? ("gps" as VerificationMode),
    modelPath: seed.modelPath ?? null,
    modelTargetHeightMeters: seed.modelHeight ?? 10,
    createdBy,
  };

  if (existing) {
    await db.update(attractions).set(values).where(eq(attractions.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(attractions)
    .values({ ...values, qrToken: crypto.randomUUID() })
    .returning({ id: attractions.id });
  return created.id;
}

type PartnerSeed = {
  name: string;
  category: PartnerCategory;
  description: string;
  photo: string;
  location: Place;
  address?: string;
  phone?: string;
  website?: string;
  modelPath?: string;
  modelHeight?: number;
};

async function upsertPartner(seed: PartnerSeed, createdBy: string) {
  const [existing] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.name, seed.name))
    .limit(1);

  const values = {
    name: seed.name,
    category: seed.category,
    description: seed.description,
    photoPath: `/uploads/partners/${seed.photo}`,
    address: seed.address ?? null,
    contactPhone: seed.phone ?? null,
    contactWebsite: seed.website ?? null,
    latitude: seed.location.lat,
    longitude: seed.location.lng,
    verificationMode: "qr" as VerificationMode,
    modelPath: seed.modelPath ?? null,
    modelTargetHeightMeters: seed.modelHeight ?? 7,
    createdBy,
  };

  if (existing) {
    await db.update(partners).set(values).where(eq(partners.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(partners)
    .values({ ...values, qrToken: crypto.randomUUID() })
    .returning({ id: partners.id });
  return created.id;
}

async function assignPartner(hotelId: string, partnerId: string) {
  await db.insert(hotelPartners).values({ hotelId, partnerId }).onConflictDoNothing();
}

async function upsertAchievement(
  placeType: PlaceType,
  placeId: string,
  name: string,
  description: string,
) {
  const [existing] = await db
    .select({ id: achievements.id })
    .from(achievements)
    .where(and(eq(achievements.placeType, placeType), eq(achievements.placeId, placeId)))
    .limit(1);

  if (existing) {
    await db
      .update(achievements)
      .set({ name, description })
      .where(eq(achievements.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(achievements)
    .values({ placeType, placeId, name, description })
    .returning({ id: achievements.id });
  return created.id;
}

async function upsertActivity(
  hotelId: string,
  name: string,
  kind: HotelActivityKind,
  description: string,
) {
  const [existing] = await db
    .select({ id: hotelActivities.id })
    .from(hotelActivities)
    .where(and(eq(hotelActivities.hotelId, hotelId), eq(hotelActivities.name, name)))
    .limit(1);

  if (existing) {
    await db
      .update(hotelActivities)
      .set({ kind, description, active: true })
      .where(eq(hotelActivities.id, existing.id));
    return;
  }
  await db.insert(hotelActivities).values({ hotelId, name, kind, description, active: true });
}

async function upsertEvent(hotelId: string, title: string, description: string, daysAhead: number) {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + daysAhead);
  startsAt.setHours(19, 30, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(22, 0, 0, 0);

  const [existing] = await db
    .select({ id: hotelEvents.id })
    .from(hotelEvents)
    .where(and(eq(hotelEvents.hotelId, hotelId), eq(hotelEvents.title, title)))
    .limit(1);

  if (existing) {
    await db
      .update(hotelEvents)
      .set({ description, startsAt, endsAt })
      .where(eq(hotelEvents.id, existing.id));
    return;
  }
  await db.insert(hotelEvents).values({ hotelId, title, description, startsAt, endsAt });
}

async function main() {
  console.log("Generating seed 3D models…");
  const models = await writeSeedModels(UPLOADS_ROOT);

  console.log("Seeding users…");
  // Required local development/testing account.
  const adminId = await upsertUser("ratichak", "01024072661", "admin");
  // A plain guest, so non-admin behaviour (partner filtering, cooldowns) can be
  // checked without admin exemptions in the way.
  await upsertUser("testguest", "testguest-local-only", "user");

  console.log("Seeding hotels…");
  const hotelAId = await upsertHotel(
    {
      name: "Seaside Grand Batumi",
      description: "Beachfront hotel on the boulevard, a short walk from Old Town.",
      address: "Seaside Boulevard 12, Batumi",
      photo: "0bb46ca0-86fc-4ec2-818d-3fd3c6888d86.png",
      location: HOTEL_A,
      modelPath: models.tower.publicPath,
      modelHeight: 30,
    },
    adminId,
  );
  const hotelBId = await upsertHotel(
    {
      name: "Old Town Boutique Batumi",
      description: "Small boutique hotel tucked into the Old Town streets.",
      address: "Memed Abashidze St 40, Batumi",
      photo: "b013644f-71eb-49ce-b69c-d75b6387e011.png",
      location: HOTEL_B,
      modelPath: models.pavilion.publicPath,
      modelHeight: 16,
    },
    adminId,
  );
  const hotelCId = await upsertHotel(
    {
      name: "Harbour View Batumi",
      description: "Quiet hotel near the dolphinarium and the new boulevard.",
      address: "Rustaveli Ave 88, Batumi",
      photo: "0bb46ca0-86fc-4ec2-818d-3fd3c6888d86.png",
      location: HOTEL_C,
    },
    adminId,
  );

  console.log("Seeding attractions…");
  const attractionSeeds: AttractionSeed[] = [
    // --- within walking distance of all three hotels ---
    {
      name: "Alphabet Tower",
      category: "landmark",
      description: "130m tower spiralling the Georgian alphabet up its frame.",
      photo: "alphabet-tower.png",
      location: { lat: 41.652, lng: 41.636 },
      verificationMode: "ar",
      modelPath: models.tower.publicPath,
      modelHeight: 40,
    },
    {
      name: "Ali and Nino Statue",
      category: "landmark",
      description: "Moving steel sculpture of two lovers passing through each other.",
      photo: "ali-and-nino-statue.png",
      location: { lat: 41.6512, lng: 41.6374 },
      verificationMode: "ar",
      modelPath: models.obelisk.publicPath,
      modelHeight: 8,
    },
    {
      name: "Europe Square",
      category: "landmark",
      description: "Grand square with the Medea statue at its centre.",
      photo: "europe-square.png",
      location: { lat: 41.6436, lng: 41.6397 },
      verificationMode: "gps",
      modelPath: models.obelisk.publicPath,
      modelHeight: 14,
    },
    {
      name: "Piazza Batumi",
      category: "historical",
      description: "Italianate piazza with mosaics and stained glass.",
      photo: "piazza-batumi.png",
      location: { lat: 41.6494, lng: 41.6409 },
      verificationMode: "qr",
      modelPath: models.pavilion.publicPath,
      modelHeight: 12,
    },
    {
      name: "Batumi Old Town",
      category: "historical",
      description: "Nineteenth-century streets and courtyards.",
      photo: "batumi-old-town.png",
      location: { lat: 41.6485, lng: 41.6402 },
    },
    {
      name: "Batumi Boulevard",
      category: "nature",
      description: "Seven kilometres of planted promenade along the shore.",
      photo: "batumi-boulevard.png",
      location: { lat: 41.6455, lng: 41.6322 },
    },
    {
      name: "Batumi Central Beach",
      category: "beach",
      description: "The city's main pebble beach.",
      photo: "batumi-central-beach.png",
      location: { lat: 41.646, lng: 41.63 },
    },
    {
      name: "Dancing Fountains",
      category: "landmark",
      description: "Evening music-and-light fountain show on the lake.",
      photo: "dancing-fountains.png",
      location: { lat: 41.641, lng: 41.632 },
    },
    {
      name: "Adjara Art Museum",
      category: "museum",
      description: "Georgian painting and graphics from the last two centuries.",
      photo: "adjara-art-museum.png",
      location: { lat: 41.646, lng: 41.638 },
      verificationMode: "qr",
    },
    {
      name: "Batumi Archaeological Museum",
      category: "museum",
      description: "Finds from Colchis and the ancient Black Sea coast.",
      photo: "batumi-archaeological-museum.png",
      location: { lat: 41.645, lng: 41.641 },
      verificationMode: "qr",
    },
    {
      name: "Orta Jame Mosque",
      category: "historical",
      description: "The city's only mosque, built in 1866.",
      photo: "orta-jame-mosque.png",
      location: { lat: 41.653, lng: 41.642 },
    },
    {
      name: "Church of the Holy Spirit",
      category: "historical",
      description: "Neo-Gothic cathedral with a bright interior.",
      photo: "church-of-holy-spirit.png",
      location: { lat: 41.649, lng: 41.644 },
    },
    {
      name: "Ashkenazi Synagogue",
      category: "historical",
      description: "1904 synagogue modelled on those of The Hague and Amsterdam.",
      photo: "ashkenazi-synagogue.png",
      location: { lat: 41.6505, lng: 41.64 },
    },
    {
      name: "Neptune Fountain",
      category: "landmark",
      description: "Replica of the Bologna fountain, in front of the drama theatre.",
      photo: "neptune-fountain.png",
      location: { lat: 41.648, lng: 41.64 },
    },
    {
      name: "Six May Park",
      category: "nature",
      description: "Lakeside park with the aquarium and zoo corner.",
      photo: "six-may-park.png",
      location: { lat: 41.6338, lng: 41.6294 },
    },
    {
      name: "Argo Cable Car",
      category: "landmark",
      description: "Cable car up to Anuria hill for the whole-bay view.",
      photo: "argo-cable-car.png",
      location: { lat: 41.644, lng: 41.635 },
      verificationMode: "qr",
    },
    {
      name: "Batumi Ferris Wheel",
      category: "landmark",
      description: "Seafront wheel beside the Batumi Tower.",
      photo: "batumi-tower-ferris-wheel.png",
      location: { lat: 41.65, lng: 41.634 },
    },
    {
      name: "Batumi Dolphinarium",
      category: "nature",
      description: "Dolphin shows in Six May Park.",
      photo: "batumi-dolphinarium.png",
      location: { lat: 41.635, lng: 41.629 },
      verificationMode: "qr",
    },
    {
      name: "360 Sky Bar",
      category: "nightlife",
      description: "Rotating bar high above the seafront.",
      photo: "360-sky-bar.png",
      location: { lat: 41.651, lng: 41.635 },
    },
    {
      name: "Chacha Time Bar",
      category: "nightlife",
      description: "Tasting bar for Georgian chacha and wine.",
      photo: "chacha-time-bar.png",
      location: { lat: 41.647, lng: 41.636 },
    },
    {
      name: "Batumi Casino Strip",
      category: "nightlife",
      description: "The cluster of late-night venues near the Tower.",
      photo: "batumi-casino-strip.png",
      location: { lat: 41.6515, lng: 41.6345 },
    },
    {
      name: "New Boulevard Beach",
      category: "beach",
      description: "The quieter southern stretch of the promenade.",
      photo: "new-boulevard-beach.png",
      location: { lat: 41.63, lng: 41.62 },
    },
    // --- deliberately OUTSIDE the 5 km radius, to prove the filter ---
    {
      name: "Batumi Botanical Garden",
      category: "nature",
      description: "Vast hillside garden at Green Cape — too far for a walking day.",
      photo: "batumi-botanical-garden.png",
      location: { lat: 41.695, lng: 41.708 },
    },
    {
      name: "Mtirala National Park",
      category: "nature",
      description: "Rainforest park inland — far outside walking range.",
      photo: "mtirala-national-park.png",
      location: { lat: 41.64, lng: 41.88 },
    },
    {
      name: "Sarpi Beach",
      category: "beach",
      description: "Clear-water beach at the Turkish border — far outside walking range.",
      photo: "sarpi-beach.png",
      location: { lat: 41.523, lng: 41.55 },
    },
    {
      name: "Borjgalo Ethnographic Museum",
      category: "museum",
      description: "Open-air museum of Adjaran village life — outside walking range.",
      photo: "borjgalo-ethnographic-museum.png",
      location: { lat: 41.67, lng: 41.68 },
    },
  ];

  const attractionIds = new Map<string, string>();
  for (const seed of attractionSeeds) {
    attractionIds.set(seed.name, await upsertAttraction(seed, adminId));
  }

  console.log("Seeding partners…");
  // Each hotel gets a DISJOINT set — this is what Test 2 checks.
  const partnerSeeds: (PartnerSeed & { hotels: string[] })[] = [
    {
      name: "Seaside Cafe",
      category: "restaurant",
      description: "Breakfast and coffee right on the boulevard.",
      photo: "seaside-cafe.png",
      location: { lat: 41.6466, lng: 41.6318 },
      address: "Seaside Boulevard 4, Batumi",
      phone: "+995 422 11 22 33",
      hotels: ["A"],
      modelPath: models.pavilion.publicPath,
      modelHeight: 7,
    },
    {
      name: "Orchid Spa",
      category: "spa",
      description: "Massage and hammam a block from the beach.",
      photo: "orchid-spa.png",
      location: { lat: 41.6489, lng: 41.6356 },
      hotels: ["A"],
    },
    {
      name: "Batumi Walking Tour",
      category: "tour",
      description: "Two-hour guided walk through the Old Town.",
      photo: "batumi-walking-tour.png",
      location: { lat: 41.6498, lng: 41.6391 },
      hotels: ["A"],
    },
    {
      name: "Sanapiro Restaurant",
      category: "restaurant",
      description: "Adjaran cooking beside the old harbour.",
      photo: "sanapiro.png",
      location: { lat: 41.6524, lng: 41.6437 },
      hotels: ["B"],
      modelPath: models.pavilion.publicPath,
      modelHeight: 8,
    },
    {
      name: "Eforea Spa",
      category: "spa",
      description: "Hotel spa open to guests of our partner hotels.",
      photo: "eforea-spa.png",
      location: { lat: 41.6531, lng: 41.6408 },
      hotels: ["B"],
    },
    {
      name: "Metro City Mall",
      category: "shop",
      description: "Shopping centre on the edge of the Old Town.",
      photo: "metro-city-mall.png",
      location: { lat: 41.6472, lng: 41.6449 },
      hotels: ["B"],
    },
    {
      name: "Porto Franco",
      category: "restaurant",
      description: "Seafood near the new boulevard.",
      photo: "porto-franco.png",
      location: { lat: 41.6376, lng: 41.6281 },
      hotels: ["C"],
    },
    {
      name: "Adjara Spa",
      category: "spa",
      description: "Thermal pools and treatments south of the centre.",
      photo: "adjara-spa.png",
      location: { lat: 41.6361, lng: 41.6312 },
      hotels: ["C"],
    },
    // Unassigned on purpose: proof that an unassigned partner reaches nobody.
    {
      name: "Anne Semonin Spa",
      category: "spa",
      description: "Not assigned to any hotel — should never appear for a guest.",
      photo: "anne-semonin-spa.png",
      location: { lat: 41.6501, lng: 41.6367 },
      hotels: [],
    },
    {
      name: "Batumi Bazaar",
      category: "shop",
      description: "Not assigned to any hotel — should never appear for a guest.",
      photo: "batumi-bazaar.png",
      location: { lat: 41.6442, lng: 41.6431 },
      hotels: [],
    },
    {
      name: "Georgian Naturale Wine",
      category: "shop",
      description: "Not assigned to any hotel — should never appear for a guest.",
      photo: "georgian-naturale-wine.png",
      location: { lat: 41.6487, lng: 41.6412 },
      hotels: [],
    },
    {
      name: "Batumi Boat Excursion",
      category: "tour",
      description: "Not assigned to any hotel — should never appear for a guest.",
      photo: "batumi-boat-excursion.png",
      location: { lat: 41.6538, lng: 41.6392 },
      hotels: [],
    },
  ];

  const hotelsByKey: Record<string, string> = { A: hotelAId, B: hotelBId, C: hotelCId };
  const partnerIds = new Map<string, string>();
  for (const seed of partnerSeeds) {
    const partnerId = await upsertPartner(seed, adminId);
    partnerIds.set(seed.name, partnerId);
    for (const key of seed.hotels) {
      await assignPartner(hotelsByKey[key], partnerId);
    }
  }

  console.log("Seeding hotel activities…");
  await upsertActivity(hotelAId, "Seaside Spa", "spa", "Sea-view treatment rooms on floor 7.");
  await upsertActivity(hotelAId, "Rooftop Pool", "pool", "Heated pool open 07:00–22:00.");
  await upsertActivity(hotelAId, "Grand Restaurant", "restaurant", "Breakfast and à la carte dinner.");
  await upsertActivity(hotelAId, "Fitness Centre", "gym", "Open 24 hours to guests.");

  await upsertActivity(hotelBId, "Boutique Sauna", "sauna", "Finnish sauna in the cellar.");
  await upsertActivity(hotelBId, "Courtyard Restaurant", "restaurant", "Georgian menu in the courtyard.");
  await upsertActivity(hotelBId, "Room Service", "room_service", "Available until midnight.");

  await upsertActivity(hotelCId, "Harbour Pool", "pool", "Outdoor pool facing the harbour.");
  await upsertActivity(hotelCId, "Morning Gym", "gym", "Compact gym on the ground floor.");

  console.log("Seeding hotel events…");
  await upsertEvent(hotelAId, "Live jazz on the terrace", "Trio playing standards.", 2);
  await upsertEvent(hotelAId, "Georgian wine tasting", "Six qvevri wines with the sommelier.", 5);
  await upsertEvent(hotelBId, "Khachapuri workshop", "Make Adjaruli khachapuri with the chef.", 3);
  await upsertEvent(hotelCId, "Sunset harbour walk", "Guided walk along the new boulevard.", 1);

  console.log("Seeding achievements…");
  await upsertAchievement("hotel", hotelAId, "Seaside Grand guest", "Unlocked the Seaside Grand Batumi.");
  await upsertAchievement("hotel", hotelBId, "Old Town guest", "Unlocked the Old Town Boutique Batumi.");
  await upsertAchievement("hotel", hotelCId, "Harbour View guest", "Unlocked the Harbour View Batumi.");

  const attractionAchievements: [string, string, string][] = [
    ["Alphabet Tower", "Alphabet climber", "Found the tower that spells Georgian in steel."],
    ["Ali and Nino Statue", "Star-crossed", "Watched Ali and Nino pass through each other."],
    ["Europe Square", "Medea's square", "Stood beneath the golden fleece."],
    ["Piazza Batumi", "Piazza regular", "Checked in under the Piazza's mosaics."],
    ["Batumi Old Town", "Old Town wanderer", "Explored the nineteenth-century streets."],
    ["Batumi Boulevard", "Boulevardier", "Walked the planted promenade."],
    ["Batumi Central Beach", "Pebble counter", "Reached the city's main beach."],
    ["Dancing Fountains", "Night of fountains", "Caught the evening fountain show."],
    ["Adjara Art Museum", "Gallery goer", "Visited the Adjara Art Museum."],
    ["Batumi Archaeological Museum", "Colchis scholar", "Visited the Archaeological Museum."],
    ["Orta Jame Mosque", "Orta Jame visitor", "Visited the city's historic mosque."],
    ["Church of the Holy Spirit", "Neo-Gothic", "Visited the Church of the Holy Spirit."],
    ["Argo Cable Car", "Above the bay", "Rode the Argo cable car."],
    ["Batumi Dolphinarium", "Dolphin watcher", "Visited the dolphinarium."],
    ["360 Sky Bar", "Full rotation", "Made it to the rotating sky bar."],
  ];
  const namedAchievements = new Map(
    attractionAchievements.map(([attractionName, name, description]) => [
      attractionName,
      { name, description },
    ]),
  );

  // Every attraction a guest can actually reach on a walking day gets a badge,
  // so a check-in always rewards something. The handful outside the 5 km radius
  // are left without one on purpose — they also give the admin dashboard's
  // "places without an achievement" prompt something real to show.
  const outOfRange = new Set([
    "Batumi Botanical Garden",
    "Mtirala National Park",
    "Sarpi Beach",
    "Borjgalo Ethnographic Museum",
  ]);

  for (const seed of attractionSeeds) {
    if (outOfRange.has(seed.name)) continue;
    const id = attractionIds.get(seed.name);
    if (!id) continue;
    const named = namedAchievements.get(seed.name);
    await upsertAchievement(
      "attraction",
      id,
      named?.name ?? `${seed.name} visitor`,
      named?.description ?? `Checked in at ${seed.name}.`,
    );
  }

  const partnerAchievements: [string, string, string][] = [
    ["Seaside Cafe", "Morning regular", "Checked in at the Seaside Cafe."],
    ["Orchid Spa", "Fully unwound", "Checked in at the Orchid Spa."],
    ["Batumi Walking Tour", "Guided", "Joined the Batumi walking tour."],
    ["Sanapiro Restaurant", "Harbour table", "Checked in at Sanapiro."],
    ["Eforea Spa", "Steam and stone", "Checked in at the Eforea Spa."],
    ["Metro City Mall", "Retail therapy", "Checked in at Metro City Mall."],
    ["Porto Franco", "Catch of the day", "Checked in at Porto Franco."],
    ["Adjara Spa", "Thermal", "Checked in at the Adjara Spa."],
  ];
  for (const [partnerName, name, description] of partnerAchievements) {
    const id = partnerIds.get(partnerName);
    if (id) await upsertAchievement("partner", id, name, description);
  }

  console.log("\nSeed complete.");
  console.log(`  hotels:       3 (${attractionSeeds.length} attractions, ${partnerSeeds.length} partners)`);
  console.log("  partner sets: Seaside Grand / Old Town / Harbour View are disjoint");
  console.log("  4 partners are intentionally unassigned and must never appear for a guest");
  console.log("  4 attractions sit outside the 5 km radius on purpose");
  console.log("\n  Test account:  ratichak / 01024072661  (admin)");
  console.log("  Plain guest:   testguest / testguest-local-only  (user)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
