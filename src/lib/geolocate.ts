import type { GeolocateErrorEvent } from "react-map-gl/mapbox";

/**
 * Shared across every map in the app (the guest hotel map, the admin location
 * picker) so a permission-denied or timeout message reads the same wherever
 * it's shown, and so the three-way switch on `GeolocationPositionError.code`
 * exists in exactly one place.
 */
export function describeGeolocateError(event: GeolocateErrorEvent): string {
  switch (event.code) {
    case event.PERMISSION_DENIED:
      return "Location access was denied — allow it for this site in your browser's settings, then try again.";
    case event.TIMEOUT:
      return "Finding your location is taking a while — move somewhere with a clearer signal and try again.";
    default:
      // GeolocationPositionError.POSITION_UNAVAILABLE (code 2) is what a
      // browser reports when it asked the OS for a location and got nothing
      // back — most often because location services are turned off at the
      // operating-system level, not because of anything the site did. Windows
      // in particular has its own separate "Location" privacy toggle that
      // blocks every browser until it's turned on, which is easy to miss
      // since the browser's own site permission can show as "allowed".
      return "Your device didn't return a location. On Windows, check Settings → Privacy & security → Location is turned on for this app/browser, then try again.";
  }
}

/**
 * The Geolocation API only works in a "secure context" — HTTPS, or the
 * special-cased `localhost` — never a bare network IP over plain HTTP. Next's
 * own dev server prints such an IP (the "Network:" URL) for testing from a
 * phone on the same Wi-Fi, which makes this an easy trap: the map loads fine,
 * but the browser silently refuses to ever ask for a location from that origin.
 *
 * Checked once, client-side, so a dead button is never shown where it could
 * never have worked — the explanation below is shown in its place instead.
 */
export function isGeolocationAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    "geolocation" in navigator
  );
}

export const GEOLOCATION_UNAVAILABLE_MESSAGE =
  "Your location can't be used on this page because it isn't loaded securely. Open it as http://localhost (not a network IP like 10.x.x.x) on this computer, or over https, to use your location here.";
