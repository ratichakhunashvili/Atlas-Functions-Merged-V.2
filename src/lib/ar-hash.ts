/**
 * Perceptual image hashing for the AR check-in mode.
 *
 * This is a real, if modest, image-matching scheme — not a stand-in for one:
 *   - the admin's AR target image is reduced to a 16x16 greyscale grid and
 *     turned into a 240-bit "difference hash" (each bit = is this pixel
 *     brighter than the one to its right),
 *   - the guest's camera frame is reduced and hashed the same way,
 *   - the server compares the two by Hamming distance.
 *
 * dHash is used rather than average-hash because it keys on local gradients,
 * which survive the lighting and exposure differences between a photo of a
 * landmark and the reference image of it.
 *
 * Honest limitations, so nobody mistakes this for full AR tracking: it matches
 * a *framing* of a subject, so it is tolerant of brightness and mild scale
 * changes but not of large viewpoint rotation, and it does not track or anchor
 * anything in 3D. It is a verification provider — strong enough to confirm
 * "you are looking at this landmark", and deliberately paired with the same
 * server-side gating every other check-in mode gets.
 *
 * Both sides of the comparison use this module, so the client and the server
 * can never disagree about how a hash is computed.
 */

/** Grid width/height the image is reduced to before hashing. */
export const HASH_GRID = 16;
/** 16 rows x 15 horizontal comparisons = 240 bits. */
export const HASH_BITS = HASH_GRID * (HASH_GRID - 1);

/** Fraction of differing bits still counted as the same subject. */
export const AR_MATCH_THRESHOLD = 0.22;

/**
 * Builds the hash from a greyscale grid of `HASH_GRID * HASH_GRID` values.
 * Returned as hex so it stores and transports as a plain short string.
 */
export function hashFromGreyscale(grey: number[]): string {
  const bits: number[] = [];
  for (let row = 0; row < HASH_GRID; row += 1) {
    for (let col = 0; col < HASH_GRID - 1; col += 1) {
      const left = grey[row * HASH_GRID + col];
      const right = grey[row * HASH_GRID + col + 1];
      bits.push(left > right ? 1 : 0);
    }
  }

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    const nibble =
      (bits[index] << 3) |
      ((bits[index + 1] ?? 0) << 2) |
      ((bits[index + 2] ?? 0) << 1) |
      (bits[index + 3] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    if (Number.isNaN(nibble)) continue;
    bits.push((nibble >> 3) & 1, (nibble >> 2) & 1, (nibble >> 1) & 1, nibble & 1);
  }
  return bits;
}

/** Fraction of bits that differ, 0 (identical) to 1 (inverted). */
export function hashDistance(a: string, b: string): number {
  const bitsA = hexToBits(a);
  const bitsB = hexToBits(b);
  const length = Math.min(bitsA.length, bitsB.length);
  if (length === 0) return 1;

  let differing = 0;
  for (let index = 0; index < length; index += 1) {
    if (bitsA[index] !== bitsB[index]) differing += 1;
  }
  return differing / length;
}

export function hashesMatch(a: string, b: string): boolean {
  return hashDistance(a, b) <= AR_MATCH_THRESHOLD;
}

export function isValidHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40,80}$/.test(value);
}
