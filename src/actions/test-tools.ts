"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  hotelUnlocks,
  itineraryDays,
  itineraryStops,
  placeCheckIns,
  userAchievements,
} from "@/db/schema";
import {
  getHotelById,
  getLatestItineraryDay,
  isHotelUnlockedForUser,
} from "@/db/queries";
import { grantAchievementForPlace } from "@/lib/achievements";
import { markStopVisited, recordPlaceCheckIn } from "@/lib/check-in";
import {
  getTestToolsSession,
  TEST_TOOLS_DISABLED,
  type TestToolResult,
} from "@/lib/dev-tools";
import { generateNextDay } from "@/actions/itinerary";

/**
 * Local-development testing shortcuts.
 *
 * Every action in this file re-checks `getTestToolsSession()`, which requires
 * BOTH a non-production build AND `ENABLE_TEST_TOOLS=true`. There is no code
 * path here that works in a production build, so none of this can be reached
 * by a deployed guest even if the UI were to render the buttons.
 */

/** Unlocks a hotel without scanning its physical QR code. */
export async function forceUnlockHotel(hotelId: string): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const hotel = await getHotelById(hotelId);
  if (!hotel) return { ok: false, error: "Hotel not found." };

  const alreadyUnlocked = await isHotelUnlockedForUser(session.userId, hotelId);
  await db
    .insert(hotelUnlocks)
    .values({ userId: session.userId, hotelId })
    .onConflictDoNothing();
  await recordPlaceCheckIn(session.userId, "hotel", hotelId, "qr");
  await grantAchievementForPlace(session.userId, "hotel", hotelId);

  revalidatePath("/gallery");
  revalidatePath("/profile");
  revalidatePath(`/hotels/${hotelId}`);

  return {
    ok: true,
    message: alreadyUnlocked
      ? `${hotel.name} was already unlocked.`
      : `Unlocked ${hotel.name}.`,
  };
}

/** Marks the guest's current stop visited, granting its achievement as a real check-in would. */
export async function markCurrentStopVisited(hotelId: string): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const day = await getLatestItineraryDay(session.userId, hotelId);
  if (!day) return { ok: false, error: "No day plan to advance." };

  const current = day.stops.find((stop) => stop.visitedAt === null);
  if (!current) return { ok: false, error: "Every stop is already visited." };

  const placeType =
    current.stopType === "attraction"
      ? "attraction"
      : current.stopType === "partner"
        ? "partner"
        : "hotel";
  const placeId = placeType === "hotel" ? hotelId : current.sourceId;

  if (placeId) {
    await recordPlaceCheckIn(session.userId, placeType, placeId, current.verificationMode);
    await grantAchievementForPlace(session.userId, placeType, placeId);
  }
  const { dayCompleted } = await markStopVisited(current.id, day.id);

  revalidatePath(`/hotels/${hotelId}`);
  revalidatePath("/profile");

  return {
    ok: true,
    message: dayCompleted
      ? `Checked in at ${current.name} — day complete.`
      : `Checked in at ${current.name}.`,
  };
}

/** Deletes today's plan and immediately generates a fresh one. */
export async function regenerateItinerary(hotelId: string): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const day = await getLatestItineraryDay(session.userId, hotelId);
  if (day) {
    await db.delete(itineraryDays).where(eq(itineraryDays.id, day.id));
  }

  const result = await generateNextDay(hotelId);
  revalidatePath(`/hotels/${hotelId}`);

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: result.warning ?? "Generated a fresh day plan." };
}

/** Grants every achievement in the system — used to check the profile collection. */
export async function unlockAllAchievements(): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const all = await db.select({ id: achievements.id }).from(achievements);
  if (all.length === 0) return { ok: false, error: "No achievements exist yet." };

  await db
    .insert(userAchievements)
    .values(all.map((row) => ({ userId: session.userId, achievementId: row.id })))
    .onConflictDoNothing();

  revalidatePath("/profile");
  return { ok: true, message: `Granted ${all.length} achievements.` };
}

/** Grants exactly one achievement, to test a single unlock. */
export async function unlockAchievementById(achievementId: string): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const inserted = await db
    .insert(userAchievements)
    .values({ userId: session.userId, achievementId })
    .onConflictDoNothing()
    .returning();

  revalidatePath("/profile");
  return {
    ok: true,
    message: inserted.length > 0 ? "Achievement unlocked." : "Already held.",
  };
}

/**
 * Wipes the caller's guest progress: itineraries, check-ins, achievements and
 * hotel unlocks. Scoped to the caller only — it can never touch another user.
 */
export async function resetMyProgress(): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  await db.delete(itineraryDays).where(eq(itineraryDays.userId, session.userId));
  await db.delete(placeCheckIns).where(eq(placeCheckIns.userId, session.userId));
  await db.delete(userAchievements).where(eq(userAchievements.userId, session.userId));
  await db.delete(hotelUnlocks).where(eq(hotelUnlocks.userId, session.userId));

  revalidatePath("/gallery");
  revalidatePath("/profile");
  return { ok: true, message: "Guest progress reset." };
}

/** Un-visits the most recently completed stop, to re-run a check-in. */
export async function undoLastCheckIn(hotelId: string): Promise<TestToolResult> {
  const session = await getTestToolsSession();
  if (!session) return TEST_TOOLS_DISABLED;

  const day = await getLatestItineraryDay(session.userId, hotelId);
  if (!day) return { ok: false, error: "No day plan." };

  const visited = day.stops.filter((stop) => stop.visitedAt !== null);
  const last = visited[visited.length - 1];
  if (!last) return { ok: false, error: "Nothing has been checked in yet." };

  await db
    .update(itineraryStops)
    .set({ visitedAt: null })
    .where(eq(itineraryStops.id, last.id));
  await db
    .update(itineraryDays)
    .set({ completedAt: null })
    .where(eq(itineraryDays.id, day.id));

  if (last.sourceId) {
    const placeType = last.stopType === "partner" ? "partner" : "attraction";
    await db
      .delete(placeCheckIns)
      .where(
        and(
          eq(placeCheckIns.userId, session.userId),
          eq(placeCheckIns.placeType, placeType),
          eq(placeCheckIns.placeId, last.sourceId),
        ),
      );
  }

  revalidatePath(`/hotels/${hotelId}`);
  return { ok: true, message: `Reset the check-in at ${last.name}.` };
}
