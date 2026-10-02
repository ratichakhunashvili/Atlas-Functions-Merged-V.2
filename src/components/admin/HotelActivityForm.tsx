"use client";

import { useActionState } from "react";
import { createHotelActivity, type HotelActivityActionState } from "@/actions/hotel-activities";
import { HOTEL_ACTIVITY_KINDS, HOTEL_ACTIVITY_KIND_LABELS } from "@/lib/hotel-activity";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";

export default function HotelActivityForm({ hotelId }: { hotelId: string }) {
  const [state, formAction] = useActionState<HotelActivityActionState, FormData>(
    createHotelActivity,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="hotelId" value={hotelId} />

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Activity name">
          <input name="name" required placeholder="Rooftop spa" className={inputClass} />
        </Field>
        <Field label="Kind">
          <select name="kind" defaultValue="spa" className={inputClass}>
            {HOTEL_ACTIVITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {HOTEL_ACTIVITY_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input name="description" className={inputClass} />
      </Field>

      <Field label="Photo" hint="Optional — the hotel's own photo is used otherwise.">
        <input type="file" name="photo" accept="image/*" className={inputClass} />
      </Field>

      <SubmitButton pendingLabel="Adding…">Add activity</SubmitButton>
    </form>
  );
}
