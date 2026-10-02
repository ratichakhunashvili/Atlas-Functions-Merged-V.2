"use server";

import { auth } from "@/auth";
import {
  getAttractionByQrToken,
  getHotelByQrToken,
  getLatestItineraryDay,
  getPartnerByQrToken,
  getUnlockedHotelsForUser,
} from "@/db/queries";
import { extractQrToken } from "@/lib/qr-token";
import { unlockByToken } from "@/actions/unlock";
import { checkInStop } from "@/actions/check-in";

export type ScanOutcome =
  | { kind: "hotel"; hotelId: string; message: string }
  | { kind: "place"; hotelId: string | null; message: string; ok: boolean }
  | { kind: "unknown"; message: string };

/**
 * Resolves ANY scanned token — hotel, attraction or partner — server-side, and
 * performs the right action for it. This is what lets a guest point their
 * phone's camera at a code from outside the app and still get the full result:
 * the hotel unlocks, or the current stop is checked in and its achievement
 * granted, without choosing anything from a menu first.
 */
export async function resolveScan(rawToken: string): Promise<ScanOutcome> {
  const session = await auth();
  if (!session?.user) {
    return { kind: "unknown", message: "You must be logged in to scan." };
  }

  const token = extractQrToken(rawToken);

  const hotel = await getHotelByQrToken(token);
  if (hotel) {
    const result = await unlockByToken(token);
    if (!result.ok) return { kind: "unknown", message: result.error };
    return {
      kind: "hotel",
      hotelId: result.hotel.id,
      message: result.alreadyUnlocked
        ? `Welcome back to ${result.hotel.name}.`
        : `${result.hotel.name} unlocked.`,
    };
  }

  const [attraction, partner] = await Promise.all([
    getAttractionByQrToken(token),
    getPartnerByQrToken(token),
  ]);
  const place = attraction ?? partner;
  if (!place) {
    return { kind: "unknown", message: "That code doesn't match anything in the app." };
  }

  // Look across every hotel the guest has unlocked, not just the most recent
  // one: a guest can hold plans at more than one hotel during a stay, and a
  // scanned code should work wherever that place is actually on a plan.
  const unlockedHotels = await getUnlockedHotelsForUser(session.user.id);
  if (unlockedHotels.length === 0) {
    return {
      kind: "place",
      hotelId: null,
      ok: false,
      message: `Scan your hotel's QR code first, then check in at ${place.name}.`,
    };
  }

  const days = await Promise.all(
    unlockedHotels.map(async (hotel) => ({
      hotel,
      day: await getLatestItineraryDay(session.user.id, hotel.id),
    })),
  );

  const pending = days.find(({ day }) =>
    day?.stops.some((stop) => stop.sourceId === place.id && stop.visitedAt === null),
  );

  if (pending?.day) {
    const stop = pending.day.stops.find(
      (candidate) => candidate.sourceId === place.id && candidate.visitedAt === null,
    )!;
    const outcome = await checkInStop(stop.id, { mode: "qr", scannedText: token });
    return {
      kind: "place",
      hotelId: pending.hotel.id,
      ok: outcome.ok,
      message: outcome.ok
        ? outcome.newlyVisited
          ? `Checked in at ${outcome.placeName}.`
          : `You've already checked in at ${outcome.placeName}.`
        : outcome.error,
    };
  }

  const visited = days.find(({ day }) =>
    day?.stops.some((stop) => stop.sourceId === place.id && stop.visitedAt !== null),
  );
  const fallbackHotel = visited?.hotel ?? unlockedHotels[0];

  return {
    kind: "place",
    hotelId: fallbackHotel.id,
    ok: Boolean(visited),
    message: visited
      ? `You've already checked in at ${place.name}.`
      : `${place.name} isn't on today's plan yet.`,
  };
}
