"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userCategoryPreferences } from "@/db/schema";
import { ALL_CATEGORIES, type Category } from "@/lib/partner-category";

export type PreferencesActionState = { error: string } | undefined;

export async function updatePreferences(
  _prevState: PreferencesActionState,
  formData: FormData,
): Promise<PreferencesActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const selected = new Set(formData.getAll("categories").map(String));
  const categories = ALL_CATEGORIES.filter((c) => selected.has(c)) as Category[];

  // The neon-http driver has no transaction support, so this is a plain
  // delete-then-insert rather than an atomic swap — acceptable for a
  // low-stakes preference list.
  await db.delete(userCategoryPreferences).where(eq(userCategoryPreferences.userId, session.user.id));
  if (categories.length > 0) {
    await db.insert(userCategoryPreferences).values(
      categories.map((category) => ({ userId: session.user.id, category })),
    );
  }

  revalidatePath("/profile");
  revalidatePath("/hotels");
}
