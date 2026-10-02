import "server-only";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export type LngLat = { lat: number; lng: number };

export type RouteLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type WalkingRoute = {
  geometry: RouteLineString;
  durationSeconds: number;
  distanceMeters: number;
};

/**
 * Deliberately a discriminated result rather than a nullable route: a caller
 * that fails to get real walking geometry must show a retry state, never
 * silently fall back to drawing a straight line and calling it the route.
 */
export type RouteResult =
  | { ok: true; route: WalkingRoute }
  | { ok: false; error: string };

const DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/walking";
const OPTIMIZED_URL = "https://api.mapbox.com/optimized-trips/v1/mapbox/walking";
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 350;

function coordPair(point: LngLat): string {
  return `${point.lng},${point.lat}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Mapbox responded ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One retry — a walking route failing is usually a transient network hiccup. */
async function fetchJsonWithRetry(url: string): Promise<unknown> {
  try {
    return await fetchJson(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchJson(url);
  }
}

function isLineString(value: unknown): value is RouteLineString {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "LineString" &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

/**
 * THE single point-to-point walking route helper. Every map, panel and
 * itinerary screen goes through this rather than calling Mapbox itself, so
 * route behaviour (timeout, retry, failure reporting) is identical everywhere.
 */
export async function getWalkingRoute(
  origin: LngLat,
  destination: LngLat,
): Promise<RouteResult> {
  if (!MAPBOX_TOKEN) {
    return { ok: false, error: "Mapbox token is not configured." };
  }

  const url =
    `${DIRECTIONS_URL}/${coordPair(origin)};${coordPair(destination)}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const data = (await fetchJsonWithRetry(url)) as {
      routes?: { geometry?: unknown; duration?: unknown; distance?: unknown }[];
    };
    const route = data.routes?.[0];
    if (!route || !isLineString(route.geometry)) {
      return { ok: false, error: "No walking route found between those points." };
    }
    return {
      ok: true,
      route: {
        geometry: route.geometry,
        durationSeconds:
          typeof route.duration === "number" ? Math.round(route.duration) : 0,
        distanceMeters:
          typeof route.distance === "number" ? Math.round(route.distance) : 0,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, error: `Couldn't load the walking route (${reason}).` };
  }
}

export type OptimizedOrder = {
  /** Input indices reordered into the best visiting order; index 0 stays first. */
  order: number[];
  geometry: RouteLineString | null;
  durationSeconds: number | null;
  /** True when Mapbox actually ordered the stops; false means the input order was kept. */
  optimized: boolean;
};

/**
 * Orders a day's stops with the Optimized Trips API, starting at `points[0]`
 * (the hotel). Unlike `getWalkingRoute`, a failure here is non-fatal — the day
 * is still generated in the given order, just not optimally sorted — so this
 * one does report a usable fallback rather than an error.
 */
export async function getOptimizedWalkingOrder(
  points: LngLat[],
): Promise<OptimizedOrder> {
  const identity = {
    order: points.map((_, index) => index),
    geometry: null,
    durationSeconds: null,
    optimized: false,
  };
  // Optimized Trips takes between 2 and 12 coordinates.
  if (points.length < 2 || points.length > 12 || !MAPBOX_TOKEN) return identity;

  const url =
    `${OPTIMIZED_URL}/${points.map(coordPair).join(";")}` +
    `?roundtrip=true&source=first&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const data = (await fetchJsonWithRetry(url)) as {
      trips?: { geometry?: unknown; duration?: unknown }[];
      waypoints?: { waypoint_index: number }[];
    };
    const trip = data.trips?.[0];
    const waypoints = data.waypoints;
    if (!trip || !waypoints || waypoints.length !== points.length) return identity;

    const order = waypoints
      .map((waypoint, inputIndex) => ({ inputIndex, tripPosition: waypoint.waypoint_index }))
      .sort((a, b) => a.tripPosition - b.tripPosition)
      .map((entry) => entry.inputIndex);

    return {
      order,
      geometry: isLineString(trip.geometry) ? trip.geometry : null,
      durationSeconds: typeof trip.duration === "number" ? Math.round(trip.duration) : null,
      optimized: true,
    };
  } catch {
    return identity;
  }
}
