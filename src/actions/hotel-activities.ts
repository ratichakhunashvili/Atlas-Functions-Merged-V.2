"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelActivities } from "@/db/schema";
import { getHotelActivityById } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { HOTEL_ACTIVITY_KINDS } from "@/lib/hotel-activity";
import {
  parseBoolean,
  parseCoordinate,
  parseEnum,
  parseText,
  requireAdmin,
  type AdminActionState,
} from "@/lib/admin";

export type HotelActivityActionState = AdminActionState;

export async function createHotelActivity(
  _prevState: HotelActivityActionState,
  formData: FormData,
): Promise<HotelActivityActionState> {
  await requireAdmin();

  const hotelId = parseText(formData.get("hotelId"));
  const name = parseText(formData.get("name"));
  if (!hotelId) return { error: "Missing hotel." };
  if (!name) return { error: "Name is required." };

  let photoPath: string | null = null;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "activities");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
  }

  await db.insert(hotelActivities).values({
    hotelId,
    name,
    kind: parseEnum(formData.get("kind"), HOTEL_ACTIVITY_KINDS, "other"),
    description: parseText(formData.get("description")) || null,
    photoPath,
    // Usually null: an activity then sits at its hotel's coordinates.
    latitude: parseCoordinate(formData.get("latitude")),
    longitude: parseCoordinate(formData.get("longitude")),
    active: true,
  });

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath("/admin/activities");
  revalidatePath(`/hotels/${hotelId}`);
  return { success: `Added ${name}.` };
}

export async function updateHotelActivity(
  _prevState: HotelActivityActionState,
  formData: FormData,
): Promise<HotelActivityActionState> {
  await requireAdmin();

  const id = parseText(formData.get("id"));
  const activity = await getHotelActivityById(id);
  if (!activity) return { error: "Activity not found." };

  const name = parseText(formData.get("name"));
  if (!name) return { error: "Name is required." };

  let photoPath = activity.photoPath;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "activities");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
    await deleteUpload(activity.photoPath);
  }

  await db
    .update(hotelActivities)
    .set({
      name,
      kind: parseEnum(formData.get("kind"), HOTEL_ACTIVITY_KINDS, activity.kind),
      description: parseText(formData.get("description")) || null,
      photoPath,
      active: parseBoolean(formData.get("active")),
    })
    .where(eq(hotelActivities.id, id));

  revalidatePath(`/admin/hotels/${activity.hotelId}`);
  revalidatePath("/admin/activities");
  revalidatePath(`/hotels/${activity.hotelId}`);
  return { success: "Activity saved." };
}

export async function deleteHotelActivity(id: string): Promise<void> {
  await requireAdmin();

  const activity = await getHotelActivityById(id);
  if (!activity) return;

  await db.delete(hotelActivities).where(eq(hotelActivities.id, id));
  await deleteUpload(activity.photoPath);

  revalidatePath(`/admin/hotels/${activity.hotelId}`);
  revalidatePath("/admin/activities");
  revalidatePath(`/hotels/${activity.hotelId}`);
}

/** Quick on/off without deleting — an activity closed for the season stays configured. */
export async function toggleHotelActivity(id: string, active: boolean): Promise<void> {
  await requireAdmin();

  const activity = await getHotelActivityById(id);
  if (!activity) return;

  await db.update(hotelActivities).set({ active }).where(eq(hotelActivities.id, id));

  revalidatePath(`/admin/hotels/${activity.hotelId}`);
  revalidatePath("/admin/activities");
}
