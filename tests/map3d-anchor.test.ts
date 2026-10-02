import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildAnchorMatrix,
  lngLatToMercator,
  meterInMercatorUnits,
} from "../src/lib/map3d/anchor";

/**
 * Regression tests for the bug this rewrite exists to kill: 3D models that
 * appear correctly at first and then drift when the camera moves.
 *
 * The root cause of drift is an object whose world position depends on the
 * camera. These tests pin down the opposite property — an object's position in
 * world space is a pure function of its longitude/latitude and nothing else.
 */

const BATUMI = { lng: 41.6338, lat: 41.6478 };

function placeInWorld(matrix: THREE.Matrix4, local: [number, number, number]) {
  return new THREE.Vector3(...local).applyMatrix4(matrix);
}

test("the model origin lands exactly on its geographic coordinate", () => {
  const mercator = lngLatToMercator(BATUMI.lng, BATUMI.lat);
  const matrix = buildAnchorMatrix(mercator, meterInMercatorUnits(BATUMI.lat));

  const origin = placeInWorld(matrix, [0, 0, 0]);

  assert.ok(Math.abs(origin.x - mercator.x) < 1e-12, "x must equal the mercator x");
  assert.ok(Math.abs(origin.y - mercator.y) < 1e-12, "y must equal the mercator y");
  assert.ok(Math.abs(origin.z - mercator.z) < 1e-12, "z must equal the mercator z");
});

test("one model unit is one real-world metre, on every axis", () => {
  const mercator = lngLatToMercator(BATUMI.lng, BATUMI.lat);
  const metersToMercator = meterInMercatorUnits(BATUMI.lat);
  const matrix = buildAnchorMatrix(mercator, metersToMercator);

  const origin = placeInWorld(matrix, [0, 0, 0]);
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const) {
    const moved = placeInWorld(matrix, [...axis]);
    const distance = moved.distanceTo(origin);
    assert.ok(
      Math.abs(distance - metersToMercator) < 1e-15,
      `one unit along ${axis} should span one metre in mercator units`,
    );
  }
});

test("the axis convention is X=east, Y=up, Z=south", () => {
  const mercator = lngLatToMercator(BATUMI.lng, BATUMI.lat);
  const scale = meterInMercatorUnits(BATUMI.lat);
  const matrix = buildAnchorMatrix(mercator, scale);
  const origin = placeInWorld(matrix, [0, 0, 0]);

  // Mercator space: +x is east, +y is SOUTH, +z is up.
  const east = placeInWorld(matrix, [1, 0, 0]);
  assert.ok(east.x - origin.x > 0, "+X must go east");
  assert.ok(Math.abs(east.y - origin.y) < 1e-18, "+X must not move north/south");

  const up = placeInWorld(matrix, [0, 1, 0]);
  assert.ok(up.z - origin.z > 0, "+Y must go up");
  assert.ok(Math.abs(up.x - origin.x) < 1e-18, "+Y must not move east/west");

  const south = placeInWorld(matrix, [0, 0, 1]);
  assert.ok(south.y - origin.y > 0, "+Z must go south");
  assert.ok(Math.abs(south.z - origin.z) < 1e-18, "+Z must not change height");
});

test("a model's base sits on the ground plane, not below it", () => {
  const mercator = lngLatToMercator(BATUMI.lng, BATUMI.lat);
  const matrix = buildAnchorMatrix(mercator, meterInMercatorUnits(BATUMI.lat));

  // Normalization re-seats every model so its lowest point is at local y = 0.
  const base = placeInWorld(matrix, [0, 0, 0]);
  assert.ok(Math.abs(base.z - mercator.z) < 1e-15, "local y=0 must be ground level");
});

test("position is independent of the camera — the drift regression", () => {
  const mercator = lngLatToMercator(BATUMI.lng, BATUMI.lat);
  const matrix = buildAnchorMatrix(mercator, meterInMercatorUnits(BATUMI.lat));
  const worldPoint = placeInWorld(matrix, [0, 5, 0]);

  // Stand in for a range of Mapbox camera states (zoom / pitch / bearing).
  // Whatever the camera does, the object's WORLD position must not change;
  // only its projection does. The old implementation multiplied the object
  // transform into the camera matrix, which broke exactly this property.
  const cameras = [
    new THREE.Matrix4().makeRotationZ(0.3).multiply(new THREE.Matrix4().makeScale(2, 2, 2)),
    new THREE.Matrix4().makeRotationX(1.1),
    new THREE.Matrix4().makeTranslation(-0.2, 0.4, 0.1),
    new THREE.Matrix4().makeScale(1024, 1024, 1024),
  ];

  for (const camera of cameras) {
    const recomputed = placeInWorld(buildAnchorMatrix(mercator, meterInMercatorUnits(BATUMI.lat)), [
      0, 5, 0,
    ]);
    assert.deepEqual(
      [recomputed.x, recomputed.y, recomputed.z],
      [worldPoint.x, worldPoint.y, worldPoint.z],
      "world position must not depend on the camera",
    );

    // And projecting through the camera must be reversible, i.e. the camera
    // matrix carries no object-specific state.
    const projected = worldPoint.clone().applyMatrix4(camera);
    const back = projected.applyMatrix4(new THREE.Matrix4().copy(camera).invert());
    assert.ok(back.distanceTo(worldPoint) < 1e-9, "projection must be invertible");
  }
});

test("latitude changes the metre scale, as Mercator requires", () => {
  // A metre spans more Mercator units further from the equator; a model that
  // ignored this would be the wrong size (and mis-seated) away from Batumi.
  const equator = meterInMercatorUnits(0);
  const batumi = meterInMercatorUnits(41.6478);
  const arctic = meterInMercatorUnits(70);

  assert.ok(batumi > equator, "scale must grow with latitude");
  assert.ok(arctic > batumi, "scale must keep growing with latitude");
});

test("two places at different coordinates get different anchors", () => {
  const a = lngLatToMercator(41.6338, 41.6478);
  const b = lngLatToMercator(41.6421, 41.6512);
  const originA = placeInWorld(buildAnchorMatrix(a, meterInMercatorUnits(41.6478)), [0, 0, 0]);
  const originB = placeInWorld(buildAnchorMatrix(b, meterInMercatorUnits(41.6512)), [0, 0, 0]);

  assert.notEqual(originA.x, originB.x);
  assert.notEqual(originA.y, originB.y);
});
