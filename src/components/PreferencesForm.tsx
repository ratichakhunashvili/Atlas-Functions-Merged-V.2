"use client";

import { useActionState, useState } from "react";
import { updatePreferences, type PreferencesActionState } from "@/actions/preferences";
import {
  ATTRACTION_CATEGORIES,
  CATEGORY_LABELS,
  PARTNER_CATEGORIES,
  type Category,
} from "@/lib/partner-category";

function CategoryCheckbox({
  category,
  checked,
  onToggle,
}: {
  category: Category;
  checked: boolean;
  onToggle: (category: Category) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
      <input
        type="checkbox"
        name="categories"
        value={category}
        checked={checked}
        onChange={() => onToggle(category)}
        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
      />
      {CATEGORY_LABELS[category]}
    </label>
  );
}

export default function PreferencesForm({ initialSelected }: { initialSelected: Category[] }) {
  const [state, formAction, pending] = useActionState<PreferencesActionState, FormData>(
    updatePreferences,
    undefined,
  );
  const [selected, setSelected] = useState<Set<Category>>(new Set(initialSelected));
  const [saved, setSaved] = useState(false);

  const toggle = (category: Category) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <form
      action={(formData) => {
        formAction(formData);
        setSaved(true);
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-500">Attractions</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ATTRACTION_CATEGORIES.map((category) => (
            <CategoryCheckbox
              key={category}
              category={category}
              checked={selected.has(category)}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-500">Partners</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PARTNER_CATEGORIES.filter((c) => c !== "other").map((category) => (
            <CategoryCheckbox
              key={category}
              category={category}
              checked={selected.has(category)}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        {saved && !pending && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>
        )}
      </div>
    </form>
  );
}
