"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getAttractionById,
  getHotelById,
  getItineraryStopWithDay,
  getPartnerById,
} from "@/db/queries";
import {
  markStopVisited,
  recordPlaceCheckIn,
  verifyArrival,
  type CheckInOutcome,
  type VerificationInput,
  type VerificationTarget,
} from "@/lib/check-in";
import { grantAchievementForPlace } from "@/lib/achievements";
import type { PlaceType } from "@/lib/place";

export type { CheckInOutcome, VerificationInput };

type ResolvedPlace = {
  placeType: PlaceType;
  placeId: string;
  target: VerificationTarget;
};

/**
 * Resolves an itinerary stop to the real place behind it. Everything is read
 * from the database by the stop's own `sourceId` — the client never gets to
 * say which place it is checking into.
 */
async function resolveStopPlace(stop: {
  stopType: string;
  sourceId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  hotelId: string;
}): Promise<ResolvedPlace | null> {
  if (stop.stopType === "attraction" && stop.sourceId) {
    const attraction = await getAttractionById(stop.sourceId);
    if (!attraction) return null;
    return {
      placeType: "attraction",
      placeId: attraction.id,
      target: {
        name: attraction.name,
        latitude: attraction.latitude ?? stop.latitude,
        longitude: attraction.longitude ?? stop.longitude,
        qrToken: attraction.qrToken,
        arTargetHash: attraction.arTargetHash,
      },
    };
  }

  if (stop.stopType === "partner" && stop.sourceId) {
    const partner = await getPartnerById(stop.sourceId);
    if (!partner) return null;
    return {
      placeType: "partner",
      placeId: partner.id,
      target: {
        name: partner.name,
        latitude: partner.latitude ?? stop.latitude,
        longitude: partner.longitude ?? stop.longitude,
        qrToken: partner.qrToken,
        arTargetHash: partner.arTargetHash,
      },
    };
  }

  // Hotel stops and in-hotel activities both resolve to the hotel itself.
  const hotel = await getHotelById(stop.hotelId);
  if (!hotel) return null;
  return {
    placeType: "hotel",
    placeId: hotel.id,
    target: {
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      qrToken: hotel.qrToken,
      arTargetHash: null,
    },
  };
}

/**
 * THE check-in. Verification mode is whatever the stop was created with, so a
 * client cannot downgrade a QR-protected stop to a GPS check-in by asking
 * nicely. One call completes the stop, unlocks the place, grants the
 * achievement and reports the next stop.
 */
export async function checkInStop(
  stopId: string,
  input: VerificationInput,
): Promise<CheckInOutcome> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in." };

  const stop = await getItineraryStopWithDay(stopId);
  if (!stop || stop.userId !== session.user.id) {
    return { ok: false, error: "Stop not found." };
  }

  if (input.mode !== stop.verificationMode) {
    return {
      ok: false,
      error: `This stop is verified by ${stop.verificationMode.toUpperCase()}, not ${input.mode.toUpperCase()}.`,
    };
  }

  const place = await resolveStopPlace(stop);
  if (!place) return { ok: false, error: "That place no longer exists." };

  // Already done: return success without re-granting anything, so a double tap
  // or a re-scan is harmless and silent.
  if (stop.visitedAt) {
    return {
      ok: true,
      placeName: stop.name,
      newlyVisited: false,
      achievement: null,
      achievementNewlyUnlocked: false,
      dayCompleted: false,
      nextStop: null,
    };
  }

  const verification = verifyArrival(place.target, input);
  if (!verification.ok) return { ok: false, error: verification.error };

  await recordPlaceCheckIn(
    session.user.id,
    place.placeType,
    place.placeId,
    stop.verificationMode,
  );
  const { dayCompleted, nextStop } = await markStopVisited(stop.id, stop.dayId);
  const unlock = await grantAchievementForPlace(
    session.user.id,
    place.placeType,
    place.placeId,
  );

  revalidatePath(`/hotels/${stop.hotelId}`);
  revalidatePath("/profile");

  return {
    ok: true,
    placeName: stop.name,
    newlyVisited: true,
    achievement: unlock.achievement,
    achievementNewlyUnlocked: unlock.newlyUnlocked,
    dayCompleted,
    nextStop,
  };
}

