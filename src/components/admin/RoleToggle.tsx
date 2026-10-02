"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RoleToggle({
  role,
  username,
  onChange,
}: {
  role: "user" | "admin";
  /** Only used to name the control for screen readers, since the table header can't. */
  username: string;
  onChange: (role: "user" | "admin") => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <select
        aria-label={`Role for ${username}`}
        value={role}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as "user" | "admin";
          setError(null);
          startTransition(async () => {
            try {
              await onChange(next);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Couldn't change the role.");
            }
          });
        }}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
