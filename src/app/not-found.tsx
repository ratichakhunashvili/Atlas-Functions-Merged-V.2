import Link from "next/link";
import { MapIcon } from "@/components/icons";

/**
 * Replaces Next's bare default 404, which showed no branding and gave the
 * guest no way back into the app.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <MapIcon className="mx-auto h-9 w-9 text-indigo-500" />
        <div>
          <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The link may be out of date, or the place may have been removed.
          </p>
        </div>
        <Link
          href="/gallery"
          className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Back to your hotels
        </Link>
      </div>
    </div>
  );
}
