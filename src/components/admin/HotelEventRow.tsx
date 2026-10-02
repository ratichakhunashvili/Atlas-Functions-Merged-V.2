"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateHotelEvent, type HotelEventActionState } from "@/actions/hotel-events";
import DeleteButton from "@/components/admin/DeleteButton";
import { Alert, Badge, Field, SubmitButton, inputClass } from "@/components/ui";

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  /** Decided on the server — reading the clock during render is impure and
   *  would make the server and client markup disagree. */
  past: boolean;
};

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time, not an ISO string. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export default function HotelEventRow({
  event,
  onDelete,
}: {
  event: EventRow;
  onDelete: () => Promise<void>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<HotelEventActionState, FormData>(
    updateHotelEvent,
    undefined,
  );

  const startsAt = new Date(event.startsAt);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">{event.title}</span>
          <span className="block text-xs text-zinc-500">
            {startsAt.toLocaleString()}
            {event.description ? ` · ${event.description}` : ""}
          </span>
        </span>

        {/* Past events stay listed for the admin but are hidden from guests. */}
        {event.past && <Badge>Past</Badge>}

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Edit
        </button>

        <DeleteButton onDelete={onDelete} />
      </li>
    );
  }

  return (
    <li className="space-y-3 py-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={event.id} />

        {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
        {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

        <Field label="Event title">
          <input name="title" defaultValue={event.title} required className={inputClass} />
        </Field>

        <Field label="Description">
          <input
            name="description"
            defaultValue={event.description ?? ""}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={toLocalInputValue(event.startsAt)}
              className={inputClass}
            />
          </Field>
          <Field label="Ends" hint="Optional.">
            <input
              type="datetime-local"
              name="endsAt"
              defaultValue={toLocalInputValue(event.endsAt)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Replace the photo" hint="Leave empty to keep the current one.">
          <input type="file" name="photo" accept="image/*" className={inputClass} />
        </Field>

        <div className="flex gap-2">
          <SubmitButton>Save event</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              router.refresh();
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
