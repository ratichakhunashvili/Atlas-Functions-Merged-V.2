import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  primaryKey,
  pgEnum,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The three kinds of real-world place in the system. There is exactly ONE
 * authoritative row per physical place — a statue is an `attraction` row that
 * *also* carries its 3D model, badge and AR target, never a second "object"
 * record that could drift out of sync with it.
 */
export const placeTypeEnum = pgEnum("place_type", ["hotel", "attraction", "partner"]);
export type PlaceType = (typeof placeTypeEnum.enumValues)[number];

/** How a guest proves they are actually at a place before it counts as visited. */
export const verificationModeEnum = pgEnum("verification_mode", ["gps", "qr", "ar"]);
export type VerificationMode = (typeof verificationModeEnum.enumValues)[number];

export const hotels = pgTable("hotels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  address: text("address"),
  photoPath: text("photo_path").notNull(),
  qrToken: varchar("qr_token", { length: 64 }).notNull().unique(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // --- 3D (see `lib/map3d` — all transforms are applied in world/meter space) ---
  modelPath: text("model_path"),
  model3dEnabled: boolean("model_3d_enabled").notNull().default(true),
  modelTargetHeightMeters: doublePrecision("model_target_height_meters").notNull().default(12),
  modelRotationDeg: doublePrecision("model_rotation_deg").notNull().default(0),
  modelElevationOffsetMeters: doublePrecision("model_elevation_offset_meters").notNull().default(0),
  modelScaleMultiplier: doublePrecision("model_scale_multiplier").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Shared by attractions and partners, and by guests' category preferences. */
export const categoryEnum = pgEnum("category", [
  "restaurant",
  "spa",
  "tour",
  "shop",
  "other",
  "landmark",
  "historical",
  "nature",
  "museum",
  "beach",
  "nightlife",
]);

export const attractions = pgTable("attractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  category: categoryEnum("category").notNull(),
  description: text("description"),
  photoPath: text("photo_path").notNull(),
  qrToken: varchar("qr_token", { length: 64 }).notNull().unique(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** GPS for open places, QR where a code can physically be installed, AR where it cannot. */
  verificationMode: verificationModeEnum("verification_mode").notNull().default("gps"),
  /** Reference image the AR verifier matches the camera frame against. */
  arTargetPath: text("ar_target_path"),
  /** Perceptual hash of that image, computed at upload — the AR match is made
   *  against this server-side, so the client never holds the answer. */
  arTargetHash: varchar("ar_target_hash", { length: 80 }),
  modelPath: text("model_path"),
  model3dEnabled: boolean("model_3d_enabled").notNull().default(true),
  modelTargetHeightMeters: doublePrecision("model_target_height_meters").notNull().default(8),
  modelRotationDeg: doublePrecision("model_rotation_deg").notNull().default(0),
  modelElevationOffsetMeters: doublePrecision("model_elevation_offset_meters").notNull().default(0),
  modelScaleMultiplier: doublePrecision("model_scale_multiplier").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  category: categoryEnum("category").notNull().default("other"),
  description: text("description"),
  photoPath: text("photo_path").notNull(),
  address: text("address"),
  contactPhone: varchar("contact_phone", { length: 64 }),
  contactWebsite: text("contact_website"),
  qrToken: varchar("qr_token", { length: 64 }).notNull().unique(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  verificationMode: verificationModeEnum("verification_mode").notNull().default("qr"),
  arTargetPath: text("ar_target_path"),
  arTargetHash: varchar("ar_target_hash", { length: 80 }),
  modelPath: text("model_path"),
  model3dEnabled: boolean("model_3d_enabled").notNull().default(true),
  modelTargetHeightMeters: doublePrecision("model_target_height_meters").notNull().default(6),
  modelRotationDeg: doublePrecision("model_rotation_deg").notNull().default(0),
  modelElevationOffsetMeters: doublePrecision("model_elevation_offset_meters").notNull().default(0),
  modelScaleMultiplier: doublePrecision("model_scale_multiplier").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Many-to-many: a partner is only ever visible to the hotels it is explicitly assigned to. */
export const hotelPartners = pgTable(
  "hotel_partners",
  {
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.hotelId, table.partnerId] })],
);

/** Things a guest can do *inside* the hotel — spa, pool, gym, restaurant, room service. */
export const hotelActivityKindEnum = pgEnum("hotel_activity_kind", [
  "spa",
  "sauna",
  "pool",
  "gym",
  "restaurant",
  "room_service",
  "other",
]);
export type HotelActivityKind = (typeof hotelActivityKindEnum.enumValues)[number];

export const hotelActivities = pgTable("hotel_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  kind: hotelActivityKindEnum("kind").notNull().default("other"),
  description: text("description"),
  photoPath: text("photo_path"),
  /** Usually null — an activity then sits at its hotel's coordinates. */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** Inactive activities stay in the database but are never picked for a day. */
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hotelEvents = pgTable("hotel_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  photoPath: text("photo_path"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hotelUnlocks = pgTable(
  "hotel_unlocks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.hotelId] })],
);

/**
 * One badge, owned by exactly one place. The unique constraint on
 * (placeType, placeId) is what stops a place ever growing a second achievement.
 * `placeId` is deliberately not a foreign key — it points into one of three
 * tables depending on `placeType` — so deletes are cascaded in application code
 * (see `deleteAchievementsForPlace`).
 */
export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    badgeImagePath: text("badge_image_path"),
    placeType: placeTypeEnum("place_type").notNull(),
    placeId: uuid("place_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("achievements_place_unique").on(table.placeType, table.placeId)],
);

/** Permanent. The composite primary key is the idempotency guarantee. */
export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);

/**
 * "This guest has been to this place." Independent of any itinerary day, so a
 * place stays unlocked (and its 3D model full-colour) across future days.
 * Re-scanning only bumps `lastCheckedInAt`; it never inserts a second row.
 */
export const placeCheckIns = pgTable(
  "place_check_ins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeType: placeTypeEnum("place_type").notNull(),
    placeId: uuid("place_id").notNull(),
    verificationMode: verificationModeEnum("verification_mode").notNull(),
    firstCheckedInAt: timestamp("first_checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCheckedInAt: timestamp("last_checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checkInCount: integer("check_in_count").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.userId, table.placeType, table.placeId] })],
);

