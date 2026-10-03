"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, NavigationControl, GeolocateControl } from "react-map-gl/mapbox";
import type {
  MapMouseEvent,
  MarkerDragEvent,
  GeolocateResultEvent,
  GeolocateErrorEvent,
  GeolocateControlInstance,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  describeGeolocateError,
  isGeolocationAvailable,
  GEOLOCATION_UNAVAILABLE_MESSAGE,
} from "@/lib/geolocate";
import { PinIcon } from "@/components/icons";

type LocateStatus = "locating" | "located" | "error" | "unavailable";

/** Shown if neither a success nor an error ever arrives — the genuinely silent
 *  failure mode, usually an OS-level location toggle the browser doesn't
 *  surface as a proper permission error at all. */
const SILENT_FAILURE_TIMEOUT_MS = 12000;

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
  // "locating" is the optimistic default so the server-rendered markup and the
  // client's first hydration pass agree — `isGeolocationAvailable()` reads
  // `window`, which doesn't exist on the server, so it can only be checked
  // after mount, in the effect below, never inline during render.
  const [status, setStatus] = useState<LocateStatus>("locating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const geolocateRef = useRef<GeolocateControlInstance>(null);
  // Places the pin on the FIRST fix after activating, then stays out of the
  // way — `trackUserLocation` keeps refining the blue dot in the background
  // for visual confidence, but must not keep yanking the pin back to a live
  // GPS fix every few seconds while someone is mid-drag fine-tuning it by hand.
  const hasPlacedFromGeolocate = useRef(false);

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

  const handleGeolocate = useCallback(
    (event: GeolocateResultEvent) => {
      setStatus("located");
      setErrorMessage(null);
      if (hasPlacedFromGeolocate.current) return;
      hasPlacedFromGeolocate.current = true;
      onChange({ lat: event.coords.latitude, lng: event.coords.longitude });
    },
    [onChange],
  );

  const handleGeolocateError = useCallback((event: GeolocateErrorEvent) => {
    setStatus("error");
    setErrorMessage(describeGeolocateError(event));
  }, []);

  // Ask for the admin's location as soon as this map is ready, rather than
  // leaving it to them to notice and click a small icon — the entire point of
  // this control is "place a pin relative to where I'm standing", so the
  // permission prompt firing immediately is expected here, not an unwelcome
  // surprise the way it might be on a page that isn't about location at all.
  useEffect(() => {
    if (!isGeolocationAvailable()) {
      // Reads `window`, so it can only be checked after mount — the server
      // (and the client's first hydration pass) always render the optimistic
      // "locating" default above. A one-time read of a browser-only
      // capability, not state derived from render inputs the way this lint
      // rule usually guards against.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unavailable");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const tryTrigger = () => {
      if (cancelled) return;
      // `trigger()` returns false if the control hasn't finished mounting onto
      // the map yet — a real race on first render, not a failure — so retry
      // briefly rather than giving up after one attempt.
      if (geolocateRef.current?.trigger() || attempts >= 20) return;
      attempts += 1;
      setTimeout(tryTrigger, 150);
    };
    tryTrigger();

    // If the browser never calls back at all — neither success nor error —
    // that's a real failure mode (most often an OS-level location toggle the
    // browser doesn't report as a normal permission error), and "Finding your
    // location…" forever with no explanation is worse than no feedback.
    const silentFailureTimer = setTimeout(() => {
      setStatus((current) => {
        if (current !== "locating") return current;
        setErrorMessage(
          "Your device never responded. Check that location is turned on for this browser — on Windows: Settings → Privacy & security → Location — then try again.",
        );
        return "error";
      });
    }, SILENT_FAILURE_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(silentFailureTimer);
    };
  }, []);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700">
      <Map
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        onClick={handleClick}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" />

        {/* Omitted entirely rather than shown disabled when geolocation can
         * never work here (e.g. an insecure origin) — a button that can only
         * ever fail is worse than no button, with the reason explained below
         * instead. */}
        {status !== "unavailable" && (
          <GeolocateControl
            ref={geolocateRef}
            position="top-right"
            trackUserLocation
            showUserHeading
            showAccuracyCircle
            positionOptions={{ enableHighAccuracy: true }}
            onGeolocate={handleGeolocate}
            onTrackUserLocationEnd={() => {
              hasPlacedFromGeolocate.current = false;
            }}
            onError={handleGeolocateError}
          />
        )}

        <Marker longitude={value.lng} latitude={value.lat} draggable onDragEnd={handleDragEnd} />
      </Map>

      <div className="pointer-events-none absolute left-2 top-2 max-w-[75%] rounded-lg bg-white/90 px-2 py-1 text-[11px] leading-tight text-zinc-600 shadow dark:bg-zinc-900/90 dark:text-zinc-300">
        {status === "located" && (
          <>
            <PinIcon className="inline h-3 w-3 align-text-bottom text-emerald-600" /> Pin placed
            at your location — drag to fine-tune
          </>
        )}
        {status === "unavailable" && (
          <>
            <PinIcon className="inline h-3 w-3 align-text-bottom text-amber-600" /> Your location
            isn&apos;t available here
          </>
        )}
        {status === "error" && (
          <>
            <PinIcon className="inline h-3 w-3 align-text-bottom text-red-600" /> Couldn&apos;t get
            your location
          </>
        )}
        {status === "locating" && (
          <>
            <PinIcon className="inline h-3 w-3 align-text-bottom" /> Finding your location…
          </>
        )}
      </div>

      {(errorMessage || status === "unavailable") && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-amber-600/95 px-2.5 py-1.5 text-xs text-white shadow-lg">
          {errorMessage ?? GEOLOCATION_UNAVAILABLE_MESSAGE}
        </div>
      )}
    </div>
  );
}
