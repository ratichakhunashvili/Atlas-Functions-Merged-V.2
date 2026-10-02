"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { itineraryDays, itineraryStops } from "@/db/schema";
import {
  getActiveHotelActivities,
  getAllAttractions,
  getHotelById,
  getLatestItineraryDay,
  getPartnersForHotel,
  getStopUsageHistory,
  getUserPreferences,
  isHotelUnlockedForUser,
} from "@/db/queries";
import { getOptimizedWalkingOrder } from "@/lib/route-engine";
import { haversineMeters } from "@/lib/geo";
import { testToolsEnabled } from "@/lib/dev-tools";
import { MAX_CANDIDATE_DISTANCE_METERS, type VerificationMode } from "@/lib/place";
import type { Category } from "@/lib/partner-category";

const MIN_STOPS = 4;
const MAX_STOPS = 8;
/** A day counts as "easy" if it's finished in under half the estimated walking time. */
const EASY_COMPLETION_RATIO = 0.5;
/** Guests get one generated plan per real day; bypassed for admins and in local testing. */
const GENERATION_COOLDOWN_HOURS = 24;

type PlannedStop = {
  stopType: "attraction" | "partner" | "hotel" | "hotel_activity";
  sourceId: string | null;
  name: string;
  category: Category | null;
  photoPath: string | null;
  modelPath: string | null;
  verificationMode: VerificationMode;
  latitude: number;
  longitude: number;
};

/** External (walkable) candidates only — hotel activities are handled separately. */
type Candidate = PlannedStop & { stopType: "attraction" | "partner"; sourceId: string };

export type GenerateDayResult =
  | { ok: true; dayId: string; warning?: string }
  | { ok: false; error: string };

