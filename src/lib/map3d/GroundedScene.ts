import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";
import { buildAnchorMatrix } from "@/lib/map3d/anchor";

/**
 * ============================================================================
 * Georeferenced 3D for Mapbox — the ONE custom layer the whole app uses.
 * ============================================================================
 *
 * Why this is built the way it is (the previous implementation drifted
 * whenever the camera moved, which is the bug this file exists to kill):
 *
 *  - Each object's position comes from `MercatorCoordinate.fromLngLat()` ONCE,
 *    at placement time, and is baked into that object's own root matrix. It is
 *    never re-derived from screen pixels, DOM positions or `map.project()`, so
 *    there is nothing to go stale when the camera pans/zooms/pitches/rotates.
 *  - The camera's `projectionMatrix` is set to Mapbox's frame matrix and
 *    NOTHING else. The old code multiplied the object transform into the
 *    camera matrix, which works for exactly one object and smears every other
 *    object across the screen as soon as the view changes.
 *  - One scene, one renderer, one layer, many object groups — not a renderer
 *    per model.
 *
 * Coordinate convention, fixed throughout this file:
 *     model +X -> east,  model +Y -> up,  model +Z -> south
 * produced by the root matrix  T(x,y,z) · S(s,-s,s) · Rx(90°)  where `s` is
 * `meterInMercatorCoordinateUnits()` at that latitude. Because that scale is
 * non-uniform (the Y flip), the matrix is composed by hand in exactly that
 * order; three.js's own position/rotation/scale properties compose as
 * T·R·S and would give a different, wrong result here.
 */

const GREY = 0x9ca3af;
const PLACEHOLDER_HEIGHT_METERS = 4;

/** Parsed GLBs are cached and cloned per placement, so the same model is never fetched twice. */
const modelCache = new Map<string, Promise<THREE.Group>>();
/** Scenes sharing `modelCache`; the cache is released when the last one goes away. */
let liveSceneCount = 0;

function loadModel(url: string): Promise<THREE.Group> {
  const cached = modelCache.get(url);
  if (cached) return cached;

  const promise = new Promise<THREE.Group>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error),
    );
  });
  modelCache.set(url, promise);
  return promise;
}

function releaseModelCache() {
  for (const entry of modelCache.values()) {
    entry
      .then((group) => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
              material.dispose();
            }
          }
        });
      })
      .catch(() => {});
  }
  modelCache.clear();
}

/**
 * Normalizes an arbitrary GLB: different authors export different units,
 * origins and pivots, so every model is measured and then re-seated with its
 * base on the ground and its footprint centred on the geographic anchor.
 */
function normalizeModel(model: THREE.Object3D, targetHeightMeters: number, scaleMultiplier: number) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const height = Math.max(size.y, 0.0001);
  const fitScale = (targetHeightMeters / height) * (scaleMultiplier || 1);

  // Re-seat in the model's own units, *then* scale — so the offsets scale too.
  model.position.set(-center.x, -box.min.y, -center.z);
  model.scale.setScalar(fitScale);

  // Wrapping keeps the re-seating independent of the rotation applied above it.
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

function buildPlaceholder(colorHex: number): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.75,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, PLACEHOLDER_HEIGHT_METERS, 20),
    material,
  );
  mesh.position.y = PLACEHOLDER_HEIGHT_METERS / 2;
  return { mesh, material };
}

function buildHighlight(colorHex: number): {
  group: THREE.Group;
  disc: THREE.Mesh;
  ring: THREE.Mesh;
  materials: THREE.Material[];
} {
  const group = new THREE.Group();
  const discMaterial = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), discMaterial);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 40), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;

  group.add(disc, ring);
  return { group, disc, ring, materials: [discMaterial, ringMaterial] };
}

export type GroundedItem = {
  /** Stable place key, e.g. `"attraction:<uuid>"`. Carried on the 3D object itself
   *  so a click resolves to the exact place, never to "whichever marker is nearest". */
  id: string;
  lat: number;
  lng: number;
  /** Omit for a coloured placeholder shape instead of a custom model. */
  modelUrl?: string | null;
  /** CSS hex, e.g. "#8b5cf6" — placeholder + ground highlight colour. */
  color: string;
  /** Locked places render grey/silhouetted; unlocked render full-colour. */
  locked: boolean;
  /** Draws attention to the guest's current itinerary target. */
  highlighted?: boolean;
  targetHeightMeters?: number;
  rotationDeg?: number;
  elevationOffsetMeters?: number;
  scaleMultiplier?: number;
};

type PlacedObject = {
  item: GroundedItem;
  root: THREE.Group;
  /** Holds the model/placeholder; carries the configured rotation + elevation. */
  modelGroup: THREE.Group;
  highlight: THREE.Group;
  highlightRing: THREE.Mesh;
  /** Resources this placement created itself and must dispose — never cached GLB resources. */
  ownedMaterials: THREE.Material[];
  ownedGeometries: THREE.BufferGeometry[];
  placeholderMaterial?: THREE.MeshStandardMaterial;
  colorHex: number;
  hasCustomModel: boolean;
  /** Set once the async GLB clone has been attached. */
  loaded: boolean;
  /** Guards against a late GLB load attaching to an object that was already removed. */
  disposed: boolean;
};

