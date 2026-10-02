import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AR_MATCH_THRESHOLD,
  HASH_BITS,
  HASH_GRID,
  hashDistance,
  hashFromGreyscale,
  hashesMatch,
  isValidHash,
} from "../src/lib/ar-hash";

/** A smooth left-to-right gradient — a stable, strongly-structured subject. */
function gradient(brightness = 1, noise = 0): number[] {
  const grey: number[] = [];
  for (let row = 0; row < HASH_GRID; row += 1) {
    for (let col = 0; col < HASH_GRID; col += 1) {
      const base = (col / HASH_GRID) * 255 * brightness;
      const jitter = noise === 0 ? 0 : Math.sin(row * 12.9898 + col * 78.233) * noise;
      grey.push(base + jitter);
    }
  }
  return grey;
}

function randomGrid(seed: number): number[] {
  const grey: number[] = [];
  let value = seed;
  for (let index = 0; index < HASH_GRID * HASH_GRID; index += 1) {
    value = (value * 1103515245 + 12345) % 2147483648;
    grey.push((value / 2147483648) * 255);
  }
  return grey;
}

test("a hash covers every comparison bit", () => {
  const hash = hashFromGreyscale(gradient());
  assert.equal(hash.length, HASH_BITS / 4, "one hex char per 4 bits");
  assert.ok(isValidHash(hash), "must pass the server-side format check");
});

test("the same image hashes identically", () => {
  assert.equal(hashFromGreyscale(gradient()), hashFromGreyscale(gradient()));
  assert.equal(hashDistance(hashFromGreyscale(gradient()), hashFromGreyscale(gradient())), 0);
});

test("brightness changes do not break the match", () => {
  // The point of a difference hash: a darker photo of the same subject still
  // matches, because only the left/right ordering of pixels matters.
  const reference = hashFromGreyscale(gradient(1));
  for (const brightness of [0.4, 0.7, 1.3]) {
    const frame = hashFromGreyscale(gradient(brightness));
    assert.ok(
      hashesMatch(reference, frame),
      `brightness ×${brightness} should still match`,
    );
  }
});

test("mild sensor noise does not break the match", () => {
  const reference = hashFromGreyscale(gradient(1, 0));
  const noisy = hashFromGreyscale(gradient(1, 6));
  assert.ok(hashesMatch(reference, noisy), "a slightly noisy frame should match");
});

test("an unrelated image does NOT match", () => {
  const reference = hashFromGreyscale(gradient());
  for (const seed of [1, 7, 99, 4242]) {
    const other = hashFromGreyscale(randomGrid(seed));
    assert.ok(
      !hashesMatch(reference, other),
      `random grid ${seed} must not be accepted as the landmark`,
    );
  }
});

test("an inverted image is far away", () => {
  const reference = hashFromGreyscale(gradient());
  const reversed = hashFromGreyscale(gradient().reverse());
  assert.ok(hashDistance(reference, reversed) > AR_MATCH_THRESHOLD);
});

test("malformed hashes are rejected before comparison", () => {
  assert.ok(!isValidHash(""));
  assert.ok(!isValidHash("not-hex"));
  assert.ok(!isValidHash("abc"), "too short to be a real hash");
  assert.ok(!isValidHash(null));
  assert.ok(!isValidHash(123));
  assert.ok(!isValidHash("f".repeat(200)), "too long");
});
