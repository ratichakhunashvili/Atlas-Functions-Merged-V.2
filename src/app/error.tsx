"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches render-time errors so a guest never sees a stack trace. The real
 * error still goes to the console for whoever is developing.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-xl text-red-600 dark:bg-red-950 dark:text-red-300">
          !
        </div>
        <div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-zinc-500">
            That didn&apos;t load as it should. Try again — if it keeps happening,
            tell whoever looks after this app.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[11px] text-zinc-400">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Try again
          </button>
          <Link
            href="/gallery"
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