function lockedMaterialFor(source: THREE.Material): THREE.Material {
  const grey = new THREE.MeshStandardMaterial({
    color: GREY,
    roughness: 0.95,
    metalness: 0.02,
    transparent: source.transparent,
    opacity: source.opacity,
  });
  return grey;
}

export class GroundedScene implements mapboxgl.CustomLayerInterface {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map?: mapboxgl.Map;
  private gl?: WebGL2RenderingContext;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer?: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private placed = new Map<string, PlacedObject>();
  /** The desired contents, kept outside `placed` so a style reload (which tears
   *  the layer down and re-adds it) can rebuild the scene from scratch. */
  private items: GroundedItem[] = [];
  private added = false;
  /** Latest Mapbox frame matrix, kept for hit-testing between frames. */
  private lastMatrix = new THREE.Matrix4();
  private raycaster = new THREE.Raycaster();

  private handleResize = () => {
    // three.js caches its drawing-buffer size and never re-reads it. Without
    // this the renderer keeps drawing at the old size after a resize or an
    // orientation change, which visibly shifts every object on screen.
    if (this.renderer && this.gl) {
      this.renderer.setSize(this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, false);
    }
  };

  constructor(id: string) {
    this.id = id;
  }

  onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    this.added = true;
    liveSceneCount += 1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    this.scene.add(
      new THREE.AmbientLight(0xffffff, 1.5),
      directional(0xffffff, 2.2, 0.5, -1, 0.8),
      directional(0xffffff, 1.0, -0.6, 1, 0.4),
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    map.on("resize", this.handleResize);

    // `placed` was emptied by the previous `onRemove`; rebuild from `items`.
    this.placed.clear();
    this.sync(this.items);
  }

  /** Reconciles the placed objects against `items`. Safe to call before `onAdd`. */
  sync(items: GroundedItem[]) {
    this.items = items;
    if (!this.added) return;

    const nextIds = new Set(items.map((item) => item.id));
    for (const [id, placed] of this.placed) {
      if (!nextIds.has(id)) {
        this.removePlaced(id, placed);
      }
    }

    for (const item of items) {
      const existing = this.placed.get(item.id);
      if (!existing) {
        this.addItem(item);
        continue;
      }
      // Position or model changed: rebuild. Anything else updates in place.
      if (
        existing.item.lat !== item.lat ||
        existing.item.lng !== item.lng ||
        (existing.item.modelUrl ?? null) !== (item.modelUrl ?? null) ||
        existing.item.targetHeightMeters !== item.targetHeightMeters ||
        existing.item.scaleMultiplier !== item.scaleMultiplier
      ) {
        this.removePlaced(item.id, existing);
        this.addItem(item);
        continue;
      }
      if (existing.item.locked !== item.locked) this.applyLocked(existing, item.locked);
      if (existing.item.rotationDeg !== item.rotationDeg) {
        existing.modelGroup.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg ?? 0);
      }
      if (existing.item.elevationOffsetMeters !== item.elevationOffsetMeters) {
        existing.modelGroup.position.y = item.elevationOffsetMeters ?? 0;
      }
      existing.item = item;
    }

