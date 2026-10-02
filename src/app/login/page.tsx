"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthActionState } from "@/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(login, undefined);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-zinc-500">
            Log in to unlock hotels and view their maps.
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>
        <p className="text-center text-sm text-zinc-500">
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-zinc-900 underline dark:text-white"
          >
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
