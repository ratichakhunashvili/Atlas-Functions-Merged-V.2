import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes a handful of small, valid .glb files for the local seed.
 *
 * Real models rather than placeholders, but generated rather than shipped, so
 * the repository stays small and the map loads instantly. They are built at
 * deliberately different scales and proportions (one is authored in
 * centimetres) so the loader's normalization — measure, re-seat the base on
 * the ground, scale to the configured height — is genuinely exercised.
 */

type Vec3 = [number, number, number];

type Geometry = { positions: number[]; normals: number[]; indices: number[] };

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalize([
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]);
}

/** Flat-shaded triangle: every face gets its own three vertices. */
function pushTriangle(geometry: Geometry, a: Vec3, b: Vec3, c: Vec3) {
  const normal = faceNormal(a, b, c);
  const base = geometry.positions.length / 3;
  for (const vertex of [a, b, c]) {
    geometry.positions.push(...vertex);
    geometry.normals.push(...normal);
  }
  geometry.indices.push(base, base + 1, base + 2);
}

/**
 * An N-sided prism, optionally tapered towards the top. Covers everything the
 * seed needs: a square tower, a tapered obelisk, a hexagonal pavilion.
 */
function prism(options: {
  sides: number;
  radius: number;
  height: number;
  topScale: number;
  baseY?: number;
}): Geometry {
  const { sides, radius, height, topScale } = options;
  const baseY = options.baseY ?? 0;
  const geometry: Geometry = { positions: [], normals: [], indices: [] };

  const ring = (scale: number, y: number): Vec3[] =>
    Array.from({ length: sides }, (_, index) => {
      const angle = (index / sides) * Math.PI * 2 + Math.PI / sides;
      return [
        Math.cos(angle) * radius * scale,
        y,
        Math.sin(angle) * radius * scale,
      ] as Vec3;
    });

  const bottom = ring(1, baseY);
  const top = ring(topScale, baseY + height);

  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    pushTriangle(geometry, bottom[index], bottom[next], top[next]);
    pushTriangle(geometry, bottom[index], top[next], top[index]);
  }

  const bottomCentre: Vec3 = [0, baseY, 0];
  const topCentre: Vec3 = [0, baseY + height, 0];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    pushTriangle(geometry, bottom[next], bottom[index], bottomCentre);
    pushTriangle(geometry, top[index], top[next], topCentre);
  }

  return geometry;
}

function merge(...geometries: Geometry[]): Geometry {
  const merged: Geometry = { positions: [], normals: [], indices: [] };
  for (const geometry of geometries) {
    const offset = merged.positions.length / 3;
    merged.positions.push(...geometry.positions);
    merged.normals.push(...geometry.normals);
    merged.indices.push(...geometry.indices.map((index) => index + offset));
  }
  return merged;
}

/** Pads a buffer up to a 4-byte boundary, as the GLB container requires. */
function padTo4(buffer: Buffer, fill: number): Buffer {
  const remainder = buffer.length % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

function buildGlb(geometry: Geometry, color: [number, number, number]): Buffer {
  const positions = Float32Array.from(geometry.positions);
  const normals = Float32Array.from(geometry.normals);
  const indices = Uint16Array.from(geometry.indices);

  const positionBytes = padTo4(Buffer.from(positions.buffer), 0);
  const normalBytes = padTo4(Buffer.from(normals.buffer), 0);
  const indexBytes = padTo4(Buffer.from(indices.buffer), 0);
  const binary = Buffer.concat([positionBytes, normalBytes, indexBytes]);

  // POSITION accessors are required to carry min/max.
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < geometry.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = geometry.positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  const json = {
    asset: { version: "2.0", generator: "merged-v2 seed" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [...color, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.75,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min,
        max,
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.length,
        byteLength: normals.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: binary.length }],
  };

  // JSON chunk pads with spaces, binary chunk pads with zeroes.
  const jsonChunk = padTo4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = padTo4(binary, 0);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN"

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

export type SeedModel = { filename: string; publicPath: string };

export async function writeSeedModels(uploadsRoot: string): Promise<Record<string, SeedModel>> {
  const dir = path.join(uploadsRoot, "models");
  await mkdir(dir, { recursive: true });

  const designs: Record<string, { geometry: Geometry; color: [number, number, number] }> = {
    // A tapered obelisk, authored around 20 units tall.
    obelisk: {
      geometry: merge(
        prism({ sides: 4, radius: 2.2, height: 2, topScale: 0.85 }),
        prism({ sides: 4, radius: 1.9, height: 15, topScale: 0.35, baseY: 2 }),
        prism({ sides: 4, radius: 0.7, height: 3, topScale: 0.02, baseY: 17 }),
      ),
      color: [0.82, 0.78, 0.68],
    },
    // Deliberately authored in centimetres (~900 units tall) to prove the
    // loader rescales whatever units a model arrives in.
    tower: {
      geometry: merge(
        prism({ sides: 4, radius: 150, height: 700, topScale: 0.75 }),
        prism({ sides: 8, radius: 120, height: 200, topScale: 0.2, baseY: 700 }),
      ),
      color: [0.55, 0.62, 0.78],
    },
    // Wide and low — the opposite proportion to the tower.
    pavilion: {
      geometry: merge(
        prism({ sides: 6, radius: 5, height: 0.6, topScale: 1 }),
        prism({ sides: 6, radius: 4.2, height: 3.2, topScale: 0.95, baseY: 0.6 }),
        prism({ sides: 6, radius: 5.2, height: 2.2, topScale: 0.05, baseY: 3.8 }),
      ),
      color: [0.36, 0.7, 0.6],
    },
  };

  const written: Record<string, SeedModel> = {};
  for (const [name, design] of Object.entries(designs)) {
    const filename = `seed-${name}.glb`;
    await writeFile(path.join(dir, filename), buildGlb(design.geometry, design.color));
    written[name] = { filename, publicPath: `/uploads/models/${filename}` };
  }
  return written;
}
