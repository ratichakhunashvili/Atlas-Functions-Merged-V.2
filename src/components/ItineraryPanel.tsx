"use client";

import { useState } from "react";
import Image from "next/image";
import CheckInButton from "@/components/CheckInButton";
import CheckInCelebration from "@/components/CheckInCelebration";
import GenerateDayButton from "@/components/GenerateDayButton";
import { Badge } from "@/components/ui";
import { LockIcon, RouteIcon } from "@/components/icons";
import type { CheckInOutcome, CheckInSuccess } from "@/lib/check-in";
import type { VerificationMode } from "@/lib/place";

export type PanelStop = {
  id: string;
  name: string;
  stopType: "attraction" | "partner" | "hotel" | "hotel_activity";
  photoPath: string | null;
  verificationMode: VerificationMode;
  arTargetPath: string | null;
  visitedAt: Date | null;
  position: number;
};

export type PanelDay = {
  dayNumber: number;
  stops: PanelStop[];
  totalDurationSeconds: number | null;
  completedAt: Date | null;
};

const STOP_TYPE_LABELS: Record<PanelStop["stopType"], string> = {
  attraction: "Attraction",
  partner: "Partner",
  hotel: "At your hotel",
  hotel_activity: "At your hotel",
};

function formatMinutes(seconds: number | null): string | null {
  if (seconds == null) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min walking`;
}

/**
 * The day's stops, revealed progressively: everything up to and including the
 * current stop is shown, the rest stay hidden behind a counter until the guest
 * checks in. The hidden stops are never sent to the client at all — the server
 * slices the list before it reaches this component.
 */
export default function ItineraryPanel({
  hotelId,
  day,
  hiddenCount,
}: {
  hotelId: string;
  day: PanelDay | null;
  hiddenCount: number;
}) {
  const [celebration, setCelebration] = useState<CheckInSuccess | null>(null);

  const handleResult = (outcome: CheckInOutcome) => {
    // Only a genuinely new visit celebrates; a repeat is silent.
    if (outcome.ok && outcome.newlyVisited) setCelebration(outcome);
  };

  if (!day) {
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold">Plan today</h2>
        </div>
        <p className="text-sm text-zinc-500">
          Get a walking route from your hotel through nearby places — including
          something at the hotel itself — revealed one stop at a time as you go.
        </p>
        <GenerateDayButton hotelId={hotelId} hasExistingDay={false} />
      </section>
    );
  }

  const visitedCount = day.stops.filter((stop) => stop.visitedAt !== null).length;
  const currentIndex = day.stops.findIndex((stop) => stop.visitedAt === null);
  const isComplete = currentIndex === -1 && hiddenCount === 0;
  const totalStops = day.stops.length + hiddenCount;
  const duration = formatMinutes(day.totalDurationSeconds);

  return (
    <>
      <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Day {day.dayNumber}</h2>
            <p className="text-sm text-zinc-500">
              {visitedCount}/{totalStops} checked in
              {duration ? ` · ~${duration}` : ""}
              {isComplete ? " · Day complete 🎉" : ""}
            </p>
          </div>
          <GenerateDayButton hotelId={hotelId} hasExistingDay />
        </div>

        <ol className="space-y-2.5">
          {day.stops.map((stop, index) => {
            const visited = stop.visitedAt !== null;
            const isCurrent = index === currentIndex;
            return (
              <li
                key={stop.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  isCurrent
                    ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    visited
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {visited ? "✓" : stop.position + 1}
                </span>

                {stop.photoPath && (
                  <Image
                    src={stop.photoPath}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{stop.name}</p>
                  <p className="text-xs text-zinc-400">
                    {STOP_TYPE_LABELS[stop.stopType]}
                    {isCurrent && " · your next stop"}
                  </p>
                </div>

                {visited ? (
                  <Badge tone="green">Visited</Badge>
                ) : isCurrent ? (
                  <CheckInButton
                    stopId={stop.id}
                    stopName={stop.name}
                    mode={stop.verificationMode}
                    arTargetPath={stop.arTargetPath}
                    onResult={handleResult}
                  />
                ) : (
                  <Badge>Up next</Badge>
                )}
              </li>
            );
          })}

          {hiddenCount > 0 && (
            <li className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-400 dark:border-zinc-700">
              <LockIcon className="h-4 w-4" />
              {hiddenCount} more stop{hiddenCount === 1 ? "" : "s"} — check in to reveal
            </li>
          )}
        </ol>
      </section>

      {celebration && (
        <CheckInCelebration result={celebration} onClose={() => setCelebration(null)} />
      )}
    </>
  );
}
