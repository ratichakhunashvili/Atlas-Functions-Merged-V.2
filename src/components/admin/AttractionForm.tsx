"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import {
  createAttraction,
  updateAttraction,
  type AttractionActionState,
} from "@/actions/attractions";
import { DEFAULT_MAP_CENTER } from "@/lib/mapbox";
import { ATTRACTION_CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/partner-category";
import {
  VERIFICATION_MODES,
  VERIFICATION_MODE_HINTS,
  VERIFICATION_MODE_LABELS,
  type VerificationMode,
} from "@/lib/place";
import { hashImageFile } from "@/lib/ar-capture";
import LocationPicker from "@/components/LocationPicker";
import ModelSettingsFields, { type ModelSettings } from "@/components/admin/ModelSettingsFields";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";

export type AttractionFormValues = ModelSettings & {
  id: string;
  name: string;
  /** The shared DB enum, not the attraction subset — a row read back from the
   *  database is typed across every category the column can hold. */
  category: Category;
  description: string | null;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
  verificationMode: VerificationMode;
  arTargetPath: string | null;
};

export default function AttractionForm({
  attraction,
}: {
  attraction?: AttractionFormValues;
}) {
  const isEdit = !!attraction;
  const [state, formAction] = useActionState<AttractionActionState, FormData>(
    isEdit ? updateAttraction : createAttraction,
    undefined,
  );
  const [location, setLocation] = useState({
    lat: attraction?.latitude ?? DEFAULT_MAP_CENTER.lat,
    lng: attraction?.longitude ?? DEFAULT_MAP_CENTER.lng,
  });
  const [mode, setMode] = useState<VerificationMode>(attraction?.verificationMode ?? "gps");
  // The AR reference hash is computed in the browser at upload time and sent
  // along, so the server has something to match camera frames against later.
  const [arHash, setArHash] = useState("");
  const [arHashError, setArHashError] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      {attraction && <input type="hidden" name="id" value={attraction.id} />}

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      <Field label="Name">
        <input name="name" defaultValue={attraction?.name ?? ""} required className={inputClass} />
      </Field>

      <Field label="Category">
        <select
          name="category"
          defaultValue={attraction?.category ?? "landmark"}
          className={inputClass}
        >
          {ATTRACTION_CATEGORIES.map((category) => (
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
          defaultValue={attraction?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <Field
        label={isEdit ? "Replace the photo" : "Photo"}
        hint={isEdit ? "Leave empty to keep the current photo." : undefined}
      >
        <input type="file" name="photo" accept="image/*" required={!isEdit} className={inputClass} />
      </Field>

      {attraction?.photoPath && (
        <Image
          src={attraction.photoPath}
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

      <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-semibold">How guests check in here</legend>
        {/* A <legend> names the group, not the control, so the select needs its own label. */}
        <label htmlFor="verificationMode" className="sr-only">
          Verification method
        </label>
        <select
          id="verificationMode"
          name="verificationMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as VerificationMode)}
          className={inputClass}
        >
          {VERIFICATION_MODES.map((option) => (
            <option key={option} value={option}>
              {VERIFICATION_MODE_LABELS[option]}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">{VERIFICATION_MODE_HINTS[mode]}</p>

        {mode === "ar" && (
          <>
            <Field
              label="AR reference photo"
              hint="A clear photo of the landmark as a guest would frame it. The app matches the camera against this."
            >
              <input
                type="file"
                name="arTarget"
                accept="image/*"
                className={inputClass}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  setArHashError(null);
                  if (!file) {
                    setArHash("");
                    return;
                  }
                  const hash = await hashImageFile(file);
                  if (hash) setArHash(hash);
                  else setArHashError("Couldn't read that image — try a different file.");
                }}
              />
            </Field>
            <input type="hidden" name="arTargetHash" value={arHash} />
            {arHashError && <Alert kind="error">{arHashError}</Alert>}
            {attraction?.arTargetPath && !arHash && (
              <div className="flex items-center gap-3">
                <Image
                  src={attraction.arTargetPath}
                  alt="Current AR reference"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <p className="text-xs text-zinc-500">Current reference photo.</p>
              </div>
            )}
          </>
        )}
      </fieldset>

      <ModelSettingsFields settings={attraction ?? null} defaultHeight={8} />

      <SubmitButton pendingLabel={isEdit ? "Saving…" : "Creating…"}>
        {isEdit ? "Save attraction" : "Create attraction"}
      </SubmitButton>
    </form>
  );
}
