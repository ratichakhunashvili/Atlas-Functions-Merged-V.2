"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { hotelUnlocks } from "@/db/schema";
import { getHotelByQrToken } from "@/db/queries";
import { extractQrToken } from "@/lib/qr-token";
import { grantAchievementForPlace, type UnlockedAchievement } from "@/lib/achievements";
import { recordPlaceCheckIn } from "@/lib/check-in";

export type UnlockResult =
  | {
      ok: true;
      alreadyUnlocked: boolean;
      hotel: { id: string; name: string };
      achievement: UnlockedAchievement | null;
      achievementNewlyUnlocked: boolean;
    }
  | { ok: false; error: string };

/**
 * The hotel QR flow. The scanned token — never a hotel name or a row id — is
 * what identifies the hotel, and it is resolved server-side, so the guest
 * never picks their hotel from a list.
 *
 * Idempotent: `onConflictDoNothing` on the (userId, hotelId) primary key means
 * re-scanning the same code just re-enters the hotel.
 */
export async function unlockByToken(rawToken: string): Promise<UnlockResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You must be logged in to unlock a hotel." };
  }

  const qrToken = extractQrToken(rawToken);
  const hotel = await getHotelByQrToken(qrToken);
  if (!hotel) {
    return { ok: false, error: "That QR code doesn't match any hotel." };
  }

  const inserted = await db
    .insert(hotelUnlocks)
    .values({ userId: session.user.id, hotelId: hotel.id })
    .onConflictDoNothing()
    .returning();
  const alreadyUnlocked = inserted.length === 0;

  await recordPlaceCheckIn(session.user.id, "hotel", hotel.id, "qr");
  const unlock = await grantAchievementForPlace(session.user.id, "hotel", hotel.id);

  revalidatePath("/gallery");
  revalidatePath("/profile");
  revalidatePath(`/hotels/${hotel.id}`);

  return {
    ok: true,
    alreadyUnlocked,
    hotel: { id: hotel.id, name: hotel.name },
    achievement: unlock.achievement,
    achievementNewlyUnlocked: unlock.newlyUnlocked,
  };
}
