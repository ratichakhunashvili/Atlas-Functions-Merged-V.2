"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Two-step delete: the first click arms it, the second confirms. Admin screens
 * are used by non-developers, so nothing destructive happens on one tap.
 */
export default function DeleteButton({
  onDelete,
  label = "Delete",
  confirmLabel = "Tap again to confirm",
  redirectTo,
  size = "sm",
}: {
  onDelete: () => Promise<void>;
  label?: string;
  confirmLabel?: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      // Disarm on its own, so a stray click can't sit waiting to fire.
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await onDelete();
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't delete that.");
        setArmed(false);
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className={`rounded-lg font-medium transition disabled:opacity-50 ${
          size === "md" ? "px-4 py-2 text-sm" : "px-2.5 py-1.5 text-xs"
        } ${
          armed
            ? "bg-red-600 text-white hover:bg-red-500"
            : "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
        }`}
      >
        {pending ? "Deleting…" : armed ? confirmLabel : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
