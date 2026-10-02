"use client";

import { useActionState } from "react";
import Image from "next/image";
import { saveAchievement, type AchievementActionState } from "@/actions/achievements";
import type { PlaceType } from "@/lib/place";
import { Alert, Field, SubmitButton, inputClass } from "@/components/ui";
import { TrophyIcon } from "@/components/icons";

/**
 * A place owns at most one achievement, so this is the same form whether one
 * already exists or not — submitting it upserts.
 */
export default function AchievementForm({
  placeType,
  placeId,
  placeName,
  existing,
}: {
  placeType: PlaceType;
  placeId: string;
  placeName: string;
  existing: {
    name: string;
    description: string | null;
    badgeImagePath: string | null;
  } | null;
}) {
  const [state, formAction] = useActionState<AchievementActionState, FormData>(
    saveAchievement,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="placeType" value={placeType} />
      <input type="hidden" name="placeId" value={placeId} />

      {state && "error" in state && <Alert kind="error">{state.error}</Alert>}
      {state && "success" in state && <Alert kind="success">{state.success}</Alert>}

      {!existing && (
        <Alert kind="info">
          No achievement is configured for {placeName} yet — guests won&apos;t earn a
          badge here until there is one.
        </Alert>
      )}

      <div className="flex items-center gap-3">
        {existing?.badgeImagePath ? (
          <Image
            src={existing.badgeImagePath}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-full border-2 border-amber-400 object-cover"
          />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700">
            <TrophyIcon className="h-6 w-6 text-zinc-400" />
          </span>
        )}
        <p className="text-sm text-zinc-500">
          {existing ? "Achievement configured" : "No badge image yet"}
        </p>
      </div>

      <Field label="Achievement name">
        <input
          name="name"
          required
          defaultValue={existing?.name ?? `${placeName} explorer`}
          className={inputClass}
        />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={2}
          defaultValue={existing?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <Field
        label={existing?.badgeImagePath ? "Replace the badge image" : "Badge image"}
        hint="Square images look best. Optional — a trophy icon is used otherwise."
      >
        <input type="file" name="badge" accept="image/*" className={inputClass} />
      </Field>

      <SubmitButton>{existing ? "Save achievement" : "Create achievement"}</SubmitButton>
    </form>
  );
}
