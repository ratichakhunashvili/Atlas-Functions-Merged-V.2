"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "mapbox-gl";
import { GroundedScene, type GroundedItem } from "@/lib/map3d/GroundedScene";

export type { GroundedItem };

/**
 * Mounts a single georeferenced 3D layer and keeps it in sync with `items`.
 *
 * The Mapbox map is treated as a long-lived imperative object: the scene is
 * created once per `layerId` and merely *told* about data changes, so React
 * re-renders never rebuild the WebGL scene. Custom layers are destroyed by
 * Mapbox whenever the style reloads, so this also re-adds the layer on
 * `style.load` — the scene remembers its contents and repopulates itself.
 */
export default function GroundedLayer({
  layerId,
  items,
  onPick,
}: {
  layerId: string;
  items: GroundedItem[];
  onPick?: (placeId: string | null) => void;
}) {
  const { current: mapRef } = useMap();
  const sceneRef = useRef<GroundedScene | null>(null);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();

    // One scene per layer id, reused across style reloads and re-renders.
    const scene = sceneRef.current ?? new GroundedScene(layerId);
    sceneRef.current = scene;

    const ensureLayer = () => {
      if (!map.getLayer(layerId)) {
        try {
          map.addLayer(scene);
        } catch {
          // The style can still be settling; `style.load` will retry.
        }
      }
    };

    if (map.isStyleLoaded()) ensureLayer();
    map.on("style.load", ensureLayer);

    const handleClick = (event: MapMouseEvent) => {
      const handler = onPickRef.current;
      if (!handler) return;
      handler(scene.pick(event.point.x, event.point.y));
    };
    map.on("click", handleClick);

    return () => {
      map.off("style.load", ensureLayer);
      map.off("click", handleClick);
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch {
        // The map may already be tearing down.
      }
      sceneRef.current = null;
    };
  }, [mapRef, layerId]);

  useEffect(() => {
    sceneRef.current?.sync(items);
  }, [items]);

  return null;
}
