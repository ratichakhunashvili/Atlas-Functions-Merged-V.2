import type { PlaceType, VerificationMode } from "@/db/schema";

export type { PlaceType, VerificationMode };

export const PLACE_TYPES = ["hotel", "attraction", "partner"] as const;

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  hotel: "Hotel",
  attraction: "Attraction",
  partner: "Partner",
};

export const VERIFICATION_MODES = ["gps", "qr", "ar"] as const;

export const VERIFICATION_MODE_LABELS: Record<VerificationMode, string> = {
  gps: "GPS proximity",
  qr: "QR code scan",
  ar: "AR camera match",
};

export const VERIFICATION_MODE_HINTS: Record<VerificationMode, string> = {
  gps: "Guest checks in by standing within range — no physical code needed.",
  qr: "Guest scans a printed QR code at the location.",
  ar: "Guest points their camera at the landmark; used where no code can be installed.",
};

/** A guest must be this close before a GPS check-in is accepted. */
export const CHECKIN_RADIUS_METERS = 150;

/** Candidates beyond this distance from the active hotel are never offered. */
export const MAX_CANDIDATE_DISTANCE_METERS = 5000;

/** Stable key for a place across the three tables. */
export function placeKey(placeType: PlaceType, placeId: string): string {
  return `${placeType}:${placeId}`;
}


