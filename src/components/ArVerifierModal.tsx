"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { hashVideoFrame } from "@/lib/ar-capture";

type Status = "starting" | "scanning" | "denied" | "unsupported";

/**
 * AR check-in. Opens the rear camera, and a few times a second reduces the
 * live frame to a perceptual hash and asks the server whether it matches this
 * place's reference image. Only the hash leaves the device, and only the
 * server decides whether it is a match.
 */
export default function ArVerifierModal({
  placeName,
  referenceImagePath,
  onClose,
  onFrame,
}: {
  placeName: string;
  referenceImagePath: string | null;
  onClose: () => void;
  /** Resolves to an error message to keep scanning, or null once verified. */
  onFrame: (frameHash: string) => Promise<string | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Decided during the first client render (this modal is loaded with ssr:false)
  // rather than in an effect, which would cause a cascading re-render.
  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== "undefined" && typeof navigator.mediaDevices === "object"
      ? "starting"
      : "unsupported",
  );
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    if (status === "unsupported") return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        if (videoRef.current) {
          videoRef.current.srcObject = granted;
          // play() rejects if the element is torn down mid-start; harmless.
          void videoRef.current.play().catch(() => {});
        }
        setStatus("scanning");
      })
      .catch(() => {
        if (!cancelled) setStatus("denied");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
    // `status` is only read here to bail out when there is no camera API at
    // all; re-running on every status change would restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(async () => {
    if (busyRef.current || doneRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const frameHash = hashVideoFrame(video);
    if (!frameHash) return;

    busyRef.current = true;
    try {
      const error = await onFrameRef.current(frameHash);
      if (error === null) {
        doneRef.current = true;
      } else {
        setMessage(error);
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (status !== "scanning") return;
    // Twice a second: fast enough to feel live, slow enough not to hammer the
    // server while the guest is still lining the shot up.
    const timer = setInterval(() => void tick(), 500);
    return () => clearInterval(timer);
  }, [status, tick]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Point your camera at {placeName}</h2>
            <p className="text-xs text-zinc-500">
              Frame the landmark like the reference photo and hold steady.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AR check-in"
            className="shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
          {status === "starting" && (
            <p className="absolute inset-0 grid place-items-center text-sm text-white">
              Starting camera…
            </p>
          )}
          {status === "denied" && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white">
              Camera access was denied. Allow it in your browser to check in here.
            </p>
          )}
          {status === "unsupported" && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white">
              This browser can&apos;t open the camera.
            </p>
          )}
        </div>

        {referenceImagePath && (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
            <Image
              src={referenceImagePath}
              alt={`Reference view of ${placeName}`}
              width={56}
              height={56}
              className="h-14 w-14 rounded-lg object-cover"
            />
            <p className="text-xs text-zinc-500">Match this framing.</p>
          </div>
        )}

        {message && <p className="text-xs text-amber-600 dark:text-amber-400">{message}</p>}
      </div>
    </div>
  );
}