/** One generated day-plan (a walking loop from the hotel through a handful of stops) for a guest at a hotel. */
export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    stopCount: integer("stop_count").notNull(),
    /** Cached optimized geometry, kept for admin/reference only — the guest-facing
     * map never renders it, so the day stays progressively revealed. */
    routeGeoJson: jsonb("route_geo_json"),
    totalDurationSeconds: integer("total_duration_seconds"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.hotelId, table.dayNumber)],
);

export const stopTypeEnum = pgEnum("stop_type", [
  "attraction",
  "partner",
  "hotel",
  "hotel_activity",
]);
export type StopType = (typeof stopTypeEnum.enumValues)[number];

/** One ordered stop within a generated day. Snapshots name/photo/location/model so the
 * plan stays stable even if the source attraction/partner is later edited or removed. */
export const itineraryStops = pgTable("itinerary_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => itineraryDays.id, { onDelete: "cascade" }),
  stopType: stopTypeEnum("stop_type").notNull(),
  /** The attraction/partner/hotel-activity id this stop came from (null for a synthetic hotel stop). */
  sourceId: uuid("source_id"),
  name: varchar("name", { length: 255 }).notNull(),
  category: categoryEnum("category"),
  photoPath: text("photo_path"),
  modelPath: text("model_path"),
  /** Snapshotted so the check-in flow a stop offers can't change mid-day. */
  verificationMode: verificationModeEnum("verification_mode").notNull().default("gps"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  position: integer("position").notNull(),
  visitedAt: timestamp("visited_at", { withTimezone: true }),
});

/** Which categories a guest is interested in — gates and filters day generation. */
export const userCategoryPreferences = pgTable(
  "user_category_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: categoryEnum("category").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.category] })],
);
