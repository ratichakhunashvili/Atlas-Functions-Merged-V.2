"use client";

import { useState } from "react";
import Image from "next/image";
import { LockIcon, TrophyIcon } from "@/components/icons";
import { PLACE_TYPE_LABELS, type PlaceType } from "@/lib/place";

export type CollectionItem = {
  id: string;
  name: string;
  description: string | null;
  badgeImagePath: string | null;
  placeType: PlaceType;
  placeName: string | null;
  unlockedAt: string | null;
};

function Badge({ item, size }: { item: CollectionItem; size: "sm" | "lg" }) {
  // Large badges shrink on a phone so three of them still fit the card.
  const dimension = size === "lg" ? 96 : 56;
  const locked = item.unlockedAt === null;

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-zinc-100 dark:bg-zinc-800 ${
        size === "lg" ? "h-[72px] w-[72px] sm:h-24 sm:w-24" : "h-14 w-14"
      } ${
        locked
          ? "border-zinc-300 dark:border-zinc-700"
          : "border-amber-400 shadow-md shadow-amber-500/20"
      }`}
    >
      {item.badgeImagePath ? (
        <Image
          src={item.badgeImagePath}
          alt=""
          width={dimension}
          height={dimension}
          className={`h-full w-full object-cover ${locked ? "grayscale opacity-40" : ""}`}
        />
      ) : (
        <TrophyIcon
          className={`h-1/2 w-1/2 ${locked ? "text-zinc-400" : "text-amber-500"}`}
        />
      )}
      {locked && (
        <span className="absolute inset-0 grid place-items-center bg-zinc-900/30">
          <LockIcon className="h-1/3 w-1/3 text-white/90" />
        </span>
      )}
    </div>
  );
}

/**
 * The profile's achievement showcase: the three most recent badges stacked and
 * all still individually readable, opening into the full collection. Hotel,
 * attraction and partner badges all live in this one collection.
 */
export default function AchievementCollection({ items }: { items: CollectionItem[] }) {
  const [open, setOpen] = useState(false);

  const unlocked = items.filter((item) => item.unlockedAt !== null);
  const featured = unlocked.slice(0, 3);

  return (
    <>
      {/* The badge stack and its summary sit side by side only from `sm` up;
          below that there isn't room for both, so they stack vertically. */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {featured.length === 0 ? (
            <>
              <Badge
                item={{
                  id: "none",
                  name: "",
                  description: null,
                  badgeImagePath: null,
                  placeType: "attraction",
                  placeName: null,
                  unlockedAt: null,
                }}
                size="lg"
              />
              <p className="text-sm text-zinc-500">
                No badges yet — unlock a hotel or check in somewhere to start.
              </p>
            </>
          ) : (
            <>
              {/* Overlapped but offset enough that all three stay identifiable. */}
              <div className="flex shrink-0 -space-x-4 sm:-space-x-5">
                {featured.map((item) => (
                  <div
                    key={item.id}
                    title={item.name}
                    className="rounded-full ring-4 ring-white dark:ring-zinc-900"
                  >
                    <Badge item={item} size="lg" />
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {unlocked.length} badge{unlocked.length === 1 ? "" : "s"} collected
                </p>
                <p className="text-xs text-zinc-500">
                  {featured.map((item) => item.name).join(" · ")}
                </p>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800 sm:w-auto"
        >
          View all ({items.length})
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Achievement collection"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your collection</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close collection"
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No achievements have been set up yet.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 p-3 text-center dark:border-zinc-800"
                  >
                    <Badge item={item} size="sm" />
                    <div>
                      <p className="text-sm font-medium leading-tight">{item.name}</p>
                      <p className="text-xs text-zinc-500">
                        {PLACE_TYPE_LABELS[item.placeType]}
                        {item.placeName ? ` · ${item.placeName}` : ""}
                      </p>
                      {item.unlockedAt ? (
                        <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          {new Date(item.unlockedAt).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-zinc-400">Locked</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
