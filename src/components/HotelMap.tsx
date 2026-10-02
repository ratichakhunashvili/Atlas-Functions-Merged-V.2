"use client";

import { useMemo, useState } from "react";
// Aliased: an unqualified `Map` import would shadow the global `Map` constructor.
import MapGL, { Marker, Popup, NavigationControl, Source, Layer } from "react-map-gl/mapbox";
import Image from "next/image";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { CATEGORY_COLORS, CATEGORY_LABELS, type Category } from "@/lib/partner-category";
import { placeKey, type PlaceType } from "@/lib/place";
import type { RouteLineString } from "@/lib/route-engine";
import dynamic from "next/dynamic";
import GroundedLayer, { type GroundedItem } from "@/components/map3d/GroundedLayer";
import { Badge } from "@/components/ui";
import { CubeIcon } from "@/components/icons";

// WebGL-only, and only needed once someone opens a place — keep it out of the
// initial bundle and away from SSR.
const ModelViewer = dynamic(() => import("@/components/ModelViewer"), { ssr: false });

const HOTEL_COLOR = "#0f172a";

export type MapPlace = {
  id: string;
  placeType: PlaceType;
  name: string;
  description: string | null;
  category: Category | null;
  photoPath: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  contactPhone?: string | null;
  contactWebsite?: string | null;
  modelPath: string | null;
  model3dEnabled: boolean;
  modelTargetHeightMeters: number;
  modelRotationDeg: number;
  modelElevationOffsetMeters: number;
  modelScaleMultiplier: number;
  /** Null when the place has no achievement configured. */
  achievementName: string | null;
};

export type RouteStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  position: number;
  visitedAt: Date | null;
  sourceId: string | null;
  stopType: string;
};

export type MapRoute = {
  legGeoJson: RouteLineString | null;
  /** Set when the walking route couldn't be loaded — shown instead of a fake line. */
  legError: string | null;
  stops: RouteStop[];
  destinationName: string | null;
};

