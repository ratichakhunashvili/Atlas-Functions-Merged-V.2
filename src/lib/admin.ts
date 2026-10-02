import "server-only";
import { auth } from "@/auth";

/** Every admin mutation calls this first — permission is checked on the server, never inferred from the UI. */
export async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    throw new Error("Forbidden: admin access required.");
  }
  return session;
}

export type AdminActionState = { error: string } | { success: string } | undefined;

export function parseCoordinate(value: FormDataEntryValue | null): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Blank/absent numeric fields fall back to `fallback` rather than NaN. */
export function parseNumber(value: FormDataEntryValue | null, fallback: number): number {
  const raw = String(value ?? "").trim();
  if (raw === "") return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

export function parseBoolean(value: FormDataEntryValue | null): boolean {
  const raw = String(value ?? "").toLowerCase();
  return raw === "on" || raw === "true" || raw === "1";
}

/** Narrows a form value to a member of an enum tuple, falling back to a default. */
export function parseEnum<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = String(value ?? "");
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** QR identity is a fresh random token, never a database row id. */
export function newQrToken(): string {
  return crypto.randomUUID();
}

/** The 3D transform knobs shared by hotels, attractions and partners. */
export type ModelFormFields = {
  model3dEnabled: boolean;
  modelTargetHeightMeters: number;
  modelRotationDeg: number;
  modelElevationOffsetMeters: number;
  modelScaleMultiplier: number;
};

export function parseModelFields(
  formData: FormData,
  defaultHeightMeters: number,
): ModelFormFields {
  return {
    model3dEnabled: parseBoolean(formData.get("model3dEnabled")),
    // Clamped so a typo can't push a model kilometres tall or inside-out.
    modelTargetHeightMeters: clamp(
      parseNumber(formData.get("modelTargetHeightMeters"), defaultHeightMeters),
      0.5,
      200,
    ),
    modelRotationDeg: parseNumber(formData.get("modelRotationDeg"), 0) % 360,
    modelElevationOffsetMeters: clamp(
      parseNumber(formData.get("modelElevationOffsetMeters"), 0),
      -50,
      200,
    ),
    modelScaleMultiplier: clamp(
      parseNumber(formData.get("modelScaleMultiplier"), 1),
      0.05,
      20,
    ),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