export async function generateNextDay(hotelId: string): Promise<GenerateDayResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in." };

  const hotel = await getHotelById(hotelId);
  if (!hotel) return { ok: false, error: "Hotel not found." };
  if (hotel.latitude == null || hotel.longitude == null) {
    return { ok: false, error: "This hotel has no location set yet — ask an admin to place it on the map." };
  }

  const isAdmin = session.user.role === "admin";
  const unlocked = isAdmin || (await isHotelUnlockedForUser(session.user.id, hotelId));
  if (!unlocked) return { ok: false, error: "Unlock this hotel first." };

  const [attractions, partners, activities, previousDay, usage, preferencesList] =
    await Promise.all([
      getAllAttractions(),
      getPartnersForHotel(hotelId),
      getActiveHotelActivities(hotelId),
      getLatestItineraryDay(session.user.id, hotelId),
      getStopUsageHistory(session.user.id, hotelId),
      getUserPreferences(session.user.id),
    ]);

  const preferences = new Set(preferencesList);
  // Admins testing without preferences get the unfiltered pool; everyone else
  // must pick at least one interest first.
  const filterByPreference = !(isAdmin && preferences.size === 0);
  if (filterByPreference && preferences.size === 0) {
    return {
      ok: false,
      error: "Pick your interests in your profile before generating a plan.",
    };
  }

  const canBypassCooldown = isAdmin || testToolsEnabled();
  if (previousDay && !canBypassCooldown) {
    const hoursSince = (Date.now() - previousDay.generatedAt.getTime()) / 3600000;
    if (hoursSince < GENERATION_COOLDOWN_HOURS) {
      const hoursLeft = Math.ceil(GENERATION_COOLDOWN_HOURS - hoursSince);
      return {
        ok: false,
        error: `You can only generate one plan per day. Try again in about ${hoursLeft}h.`,
      };
    }
  }

  const hotelLat = hotel.latitude;
  const hotelLng = hotel.longitude;
  const withinWalkingDistance = (lat: number, lng: number) =>
    haversineMeters(hotelLat, hotelLng, lat, lng) <= MAX_CANDIDATE_DISTANCE_METERS;
  const matchesPreferences = (category: Category) =>
    !filterByPreference || preferences.has(category);

  const attractionCandidates: Candidate[] = attractions
    .filter(
      (a) =>
        a.latitude != null &&
        a.longitude != null &&
        withinWalkingDistance(a.latitude, a.longitude) &&
        matchesPreferences(a.category),
    )
    .map((a) => ({
      stopType: "attraction",
      sourceId: a.id,
      name: a.name,
      category: a.category,
      photoPath: a.photoPath,
      modelPath: a.model3dEnabled ? a.modelPath : null,
      verificationMode: a.verificationMode,
      latitude: a.latitude!,
      longitude: a.longitude!,
    }));

  const partnerCandidates: Candidate[] = partners
    .filter(
      (p) =>
        p.latitude != null &&
        p.longitude != null &&
        withinWalkingDistance(p.latitude, p.longitude) &&
        matchesPreferences(p.category),
    )
    .map((p) => ({
      stopType: "partner",
      sourceId: p.id,
      name: p.name,
      category: p.category,
      photoPath: p.photoPath,
      modelPath: p.model3dEnabled ? p.modelPath : null,
      verificationMode: p.verificationMode,
      latitude: p.latitude!,
      longitude: p.longitude!,
    }));

  if (attractionCandidates.length === 0 && partnerCandidates.length === 0) {
    return {
      ok: false,
      error: "No attractions or partners match your interests within walking distance yet.",
    };
  }

  // --- how many stops today -------------------------------------------------
  let stopCount = MIN_STOPS;
  if (previousDay) {
    stopCount = Math.max(MIN_STOPS, previousDay.stopCount);
    const allVisited = previousDay.stops.every((s) => s.visitedAt !== null);
    if (allVisited && previousDay.completedAt && previousDay.totalDurationSeconds) {
      const actualSeconds =
        (previousDay.completedAt.getTime() - previousDay.generatedAt.getTime()) / 1000;
      if (actualSeconds < previousDay.totalDurationSeconds * EASY_COMPLETION_RATIO) {
        stopCount = previousDay.stopCount + 1;
      }
    }
  }
  stopCount = Math.min(MAX_STOPS, Math.max(MIN_STOPS, stopCount));

  // --- the guaranteed hotel activity ---------------------------------------
  const dayNumber = (previousDay?.dayNumber ?? 0) + 1;
  const hotelActivityStop = pickHotelActivity(activities, dayNumber, hotel, usage);
  const externalSlots = Math.max(1, stopCount - 1);

  // --- pick the external stops ---------------------------------------------
  const freshness = (sourceId: string) => usage.get(sourceId) ?? -1;
  const squaredDistance = (lat: number, lng: number) => {
    const dLat = lat - hotelLat;
    const dLng = lng - hotelLng;
    return dLat * dLat + dLng * dLng;
  };
  // Least-recently-used first, then nearest — so fresh places win, and the day
  // stays compact when freshness ties.
  const rank = (a: Candidate, b: Candidate) => {
    const diff = freshness(a.sourceId) - freshness(b.sourceId);
    if (diff !== 0) return diff;
    return squaredDistance(a.latitude, a.longitude) - squaredDistance(b.latitude, b.longitude);
  };

  const chosen: Candidate[] = [];
  const chosenIds = new Set<string>();
  let warning: string | undefined;

  // Partner guarantee: one assigned partner leads the pick when any exist.
  if (partnerCandidates.length > 0) {
    const bestPartner = [...partnerCandidates].sort(rank)[0];
    chosen.push(bestPartner);
    chosenIds.add(bestPartner.sourceId);
  } else if (!hotelActivityStop) {
    warning = "No partner is assigned to this hotel yet, so today is attractions only.";
  }

  const pool = [...attractionCandidates, ...partnerCandidates]
    .filter((candidate) => !chosenIds.has(candidate.sourceId))
    .sort(rank);

  for (const candidate of pool) {
    if (chosen.length >= externalSlots) break;
    chosen.push(candidate);
    chosenIds.add(candidate.sourceId);
  }

  // Pool smaller than the day needs: reuse rather than fail (spec: never hard-fail
  // generation just because not enough unique places exist).
  const uniquePool = [...chosen];
  let reuseIndex = 0;
  while (chosen.length < externalSlots && uniquePool.length > 0) {
    chosen.push(uniquePool[reuseIndex % uniquePool.length]);
    reuseIndex += 1;
  }

  // --- order the walk ------------------------------------------------------
  const points = [
    { lat: hotelLat, lng: hotelLng },
    ...chosen.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
  ];
  const optimized = await getOptimizedWalkingOrder(points);
  const orderedExternal =
    optimized.optimized && optimized.order.length === points.length
      ? optimized.order.filter((index) => index !== 0).map((index) => chosen[index - 1])
      : chosen;

  /**
   * Hotel-activity placement. The spec requires it to be the FIRST or the LAST
   * stop, never mid-route. Parity on the day number alternates the two so a
   * repeat guest doesn't always get the same shape of day — odd days open at
   * the hotel, even days close there.
   */
  const activityFirst = dayNumber % 2 === 1;
  const orderedStops: PlannedStop[] = hotelActivityStop
    ? activityFirst
      ? [hotelActivityStop, ...orderedExternal]
      : [...orderedExternal, hotelActivityStop]
    : orderedExternal;

  if (!hotelActivityStop) {
    warning =
      "This hotel has no activities set up yet, so today's plan is all outside the hotel.";
  }

  const [newDay] = await db
    .insert(itineraryDays)
    .values({
      userId: session.user.id,
      hotelId,
      dayNumber,
      stopCount: orderedStops.length,
      routeGeoJson: optimized.geometry,
      totalDurationSeconds: optimized.durationSeconds,
    })
    .returning();

  await db.insert(itineraryStops).values(
    orderedStops.map((stop, index) => ({
      dayId: newDay.id,
      stopType: stop.stopType,
      sourceId: stop.sourceId,
      name: stop.name,
      category: stop.category,
      photoPath: stop.photoPath,
      modelPath: stop.modelPath,
      verificationMode: stop.verificationMode,
      latitude: stop.latitude,
      longitude: stop.longitude,
      position: index,
      visitedAt: null,
    })),
  );

  revalidatePath(`/hotels/${hotelId}`);
  return { ok: true, dayId: newDay.id, warning };
}

