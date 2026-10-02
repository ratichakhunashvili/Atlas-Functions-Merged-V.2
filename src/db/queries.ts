import "server-only";
import { db } from "@/db";
import {
  achievements,
  attractions,
  hotelActivities,
  hotelEvents,
  hotelPartners,
  hotels,
  hotelUnlocks,
  itineraryDays,
  itineraryStops,
  partners,
  placeCheckIns,
  userAchievements,
  userCategoryPreferences,
  users,
} from "@/db/schema";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Category } from "@/lib/partner-category";
import { placeKey, type PlaceType, type VerificationMode } from "@/lib/place";

export async function isFirstUser(): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return count === 0;
}

/* ------------------------------------------------------------------ users */

export type AdminUserRow = {
  id: string;
  username: string;
  role: "user" | "admin";
  createdAt: Date;
  unlockedHotels: number;
  achievementCount: number;
  checkInCount: number;
  itineraryDayCount: number;
};

/** Backs the admin users table. Password hashes are never selected. */
export async function getAllUsersForAdmin(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      unlockedHotels: sql<number>`(select count(*)::int from ${hotelUnlocks} where ${hotelUnlocks.userId} = ${users.id})`,
      achievementCount: sql<number>`(select count(*)::int from ${userAchievements} where ${userAchievements.userId} = ${users.id})`,
      checkInCount: sql<number>`(select count(*)::int from ${placeCheckIns} where ${placeCheckIns.userId} = ${users.id})`,
      itineraryDayCount: sql<number>`(select count(*)::int from ${itineraryDays} where ${itineraryDays.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return rows;
}

export async function getUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

/* ----------------------------------------------------------------- hotels */

export async function getAllHotels() {
  return db.select().from(hotels).orderBy(desc(hotels.createdAt));
}

export async function getHotelById(id: string) {
  const [hotel] = await db.select().from(hotels).where(eq(hotels.id, id)).limit(1);
  return hotel ?? null;
}

export async function getHotelByQrToken(qrToken: string) {
  const [hotel] = await db
    .select()
    .from(hotels)
    .where(eq(hotels.qrToken, qrToken))
    .limit(1);
  return hotel ?? null;
}

export type HotelWithStatus = {
  id: string;
  name: string;
  address: string | null;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
  unlocked: boolean;
};

export async function getHotelsWithUnlockStatus(
  userId: string,
): Promise<HotelWithStatus[]> {
  const rows = await db
    .select({
      id: hotels.id,
      name: hotels.name,
      address: hotels.address,
      photoPath: hotels.photoPath,
      latitude: hotels.latitude,
      longitude: hotels.longitude,
      unlockedAt: hotelUnlocks.unlockedAt,
    })
    .from(hotels)
    .leftJoin(
      hotelUnlocks,
      and(eq(hotelUnlocks.hotelId, hotels.id), eq(hotelUnlocks.userId, userId)),
    )
    .orderBy(desc(hotels.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    photoPath: row.photoPath,
    latitude: row.latitude,
    longitude: row.longitude,
    unlocked: row.unlockedAt !== null,
  }));
}

export async function isHotelUnlockedForUser(
  userId: string,
  hotelId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: hotelUnlocks.userId })
    .from(hotelUnlocks)
    .where(and(eq(hotelUnlocks.userId, userId), eq(hotelUnlocks.hotelId, hotelId)))
    .limit(1);
  return row !== undefined;
}

/** Every hotel this guest has unlocked, most recent first. */
export async function getUnlockedHotelsForUser(userId: string) {
  const rows = await db
    .select({ hotel: hotels })
    .from(hotelUnlocks)
    .innerJoin(hotels, eq(hotels.id, hotelUnlocks.hotelId))
    .where(eq(hotelUnlocks.userId, userId))
    .orderBy(desc(hotelUnlocks.unlockedAt));
  return rows.map((row) => row.hotel);
}

/** The hotel a guest is currently staying at — their most recent unlock. */
export async function getActiveHotelForUser(userId: string) {
  const [row] = await db
    .select({ hotel: hotels, unlockedAt: hotelUnlocks.unlockedAt })
    .from(hotelUnlocks)
    .innerJoin(hotels, eq(hotels.id, hotelUnlocks.hotelId))
    .where(eq(hotelUnlocks.userId, userId))
    .orderBy(desc(hotelUnlocks.unlockedAt))
    .limit(1);
  return row?.hotel ?? null;
}

export type HotelUnlock = { userId: string; username: string; unlockedAt: Date };

export async function getUnlocksForHotel(hotelId: string): Promise<HotelUnlock[]> {
  return db
    .select({
      userId: hotelUnlocks.userId,
      username: users.username,
      unlockedAt: hotelUnlocks.unlockedAt,
    })
    .from(hotelUnlocks)
    .innerJoin(users, eq(users.id, hotelUnlocks.userId))
    .where(eq(hotelUnlocks.hotelId, hotelId))
    .orderBy(desc(hotelUnlocks.unlockedAt));
}

export async function getHotelUnlockCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ hotelId: hotelUnlocks.hotelId, count: sql<number>`count(*)::int` })
    .from(hotelUnlocks)
    .groupBy(hotelUnlocks.hotelId);
  return Object.fromEntries(rows.map((row) => [row.hotelId, row.count]));
}

/* ------------------------------------------------- hotel activities/events */

export async function getHotelActivities(hotelId: string) {
  return db
    .select()
    .from(hotelActivities)
    .where(eq(hotelActivities.hotelId, hotelId))
    .orderBy(asc(hotelActivities.name));
}

export async function getActiveHotelActivities(hotelId: string) {
  return db
    .select()
    .from(hotelActivities)
    .where(and(eq(hotelActivities.hotelId, hotelId), eq(hotelActivities.active, true)))
    .orderBy(asc(hotelActivities.name));
}

export async function getHotelActivityById(id: string) {
  const [row] = await db
    .select()
    .from(hotelActivities)
    .where(eq(hotelActivities.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Every event for a hotel, each flagged with whether it has already started.
 * The clock is read here rather than in a component, where React forbids it
 * (an impure render would also make the server and client markup disagree).
 */
export async function getHotelEvents(hotelId: string) {
  const rows = await db
    .select()
    .from(hotelEvents)
    .where(eq(hotelEvents.hotelId, hotelId))
    .orderBy(asc(hotelEvents.startsAt));

  const now = Date.now();
  return rows.map((row) => ({ ...row, past: row.startsAt.getTime() < now }));
}

/** Events that haven't finished yet — what the guest actually wants to see. */
export async function getUpcomingHotelEvents(hotelId: string) {
  return db
    .select()
    .from(hotelEvents)
    .where(and(eq(hotelEvents.hotelId, hotelId), gte(hotelEvents.startsAt, new Date())))
    .orderBy(asc(hotelEvents.startsAt));
}

export async function getHotelEventById(id: string) {
  const [row] = await db.select().from(hotelEvents).where(eq(hotelEvents.id, id)).limit(1);
  return row ?? null;
}

/* ---------------------------------------------------- attractions/partners */

export async function getAllAttractions() {
  return db.select().from(attractions).orderBy(desc(attractions.createdAt));
}

export async function getAttractionById(id: string) {
  const [attraction] = await db
    .select()
    .from(attractions)
    .where(eq(attractions.id, id))
    .limit(1);
  return attraction ?? null;
}

export async function getAttractionByQrToken(qrToken: string) {
  const [row] = await db
    .select()
    .from(attractions)
    .where(eq(attractions.qrToken, qrToken))
    .limit(1);
  return row ?? null;
}

export async function getAllPartners() {
  return db.select().from(partners).orderBy(desc(partners.createdAt));
}

export async function getPartnerById(id: string) {
  const [partner] = await db
    .select()
    .from(partners)
    .where(eq(partners.id, id))
    .limit(1);
  return partner ?? null;
}

export async function getPartnerByQrToken(qrToken: string) {
  const [row] = await db
    .select()
    .from(partners)
    .where(eq(partners.qrToken, qrToken))
    .limit(1);
  return row ?? null;
}

/**
 * The partners visible for one hotel. This join IS the hotel-separation
 * guarantee — there is deliberately no "all partners" path in the guest flow.
 */
export async function getPartnersForHotel(hotelId: string) {
  const rows = await db
    .select({ partner: partners })
    .from(hotelPartners)
    .innerJoin(partners, eq(partners.id, hotelPartners.partnerId))
    .where(eq(hotelPartners.hotelId, hotelId))
    .orderBy(desc(hotelPartners.createdAt));
  return rows.map((row) => row.partner);
}

export type PartnerWithAssignment = {
  id: string;
  name: string;
  category: Category;
  photoPath: string;
  assigned: boolean;
};

export async function getPartnersWithAssignment(
  hotelId: string,
): Promise<PartnerWithAssignment[]> {
  const rows = await db
    .select({
      id: partners.id,
      name: partners.name,
      category: partners.category,
      photoPath: partners.photoPath,
      assignedHotelId: hotelPartners.hotelId,
    })
    .from(partners)
    .leftJoin(
      hotelPartners,
      and(eq(hotelPartners.partnerId, partners.id), eq(hotelPartners.hotelId, hotelId)),
    )
    .orderBy(desc(partners.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    photoPath: row.photoPath,
    assigned: row.assignedHotelId !== null,
  }));
}

/** Which hotels a partner is assigned to — shown on the partner admin page. */
export async function getHotelsForPartner(partnerId: string) {
  const rows = await db
    .select({ id: hotels.id, name: hotels.name })
    .from(hotelPartners)
    .innerJoin(hotels, eq(hotels.id, hotelPartners.hotelId))
    .where(eq(hotelPartners.partnerId, partnerId))
    .orderBy(asc(hotels.name));
  return rows;
}

/* ----------------------------------------------------------- achievements */

export type AchievementRow = {
  id: string;
  name: string;
  description: string | null;
  badgeImagePath: string | null;
  placeType: PlaceType;
  placeId: string;
  createdAt: Date;
};

export async function getAchievementForPlace(
  placeType: PlaceType,
  placeId: string,
): Promise<AchievementRow | null> {
  const [row] = await db
    .select()
    .from(achievements)
    .where(and(eq(achievements.placeType, placeType), eq(achievements.placeId, placeId)))
    .limit(1);
  return row ?? null;
}

export type AchievementWithPlace = AchievementRow & {
  placeName: string | null;
  holders: number;
};

/** Every achievement, resolved to its place's name across all three tables. */
export async function getAllAchievementsWithPlace(): Promise<AchievementWithPlace[]> {
  const [rows, names] = await Promise.all([
    db.select().from(achievements).orderBy(desc(achievements.createdAt)),
    getPlaceNameMap(),
  ]);

  const holderRows = await db
    .select({
      achievementId: userAchievements.achievementId,
      count: sql<number>`count(*)::int`,
    })
    .from(userAchievements)
    .groupBy(userAchievements.achievementId);
  const holders = new Map(holderRows.map((row) => [row.achievementId, row.count]));

  return rows.map((row) => ({
    ...row,
    placeName: names.get(placeKey(row.placeType, row.placeId)) ?? null,
    holders: holders.get(row.id) ?? 0,
  }));
}

export type CollectedAchievement = AchievementWithPlace & {
  unlockedAt: Date | null;
};

/**
 * The guest's full collection: every achievement in the system, flagged with
 * whether they hold it, so locked ones can render as silhouettes.
 */
export async function getAchievementCollection(
  userId: string,
): Promise<CollectedAchievement[]> {
  const [all, owned] = await Promise.all([
    getAllAchievementsWithPlace(),
    db
      .select({
        achievementId: userAchievements.achievementId,
        unlockedAt: userAchievements.unlockedAt,
      })
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId)),
  ]);

  const unlockedAt = new Map(owned.map((row) => [row.achievementId, row.unlockedAt]));
  return all
    .map((achievement) => ({
      ...achievement,
      unlockedAt: unlockedAt.get(achievement.id) ?? null,
    }))
    .sort((a, b) => {
      // Unlocked first, most recent at the front; locked ones trail behind.
      if (!!a.unlockedAt !== !!b.unlockedAt) return a.unlockedAt ? -1 : 1;
      if (a.unlockedAt && b.unlockedAt) return b.unlockedAt.getTime() - a.unlockedAt.getTime();
      return a.name.localeCompare(b.name);
    });
}


/* ------------------------------------------------------------- check-ins */

export type PlaceCheckInRow = {
  placeType: PlaceType;
  placeId: string;
  /** Null only when the place has since been deleted. */
  placeName: string | null;
  verificationMode: VerificationMode;
  firstCheckedInAt: Date;
  lastCheckedInAt: Date;
  checkInCount: number;
};

/**
 * `place_id` points into one of three tables, so names can't be joined in SQL.
 * One shared lookup keeps every screen that shows a check-in consistent.
 */
export async function getPlaceNameMap(): Promise<Map<string, string>> {
  const [hotelRows, attractionRows, partnerRows] = await Promise.all([
    db.select({ id: hotels.id, name: hotels.name }).from(hotels),
    db.select({ id: attractions.id, name: attractions.name }).from(attractions),
    db.select({ id: partners.id, name: partners.name }).from(partners),
  ]);

  const names = new Map<string, string>();
  for (const row of hotelRows) names.set(placeKey("hotel", row.id), row.name);
  for (const row of attractionRows) names.set(placeKey("attraction", row.id), row.name);
  for (const row of partnerRows) names.set(placeKey("partner", row.id), row.name);
  return names;
}

export async function getPlaceCheckInsForUser(userId: string): Promise<PlaceCheckInRow[]> {
  const [rows, names] = await Promise.all([
    db
      .select({
        placeType: placeCheckIns.placeType,
        placeId: placeCheckIns.placeId,
        verificationMode: placeCheckIns.verificationMode,
        firstCheckedInAt: placeCheckIns.firstCheckedInAt,
        lastCheckedInAt: placeCheckIns.lastCheckedInAt,
        checkInCount: placeCheckIns.checkInCount,
      })
      .from(placeCheckIns)
      .where(eq(placeCheckIns.userId, userId))
      .orderBy(desc(placeCheckIns.lastCheckedInAt)),
    getPlaceNameMap(),
  ]);

  return rows.map((row) => ({
    ...row,
    placeName: names.get(placeKey(row.placeType, row.placeId)) ?? null,
  }));
}

/** `"attraction:<id>"` keys for every place this guest has unlocked — drives the 3D locked/unlocked state. */
export async function getUnlockedPlaceKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ placeType: placeCheckIns.placeType, placeId: placeCheckIns.placeId })
    .from(placeCheckIns)
    .where(eq(placeCheckIns.userId, userId));

  const keys = new Set(rows.map((row) => placeKey(row.placeType, row.placeId)));

  // A hotel counts as unlocked for 3D purposes the moment its QR is scanned.
  const unlockedHotels = await db
    .select({ hotelId: hotelUnlocks.hotelId })
    .from(hotelUnlocks)
    .where(eq(hotelUnlocks.userId, userId));
  for (const row of unlockedHotels) keys.add(placeKey("hotel", row.hotelId));

  return keys;
}

export type RecentCheckIn = {
  username: string;
  placeType: PlaceType;
  placeId: string;
  placeName: string | null;
  verificationMode: VerificationMode;
  lastCheckedInAt: Date;
  checkInCount: number;
};

export async function getRecentCheckIns(limit = 50): Promise<RecentCheckIn[]> {
  const [rows, names] = await Promise.all([
    db
      .select({
        username: users.username,
        placeType: placeCheckIns.placeType,
        placeId: placeCheckIns.placeId,
        verificationMode: placeCheckIns.verificationMode,
        lastCheckedInAt: placeCheckIns.lastCheckedInAt,
        checkInCount: placeCheckIns.checkInCount,
      })
      .from(placeCheckIns)
      .innerJoin(users, eq(users.id, placeCheckIns.userId))
      .orderBy(desc(placeCheckIns.lastCheckedInAt))
      .limit(limit),
    getPlaceNameMap(),
  ]);

  return rows.map((row) => ({
    ...row,
    placeName: names.get(placeKey(row.placeType, row.placeId)) ?? null,
  }));
}

/* ------------------------------------------------------------- itinerary */

export type ItineraryStop = {
  id: string;
  stopType: "attraction" | "partner" | "hotel" | "hotel_activity";
  sourceId: string | null;
  name: string;
  category: Category | null;
  photoPath: string | null;
  modelPath: string | null;
  verificationMode: VerificationMode;
  latitude: number;
  longitude: number;
  position: number;
  visitedAt: Date | null;
};

export type ItineraryDay = {
  id: string;
  userId: string;
  hotelId: string;
  dayNumber: number;
  stopCount: number;
  routeGeoJson: unknown;
  totalDurationSeconds: number | null;
  generatedAt: Date;
  completedAt: Date | null;
  stops: ItineraryStop[];
};

export async function getLatestItineraryDay(
  userId: string,
  hotelId: string,
): Promise<ItineraryDay | null> {
  const [day] = await db
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId)))
    .orderBy(desc(itineraryDays.dayNumber))
    .limit(1);
  if (!day) return null;

  const stops = await db
    .select()
    .from(itineraryStops)
    .where(eq(itineraryStops.dayId, day.id))
    .orderBy(asc(itineraryStops.position));

  return { ...day, stops };
}

export async function getItineraryDaysForUser(userId: string, hotelId: string) {
  return db
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId)))
    .orderBy(desc(itineraryDays.dayNumber));
}

export type AdminItineraryRow = {
  dayId: string;
  username: string;
  hotelName: string;
  dayNumber: number;
  stopCount: number;
  visitedCount: number;
  generatedAt: Date;
  completedAt: Date | null;
};

export async function getRecentItineraries(limit = 50): Promise<AdminItineraryRow[]> {
  return db
    .select({
      dayId: itineraryDays.id,
      username: users.username,
      hotelName: hotels.name,
      dayNumber: itineraryDays.dayNumber,
      stopCount: itineraryDays.stopCount,
      visitedCount: sql<number>`(select count(*)::int from ${itineraryStops} where ${itineraryStops.dayId} = ${itineraryDays.id} and ${itineraryStops.visitedAt} is not null)`,
      generatedAt: itineraryDays.generatedAt,
      completedAt: itineraryDays.completedAt,
    })
    .from(itineraryDays)
    .innerJoin(users, eq(users.id, itineraryDays.userId))
    .innerJoin(hotels, eq(hotels.id, itineraryDays.hotelId))
    .orderBy(desc(itineraryDays.generatedAt))
    .limit(limit);
}

/** Maps a source place id to the most recent day-number it was used in. */
export async function getStopUsageHistory(
  userId: string,
  hotelId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      sourceId: itineraryStops.sourceId,
      lastDayNumber: sql<number>`max(${itineraryDays.dayNumber})::int`,
    })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId)))
    .groupBy(itineraryStops.sourceId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.sourceId) map.set(row.sourceId, row.lastDayNumber);
  }
  return map;
}

export type ItineraryStopWithDay = ItineraryStop & {
  dayId: string;
  userId: string;
  hotelId: string;
};

export async function getItineraryStopWithDay(
  stopId: string,
): Promise<ItineraryStopWithDay | null> {
  const [row] = await db
    .select({
      id: itineraryStops.id,
      stopType: itineraryStops.stopType,
      sourceId: itineraryStops.sourceId,
      name: itineraryStops.name,
      category: itineraryStops.category,
      photoPath: itineraryStops.photoPath,
      modelPath: itineraryStops.modelPath,
      verificationMode: itineraryStops.verificationMode,
      latitude: itineraryStops.latitude,
      longitude: itineraryStops.longitude,
      position: itineraryStops.position,
      visitedAt: itineraryStops.visitedAt,
      dayId: itineraryDays.id,
      userId: itineraryDays.userId,
      hotelId: itineraryDays.hotelId,
    })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(eq(itineraryStops.id, stopId))
    .limit(1);
  return row ?? null;
}


export async function getUserPreferences(userId: string): Promise<Category[]> {
  const rows = await db
    .select({ category: userCategoryPreferences.category })
    .from(userCategoryPreferences)
    .where(eq(userCategoryPreferences.userId, userId));
  return rows.map((row) => row.category);
}
