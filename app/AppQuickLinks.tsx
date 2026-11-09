"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppQuickLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/login") return null;

  return (
    <nav
      aria-label="Navegación rápida"
      className="mobile-quick-links flex min-w-0 flex-wrap gap-2 sm:pointer-events-none sm:fixed sm:bottom-5 sm:left-5 sm:right-auto sm:z-40 sm:max-w-[calc(100vw-6rem)]"
    >
      <Link
        href="/"
        className="rounded-xl border border-violet-400/30 bg-[#14151c]/95 px-2 py-3 text-xs font-semibold text-violet-200 shadow-lg backdrop-blur transition hover:bg-violet-500/20 sm:pointer-events-auto sm:px-4 sm:text-sm"
      >
        <span className="sm:hidden">Inicio</span>
        <span className="hidden sm:inline">← Menú principal</span>
      </Link>
      {isAdmin && pathname !== "/admin" && (
        <Link
          href="/admin"
          className="rounded-xl border border-amber-400/30 bg-[#14151c]/95 px-2 py-3 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur transition hover:bg-amber-500/20 sm:pointer-events-auto sm:px-4 sm:text-sm"
        >
          <span className="sm:hidden">Admin</span>
          <span className="hidden sm:inline">Panel de administración</span>
        </Link>
      )}
    </nav>
  );
}
