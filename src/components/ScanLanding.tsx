"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveScan, type ScanOutcome } from "@/actions/scan";
import { Alert } from "@/components/ui";
import { QrIcon } from "@/components/icons";

type State =
  | { phase: "working" }
  | { phase: "done"; outcome: ScanOutcome }
  | { phase: "failed"; message: string };

/**
 * Runs a scanned token through the server once, then forwards the guest to
 * wherever that token belongs. Rendered by `/unlock/[token]`, which is what a
 * printed QR code opens.
 */
export default function ScanLanding({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "working" });
  // A scan is a mutation; React's dev double-mount must not run it twice.
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setState({ phase: "working" });
    try {
      const outcome = await resolveScan(token);
      setState({ phase: "done", outcome });

      if (outcome.kind === "hotel") {
        router.replace(`/hotels/${outcome.hotelId}?scan=${encodeURIComponent(outcome.message)}`);
        return;
      }
      if (outcome.kind === "place" && outcome.hotelId) {
        const key = outcome.ok ? "scan" : "scanError";
        router.replace(
          `/hotels/${outcome.hotelId}?${key}=${encodeURIComponent(outcome.message)}`,
        );
      }
    } catch {
      setState({ phase: "failed", message: "That scan couldn't be processed." });
    }
  }, [token, router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <QrIcon className="mx-auto h-8 w-8 text-indigo-500" />

        {state.phase === "working" && (
          <>
            <h1 className="text-lg font-semibold">Reading your code…</h1>
            <p className="text-sm text-zinc-500">Checking what this QR code unlocks.</p>
          </>
        )}

        {state.phase === "done" && (
          <>
            <h1 className="text-lg font-semibold">
              {state.outcome.kind === "unknown" ? "We couldn't use that code" : "Done"}
            </h1>
            <Alert
              kind={
                state.outcome.kind === "unknown" ||
                (state.outcome.kind === "place" && !state.outcome.ok)
                  ? "error"
                  : "success"
              }
            >
              {state.outcome.message}
            </Alert>
            {state.outcome.kind === "unknown" && (
              <button
                type="button"
                onClick={() => router.replace("/gallery")}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Back to hotels
              </button>
            )}
          </>
        )}

        {state.phase === "failed" && (
          <>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <Alert kind="error">{state.message}</Alert>
            <button
              type="button"
              onClick={() => void run()}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
