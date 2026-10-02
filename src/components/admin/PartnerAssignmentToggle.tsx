"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PartnerAssignmentToggle({
  assigned,
  onAssign,
  onUnassign,
}: {
  assigned: boolean;
  onAssign: () => Promise<void>;
  onUnassign: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await (assigned ? onUnassign() : onAssign());
          router.refresh();
        })
      }
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        assigned
          ? "bg-emerald-600 text-white hover:bg-emerald-500"
          : "border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {pending ? "…" : assigned ? "Assigned" : "Assign"}
    </button>
  );
}
