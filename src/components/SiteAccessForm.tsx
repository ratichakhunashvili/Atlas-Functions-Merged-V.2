"use client";

import { useActionState } from "react";
import { submitSitePassword, type SiteAccessState } from "@/actions/site-access";

export default function SiteAccessForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState<SiteAccessState, FormData>(
    submitSitePassword,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <h1 className="text-xl font-semibold">This demo is password-protected</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter the password you were given to continue.
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          required
          autoFocus
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        Continue
      </button>
    </form>
  );
}
