"use client";

import Image from "next/image";
import { CheckIcon, SparkIcon, TrophyIcon } from "@/components/icons";
import type { CheckInSuccess } from "@/lib/check-in";

/**
 * Shown once, right after a successful check-in. Deliberately driven by the
 * server's `newlyVisited` / `achievementNewlyUnlocked` flags, so a repeat scan
 * of the same place never celebrates twice.
 */
export default function CheckInCelebration({
  result,
  onClose,
}: {
  result: CheckInSuccess;
  onClose: () => void;
}) {
  const achievement = result.achievementNewlyUnlocked ? result.achievement : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300">
          <CheckIcon className="h-7 w-7" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">Checked in at {result.placeName}</h2>
          {result.dayCompleted ? (
            <p className="mt-1 text-sm text-zinc-500">
              That was the last stop — your day is complete. 🎉
            </p>
          ) : result.nextStop ? (
            <p className="mt-1 text-sm text-zinc-500">
              Next up: <span className="font-medium">{result.nextStop.name}</span>
            </p>
          ) : null}
        </div>

        {achievement && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <SparkIcon className="h-3.5 w-3.5" />
              Achievement unlocked
            </p>
            {achievement.badgeImagePath ? (
              <Image
                src={achievement.badgeImagePath}
                alt=""
                width={72}
                height={72}
                className="mx-auto h-18 w-18 rounded-full object-cover"
              />
            ) : (
              <TrophyIcon className="mx-auto h-10 w-10 text-amber-500" />
            )}
            <p className="font-medium">{achievement.name}</p>
            {achievement.description && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{achievement.description}</p>
            )}
          </div>
        )}

        {result.achievement && !result.achievementNewlyUnlocked && (
          <p className="text-xs text-zinc-500">
            You already hold the “{result.achievement.name}” badge for this place.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          {result.dayCompleted ? "Finish the day" : "Continue"}
        </button>
      </div>
    </div>
  );
}
