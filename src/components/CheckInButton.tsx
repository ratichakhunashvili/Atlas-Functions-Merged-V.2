"use client";

import { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { checkInStop } from "@/actions/check-in";
import type { CheckInOutcome } from "@/lib/check-in";
import type { VerificationMode } from "@/lib/place";
import { CameraIcon, PinIcon, QrIcon } from "@/components/icons";

// Camera APIs are browser-only — never evaluate these during SSR.
const QRScannerModal = dynamic(() => import("@/components/QRScannerModal"), { ssr: false });
const ArVerifierModal = dynamic(() => import("@/components/ArVerifierModal"), { ssr: false });

const LABELS: Record<VerificationMode, { idle: string; busy: string }> = {
  gps: { idle: "Check in here", busy: "Checking location…" },
  qr: { idle: "Scan QR", busy: "Verifying…" },
  ar: { idle: "Open AR", busy: "Verifying…" },
};

/**
 * The guest's single check-in control. Which evidence it gathers depends on the
 * stop's verification mode, but all three paths end in the same server action,
 * which completes the stop, unlocks the place, grants the achievement and
 * advances the itinerary in one go.
 */
export default function CheckInButton({
  stopId,
  stopName,
  mode,
  arTargetPath,
  onResult,
}: {
  stopId: string;
  stopName: string;
  mode: VerificationMode;
  arTargetPath: string | null;
  onResult: (outcome: CheckInOutcome) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);

  const finish = useCallback(
    (outcome: CheckInOutcome) => {
      if (outcome.ok) {
        setError(null);
        onResult(outcome);
        router.refresh();
      } else {
        setError(outcome.error);
      }
    },
    [onResult, router],
  );

  /** Reads a fresh fix right before submitting, rather than trusting a stale one. */
  const readPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("This browser doesn't support location."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
    });

  const handleGps = () => {
    setError(null);
    startTransition(async () => {
      try {
        const position = await readPosition();
        finish(
          await checkInStop(stopId, {
            mode: "gps",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        );
      } catch (cause) {
        setError(
          cause instanceof GeolocationPositionError && cause.code === cause.PERMISSION_DENIED
            ? "Location access was denied — allow it to check in here."
            : "Couldn't get your location. Move somewhere with a clearer signal and try again.",
        );
      }
    });
  };

  const handleScan = (scannedText: string) => {
    setScannerOpen(false);
    setError(null);
    startTransition(async () => {
      finish(await checkInStop(stopId, { mode: "qr", scannedText }));
    });
  };

  /** Returns an error to keep the AR camera scanning, or null once verified. */
  const handleArFrame = async (frameHash: string): Promise<string | null> => {
    let position: GeolocationPosition;
    try {
      position = await readPosition();
    } catch {
      return "Allow location access — AR check-in also confirms you're on site.";
    }

    const outcome = await checkInStop(stopId, {
      mode: "ar",
      frameHash,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    if (outcome.ok) {
      setArOpen(false);
      finish(outcome);
      return null;
    }
    return outcome.error;
  };

  const label = LABELS[mode];
  const Icon = mode === "gps" ? PinIcon : mode === "qr" ? QrIcon : CameraIcon;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (mode === "gps") handleGps();
          else if (mode === "qr") setScannerOpen(true);
          else setArOpen(true);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        <Icon className="h-3.5 w-3.5" />
        {pending ? label.busy : label.idle}
      </button>

      {error && <p className="max-w-[18rem] text-right text-xs text-red-600">{error}</p>}

      {scannerOpen && (
        <QRScannerModal
          title={`Scan the code at ${stopName}`}
          hint="Point your camera at the QR code displayed at this location."
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
        />
      )}

      {arOpen && (
        <ArVerifierModal
          placeName={stopName}
          referenceImagePath={arTargetPath}
          onClose={() => setArOpen(false)}
          onFrame={handleArFrame}
        />
      )}
    </div>
  );
}
