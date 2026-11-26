import Link from "next/link";

export default function ProjectWorkspaceNavigation({ projectId, active }: { projectId: string; active: "overview" | "tracking" }) {
  const items = [
    { key: "overview" as const, label: "Resumen del proyecto", href: `/proyectos/${projectId}` },
    { key: "tracking" as const, label: "Tareas y avance", href: `/proyectos/seguimiento/${projectId}` },
  ];
  return <nav aria-label="Secciones del proyecto" className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">{items.map((item) => <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm transition ${active === item.key ? "bg-violet-400/15 text-violet-100" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>{item.label}</Link>)}</nav>;
}
