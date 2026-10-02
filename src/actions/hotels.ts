"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hotels, hotelUnlocks } from "@/db/schema";
import { getHotelById } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { deleteAchievementsForPlace } from "@/lib/achievements";
import {
  newQrToken,
  parseCoordinate,
  parseModelFields,
  parseText,
  requireAdmin,
  type AdminActionState,
} from "@/lib/admin";

export type HotelActionState = AdminActionState;

export async function createHotel(
  _prevState: HotelActionState,
  formData: FormData,
): Promise<HotelActionState> {
  const session = await requireAdmin();

  const name = parseText(formData.get("name"));
  const description = parseText(formData.get("description"));
  const address = parseText(formData.get("address"));
  const photo = optionalFile(formData.get("photo"));
  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  if (!name) return { error: "Name is required." };
  if (!photo) return { error: "A photo is required." };
  if (latitude === null || longitude === null) {
    return { error: "Pick a location for this hotel on the map." };
  }

  const upload = await saveUpload(photo, "hotels");
  if (!upload.ok) return { error: upload.error };

  const model = optionalFile(formData.get("model"));
  let modelPath: string | null = null;
  if (model) {
    const modelUpload = await saveUpload(model, "models");
    if (!modelUpload.ok) {
      await deleteUpload(upload.path);
      return { error: modelUpload.error };
    }
    modelPath = modelUpload.path;
  }

  await db.insert(hotels).values({
    name,
    description: description || null,
    address: address || null,
    photoPath: upload.path,
    modelPath,
    qrToken: newQrToken(),
    latitude,
    longitude,
    createdBy: session.user.id,
    ...parseModelFields(formData, 12),
  });

  revalidatePath("/admin/hotels");
  redirect("/admin/hotels");
}

export async function updateHotel(
  _prevState: HotelActionState,
  formData: FormData,
): Promise<HotelActionState> {
  await requireAdmin();

  const id = parseText(formData.get("id"));
  const hotel = await getHotelById(id);
  if (!hotel) return { error: "Hotel not found." };

  const name = parseText(formData.get("name"));
  if (!name) return { error: "Name is required." };

  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  let photoPath = hotel.photoPath;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "hotels");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
    await deleteUpload(hotel.photoPath);
  }

  let modelPath = hotel.modelPath;
  const model = optionalFile(formData.get("model"));
  if (model) {
    const upload = await saveUpload(model, "models");
    if (!upload.ok) return { error: upload.error };
    modelPath = upload.path;
    await deleteUpload(hotel.modelPath);
  }
  if (parseText(formData.get("removeModel")) === "1") {
    await deleteUpload(modelPath);
    modelPath = null;
  }

  await db
    .update(hotels)
    .set({
      name,
      description: parseText(formData.get("description")) || null,
      address: parseText(formData.get("address")) || null,
      photoPath,
      modelPath,
      latitude: latitude ?? hotel.latitude,
      longitude: longitude ?? hotel.longitude,
      ...parseModelFields(formData, 12),
    })
    .where(eq(hotels.id, id));

  revalidatePath("/admin/hotels");
  revalidatePath(`/admin/hotels/${id}`);
  revalidatePath(`/hotels/${id}`);
  return { success: "Hotel saved." };
}

/**
 * Deleting a hotel cascades its partners-assignments, unlocks, activities,
 * events and itineraries through foreign keys; its achievement and uploaded
 * files have no FK to ride on, so they are cleaned up explicitly here.
 */
export async function deleteHotel(id: string): Promise<void> {
  await requireAdmin();

  const hotel = await getHotelById(id);
  if (!hotel) return;

  await deleteAchievementsForPlace("hotel", id);
  await db.delete(hotels).where(eq(hotels.id, id));
  await deleteUpload(hotel.photoPath);
  await deleteUpload(hotel.modelPath);

  revalidatePath("/admin/hotels");
  revalidatePath("/gallery");
}

export async function updateHotelLocation(
  hotelId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await requireAdmin();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Invalid coordinates.");
  }

  await db.update(hotels).set({ latitude, longitude }).where(eq(hotels.id, hotelId));

  revalidatePath("/admin/hotels");
  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath(`/hotels/${hotelId}`);
}

/** Issues a brand-new QR token, invalidating every printed copy of the old one. */
export async function regenerateHotelQrToken(hotelId: string): Promise<void> {
  await requireAdmin();

  await db.update(hotels).set({ qrToken: newQrToken() }).where(eq(hotels.id, hotelId));

  revalidatePath("/admin/qr-codes");
  revalidatePath(`/admin/hotels/${hotelId}`);
}

export async function revokeHotelUnlock(hotelId: string, userId: string): Promise<void> {
  await requireAdmin();

  await db
    .delete(hotelUnlocks)
    .where(and(eq(hotelUnlocks.hotelId, hotelId), eq(hotelUnlocks.userId, userId)));

  revalidatePath(`/admin/hotels/${hotelId}`);
}
