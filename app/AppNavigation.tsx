"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type CompanyRole = "owner" | "admin" | "producer" | "member" | "viewer";
type Props = { name: string; email: string; avatarUrl?: string | null; isAdmin: boolean; companyRole: CompanyRole | null };

const groups = [
  { label: "Inicio", items: [{ href: "/", label: "Panel principal", icon: "▦" }] },
  { label: "Producción", items: [
    { href: "/produccion", label: "Espacio de producción", icon: "▣" },
  ] },
  { label: "Equipo y comunicación", items: [
    { href: "/equipo", label: "Directorio del equipo", icon: "♙" },
    { href: "/actividad", label: "Actividad reciente", icon: "↗" },
    { href: "/horarios", label: "Mis jornadas", icon: "◷" },
  ] },
  { label: "Herramientas", items: [
    { href: "/buscar", label: "Búsqueda global", icon: "⌕" },
    { href: "/estadisticas", label: "Estadísticas", icon: "▥" },
    { href: "/centro", label: "Centro de trabajo", icon: "⌂" },
  ] },
];

const roleLabels: Record<CompanyRole, string> = {
  owner: "Dueño de productora",
  admin: "Administrador",
  producer: "Productor",
  member: "Colaborador",
  viewer: "Solo lectura",
};

function NavItems({ pathname, isAdmin, companyRole, onNavigate }: {
  pathname: string; isAdmin: boolean; companyRole: CompanyRole | null; onNavigate?: () => void;
}) {
  const canManageCompany = companyRole === "owner" || companyRole === "admin";
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/produccion") {
      return ["/produccion", "/proyectos", "/rodaje", "/calendario", "/timeline", "/centro"].some(
        (route) => pathname === route || pathname.startsWith(route + "/"),
      );
    }
    return pathname === href || pathname.startsWith(href + "/");
  };
  return <>
    {groups.map((group) => <div key={group.label} className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">{group.label}</p>
      <div className="space-y-1">{group.items.map((item) => {
        const active = isActive(item.href);
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`cf-nav-link ${active ? "is-active" : ""}`} title={item.label} aria-label={item.label}>
          <span className="cf-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </Link>;
      })}</div>
    </div>)}
    {canManageCompany && <div className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Mi productora</p>
      {[
        { href: "/empresa", label: "Resumen de empresa", icon: "⌂" },
        { href: "/empresa/miembros", label: "Miembros y usuarios", icon: "♙" },
        { href: "/empresa/roles", label: "Roles y permisos", icon: "⚿" },
        { href: "/empresa/invitaciones", label: "Invitaciones", icon: "✉" },
        { href: "/empresa/solicitudes", label: "Solicitudes", icon: "☷" },
        { href: "/empresa/puestos", label: "Puestos cinematográficos", icon: "▣" },
        { href: "/empresa/vigencia", label: "Plan y vigencia", icon: "◷" },
        { href: "/empresa/configuracion", label: "Configuración", icon: "⚙" },
        { href: "/empresa/informes", label: "Informes de empresa", icon: "▥" },
      ].map((item) => {
        const active = item.href === "/empresa" ? pathname === "/empresa" : isActive(item.href);
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`cf-nav-link ${active ? "is-active" : ""}`}>
          <span className="cf-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </Link>;
      })}
    </div>}
    {isAdmin && <div className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Administración global</p>
      <Link href="/admin" onClick={onNavigate} aria-current={pathname === "/admin" ? "page" : undefined} className={`cf-nav-link ${pathname === "/admin" ? "is-active" : ""}`}>
        <span className="cf-nav-icon" aria-hidden="true">⚙</span><span>Panel de administración</span>
      </Link>
      <Link href="/admin/productoras" onClick={onNavigate} aria-current={isActive("/admin/productoras") ? "page" : undefined} className={`cf-nav-link ${isActive("/admin/productoras") ? "is-active" : ""}`}>
        <span className="cf-nav-icon" aria-hidden="true">▣</span><span>Productoras y pagos</span>
      </Link>
      <Link href="/admin/informes" onClick={onNavigate} aria-current={isActive("/admin/informes") ? "page" : undefined} className={`cf-nav-link ${isActive("/admin/informes") ? "is-active" : ""}`}>
        <span className="cf-nav-icon" aria-hidden="true">▥</span><span>Informes globales</span>
      </Link>
      <Link href="/admin/horarios" onClick={onNavigate} aria-current={isActive("/admin/horarios") ? "page" : undefined} className={`cf-nav-link ${isActive("/admin/horarios") ? "is-active" : ""}`}>
        <span className="cf-nav-icon" aria-hidden="true">◷</span><span>Control de horarios</span>
      </Link>
      <Link href="/usuarios" onClick={onNavigate} aria-current={isActive("/usuarios") ? "page" : undefined} className={`cf-nav-link ${isActive("/usuarios") ? "is-active" : ""}`}>
        <span className="cf-nav-icon" aria-hidden="true">♙</span><span>Usuarios y solicitudes</span>
      </Link>
    </div>}
  </>;
}

