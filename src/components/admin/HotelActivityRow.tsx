"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateHotelActivity,
  toggleHotelActivity,
  type HotelActivityActionState,
} from "@/actions/hotel-activities";
import {
  HOTEL_ACTIVITY_KINDS,
  HOTEL_ACTIVITY_KIND_LABELS,
  type HotelActivityKind,
} from "@/lib/hotel-activity";
import DeleteButton from "@/components/admin/DeleteButton";
import { Alert, Badge, Field, SubmitButton, inputClass } from "@/components/ui";

export type ActivityRow = {
  id: string;
  name: string;
  kind: HotelActivityKind;
  description: string | null;
  active: boolean;
};

/**
 * One activity, with inline editing and an active/inactive switch.
 *
 * An inactive activity stays configured but is never picked for a day, which is
 * what a hotel wants for something closed for the season — deleting it would
 * lose the description and photo.
 */
export default function HotelActivityRow({
  activity,
  onDelete,
}: {
  activity: ActivityRow;
  onDelete: () => Promise<void>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<HotelActivityActionState, FormData>(
    updateHotelActivity,
    undefined,
  );
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">{activity.name}</span>
          <span className="block text-xs text-zinc-500">
            {HOTEL_ACTIVITY_KIND_LABELS[activity.kind]}
            {activity.description ? ` · ${activity.description}` : ""}
          </span>
        </span>

        {!activity.active && <Badge tone="amber">Inactive</Badge>}

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await toggleHotelActivity(activity.id, !activity.active);
            setBusy(false);
            router.refresh();
          }}
          className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {busy ? "…" : activity.active ? "Deactivate" : "Activate"}
        </button>

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
        <input type="hidden" name="id" value={activity.id} />

        {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
        {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Activity name">
            <input name="name" defaultValue={activity.name} required className={inputClass} />
          </Field>
          <Field label="Kind">
            <select name="kind" defaultValue={activity.kind} className={inputClass}>
              {HOTEL_ACTIVITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {HOTEL_ACTIVITY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <input
            name="description"
            defaultValue={activity.description ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Replace the photo" hint="Leave empty to keep the current one.">
          <input type="file" name="photo" accept="image/*" className={inputClass} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={activity.active}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          Available to guests
        </label>

        <div className="flex gap-2">
          <SubmitButton>Save activity</SubmitButton>
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