export default function HotelMap({
  center,
  hotelName,
  places,
  route,
  unlockedKeys,
  /** The place the guest is walking to right now — gets a pulsing ground ring. */
  currentPlaceKey,
}: {
  center: { lat: number; lng: number };
  hotelName: string;
  places: MapPlace[];
  route: MapRoute | null;
  unlockedKeys: string[];
  currentPlaceKey: string | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** The place whose standalone 3D viewer is open, if any. */
  const [viewerKey, setViewerKey] = useState<string | null>(null);

  const unlocked = useMemo(() => new Set(unlockedKeys), [unlockedKeys]);

  const byKey = useMemo(() => {
    const map = new Map<string, MapPlace>();
    for (const place of places) map.set(placeKey(place.placeType, place.id), place);
    return map;
  }, [places]);

  // Memoized so the 3D layer only re-syncs when the data genuinely changes —
  // a React re-render on its own must never rebuild the WebGL scene.
  const groundedItems = useMemo<GroundedItem[]>(
    () =>
      places
        .filter((place) => place.model3dEnabled)
        .map((place) => {
          const key = placeKey(place.placeType, place.id);
          return {
            id: key,
            lat: place.latitude,
            lng: place.longitude,
            modelUrl: place.modelPath,
            color:
              place.placeType === "hotel"
                ? HOTEL_COLOR
                : CATEGORY_COLORS[place.category ?? "other"],
            locked: !unlocked.has(key),
            highlighted: key === currentPlaceKey,
            targetHeightMeters: place.modelTargetHeightMeters,
            rotationDeg: place.modelRotationDeg,
            elevationOffsetMeters: place.modelElevationOffsetMeters,
            scaleMultiplier: place.modelScaleMultiplier,
          };
        }),
    [places, unlocked, currentPlaceKey],
  );

  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;
  const viewer = viewerKey ? byKey.get(viewerKey) ?? null : null;
  const viewerUnlocked = viewerKey ? unlocked.has(viewerKey) : false;

  return (
    <div className="relative h-[60vh] min-h-[22rem] w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <MapGL
        // Uncontrolled on purpose: the camera must not jump back when the route
        // or the itinerary state updates.
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: 15.5,
          pitch: 50,
          bearing: -20,
        }}
        mapboxAccessToken={MAPBOX_TOKEN || undefined}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
        maxPitch={75}
      >
        <NavigationControl position="top-right" visualizePitch />

        <GroundedLayer layerId="places-3d" items={groundedItems} onPick={setSelectedKey} />

        {route?.legGeoJson && (
          <Source
            id="current-leg"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: route.legGeoJson }}
          >
            <Layer
              id="current-leg-casing"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{ "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 }}
            />
            <Layer
              id="current-leg-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{ "line-color": "#4f46e5", "line-width": 5 }}
            />
          </Source>
        )}

        {places.map((place) => {
          const key = placeKey(place.placeType, place.id);
          const color =
            place.placeType === "hotel"
              ? HOTEL_COLOR
              : CATEGORY_COLORS[place.category ?? "other"];
          return (
            <Marker
              key={key}
              longitude={place.longitude}
              latitude={place.latitude}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelectedKey(key);
              }}
            >
              <div
                title={place.name}
                style={{ backgroundColor: color }}
                className={`h-4 w-4 cursor-pointer rounded-full border-2 shadow ${
                  unlocked.has(key) ? "border-white" : "border-white/60 opacity-70"
                } ${key === currentPlaceKey ? "ring-4 ring-indigo-400/60" : ""}`}
              />
            </Marker>
          );
        })}

        {route?.stops.map((stop) => (
          <Marker key={`stop-${stop.id}`} longitude={stop.longitude} latitude={stop.latitude}>
            <div
              title={stop.name}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold shadow ${
                stop.visitedAt
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-indigo-600 bg-white text-indigo-600"
              }`}
            >
              {stop.visitedAt ? "✓" : stop.position + 1}
            </div>
          </Marker>
        ))}

        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            onClose={() => setSelectedKey(null)}
            closeOnClick={false}
            anchor="bottom"
            offset={18}
            maxWidth="260px"
          >
            <PlaceCard
              place={selected}
              unlocked={unlocked.has(placeKey(selected.placeType, selected.id))}
              isCurrentTarget={placeKey(selected.placeType, selected.id) === currentPlaceKey}
              onOpenViewer={() => setViewerKey(selectedKey)}
            />
          </Popup>
        )}
      </MapGL>

      {viewer?.modelPath && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`3D view of ${viewer.name}`}
          className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-4"
          onClick={() => setViewerKey(null)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{viewer.name}</p>
                <p className="text-xs text-zinc-500">
                  {viewerUnlocked ? "Drag to turn it around" : "Check in here to reveal it"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewerKey(null)}
                aria-label="Close 3D view"
                className="shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <ModelViewer
              modelUrl={viewer.modelPath}
              locked={!viewerUnlocked}
              className="aspect-square w-full"
            />
          </div>
        </div>
      )}

      {route?.legError && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-red-600/95 px-3 py-2 text-xs text-white shadow-lg">
          {route.legError}
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-700 shadow dark:bg-zinc-900/90 dark:text-zinc-200">
        {hotelName}
      </div>
    </div>
  );
}

function PlaceCard({
  place,
  unlocked,
  isCurrentTarget,
  onOpenViewer,
}: {
  place: MapPlace;
  unlocked: boolean;
  isCurrentTarget: boolean;
  onOpenViewer: () => void;
}) {
  return (
    <div className="w-56 space-y-1.5 text-zinc-900">
      {place.photoPath && (
        <div className="relative h-24 w-full overflow-hidden rounded-lg">
          <Image
            src={place.photoPath}
            alt=""
            fill
            sizes="224px"
            className={`object-cover ${unlocked ? "" : "grayscale"}`}
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">{place.name}</p>
        <Badge tone={unlocked ? "green" : "neutral"}>{unlocked ? "Unlocked" : "Locked"}</Badge>
      </div>
      <p className="text-xs font-medium text-zinc-500">
        {place.placeType === "hotel"
          ? "Your hotel"
          : place.category
            ? CATEGORY_LABELS[place.category]
            : place.placeType}
      </p>
      {isCurrentTarget && (
        <p className="text-xs font-semibold text-indigo-600">Your next stop</p>
      )}
      {place.description && <p className="text-xs text-zinc-600">{place.description}</p>}
      {place.address && <p className="text-xs text-zinc-500">{place.address}</p>}
      {place.contactPhone && <p className="text-xs text-zinc-500">{place.contactPhone}</p>}
      {place.contactWebsite && (
        <a
          href={place.contactWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-600 underline"
        >
          Website
        </a>
      )}
      {place.achievementName && (
        <p className="text-xs text-amber-700">
          {unlocked ? "🏅 " : "🔒 "}
          {place.achievementName}
        </p>
      )}
      {place.modelPath && (
        <button
          type="button"
          onClick={onOpenViewer}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          <CubeIcon className="h-3.5 w-3.5" />
          View in 3D
        </button>
      )}
    </div>
  );
}
