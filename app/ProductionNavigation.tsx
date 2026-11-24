import Link from "next/link";

const items = [
  { href: "/proyectos", label: "Proyectos", description: "Cartera y equipos", icon: "▣" },
  { href: "/rodaje", label: "Planificador de rodaje", description: "Escenas y jornadas", icon: "▤" },
  { href: "/calendario", label: "Calendario", description: "Fechas e hitos", icon: "▦" },
  { href: "/timeline", label: "Línea de tiempo", description: "Avance y actividad", icon: "◷" },
];

export default function ProductionNavigation({ active }: { active: string }) {
  return (
    <nav aria-label="Herramientas de producción" className="cf-production-nav">
      {items.map((item) => {
        const selected = item.href === active;
        return (
          <Link key={item.href} href={item.href} aria-current={selected ? "page" : undefined} className={selected ? "cf-production-tab is-active" : "cf-production-tab"}>
            <span className="cf-production-tab-icon" aria-hidden="true">{item.icon}</span>
            <span className="min-w-0"><strong>{item.label}</strong><small>{item.description}</small></span>
            <span className="cf-production-tab-arrow" aria-hidden="true">→</span>
          </Link>
        );
      })}
    </nav>
  );
}
