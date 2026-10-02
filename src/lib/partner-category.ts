export const PARTNER_CATEGORIES = [
  "restaurant",
  "spa",
  "tour",
  "shop",
  "other",
] as const;

export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export const ATTRACTION_CATEGORIES = [
  "landmark",
  "historical",
  "nature",
  "museum",
  "beach",
  "nightlife",
  "other",
] as const;

export type AttractionCategory = (typeof ATTRACTION_CATEGORIES)[number];

export type Category = PartnerCategory | AttractionCategory;

/** Every distinct category across attractions and partners — backs the profile preference picker. */
export const ALL_CATEGORIES = [
  "landmark",
  "historical",
  "nature",
  "museum",
  "beach",
  "nightlife",
  "restaurant",
  "spa",
  "tour",
  "shop",
  "other",
] as const satisfies readonly Category[];

/** Attraction categories checked in via a scan (framed as "AR") rather than GPS proximity. */
export const AR_SCAN_ATTRACTION_CATEGORIES = ["landmark", "historical"] as const;

export const PARTNER_CATEGORY_LABELS: Record<PartnerCategory, string> = {
  restaurant: "Restaurant",
  spa: "Spa",
  tour: "Tour",
  shop: "Shop",
  other: "Other",
};

export const ATTRACTION_CATEGORY_LABELS: Record<AttractionCategory, string> = {
  landmark: "Landmark",
  historical: "Historical",
  nature: "Nature",
  museum: "Museum/Culture",
  beach: "Beach",
  nightlife: "Nightlife",
  other: "Other",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  ...ATTRACTION_CATEGORY_LABELS,
  ...PARTNER_CATEGORY_LABELS,
};

export const PARTNER_CATEGORY_COLORS: Record<PartnerCategory, string> = {
  restaurant: "#f97316",
  spa: "#ec4899",
  tour: "#3b82f6",
  shop: "#22c55e",
  other: "#71717a",
};

export const ATTRACTION_CATEGORY_COLORS: Record<AttractionCategory, string> = {
  landmark: "#8b5cf6",
  historical: "#b45309",
  nature: "#0d9488",
  museum: "#0ea5e9",
  beach: "#06b6d4",
  nightlife: "#d946ef",
  other: "#71717a",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  ...ATTRACTION_CATEGORY_COLORS,
  ...PARTNER_CATEGORY_COLORS,
};
