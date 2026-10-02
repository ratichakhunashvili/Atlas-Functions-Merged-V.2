"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const REGION_ID = "qr-scanner-region";

/** html5-qrcode calls its internal camera <video> element's .play() without
 * handling the returned promise. If that element is torn down (e.g. we stop
 * the scanner right after a successful scan) while play() is still
 * pending, the browser rejects it with this AbortError — benign, but
 * Next's dev overlay treats the unhandled rejection as a fatal error.
 * Swallow only this specific, known rejection while the scanner is mounted. */
function isBenignPlayAbort(reason: unknown): boolean {
  return (
    reason instanceof DOMException &&
    reason.name === "AbortError" &&
    reason.message.includes("play() request was interrupted")
  );
}

/** scanner.stop() throws *synchronously* (not a rejected promise) when the
 * scanner isn't currently running, so a chained .catch() alone can't guard
 * it — it needs a real try/catch around the call itself. */
function safeStop(scanner: Html5Qrcode) {
  try {
    scanner
      .stop()
      .catch(() => {})
      .finally(() => {
        try {
          scanner.clear();
        } catch {
          // ignore
        }
      });
  } catch {
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }
}

export default function QRScannerModal({
  onClose,
  onScan,
  title = "Scan a hotel's QR code",
  hint = "Point your camera at the QR code at the hotel's front desk.",
}: {
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
  hint?: string;
}) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignPlayAbort(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const scanner = new Html5Qrcode(REGION_ID);
    let stopped = false;
    let running = false;

    const stopIfRunning = () => {
      if (running) {
        running = false;
        safeStop(scanner);
      }
    };

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (stopped) return;
          stopped = true;
          stopIfRunning();
          onScanRef.current(decodedText);
        },
        () => {},
      )
      .then(() => {
        running = true;
        // The modal may have already been closed while the camera was
        // still starting up — stop it now instead of leaving it running.
        if (stopped) {
          stopIfRunning();
        }
      })
      .catch((err) => {
        console.error("Unable to start camera for QR scanning", err);
      });

    return () => {
      stopped = true;
      startPromise.finally(() => {
        stopIfRunning();
        // Stopping the camera can trigger a trailing, already in-flight
        // play() rejection asynchronously — keep the listener around for a
        // moment after that instead of removing it immediately, or it
        // would be gone before that rejection ever fires.
        setTimeout(() => {
          window.removeEventListener(
            "unhandledrejection",
            handleUnhandledRejection,
          );
        }, 1000);
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>
        <div id={REGION_ID} className="overflow-hidden rounded-xl" />
        <p className="mt-3 text-center text-xs text-zinc-500">{hint}</p>
      </div>
    </div>
  );
}
