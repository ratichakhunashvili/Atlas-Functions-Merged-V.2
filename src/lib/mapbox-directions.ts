import "server-only";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export type RouteLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type OptimizedRoute = {
  /** Original input indices, reordered into the best visiting order (index 0 = the fixed start point). */
  order: number[];
  geometry: RouteLineString | null;
  durationSeconds: number | null;
};

/**
 * Asks Mapbox for the best walking loop through a set of points, starting at
 * `points[0]`. Falls back to visiting them in the given order (no route line)
 * if the request fails, so itinerary generation never hard-fails on a
 * network hiccup.
 */
export async function getOptimizedWalkingRoute(
  points: { lat: number; lng: number }[],
): Promise<OptimizedRoute> {
  const identityOrder = points.map((_, i) => i);
  if (points.length < 2 || !MAPBOX_TOKEN) {
    return { order: identityOrder, geometry: null, durationSeconds: null };
  }

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coords}` +
      `?roundtrip=true&source=first&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox optimization request failed: ${res.status}`);

    const data = await res.json();
    const trip = data.trips?.[0];
    const waypoints: { waypoint_index: number }[] | undefined = data.waypoints;
    if (!trip || !waypoints || waypoints.length !== points.length) {
      throw new Error("Unexpected Mapbox optimization response shape.");
    }

    const order = waypoints
      .map((wp, inputIndex) => ({ inputIndex, tripPosition: wp.waypoint_index }))
      .sort((a, b) => a.tripPosition - b.tripPosition)
      .map((entry) => entry.inputIndex);

    return {
      order,
      geometry: trip.geometry ?? null,
      durationSeconds:
        typeof trip.duration === "number" ? Math.round(trip.duration) : null,
    };
  } catch {
    return { order: identityOrder, geometry: null, durationSeconds: null };
  }
}

export type WalkingLeg = {
  geometry: RouteLineString | null;
  durationSeconds: number | null;
};

/**
 * A single point-to-point walking route — used to reveal just the leg to the
 * guest's *current* stop, rather than the whole day's path at once.
 */
export async function getWalkingLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<WalkingLeg> {
  if (!MAPBOX_TOKEN) return { geometry: null, durationSeconds: null };

  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox directions request failed: ${res.status}`);

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("No route returned");

    return {
      geometry: route.geometry ?? null,
      durationSeconds: typeof route.duration === "number" ? Math.round(route.duration) : null,
    };
  } catch {
    return { geometry: null, durationSeconds: null };
  }
}
