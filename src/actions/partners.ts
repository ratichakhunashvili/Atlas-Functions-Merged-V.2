"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelPartners, partners } from "@/db/schema";
import { getPartnerById } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { deleteAchievementsForPlace } from "@/lib/achievements";
import { PARTNER_CATEGORIES } from "@/lib/partner-category";
import { VERIFICATION_MODES } from "@/lib/place";
import {
  newQrToken,
  parseCoordinate,
  parseEnum,
  parseModelFields,
  parseText,
  requireAdmin,
  type AdminActionState,
} from "@/lib/admin";

export type PartnerActionState = AdminActionState;

export async function createPartner(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const session = await requireAdmin();

  const name = parseText(formData.get("name"));
  const photo = optionalFile(formData.get("photo"));
  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  if (!name) return { error: "Name is required." };
  if (!photo) return { error: "A photo is required." };
  if (latitude === null || longitude === null) {
    return { error: "Pick a location for this partner on the map." };
  }

  const upload = await saveUpload(photo, "partners");
  if (!upload.ok) return { error: upload.error };

  let modelPath: string | null = null;
  const model = optionalFile(formData.get("model"));
  if (model) {
    const modelUpload = await saveUpload(model, "models");
    if (!modelUpload.ok) {
      await deleteUpload(upload.path);
      return { error: modelUpload.error };
    }
    modelPath = modelUpload.path;
  }

  await db.insert(partners).values({
    name,
    category: parseEnum(formData.get("category"), PARTNER_CATEGORIES, "other"),
    description: parseText(formData.get("description")) || null,
    address: parseText(formData.get("address")) || null,
    contactPhone: parseText(formData.get("contactPhone")) || null,
    contactWebsite: parseText(formData.get("contactWebsite")) || null,
    qrToken: newQrToken(),
    photoPath: upload.path,
    modelPath,
    verificationMode: parseEnum(formData.get("verificationMode"), VERIFICATION_MODES, "qr"),
    latitude,
    longitude,
    createdBy: session.user.id,
    ...parseModelFields(formData, 6),
  });

  revalidatePath("/admin/partners");
  redirect("/admin/partners");
}

export async function updatePartner(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  await requireAdmin();

  const id = parseText(formData.get("id"));
  const partner = await getPartnerById(id);
  if (!partner) return { error: "Partner not found." };

  const name = parseText(formData.get("name"));
  if (!name) return { error: "Name is required." };

  let photoPath = partner.photoPath;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "partners");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
    await deleteUpload(partner.photoPath);
  }

  let modelPath = partner.modelPath;
  const model = optionalFile(formData.get("model"));
  if (model) {
    const upload = await saveUpload(model, "models");
    if (!upload.ok) return { error: upload.error };
    modelPath = upload.path;
    await deleteUpload(partner.modelPath);
  }
  if (parseText(formData.get("removeModel")) === "1") {
    await deleteUpload(modelPath);
    modelPath = null;
  }

  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  await db
    .update(partners)
    .set({
      name,
      category: parseEnum(formData.get("category"), PARTNER_CATEGORIES, partner.category),
      description: parseText(formData.get("description")) || null,
      address: parseText(formData.get("address")) || null,
      contactPhone: parseText(formData.get("contactPhone")) || null,
      contactWebsite: parseText(formData.get("contactWebsite")) || null,
      photoPath,
      modelPath,
      verificationMode: parseEnum(
        formData.get("verificationMode"),
        VERIFICATION_MODES,
        partner.verificationMode,
      ),
      latitude: latitude ?? partner.latitude,
      longitude: longitude ?? partner.longitude,
      ...parseModelFields(formData, 6),
    })
    .where(eq(partners.id, id));

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
  return { success: "Partner saved." };
}

export async function deletePartner(id: string): Promise<void> {
  await requireAdmin();

  const partner = await getPartnerById(id);
  if (!partner) return;

  await deleteAchievementsForPlace("partner", id);
  await db.delete(partners).where(eq(partners.id, id));
  await deleteUpload(partner.photoPath);
  await deleteUpload(partner.modelPath);

  revalidatePath("/admin/partners");
}

export async function updatePartnerLocation(
  id: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await requireAdmin();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Invalid coordinates.");
  }

  await db.update(partners).set({ latitude, longitude }).where(eq(partners.id, id));

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${id}`);
}

export async function regeneratePartnerQrToken(id: string): Promise<void> {
  await requireAdmin();

  await db.update(partners).set({ qrToken: newQrToken() }).where(eq(partners.id, id));

  revalidatePath("/admin/qr-codes");
  revalidatePath(`/admin/partners/${id}`);
}

/** Assignment is what makes a partner visible to a hotel — and invisible to every other hotel. */
export async function assignPartnerToHotel(hotelId: string, partnerId: string): Promise<void> {
  await requireAdmin();

  await db.insert(hotelPartners).values({ hotelId, partnerId }).onConflictDoNothing();

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath(`/hotels/${hotelId}`);
}

export async function unassignPartnerFromHotel(
  hotelId: string,
  partnerId: string,
): Promise<void> {
  await requireAdmin();

  await db
    .delete(hotelPartners)
    .where(and(eq(hotelPartners.hotelId, hotelId), eq(hotelPartners.partnerId, partnerId)));

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath(`/hotels/${hotelId}`);
}
