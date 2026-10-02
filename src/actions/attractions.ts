"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attractions } from "@/db/schema";
import { getAttractionById } from "@/db/queries";
import { saveUpload, deleteUpload, optionalFile } from "@/lib/storage";
import { deleteAchievementsForPlace } from "@/lib/achievements";
import { ATTRACTION_CATEGORIES } from "@/lib/partner-category";
import { VERIFICATION_MODES } from "@/lib/place";
import { isValidHash } from "@/lib/ar-hash";
import {
  newQrToken,
  parseCoordinate,
  parseEnum,
  parseModelFields,
  parseText,
  requireAdmin,
  type AdminActionState,
} from "@/lib/admin";

export type AttractionActionState = AdminActionState;

export async function createAttraction(
  _prevState: AttractionActionState,
  formData: FormData,
): Promise<AttractionActionState> {
  const session = await requireAdmin();

  const name = parseText(formData.get("name"));
  const photo = optionalFile(formData.get("photo"));
  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  if (!name) return { error: "Name is required." };
  if (!photo) return { error: "A photo is required." };
  if (latitude === null || longitude === null) {
    return { error: "Pick a location for this attraction on the map." };
  }

  const upload = await saveUpload(photo, "attractions");
  if (!upload.ok) return { error: upload.error };

  const uploaded: string[] = [upload.path];
  const extra = await saveOptionalAssets(formData, uploaded);
  if ("error" in extra) {
    for (const path of uploaded) await deleteUpload(path);
    return { error: extra.error };
  }

  await db.insert(attractions).values({
    name,
    category: parseEnum(formData.get("category"), ATTRACTION_CATEGORIES, "landmark"),
    description: parseText(formData.get("description")) || null,
    photoPath: upload.path,
    modelPath: extra.modelPath,
    arTargetPath: extra.arTargetPath,
    arTargetHash: parseArHash(formData.get("arTargetHash")),
    verificationMode: parseEnum(formData.get("verificationMode"), VERIFICATION_MODES, "gps"),
    qrToken: newQrToken(),
    latitude,
    longitude,
    createdBy: session.user.id,
    ...parseModelFields(formData, 8),
  });

  revalidatePath("/admin/attractions");
  redirect("/admin/attractions");
}

export async function updateAttraction(
  _prevState: AttractionActionState,
  formData: FormData,
): Promise<AttractionActionState> {
  await requireAdmin();

  const id = parseText(formData.get("id"));
  const attraction = await getAttractionById(id);
  if (!attraction) return { error: "Attraction not found." };

  const name = parseText(formData.get("name"));
  if (!name) return { error: "Name is required." };

  let photoPath = attraction.photoPath;
  const photo = optionalFile(formData.get("photo"));
  if (photo) {
    const upload = await saveUpload(photo, "attractions");
    if (!upload.ok) return { error: upload.error };
    photoPath = upload.path;
    await deleteUpload(attraction.photoPath);
  }

  let modelPath = attraction.modelPath;
  const model = optionalFile(formData.get("model"));
  if (model) {
    const upload = await saveUpload(model, "models");
    if (!upload.ok) return { error: upload.error };
    modelPath = upload.path;
    await deleteUpload(attraction.modelPath);
  }
  if (parseText(formData.get("removeModel")) === "1") {
    await deleteUpload(modelPath);
    modelPath = null;
  }

  let arTargetPath = attraction.arTargetPath;
  let arTargetHash = attraction.arTargetHash;
  const arTarget = optionalFile(formData.get("arTarget"));
  if (arTarget) {
    const upload = await saveUpload(arTarget, "ar-targets");
    if (!upload.ok) return { error: upload.error };
    // The hash is computed in the browser from the same file, so the two always
    // describe the same image.
    const hash = parseArHash(formData.get("arTargetHash"));
    if (!hash) {
      await deleteUpload(upload.path);
      return { error: "That AR reference image couldn't be processed. Try another file." };
    }
    arTargetPath = upload.path;
    arTargetHash = hash;
    await deleteUpload(attraction.arTargetPath);
  }

  const latitude = parseCoordinate(formData.get("latitude"));
  const longitude = parseCoordinate(formData.get("longitude"));

  await db
    .update(attractions)
    .set({
      name,
      category: parseEnum(formData.get("category"), ATTRACTION_CATEGORIES, attraction.category),
      description: parseText(formData.get("description")) || null,
      photoPath,
      modelPath,
      arTargetPath,
      arTargetHash,
      verificationMode: parseEnum(
        formData.get("verificationMode"),
        VERIFICATION_MODES,
        attraction.verificationMode,
      ),
      latitude: latitude ?? attraction.latitude,
      longitude: longitude ?? attraction.longitude,
      ...parseModelFields(formData, 8),
    })
    .where(eq(attractions.id, id));

  revalidatePath("/admin/attractions");
  revalidatePath(`/admin/attractions/${id}`);
  return { success: "Attraction saved." };
}

export async function deleteAttraction(id: string): Promise<void> {
  await requireAdmin();

  const attraction = await getAttractionById(id);
  if (!attraction) return;

  await deleteAchievementsForPlace("attraction", id);
  await db.delete(attractions).where(eq(attractions.id, id));
  await deleteUpload(attraction.photoPath);
  await deleteUpload(attraction.modelPath);
  await deleteUpload(attraction.arTargetPath);

  revalidatePath("/admin/attractions");
}

export async function updateAttractionLocation(
  id: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await requireAdmin();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Invalid coordinates.");
  }

  await db.update(attractions).set({ latitude, longitude }).where(eq(attractions.id, id));

  revalidatePath("/admin/attractions");
  revalidatePath(`/admin/attractions/${id}`);
}

export async function regenerateAttractionQrToken(id: string): Promise<void> {
  await requireAdmin();

  await db.update(attractions).set({ qrToken: newQrToken() }).where(eq(attractions.id, id));

  revalidatePath("/admin/qr-codes");
  revalidatePath(`/admin/attractions/${id}`);
}

/** The hash arrives from the browser, so it is validated rather than trusted. */
function parseArHash(value: FormDataEntryValue | null): string | null {
  const raw = parseText(value);
  return isValidHash(raw) ? raw : null;
}

/** Uploads the optional .glb / AR target, tracking paths so a later failure can roll them back. */
async function saveOptionalAssets(
  formData: FormData,
  uploaded: string[],
): Promise<{ modelPath: string | null; arTargetPath: string | null } | { error: string }> {
  let modelPath: string | null = null;
  let arTargetPath: string | null = null;

  const model = optionalFile(formData.get("model"));
  if (model) {
    const upload = await saveUpload(model, "models");
    if (!upload.ok) return { error: upload.error };
    modelPath = upload.path;
    uploaded.push(upload.path);
  }

  const arTarget = optionalFile(formData.get("arTarget"));
  if (arTarget) {
    const upload = await saveUpload(arTarget, "ar-targets");
    if (!upload.ok) return { error: upload.error };
    arTargetPath = upload.path;
    uploaded.push(upload.path);
  }

  return { modelPath, arTargetPath };
}
