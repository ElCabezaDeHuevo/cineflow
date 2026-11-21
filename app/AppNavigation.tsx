"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { name: string; email: string; avatarUrl?: string | null; isAdmin: boolean };

const groups = [
  { label: "Espacio de trabajo", items: [{ href: "/", label: "Panel principal", icon: "▦" }] },
  { label: "Producción", items: [{ href: "/proyectos", label: "Proyectos", icon: "▣" }, { href: "/timeline", label: "Timeline", icon: "◷" }, { href: "/calendario", label: "Calendario", icon: "▦" }, { href: "/rodaje", label: "Planificador de rodaje", icon: "▤" }] },
  { label: "Colaboración", items: [{ href: "/equipo", label: "Equipo", icon: "♙" }, { href: "/actividad", label: "Actividad", icon: "↗" }, { href: "/horarios", label: "Jornadas", icon: "◷" }] },
  { label: "Herramientas", items: [{ href: "/buscar", label: "Buscar", icon: "⌕" }, { href: "/admin/informes", label: "Informes", icon: "▥" }] },
];

function NavItems({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  return <>{groups.map((group) => <div key={group.label} className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">{group.label}</p><div className="space-y-1">{group.items.filter((item) => item.href !== "/admin/informes" || isAdmin).map((item) => { const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`cf-nav-link ${active ? "is-active" : ""}`}><span className="cf-nav-icon">{item.icon}</span><span>{item.label}</span></Link>; })}</div></div>)}{isAdmin && <div className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Administración</p><Link href="/admin" className={`cf-nav-link ${pathname.startsWith("/admin") ? "is-active" : ""}`}><span className="cf-nav-icon">⚙</span><span>Panel de administración</span></Link></div>}</>;
}

export default function AppNavigation({ name, email, avatarUrl, isAdmin }: Props) {
  const pathname = usePathname();
  const initials = name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CF";
  const primary = [{ href: "/", label: "Inicio", icon: "▦" }, { href: "/proyectos", label: "Proyectos", icon: "▣" }, { href: "/timeline", label: "Timeline", icon: "◷" }, { href: "/equipo", label: "Equipo", icon: "♙" }];
  return <>
    <aside className="cf-sidebar hidden md:flex">
      <Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO</small></span></Link>
      <div className="cf-sidebar-scroll"><NavItems pathname={pathname} isAdmin={isAdmin} /></div>
      <Link href="/perfil" className="cf-account"><span className="cf-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span><span className="min-w-0"><strong>{name}</strong><small>{email || "Mi cuenta"}</small></span><span className="ml-auto text-zinc-500">⌄</span></Link>
    </aside>
    <header className="cf-mobile-header md:hidden"><Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO</small></span></Link><Link href="/perfil" className="cf-avatar">{initials}</Link></header>
    <nav className="cf-mobile-nav md:hidden" aria-label="Navegación principal">{primary.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"); return <Link key={item.href} href={item.href} className={active ? "is-active" : ""}><span>{item.icon}</span><small>{item.label}</small></Link>; })}<Link href="/mas" onClick={(event) => { event.preventDefault(); document.dispatchEvent(new CustomEvent("cineflow:open-more")); }}><span>•••</span><small>Más</small></Link></nav>
  </>;
}
