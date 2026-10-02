"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  forceUnlockHotel,
  markCurrentStopVisited,
  regenerateItinerary,
  resetMyProgress,
  undoLastCheckIn,
  unlockAchievementById,
  unlockAllAchievements,
} from "@/actions/test-tools";
import type { TestToolResult } from "@/lib/dev-tools";

type Tool = { label: string; run: () => Promise<TestToolResult> };

/**
 * Local-development shortcuts. This component is only ever rendered when the
 * server has already confirmed the tools are enabled; every action re-checks
 * that server-side regardless, so rendering it can't grant access by itself.
 */
export type TestableAchievement = { id: string; name: string; held: boolean };

export default function TestToolsPanel({
  hotelId,
  achievements = [],
}: {
  hotelId: string | null;
  /** Lets a single badge be granted, to check one unlock in isolation. */
  achievements?: TestableAchievement[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<TestToolResult | null>(null);

  const tools: Tool[] = [
    ...(hotelId
      ? [
          { label: "Force-unlock this hotel", run: () => forceUnlockHotel(hotelId) },
          { label: "Regenerate itinerary", run: () => regenerateItinerary(hotelId) },
          { label: "Mark current stop visited", run: () => markCurrentStopVisited(hotelId) },
          { label: "Undo last check-in", run: () => undoLastCheckIn(hotelId) },
        ]
      : []),
    { label: "Unlock all achievements", run: unlockAllAchievements },
    { label: "Reset my progress", run: resetMyProgress },
  ];

  const handle = (tool: Tool) => {
    setMessage(null);
    startTransition(async () => {
      setMessage(await tool.run());
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-dashed border-amber-400 bg-amber-50/60 p-4 dark:border-amber-700 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Testing shortcuts
        </h2>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900 dark:text-amber-200">
          local only
        </span>
      </div>
      <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
        Skips physical QR scanning and GPS so the full flow can be exercised at a
        desk. Disabled automatically in a production build.
      </p>

      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            disabled={pending}
            onClick={() => handle(tool)}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-zinc-800"
          >
            {tool.label}
          </button>
        ))}
      </div>

      {achievements.length > 0 && (
        <label className="mt-3 block text-xs text-amber-800 dark:text-amber-300">
          Unlock a single achievement
          <select
            disabled={pending}
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (!id) return;
              setMessage(null);
              startTransition(async () => {
                setMessage(await unlockAchievementById(id));
                router.refresh();
              });
            }}
            className="mt-1 w-full rounded-lg border border-amber-400 bg-white px-2 py-1.5 text-xs dark:border-amber-700 dark:bg-zinc-900"
          >
            <option value="">Pick an achievement…</option>
            {achievements.map((achievement) => (
              <option key={achievement.id} value={achievement.id}>
                {achievement.held ? "✓ " : ""}
                {achievement.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {message && (
        <p
          className={`mt-3 text-xs ${
            message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {message.ok ? message.message : message.error}
        </p>
      )}
    </section>
  );
}
