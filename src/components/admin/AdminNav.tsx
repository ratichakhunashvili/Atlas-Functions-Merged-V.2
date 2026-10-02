"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Plain-language section names — this panel is used by non-developers. */
const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/hotels", label: "Hotels" },
  { href: "/admin/attractions", label: "Attractions" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/achievements", label: "Achievements" },
  { href: "/admin/models", label: "3D models" },
  { href: "/admin/qr-codes", label: "QR codes" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/itineraries", label: "Itineraries" },
  { href: "/admin/check-ins", label: "Check-ins" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      {SECTIONS.map((section) => {
        const active =
          section.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-indigo-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
