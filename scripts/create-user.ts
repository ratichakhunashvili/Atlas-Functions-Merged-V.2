import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const [username, password, roleArg] = process.argv.slice(2);

  if (!username || !password) {
    console.error(
      "Usage: npm run create-user -- <username> <password> [user|admin]",
    );
    process.exit(1);
  }
  if (roleArg && roleArg !== "user" && roleArg !== "admin") {
    console.error('Role must be "user" or "admin".');
    process.exit(1);
  }
  const role: "user" | "admin" = roleArg === "admin" ? "admin" : "user";

  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalizedUsername))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, role })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing user "${normalizedUsername}" (role: ${role}).`);
    return;
  }

  await db.insert(users).values({
    username: normalizedUsername,
    passwordHash,
    role,
  });
  console.log(`Created user "${normalizedUsername}" (role: ${role}).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
