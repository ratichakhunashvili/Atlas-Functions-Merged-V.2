import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import type { PlaceType } from "@/lib/place";

export type UnlockedAchievement = {
  id: string;
  name: string;
  description: string | null;
  badgeImagePath: string | null;
};

export type AchievementUnlockOutcome = {
  /** Null when the place simply has no achievement configured — not an error. */
  achievement: UnlockedAchievement | null;
  /** False when the guest already held it, so the celebration is not shown twice. */
  newlyUnlocked: boolean;
};

/**
 * Grants the achievement belonging to a place, if it has one.
 *
 * Idempotent in both senses that matter: `onConflictDoNothing` against the
 * (userId, achievementId) primary key means a repeat scan writes nothing, and
 * the returned `newlyUnlocked` flag is false, so the UI stays silent instead of
 * celebrating the same badge again.
 */
export async function grantAchievementForPlace(
  userId: string,
  placeType: PlaceType,
  placeId: string,
): Promise<AchievementUnlockOutcome> {
  const [achievement] = await db
    .select()
    .from(achievements)
    .where(and(eq(achievements.placeType, placeType), eq(achievements.placeId, placeId)))
    .limit(1);

  if (!achievement) return { achievement: null, newlyUnlocked: false };

  const inserted = await db
    .insert(userAchievements)
    .values({ userId, achievementId: achievement.id })
    .onConflictDoNothing()
    .returning();

  return {
    achievement: {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      badgeImagePath: achievement.badgeImagePath,
    },
    newlyUnlocked: inserted.length > 0,
  };
}

/**
 * `achievements.placeId` intentionally has no foreign key (it points into one
 * of three tables), so deleting a place must clean up after itself here.
 */
export async function deleteAchievementsForPlace(
  placeType: PlaceType,
  placeId: string,
): Promise<void> {
  await db
    .delete(achievements)
    .where(and(eq(achievements.placeType, placeType), eq(achievements.placeId, placeId)));
}
