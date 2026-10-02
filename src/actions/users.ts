"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";

/**
 * Role changes and deletions both refuse to act on the caller's own account,
 * so an admin can't lock themselves (or the last admin) out of the panel.
 */
export async function setUserRole(userId: string, role: "user" | "admin"): Promise<void> {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("You can't change your own role.");
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Deleting a user cascades their unlocks, itineraries, check-ins and achievements. */
export async function deleteUser(userId: string): Promise<void> {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("You can't delete your own account.");
  }

  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/admin/users");
}

/** Lets a signed-in guest see whether the dev test account is the one in use. */
export async function getCurrentUsername(): Promise<string | null> {
  const session = await auth();
  return session?.user?.username ?? null;
}
