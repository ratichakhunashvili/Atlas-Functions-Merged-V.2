import type { ReactNode } from "react";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <>
      <Navbar
        user={{ username: session.user.username, role: session.user.role }}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
