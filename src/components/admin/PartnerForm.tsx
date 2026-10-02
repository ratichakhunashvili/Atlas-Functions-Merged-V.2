"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { createPartner, updatePartner, type PartnerActionState } from "@/actions/partners";
import { DEFAULT_MAP_CENTER } from "@/lib/mapbox";
import { CATEGORY_LABELS, PARTNER_CATEGORIES, type Category } from "@/lib/partner-category";
import {
  VERIFICATION_MODES,
  VERIFICATION_MODE_HINTS,
  VERIFICATION_MODE_LABELS,
  type VerificationMode,
} from "@/lib/place";
import LocationPicker from "@/components/LocationPicker";
import ModelSettingsFields, { type ModelSettings } from "@/components/admin/ModelSettingsFields";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";

export type PartnerFormValues = ModelSettings & {
  id: string;
  name: string;
  /** The shared DB enum, not the partner subset — see AttractionForm. */
  category: Category;
  description: string | null;
  address: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
  verificationMode: VerificationMode;
};

export default function PartnerForm({ partner }: { partner?: PartnerFormValues }) {
  const isEdit = !!partner;
  const [state, formAction] = useActionState<PartnerActionState, FormData>(
    isEdit ? updatePartner : createPartner,
    undefined,
  );
  const [location, setLocation] = useState({
    lat: partner?.latitude ?? DEFAULT_MAP_CENTER.lat,
    lng: partner?.longitude ?? DEFAULT_MAP_CENTER.lng,
  });
  const [mode, setMode] = useState<VerificationMode>(partner?.verificationMode ?? "qr");

  return (
    <form action={formAction} className="space-y-5">
      {partner && <input type="hidden" name="id" value={partner.id} />}

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      <Field label="Business name">
        <input name="name" defaultValue={partner?.name ?? ""} required className={inputClass} />
      </Field>

      <Field label="Category">
        <select name="category" defaultValue={partner?.category ?? "other"} className={inputClass}>
          {PARTNER_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={partner?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address">
          <input name="address" defaultValue={partner?.address ?? ""} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input
            name="contactPhone"
            defaultValue={partner?.contactPhone ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Website">
        <input
          name="contactWebsite"
          type="url"
          placeholder="https://"
          defaultValue={partner?.contactWebsite ?? ""}
          className={inputClass}
        />
      </Field>

      <Field
        label={isEdit ? "Replace the photo" : "Photo"}
        hint={isEdit ? "Leave empty to keep the current photo." : undefined}
      >
        <input type="file" name="photo" accept="image/*" required={!isEdit} className={inputClass} />
      </Field>

      {partner?.photoPath && (
        <Image
          src={partner.photoPath}
          alt=""
          width={160}
          height={100}
          className="h-24 w-40 rounded-lg object-cover"
        />
      )}

      <Field label="Location" hint="Click the map or drag the pin.">
        <LocationPicker value={location} onChange={setLocation} />
      </Field>
      <p className="text-xs text-zinc-500">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </p>
      <input type="hidden" name="latitude" value={location.lat} />
      <input type="hidden" name="longitude" value={location.lng} />

      <Field label="How guests check in here" hint={VERIFICATION_MODE_HINTS[mode]}>
        <select
          name="verificationMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as VerificationMode)}
          className={inputClass}
        >
          {VERIFICATION_MODES.filter((option) => option !== "ar").map((option) => (
            <option key={option} value={option}>
              {VERIFICATION_MODE_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      <ModelSettingsFields settings={partner ?? null} defaultHeight={6} />

      <SubmitButton pendingLabel={isEdit ? "Saving…" : "Creating…"}>
        {isEdit ? "Save partner" : "Create partner"}
      </SubmitButton>
    </form>
  );
}