export default function AppNavigation({ name, avatarUrl, isAdmin, companyRole }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CF";
  const primary = [
    { href: "/", label: "Inicio", icon: "▦" },
    { href: "/proyectos", label: "Proyectos", icon: "▣" },
    { href: "/calendario", label: "Agenda", icon: "▦" },
    { href: "/equipo", label: "Equipo", icon: "♙" },
  ];
  return <>
    <aside className="cf-sidebar hidden md:flex" aria-label="Navegación principal">
      <Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO WORKSPACE</small></span></Link>
      <div className="cf-sidebar-scroll"><NavItems pathname={pathname} isAdmin={isAdmin} companyRole={companyRole} /></div>
      <Link href="/perfil" className="cf-account" aria-label="Abrir mi perfil">
        <span className="cf-avatar">{avatarUrl ? <Image src={avatarUrl} alt="" width={40} height={40} unoptimized /> : initials}</span>
        <span className="min-w-0"><strong>{name}</strong><small>{isAdmin ? "Dueño de CineFlow" : roleLabels[companyRole ?? "viewer"]}</small></span>
        <span className="ml-auto text-zinc-500" aria-hidden="true">↗</span>
      </Link>
    </aside>
    <header className="cf-mobile-header md:hidden">
      <Link href="/" className="cf-brand"><span className="cf-brand-mark">C</span><span>CINE<span>FLOW</span><small>STUDIO</small></span></Link>
      <Link href="/perfil" className="cf-avatar" aria-label="Mi perfil">{avatarUrl ? <Image src={avatarUrl} alt="" width={40} height={40} unoptimized /> : initials}</Link>
    </header>
    <nav className="cf-mobile-nav md:hidden" aria-label="Navegación principal">
      {primary.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
        return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
          <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
        </Link>;
      })}
      <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label={moreOpen ? "Cerrar más secciones" : "Abrir más secciones"} aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="cf-more-menu">
        <span aria-hidden="true">•••</span><small>Más</small>
      </button>
    </nav>
    {moreOpen && <div className="cf-more-overlay" onClick={() => setMoreOpen(false)}>
      <section id="cf-more-menu" className="cf-more-sheet" role="dialog" aria-modal="true" aria-label="Más secciones" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-300">CineFlow</p><strong className="text-base">Todas las secciones</strong><p className="mt-1 text-xs text-zinc-400">{isAdmin ? "Dueño de CineFlow · Administración global" : roleLabels[companyRole ?? "viewer"]}</p></div>
          <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar menú" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 px-3 text-zinc-300">✕</button>
        </div>
        <Link href="/perfil" onClick={() => setMoreOpen(false)} className="mb-4 flex min-h-14 items-center gap-3 rounded-xl border border-violet-300/15 bg-violet-300/[.06] p-3">
          <span className="cf-avatar">{avatarUrl ? <Image src={avatarUrl} alt="" width={40} height={40} unoptimized /> : initials}</span>
          <span className="min-w-0"><strong className="block truncate text-sm text-white">{name}</strong><small className="block truncate text-xs text-zinc-400">Perfil, contraseña y seguridad</small></span>
          <span className="ml-auto text-zinc-500" aria-hidden="true">↗</span>
        </Link>
        <div className="cf-more-nav-scroll"><NavItems pathname={pathname} isAdmin={isAdmin} companyRole={companyRole} onNavigate={() => setMoreOpen(false)} /></div>
      </section>
    </div>}
  </>;
}
