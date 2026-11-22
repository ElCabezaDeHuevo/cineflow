"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type CompanyRole = "owner" | "admin" | "producer" | "member" | "viewer";
type Props = { name: string; email: string; avatarUrl?: string | null; isAdmin: boolean; companyRole: CompanyRole | null };

const groups = [
  { label: "Espacio de trabajo", items: [{ href: "/", label: "Panel principal", icon: "▦" }] },
  { label: "Producción", items: [{ href: "/proyectos", label: "Proyectos", icon: "▣" }, { href: "/timeline", label: "Timeline", icon: "◷" }, { href: "/calendario", label: "Calendario", icon: "▦" }, { href: "/rodaje", label: "Planificador de rodaje", icon: "▤" }] },
  { label: "Colaboración", items: [{ href: "/equipo", label: "Equipo", icon: "♙" }, { href: "/actividad", label: "Actividad", icon: "↗" }, { href: "/horarios", label: "Jornadas", icon: "◷" }] },
  { label: "Herramientas", items: [{ href: "/buscar", label: "Buscar", icon: "⌕" }, { href: "/estadisticas", label: "Estadísticas", icon: "▥" }, { href: "/centro", label: "Centro de ayuda", icon: "?" }] },
];

function NavItems({ pathname, isAdmin, companyRole, onNavigate }: { pathname: string; isAdmin: boolean; companyRole: CompanyRole | null; onNavigate?: () => void }) {
  const canManageCompany = companyRole === "owner" || companyRole === "admin";
  return <>
    {groups.map((group) => <div key={group.label} className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">{group.label}</p><div className="space-y-1">{group.items.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"); return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`cf-nav-link ${active ? "is-active" : ""}`}><span className="cf-nav-icon">{item.icon}</span><span>{item.label}</span></Link>; })}</div></div>)}
    {canManageCompany && <div className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Mi productora</p><Link href="/empresa" onClick={onNavigate} className={`cf-nav-link ${pathname === "/empresa" ? "is-active" : ""}`}><span className="cf-nav-icon">⌂</span><span>Espacio de empresa</span></Link><Link href="/empresa/informes" onClick={onNavigate} className={`cf-nav-link ${pathname.startsWith("/empresa/informes") ? "is-active" : ""}`}><span className="cf-nav-icon">▥</span><span>Informes de empresa</span></Link></div>}
    {isAdmin && <div className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Administración global</p><Link href="/admin/informes" onClick={onNavigate} className={`cf-nav-link ${pathname === "/admin/informes" ? "is-active" : ""}`}><span className="cf-nav-icon">▥</span><span>Informes globales</span></Link><Link href="/admin" onClick={onNavigate} className={`cf-nav-link ${pathname.startsWith("/admin") && pathname !== "/admin/informes" ? "is-active" : ""}`}><span className="cf-nav-icon">⚙</span><span>Panel de administración</span></Link></div>}
  </>;
}

export default function AppNavigation({ name, email, avatarUrl, isAdmin, companyRole }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const initials = name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CF";
  const primary = [{ href: "/", label: "Inicio", icon: "▦" }, { href: "/proyectos", label: "Proyectos", icon: "▣" }, { href: "/timeline", label: "Timeline", icon: "◷" }, { href: "/equipo", label: "Equipo", icon: "♙" }];
  return <>
    <aside className="cf-sidebar hidden md:flex">
      <Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO</small></span></Link>
      <motion.div className="cf-sidebar-scroll" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}><NavItems pathname={pathname} isAdmin={isAdmin} companyRole={companyRole} /></motion.div>
      <Link href="/perfil" className="cf-account"><span className="cf-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span><span className="min-w-0"><strong>{name}</strong><small>{email || "Mi cuenta"}</small></span><span className="ml-auto text-zinc-500">⌄</span></Link>
    </aside>
    <header className="cf-mobile-header md:hidden"><Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO</small></span></Link><Link href="/perfil" className="cf-avatar">{initials}</Link></header>
    <motion.nav initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.32, ease: "easeOut" }} className="cf-mobile-nav md:hidden" aria-label="Navegación principal">{primary.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"); return <Link key={item.href} href={item.href} className={active ? "is-active" : ""}><span>{item.icon}</span><small>{item.label}</small></Link>; })}<button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}><span>•••</span><small>Más</small></button></motion.nav><AnimatePresence>{moreOpen && <motion.div className="cf-more-overlay" onClick={() => setMoreOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}><motion.section className="cf-more-sheet" onClick={(event) => event.stopPropagation()} initial={{ y: 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 32 }}><div className="mb-4 flex items-center justify-between"><strong className="text-sm">Más secciones</strong><button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar" className="text-zinc-400">✕</button></div><NavItems pathname={pathname} isAdmin={isAdmin} companyRole={companyRole} onNavigate={() => setMoreOpen(false)}/><Link href="/perfil" onClick={() => setMoreOpen(false)} className="cf-nav-link">Mi cuenta</Link></motion.section></motion.div>}</AnimatePresence>
  </>;
}
