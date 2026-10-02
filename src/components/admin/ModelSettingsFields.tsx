"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Field, inputClass } from "@/components/ui";
import { CubeIcon } from "@/components/icons";

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), { ssr: false });

export type ModelSettings = {
  modelPath: string | null;
  model3dEnabled: boolean;
  modelTargetHeightMeters: number;
  modelRotationDeg: number;
  modelElevationOffsetMeters: number;
  modelScaleMultiplier: number;
};

/**
 * The 3D block shared by the hotel, attraction and partner forms.
 *
 * These settings exist because exported .glb files disagree about units,
 * pivots and facing — rather than demanding well-authored models, the admin
 * can nudge a bad one into place and see exactly what each number does.
 */
export default function ModelSettingsFields({
  settings,
  defaultHeight,
}: {
  settings: ModelSettings | null;
  defaultHeight: number;
}) {
  const [enabled, setEnabled] = useState(settings?.model3dEnabled ?? true);
  const [removeModel, setRemoveModel] = useState(false);
  const hasModel = !!settings?.modelPath && !removeModel;

  return (
    <fieldset className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <CubeIcon className="h-4 w-4 text-indigo-500" />
        3D model on the map
      </legend>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="model3dEnabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
        />
        Show this place in 3D
      </label>

      {/* Preview, so the saved height/rotation can be judged without opening
          the guest map. Shows the model as stored, before any pending upload. */}
      {hasModel && settings?.modelPath && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Current model</p>
          <ModelViewer
            modelUrl={settings.modelPath}
            locked={false}
            className="h-48 w-full max-w-xs"
          />
          <p className="text-xs text-zinc-500">
            Drag to turn it around. This preview ignores the settings below — it
            shows the file itself.
          </p>
        </div>
      )}

      <Field
        label={hasModel ? "Replace the .glb model" : "Upload a .glb model"}
        hint={
          hasModel
            ? "Leave empty to keep the current model. Without one, the place shows a coloured marker shape instead."
            : "Optional. Without a model the place shows a coloured marker shape instead."
        }
      >
        <input type="file" name="model" accept=".glb,.gltf" className={inputClass} />
      </Field>

      {hasModel && (
        <label className="flex items-center gap-2 text-sm text-red-600">
          <input
            type="checkbox"
            checked={removeModel}
            onChange={(event) => setRemoveModel(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          Remove the current model
        </label>
      )}
      <input type="hidden" name="removeModel" value={removeModel ? "1" : "0"} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Height on the map (metres)" hint="How tall it should appear in the real world.">
          <input
            type="number"
            name="modelTargetHeightMeters"
            step="0.5"
            min="0.5"
            max="200"
            defaultValue={settings?.modelTargetHeightMeters ?? defaultHeight}
            className={inputClass}
          />
        </Field>

        <Field label="Rotation (degrees)" hint="Turn the model to face the right way.">
          <input
            type="number"
            name="modelRotationDeg"
            step="5"
            defaultValue={settings?.modelRotationDeg ?? 0}
            className={inputClass}
          />
        </Field>

        <Field label="Lift off the ground (metres)" hint="Use when a model sinks into or floats above the ground.">
          <input
            type="number"
            name="modelElevationOffsetMeters"
            step="0.5"
            min="-50"
            max="200"
            defaultValue={settings?.modelElevationOffsetMeters ?? 0}
            className={inputClass}
          />
        </Field>

        <Field label="Size multiplier" hint="1 = exactly the height above. Fine-tuning only.">
          <input
            type="number"
            name="modelScaleMultiplier"
            step="0.05"
            min="0.05"
            max="20"
            defaultValue={settings?.modelScaleMultiplier ?? 1}
            className={inputClass}
          />
        </Field>
      </div>
    </fieldset>
  );
}
