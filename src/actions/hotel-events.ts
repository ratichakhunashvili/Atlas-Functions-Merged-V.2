"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelEvents } from "@/db/schema";
import { getHotelEventById } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { parseText, requireAdmin, type AdminActionState } from "@/lib/admin";

export type HotelEventActionState = AdminActionState;

/** `datetime-local` gives "2026-10-02T19:30" — no zone, so it reads as local time. */
function parseDateTime(value: FormDataEntryValue | null): Date | null {
  const raw = parseText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createHotelEvent(
  _prevState: HotelEventActionState,
  formData: FormData,
): Promise<HotelEventActionState> {
  await requireAdmin();

  const hotelId = parseText(formData.get("hotelId"));
  const title = parseText(formData.get("title"));
  const startsAt = parseDateTime(formData.get("startsAt"));
  const endsAt = parseDateTime(formData.get("endsAt"));

  if (!hotelId) return { error: "Missing hotel." };
  if (!title) return { error: "Title is required." };
  if (!startsAt) return { error: "A start date and time is required." };
  if (endsAt && endsAt < startsAt) return { error: "The end time is before the start time." };

  let photoPath: string | null = null;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "events");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
  }

  await db.insert(hotelEvents).values({
    hotelId,
    title,
    description: parseText(formData.get("description")) || null,
    photoPath,
    startsAt,
    endsAt,
  });

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/hotels/${hotelId}`);
  return { success: `Added ${title}.` };
}

export async function updateHotelEvent(
  _prevState: HotelEventActionState,
  formData: FormData,
): Promise<HotelEventActionState> {
  await requireAdmin();

  const id = parseText(formData.get("id"));
  const event = await getHotelEventById(id);
  if (!event) return { error: "Event not found." };

  const title = parseText(formData.get("title"));
  const startsAt = parseDateTime(formData.get("startsAt"));
  const endsAt = parseDateTime(formData.get("endsAt"));

  if (!title) return { error: "Title is required." };
  if (!startsAt) return { error: "A start date and time is required." };
  if (endsAt && endsAt < startsAt) return { error: "The end time is before the start time." };

  let photoPath = event.photoPath;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "events");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
    await deleteUpload(event.photoPath);
  }

  await db
    .update(hotelEvents)
    .set({
      title,
      description: parseText(formData.get("description")) || null,
      photoPath,
      startsAt,
      endsAt,
    })
    .where(eq(hotelEvents.id, id));

  revalidatePath(`/admin/hotels/${event.hotelId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/hotels/${event.hotelId}`);
  return { success: "Event saved." };
}

export async function deleteHotelEvent(id: string): Promise<void> {
  await requireAdmin();

  const event = await getHotelEventById(id);
  if (!event) return;

  await db.delete(hotelEvents).where(eq(hotelEvents.id, id));
  await deleteUpload(event.photoPath);

  revalidatePath(`/admin/hotels/${event.hotelId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/hotels/${event.hotelId}`);
}
