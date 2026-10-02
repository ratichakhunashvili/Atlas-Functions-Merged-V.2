import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { itineraryDays, itineraryStops, placeCheckIns } from "@/db/schema";
import type { UnlockedAchievement } from "@/lib/achievements";
import { haversineMeters } from "@/lib/geo";
import { extractQrToken } from "@/lib/qr-token";
import { hashesMatch, isValidHash } from "@/lib/ar-hash";
import {
  CHECKIN_RADIUS_METERS,
  type PlaceType,
  type VerificationMode,
} from "@/lib/place";

/**
 * What the guest gets back from a successful verification. One scan produces
 * all of it — stop completion, place unlock, achievement, 3D reveal and the
 * pointer to the next stop — so no screen has to chain extra actions.
 */
export type CheckInSuccess = {
  ok: true;
  placeName: string;
  /** False when this place was already checked in — suppresses a repeat celebration. */
  newlyVisited: boolean;
  achievement: UnlockedAchievement | null;
  achievementNewlyUnlocked: boolean;
  /** True when this completed the final stop of the day. */
  dayCompleted: boolean;
  nextStop: { id: string; name: string } | null;
};

export type CheckInFailure = { ok: false; error: string };
export type CheckInOutcome = CheckInSuccess | CheckInFailure;

export type VerificationInput =
  | { mode: "gps"; latitude: number; longitude: number }
  | { mode: "qr"; scannedText: string }
  | {
      mode: "ar";
      /** Perceptual hash of the guest's camera frame (see `lib/ar-hash`). */
      frameHash: string;
      /** AR also requires being at the place, so a photo of a photo isn't enough. */
      latitude: number;
      longitude: number;
    };

/**
 * A verification provider turns raw evidence into a yes/no. Each mode is
 * isolated here rather than inlined into the itinerary code, so a real AR
 * implementation can replace `verifyAr` without touching check-in flow.
 */
export type VerificationTarget = {
  name: string;
  latitude: number;
  longitude: number;
  /** The place's secret token — never sent to the client for comparison there. */
  qrToken: string | null;
  /** Reference hash for AR mode — likewise server-side only. */
  arTargetHash: string | null;
};

export type VerificationResult = { ok: true } | { ok: false; error: string };

function verifyGps(
  target: VerificationTarget,
  latitude: number,
  longitude: number,
): VerificationResult {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: "We couldn't read your location. Try again." };
  }
  const meters = haversineMeters(latitude, longitude, target.latitude, target.longitude);
  if (meters > CHECKIN_RADIUS_METERS) {
    return {
      ok: false,
      error: `You're about ${Math.round(meters)}m away — get within ${CHECKIN_RADIUS_METERS}m of ${target.name} to check in.`,
    };
  }
  return { ok: true };
}

function verifyToken(target: VerificationTarget, scanned: string, label: string): VerificationResult {
  if (!target.qrToken) {
    return { ok: false, error: `${target.name} has no ${label} configured yet.` };
  }
  if (extractQrToken(scanned) !== target.qrToken) {
    return { ok: false, error: `That ${label} doesn't match this stop.` };
  }
  return { ok: true };
}

/**
 * AR verification. The browser reduces the camera frame to a perceptual hash
 * and sends only that; the comparison against the place's reference hash runs
 * here, on the server, so the client is never told what a match looks like and
 * cannot assert one.
 *
 * Two conditions must hold: the frame must look like the landmark, AND the
 * guest must be standing near it — which is what stops someone checking in by
 * photographing a postcard.
 */
function verifyAr(
  target: VerificationTarget,
  frameHash: string,
  latitude: number,
  longitude: number,
): VerificationResult {
  if (!target.arTargetHash) {
    return {
      ok: false,
      error: `${target.name} has no AR reference image set up yet — ask an admin to add one.`,
    };
  }
  if (!isValidHash(frameHash)) {
    return { ok: false, error: "That camera frame couldn't be read. Try again." };
  }

  const proximity = verifyGps(target, latitude, longitude);
  if (!proximity.ok) return proximity;

  if (!hashesMatch(target.arTargetHash, frameHash)) {
    return {
      ok: false,
      error: `That doesn't look like ${target.name} yet — line the landmark up in the frame and hold steady.`,
    };
  }
  return { ok: true };
}

export function verifyArrival(
  target: VerificationTarget,
  input: VerificationInput,
): VerificationResult {
  switch (input.mode) {
    case "gps":
      return verifyGps(target, input.latitude, input.longitude);
    case "qr":
      return verifyToken(target, input.scannedText, "QR code");
    case "ar":
      return verifyAr(target, input.frameHash, input.latitude, input.longitude);
  }
}

/**
 * Records that a guest has been to a place. Upsert rather than insert: a repeat
 * visit bumps the counter and timestamp but never creates a second row, which
 * is what keeps the place (and its 3D model) unlocked exactly once.
 */
export async function recordPlaceCheckIn(
  userId: string,
  placeType: PlaceType,
  placeId: string,
  verificationMode: VerificationMode,
): Promise<{ firstTime: boolean }> {
  const inserted = await db
    .insert(placeCheckIns)
    .values({ userId, placeType, placeId, verificationMode })
    .onConflictDoUpdate({
      target: [placeCheckIns.userId, placeCheckIns.placeType, placeCheckIns.placeId],
      set: {
        lastCheckedInAt: new Date(),
        checkInCount: sql`${placeCheckIns.checkInCount} + 1`,
      },
    })
    .returning({ count: placeCheckIns.checkInCount });

  return { firstTime: (inserted[0]?.count ?? 1) === 1 };
}

/** Marks a stop visited and closes the day when nothing is left unvisited. */
export async function markStopVisited(
  stopId: string,
  dayId: string,
): Promise<{ dayCompleted: boolean; nextStop: { id: string; name: string } | null }> {
  await db
    .update(itineraryStops)
    .set({ visitedAt: new Date() })
    .where(and(eq(itineraryStops.id, stopId), isNull(itineraryStops.visitedAt)));

  const remaining = await db
    .select({ id: itineraryStops.id, name: itineraryStops.name })
    .from(itineraryStops)
    .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.visitedAt)))
    .orderBy(itineraryStops.position)
    .limit(1);

  if (remaining.length === 0) {
    await db
      .update(itineraryDays)
      .set({ completedAt: new Date() })
      .where(and(eq(itineraryDays.id, dayId), isNull(itineraryDays.completedAt)));
    return { dayCompleted: true, nextStop: null };
  }

  return { dayCompleted: false, nextStop: remaining[0] };
}
