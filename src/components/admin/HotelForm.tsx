"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { createHotel, updateHotel, type HotelActionState } from "@/actions/hotels";
import { DEFAULT_MAP_CENTER } from "@/lib/mapbox";
import LocationPicker from "@/components/LocationPicker";
import ModelSettingsFields, { type ModelSettings } from "@/components/admin/ModelSettingsFields";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";

export type HotelFormValues = ModelSettings & {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
};

export default function HotelForm({ hotel }: { hotel?: HotelFormValues }) {
  const isEdit = !!hotel;
  const [state, formAction] = useActionState<HotelActionState, FormData>(
    isEdit ? updateHotel : createHotel,
    undefined,
  );
  const [location, setLocation] = useState({
    lat: hotel?.latitude ?? DEFAULT_MAP_CENTER.lat,
    lng: hotel?.longitude ?? DEFAULT_MAP_CENTER.lng,
  });

  return (
    <form action={formAction} className="space-y-5">
      {hotel && <input type="hidden" name="id" value={hotel.id} />}

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      <Field label="Hotel name">
        <input name="name" defaultValue={hotel?.name ?? ""} required className={inputClass} />
      </Field>

      <Field label="Address">
        <input name="address" defaultValue={hotel?.address ?? ""} className={inputClass} />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={hotel?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <Field
        label={isEdit ? "Replace the photo" : "Photo"}
        hint={isEdit ? "Leave empty to keep the current photo." : undefined}
      >
        <input
          type="file"
          name="photo"
          accept="image/*"
          required={!isEdit}
          className={inputClass}
        />
      </Field>

      {hotel?.photoPath && (
        <Image
          src={hotel.photoPath}
          alt=""
          width={160}
          height={100}
          className="h-24 w-40 rounded-lg object-cover"
        />
      )}

      <Field
        label="Location"
        hint="Click the map or drag the pin — you never have to type coordinates."
      >
        <LocationPicker value={location} onChange={setLocation} />
      </Field>
      <p className="text-xs text-zinc-500">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </p>
      <input type="hidden" name="latitude" value={location.lat} />
      <input type="hidden" name="longitude" value={location.lng} />

      <ModelSettingsFields settings={hotel ?? null} defaultHeight={12} />

      <SubmitButton pendingLabel={isEdit ? "Saving…" : "Creating…"}>
        {isEdit ? "Save hotel" : "Create hotel"}
      </SubmitButton>
    </form>
  );
}
