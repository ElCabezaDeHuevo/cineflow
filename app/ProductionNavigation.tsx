import Link from "next/link";

const items = [
  { href: "/produccion", label: "Resumen" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/rodaje", label: "Rodaje" },
  { href: "/calendario", label: "Agenda" },
  { href: "/timeline", label: "Seguimiento" },
];

export default function ProductionNavigation({ active }: { active: string }) {
  return (
    <nav aria-label="Herramientas de producción" className="cf-production-nav">
      {items.map((item) => {
        const selected = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={selected ? "cf-production-tab is-active" : "cf-production-tab"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
