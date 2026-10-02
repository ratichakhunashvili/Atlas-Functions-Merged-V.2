"use client";

import { useCallback, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import type { MapMouseEvent, MarkerDragEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

export default function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number };
  onChange: (next: { lat: number; lng: number }) => void;
}) {
  const [viewState, setViewState] = useState({
    longitude: value.lng,
    latitude: value.lat,
    zoom: 14,
  });

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    },
    [onChange],
  );

  const handleDragEnd = useCallback(
    (e: MarkerDragEvent) => {
      onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    },
    [onChange],
  );

  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700">
      <Map
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        onClick={handleClick}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" />
        <Marker
          longitude={value.lng}
          latitude={value.lat}
          draggable
          onDragEnd={handleDragEnd}
        />
      </Map>
    </div>
  );
}
