"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateNextDay } from "@/actions/itinerary";

export default function GenerateDayButton({
  hotelId,
  hasExistingDay,
}: {
  hotelId: string;
  hasExistingDay: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await generateNextDay(hotelId);
      if (result.ok) {
        if (result.warning) setNotice(result.warning);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Planning…" : hasExistingDay ? "Plan the next day" : "Plan my day"}
      </button>
      {error && <p className="max-w-sm text-xs text-red-600">{error}</p>}
      {notice && <p className="max-w-sm text-xs text-amber-600">{notice}</p>}
    </div>
  );
}
