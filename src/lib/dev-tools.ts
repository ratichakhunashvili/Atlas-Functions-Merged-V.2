import "server-only";
import { auth } from "@/auth";

/**
 * Testing shortcuts: force-unlock a hotel, mark a stop visited, regenerate a
 * day, grant an achievement, reset progress.
 *
 * `ENABLE_TEST_TOOLS=true` switches them on outside a production build. In a
 * production build that alone is NOT enough — a second, differently named flag,
 * `ALLOW_TEST_TOOLS_IN_PRODUCTION`, must also be set.
 *
 * The two-key shape is the point. A deployed demo that is meant to be poked at
 * can turn them on deliberately, but no single stray environment variable, and
 * no copied `.env`, can ever leave them on somewhere real by accident. Anything
 * they expose is still scoped to the caller's own account.
 */
export function testToolsEnabled(): boolean {
  if (process.env.ENABLE_TEST_TOOLS !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_TEST_TOOLS_IN_PRODUCTION === "true";
}

export type TestToolsSession = {
  userId: string;
  username: string;
  role: "user" | "admin";
};

/**
 * Resolves the caller only if the testing shortcuts are available to them.
 * Returns null — never throws — so callers can degrade quietly in production.
 */
export async function getTestToolsSession(): Promise<TestToolsSession | null> {
  if (!testToolsEnabled()) return null;
  const session = await auth();
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    username: session.user.username,
    role: session.user.role,
  };
}

export type TestToolResult = { ok: true; message: string } | { ok: false; error: string };

export const TEST_TOOLS_DISABLED: TestToolResult = {
  ok: false,
  error: "Testing shortcuts are disabled in this environment.",
};
