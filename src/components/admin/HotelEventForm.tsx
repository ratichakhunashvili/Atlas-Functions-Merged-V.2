"use client";

import { useActionState } from "react";
import { createHotelEvent, type HotelEventActionState } from "@/actions/hotel-events";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";

export default function HotelEventForm({ hotelId }: { hotelId: string }) {
  const [state, formAction] = useActionState<HotelEventActionState, FormData>(
    createHotelEvent,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="hotelId" value={hotelId} />

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      <Field label="Event title">
        <input name="title" required placeholder="Live jazz on the terrace" className={inputClass} />
      </Field>

      <Field label="Description">
        <input name="description" className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input type="datetime-local" name="startsAt" required className={inputClass} />
        </Field>
        <Field label="Ends" hint="Optional.">
          <input type="datetime-local" name="endsAt" className={inputClass} />
        </Field>
      </div>

      <Field label="Photo" hint="Optional.">
        <input type="file" name="photo" accept="image/*" className={inputClass} />
      </Field>

      <SubmitButton pendingLabel="Adding…">Add event</SubmitButton>
    </form>
  );
}
