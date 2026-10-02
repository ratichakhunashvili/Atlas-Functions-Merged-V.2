import "server-only";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

/** Upload buckets. Keeping them named stops callers inventing folder strings. */
export type UploadFolder =
  | "hotels"
  | "attractions"
  | "partners"
  | "activities"
  | "events"
  | "badges"
  | "models"
  | "ar-targets";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const MODEL_EXTENSIONS = new Set([".glb", ".gltf"]);

/** Server Actions are capped at 20 MB in next.config.ts; stay under that. */
const MAX_UPLOAD_BYTES = 19 * 1024 * 1024;

export type UploadResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Where uploaded bytes go.
 *
 * Vercel Blob when `BLOB_READ_WRITE_TOKEN` is present, local disk otherwise.
 * The split is a deployment fact, not a code path callers should know about:
 * a serverless filesystem is read-only, so local disk cannot accept new
 * uploads there, while on a developer's machine Blob would need a token nobody
 * should have to set up just to run the thing.
 *
 * Only the returned public path is ever persisted, so the two are
 * interchangeable from the database's point of view — a local upload is
 * `/uploads/<folder>/<uuid>.png`, a Blob upload is an absolute https URL.
 */
function usingBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveUpload(file: File, folder: UploadFolder): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    };
  }

  const ext = path.extname(file.name).toLowerCase();
  const allowed = folder === "models" ? MODEL_EXTENSIONS : IMAGE_EXTENSIONS;
  if (!allowed.has(ext)) {
    return {
      ok: false,
      error: `Expected ${[...allowed].join(", ")} but got "${ext || "no extension"}".`,
    };
  }

  const filename = `${crypto.randomUUID()}${ext}`;

  if (usingBlob()) {
    try {
      const blob = await put(`${folder}/${filename}`, file, {
        access: "public",
        // The name is already a UUID, so the extra suffix would only make the
        // URL harder to read.
        addRandomSuffix: false,
      });
      return { ok: true, path: blob.url };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      return { ok: false, error: `Upload failed (${reason}).` };
    }
  }

  try {
    const dir = path.join(UPLOADS_ROOT, folder);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return { ok: true, path: `/uploads/${folder}/${filename}` };
  } catch (error) {
    // The most likely cause is a read-only filesystem, i.e. deployed without a
    // Blob token — say so rather than reporting a bare errno.
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      error: `Couldn't store that file (${reason}). If this is a deployed site, set BLOB_READ_WRITE_TOKEN.`,
    };
  }
}

/**
 * Deletes an uploaded file, local or Blob. Missing files are ignored —
 * deletion is best-effort cleanup, never something a user action hangs on.
 */
export async function deleteUpload(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath) return;

  if (publicPath.startsWith("http://") || publicPath.startsWith("https://")) {
    if (!usingBlob()) return;
    await del(publicPath).catch(() => {});
    return;
  }

  if (!publicPath.startsWith("/uploads/")) return;
  // Normalize away any "..", so a crafted stored path can't escape the uploads tree.
  const resolved = path.resolve(UPLOADS_ROOT, "." + publicPath.replace("/uploads", ""));
  if (!resolved.startsWith(UPLOADS_ROOT)) return;
  await unlink(resolved).catch(() => {});
}

/** Reads an optional file field, returning null when the form left it blank. */
export function optionalFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}
