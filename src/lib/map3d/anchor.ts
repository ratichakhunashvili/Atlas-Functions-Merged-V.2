import * as THREE from "three";

/**
 * The geographic anchoring maths, isolated from Mapbox so it can be tested in
 * Node (mapbox-gl needs a browser) — and so the one place that decides where a
 * model sits in the world is a single pure function.
 *
 * Convention produced here, used everywhere in `lib/map3d`:
 *     model +X -> east,  model +Y -> up,  model +Z -> south
 */

/** WGS84 equatorial circumference, as Mapbox uses it. */
const EARTH_CIRCUMFERENCE_METERS = 40075016.686;

export type Mercator = { x: number; y: number; z: number };

/**
 * Web Mercator position in Mapbox's unit square, where the whole world spans
 * 0..1. Mirrors `mapboxgl.MercatorCoordinate.fromLngLat`.
 */
export function lngLatToMercator(lng: number, lat: number, altitude = 0): Mercator {
  const x = (180 + lng) / 360;
  const y =
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
  return { x, y, z: altitude / mercatorScaleAtLatitude(lat) };
}

/** How many Mercator units one metre spans at this latitude. */
export function meterInMercatorUnits(lat: number): number {
  return 1 / mercatorScaleAtLatitude(lat);
}

function mercatorScaleAtLatitude(lat: number): number {
  return EARTH_CIRCUMFERENCE_METERS * Math.cos((lat * Math.PI) / 180);
}

/**
 * The model-space -> Mercator-space matrix for one placed object.
 *
 * Composed by hand, in exactly this order, because the scale is non-uniform
 * (the Y flip turns Mapbox's southward +Y into a conventional upward axis).
 * three.js's own position/rotation/scale properties compose as T·R·S, which
 * would bake the flip into the rotation and give a different, wrong result.
 *
 * Crucially this is the ONLY place an object's world position comes from, and
 * it is computed once at placement time — never re-derived from screen pixels,
 * so no camera movement can make it drift.
 */
export function buildAnchorMatrix(mercator: Mercator, metersToMercator: number): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(mercator.x, mercator.y, mercator.z)
    .scale(new THREE.Vector3(metersToMercator, -metersToMercator, metersToMercator))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
}
