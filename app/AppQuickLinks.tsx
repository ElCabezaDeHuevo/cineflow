"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppQuickLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login" || (!isAdmin && pathname === "/")) return null;

  return (
    <nav
      aria-label="Navegación rápida"
      className="mobile-quick-links flex min-w-0 flex-wrap gap-2 sm:pointer-events-none sm:fixed sm:bottom-4 sm:left-4 sm:right-auto sm:z-40 sm:max-w-[calc(100vw-5rem)]"
    >
      {pathname !== "/" && (
        <Link
          href="/"
          className="rounded-lg border border-violet-400/30 bg-[#14151c]/95 px-3 py-2 text-xs font-semibold text-violet-200 shadow-lg backdrop-blur transition hover:bg-violet-500/20 sm:pointer-events-auto"
        >
          Inicio
        </Link>
      )}
      {isAdmin && pathname !== "/admin" && (
        <Link
          href="/admin"
          aria-label="Panel de administración"
          title="Panel de administración"
          className="rounded-lg border border-amber-400/30 bg-[#14151c]/95 px-3 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur transition hover:bg-amber-500/20 sm:pointer-events-auto"
        >
          Admin
        </Link>
      )}
    </nav>
  );
}