    this.map?.triggerRepaint();
  }

  private addItem(item: GroundedItem) {
    // Mapbox's own conversion when it's available; the pure implementation in
    // `anchor.ts` is identical and is what the tests exercise.
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat([item.lng, item.lat], 0);
    const metersToMercator = mercator.meterInMercatorCoordinateUnits();

    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.matrix.copy(buildAnchorMatrix(mercator, metersToMercator));

    const colorHex = new THREE.Color(item.color).getHex();
    const modelGroup = new THREE.Group();
    modelGroup.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg ?? 0);
    modelGroup.position.y = item.elevationOffsetMeters ?? 0;

    const highlight = buildHighlight(item.locked ? GREY : colorHex);
    root.add(modelGroup, highlight.group);

    const placed: PlacedObject = {
      item,
      root,
      modelGroup,
      highlight: highlight.group,
      highlightRing: highlight.ring,
      ownedMaterials: [...highlight.materials],
      ownedGeometries: [highlight.disc.geometry, highlight.ring.geometry],
      colorHex,
      hasCustomModel: !!item.modelUrl,
      loaded: false,
      disposed: false,
    };

    // Every mesh carries its place key, so picking is exact rather than spatial.
    root.userData.placeId = item.id;

    if (item.modelUrl) {
      loadModel(item.modelUrl)
        .then((source) => {
          if (placed.disposed) return;
          const clone = source.clone(true);
          const wrapper = normalizeModel(
            clone,
            item.targetHeightMeters ?? 8,
            item.scaleMultiplier ?? 1,
          );
          wrapper.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.userData.placeId = item.id;
              child.userData.originalMaterial = child.material;
            }
          });
          placed.modelGroup.add(wrapper);
          placed.loaded = true;
          if (placed.item.locked) this.applyLocked(placed, true);
          this.map?.triggerRepaint();
        })
        .catch(() => {
          // A broken/missing GLB must not take the map down — fall back to the
          // placeholder shape so the place is still visible and clickable.
          if (placed.disposed) return;
          const placeholder = buildPlaceholder(placed.item.locked ? GREY : colorHex);
          placeholder.mesh.userData.placeId = item.id;
          placed.modelGroup.add(placeholder.mesh);
          placed.placeholderMaterial = placeholder.material;
          placed.ownedMaterials.push(placeholder.material);
          placed.ownedGeometries.push(placeholder.mesh.geometry);
          placed.hasCustomModel = false;
          placed.loaded = true;
          this.map?.triggerRepaint();
        });
    } else {
      const placeholder = buildPlaceholder(item.locked ? GREY : colorHex);
      placeholder.mesh.userData.placeId = item.id;
      modelGroup.add(placeholder.mesh);
      placed.placeholderMaterial = placeholder.material;
      placed.ownedMaterials.push(placeholder.material);
      placed.ownedGeometries.push(placeholder.mesh.geometry);
      placed.loaded = true;
    }

    this.scene.add(root);
    this.placed.set(item.id, placed);
  }

  private applyLocked(placed: PlacedObject, locked: boolean) {
    placed.item = { ...placed.item, locked };

    if (placed.hasCustomModel) {
      placed.modelGroup.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const original = child.userData.originalMaterial as THREE.Material | undefined;
        if (locked) {
          if (!child.userData.lockedMaterial && original) {
            const grey = lockedMaterialFor(original);
            child.userData.lockedMaterial = grey;
            placed.ownedMaterials.push(grey);
          }
          if (child.userData.lockedMaterial) child.material = child.userData.lockedMaterial;
        } else if (original) {
          child.material = original;
        }
      });
    } else {
      placed.placeholderMaterial?.color.setHex(locked ? GREY : placed.colorHex);
    }

    const highlightHex = locked ? GREY : placed.colorHex;
    placed.highlight.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshBasicMaterial).color.setHex(highlightHex);
      }
    });
  }

  private removePlaced(id: string, placed: PlacedObject) {
    placed.disposed = true;
    this.scene.remove(placed.root);
    for (const material of placed.ownedMaterials) material.dispose();
    for (const geometry of placed.ownedGeometries) geometry.dispose();
    this.placed.delete(id);
  }

  /**
   * True ray/geometry hit-testing against the actual 3D meshes. The ray is
   * built by inverting Mapbox's own frame matrix, so it agrees exactly with
   * what is drawn no matter the pitch or bearing.
   */
  pick(screenX: number, screenY: number): string | null {
    const map = this.map;
    if (!map || this.placed.size === 0) return null;

    const canvas = map.getCanvas();
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -((screenY / height) * 2 - 1);

    const inverse = new THREE.Matrix4().copy(this.lastMatrix).invert();
    const near = new THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(inverse);
    const far = new THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(inverse);
    const direction = far.sub(near).normalize();

    this.raycaster.set(near, direction);
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;

    this.scene.updateMatrixWorld(true);
    const roots = [...this.placed.values()].map((placed) => placed.root);
    const hits = this.raycaster.intersectObjects(roots, true);

    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        const placeId = node.userData?.placeId;
        if (typeof placeId === "string") return placeId;
        node = node.parent;
      }
    }
    return null;
  }

  render(_gl: WebGL2RenderingContext, matrix: Array<number> | Float32Array) {
    if (!this.renderer) return;

    // The ONLY thing the camera gets is Mapbox's frame matrix. Object
    // transforms live on the objects, which is what keeps them pinned to the
    // ground when the camera moves.
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(Array.from(matrix));
    this.lastMatrix.copy(this.camera.projectionMatrix);

    const elapsed = this.clock.getElapsedTime();
    let animating = false;

    for (const placed of this.placed.values()) {
      if (!placed.item.locked && placed.loaded) {
        // Unlocked places get a slow turn so they read as "alive"/collected.
        const base = THREE.MathUtils.degToRad(placed.item.rotationDeg ?? 0);
        placed.modelGroup.rotation.y = base + elapsed * 0.25;
        animating = true;
      }
      if (placed.item.highlighted) {
        const pulse = 1 + Math.sin(elapsed * 2.4) * 0.12;
        placed.highlightRing.scale.set(pulse, pulse, 1);
        animating = true;
      } else {
        placed.highlightRing.scale.set(1, 1, 1);
      }
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // Only keep the frame loop alive while something is actually moving.
    if (animating) this.map?.triggerRepaint();
  }

  onRemove() {
    this.added = false;
    this.map?.off("resize", this.handleResize);

    for (const [id, placed] of [...this.placed]) {
      this.removePlaced(id, placed);
    }
    this.scene.clear();

    // The renderer shares the map's GL context and canvas; `dispose()` releases
    // three.js's own programs/buffers without destroying Mapbox's context.
    this.renderer?.dispose();
    this.renderer = undefined;

    liveSceneCount = Math.max(0, liveSceneCount - 1);
    if (liveSceneCount === 0) releaseModelCache();
  }
}

function directional(color: number, intensity: number, x: number, y: number, z: number) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(x, y, z).normalize();
  return light;
}
