"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LockIcon } from "@/components/icons";

/**
 * Standalone, orbitable 3D viewer for a single model.
 *
 * Deliberately NOT the same thing as the georeferenced map layer: this one has
 * its own canvas and its own camera that the viewer drives, and it knows
 * nothing about Mercator or geography. The map layer renders a place where it
 * stands in the world; this renders a place as an object you can turn around.
 *
 * Written against plain three.js rather than react-three-fiber so it shares the
 * loader and conventions already used by `lib/map3d` and adds no dependencies.
 */
export default function ModelViewer({
  modelUrl,
  locked,
  className = "",
}: {
  modelUrl: string;
  locked: boolean;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(
      new THREE.AmbientLight(0xffffff, 1.6),
      light(0xffffff, 2.0, 3, 5, 2),
      light(0xffffff, 0.7, -3, -2, -2),
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;

    // Owned by this component, so safe to dispose on unmount — unlike the
    // shared GLB cache the map layer uses.
    const owned: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } = {
      geometries: [],
      materials: [],
    };

    let frame = 0;
    let disposed = false;

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Normalize: centre it and scale so any model fills the frame alike.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(centre);
        const extent = Math.max(size.x, size.y, size.z) || 1;
        model.position.sub(centre);
        model.scale.setScalar(1 / extent);

        if (locked) {
          const grey = new THREE.MeshStandardMaterial({
            color: 0x9ca3af,
            roughness: 0.95,
            metalness: 0.05,
          });
          owned.materials.push(grey);
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) child.material = grey;
          });
        }

        scene.add(model);
        camera.position.set(0, 0.35, 2.2);
        controls.update();
        setStatus("ready");
      },
      undefined,
      () => {
        if (!disposed) setStatus("error");
      },
    );

    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            material.dispose();
          }
        }
      });
      for (const material of owned.materials) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, locked]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800 ${className}`}>
      <div ref={mountRef} className="h-full w-full" />

      {status === "loading" && (
        <p className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
          Loading model…
        </p>
      )}
      {status === "error" && (
        <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-zinc-500">
          This model couldn&apos;t be loaded.
        </p>
      )}
      {locked && status === "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-zinc-900/70 p-3">
            <LockIcon className="h-6 w-6 text-white" />
          </span>
        </div>
      )}
    </div>
  );
}

function light(color: number, intensity: number, x: number, y: number, z: number) {
  const directional = new THREE.DirectionalLight(color, intensity);
  directional.position.set(x, y, z);
  return directional;
}
