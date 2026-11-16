"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Inicio", short: "Inicio" },
  { href: "/proyectos", label: "Proyectos", short: "Proyectos" },
  { href: "/calendario", label: "Calendario", short: "Agenda" },
  { href: "/equipo", label: "Equipo", short: "Equipo" },
  { href: "/centro", label: "Centro de trabajo", short: "Centro" },
];

export default function AppQuickLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/recuperar" || pathname === "/restablecer") return null;

  const links = [
    ...destinations,
    ...(isAdmin ? [{ href: "/admin", label: "Administración", short: "Admin" }] : []),
  ];

  return (
    <nav aria-label="Navegación principal" className="mobile-quick-links flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#11121a]/95 p-1.5 shadow-xl shadow-black/25 backdrop-blur-xl sm:pointer-events-auto sm:fixed sm:bottom-5 sm:left-1/2 sm:z-40 sm:max-w-[min(94vw,720px)] sm:-translate-x-1/2">
      {links.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:px-4 ${active ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/20" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
