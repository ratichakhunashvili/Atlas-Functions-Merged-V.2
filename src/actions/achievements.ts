"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { achievements } from "@/db/schema";
import { getAchievementForPlace } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { PLACE_TYPES } from "@/lib/place";
import {
  parseEnum,
  parseText,
  requireAdmin,
  type AdminActionState,
} from "@/lib/admin";

export type AchievementActionState = AdminActionState;

/**
 * Creates or updates the one achievement a place is allowed to own. Upserting
 * on (placeType, placeId) is what enforces "one badge per place" — the admin UI
 * can't accidentally create a second one by submitting the form twice.
 */
export async function saveAchievement(
  _prevState: AchievementActionState,
  formData: FormData,
): Promise<AchievementActionState> {
  await requireAdmin();

  const placeType = parseEnum(formData.get("placeType"), PLACE_TYPES, "attraction");
  const placeId = parseText(formData.get("placeId"));
  const name = parseText(formData.get("name"));

  if (!placeId) return { error: "Missing place." };
  if (!name) return { error: "Achievement name is required." };

  const existing = await getAchievementForPlace(placeType, placeId);

  let badgeImagePath = existing?.badgeImagePath ?? null;
  const badge = optionalFile(formData.get("badge"));
  if (badge) {
    const upload = await saveUpload(badge, "badges");
    if (!upload.ok) return { error: upload.error };
    badgeImagePath = upload.path;
    await deleteUpload(existing?.badgeImagePath);
  }

  const description = parseText(formData.get("description")) || null;

  if (existing) {
    await db
      .update(achievements)
      .set({ name, description, badgeImagePath })
      .where(eq(achievements.id, existing.id));
  } else {
    await db.insert(achievements).values({
      name,
      description,
      badgeImagePath,
      placeType,
      placeId,
    });
  }

  revalidatePath("/admin/achievements");
  revalidatePath(`/admin/${placeType}s/${placeId}`);
  revalidatePath("/profile");
  return { success: existing ? "Achievement updated." : "Achievement created." };
}

/** Deleting an achievement cascades to everyone who held it. */
export async function deleteAchievement(id: string): Promise<void> {
  await requireAdmin();

  const [existing] = await db
    .select()
    .from(achievements)
    .where(eq(achievements.id, id))
    .limit(1);
  if (!existing) return;

  await db.delete(achievements).where(eq(achievements.id, id));
  await deleteUpload(existing.badgeImagePath);

  revalidatePath("/admin/achievements");
  revalidatePath("/profile");
}
