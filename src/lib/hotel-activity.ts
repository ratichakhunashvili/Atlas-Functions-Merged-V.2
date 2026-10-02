import { hotelActivityKindEnum, type HotelActivityKind } from "@/db/schema";

export type { HotelActivityKind };

/**
 * Lives here rather than beside the server actions because a `"use server"`
 * module may only export async functions — constants exported from one break
 * the build.
 */
export const HOTEL_ACTIVITY_KINDS = hotelActivityKindEnum.enumValues;

export const HOTEL_ACTIVITY_KIND_LABELS: Record<HotelActivityKind, string> = {
  spa: "Spa",
  sauna: "Sauna",
  pool: "Pool",
  gym: "Gym",
  restaurant: "Restaurant",
  room_service: "Room service",
  other: "Other",
};