type HotelRow = { id: string; name: string; photoPath: string; latitude: number | null; longitude: number | null };
type ActivityRow = {
  id: string;
  name: string;
  photoPath: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Chooses today's in-hotel activity, preferring one the guest hasn't done
 * recently. Returns null only when the hotel genuinely has none configured.
 */
function pickHotelActivity(
  activities: ActivityRow[],
  dayNumber: number,
  hotel: HotelRow,
  usage: Map<string, number>,
): PlannedStop | null {
  if (activities.length === 0) return null;

  const sorted = [...activities].sort((a, b) => {
    const diff = (usage.get(a.id) ?? -1) - (usage.get(b.id) ?? -1);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  const activity = sorted[(dayNumber - 1) % sorted.length] ?? sorted[0];

  return {
    stopType: "hotel_activity",
    sourceId: activity.id,
    name: activity.name,
    category: null,
    photoPath: activity.photoPath ?? hotel.photoPath,
    modelPath: null,
    // In-hotel activities are confirmed by being at the hotel.
    verificationMode: "gps",
    latitude: activity.latitude ?? hotel.latitude ?? 0,
    longitude: activity.longitude ?? hotel.longitude ?? 0,
  };
}

/** Admin-only: clears a guest's generated itinerary for a hotel so they start over from Day 1. */
export async function revokeItinerary(userId: string, hotelId: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    throw new Error("Forbidden: admin access required.");
  }

  await db
    .delete(itineraryDays)
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId)));

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath(`/hotels/${hotelId}`);
}
