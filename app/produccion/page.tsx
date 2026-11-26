import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import ProductionNavigation from "@/app/ProductionNavigation";

const destinations = [
  { group: "Planificación", title: "Proyectos", description: "Consulta la cartera, crea producciones y administra equipos de proyecto.", href: "/proyectos", icon: "▣", action: "Abrir proyectos" },
  { group: "Planificación", title: "Planificador de rodaje", description: "Organiza escenas por jornada, llamado, locación y fecha.", href: "/rodaje", icon: "▤", action: "Planificar rodaje" },
  { group: "Planificación", title: "Agenda", description: "Revisa entregas, tareas por vencer, rodajes y eventos.", href: "/calendario", icon: "▦", action: "Abrir agenda" },
  { group: "Seguimiento", title: "Avance y actividad", description: "Consulta el progreso por proyecto, tareas abiertas y cambios recientes.", href: "/timeline", icon: "◷", action: "Ver seguimiento" },
  { group: "Seguimiento", title: "Centro de producción", description: "Consulta tus partes, notificaciones, presupuesto y agenda de trabajo.", href: "/centro", icon: "⌂", action: "Abrir centro" },
  { group: "Equipo", title: "Equipo de producción", description: "Encuentra colaboradores, perfiles y responsabilidades por proyecto.", href: "/equipo", icon: "♙", action: "Ver equipo" },
];

export default async function ProductionHomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/produccion");

  const isAdmin = isCineflowAdmin(user);
  const admin = isAdmin ? createSupabaseAdminClient() : null;
  const dataClient = isAdmin && admin ? admin : supabase;
  const { data: projects, error: projectsError } = await dataClient
    .from("projects")
    .select("id,stage,delivery_date")
    .order("delivery_date", { ascending: true })
    .limit(500);
  const projectIds = (projects ?? []).map((project) => project.id);
  const [{ data: tasks }, { data: shootDays }] = await Promise.all([
    projectIds.length
      ? dataClient.from("project_tasks").select("id,status,due_date").in("project_id", projectIds).neq("status", "completada")
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? dataClient.from("shoot_days").select("id,shoot_date").in("project_id", projectIds).not("shoot_date", "is", null)
      : Promise.resolve({ data: [] }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const monthAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const activeProjects = (projects ?? []).filter((project) => project.stage !== "Distribución").length;
  const upcomingTasks = (tasks ?? []).filter((task) => task.due_date && task.due_date >= today).length;
  const upcomingShootDays = (shootDays ?? []).filter((day) => day.shoot_date && day.shoot_date >= today && day.shoot_date <= monthAhead).length;

  return (
    <main className="cf-cinematic-page cf-bg-timeline min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-7xl">
        <ProductionNavigation active="/produccion" />
        <header className="mb-8 mt-5 rounded-3xl border border-white/10 bg-white/[.055] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">CineFlow / Espacio de producción</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Producción</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">Planifica cada proyecto, coordina el rodaje y mantén al equipo al día desde un solo espacio.</p>
        </header>
        {projectsError && <p role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudieron cargar las métricas de producción. Aún puedes abrir las herramientas de abajo.</p>}
        <section aria-label="Resumen de producción" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ["Proyectos activos", activeProjects],
            ["Tareas abiertas con fecha", upcomingTasks],
            ["Rodajes próximos 30 días", upcomingShootDays],
          ].map(([label, value]) => <article key={label} className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-4 sm:p-5">
            <p className="text-xs text-gray-400 sm:text-sm">{label}</p>
            <p className="mt-2 text-2xl font-bold text-violet-200 sm:text-3xl">{value}</p>
          </article>)}
        </section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300">Herramientas</p><h2 className="mt-1 text-xl font-semibold">Elige qué quieres organizar</h2></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {destinations.map((item) => <Link key={item.href} href={item.href} className="cf-card group flex min-h-48 flex-col rounded-2xl border border-white/10 bg-[#14151c]/90 p-5 transition hover:-translate-y-0.5 hover:border-violet-400/35 hover:bg-[#191a24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">{item.group}</span><span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-lg text-violet-200">{item.icon}</span></div>
            <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{item.description}</p>
            <span className="mt-auto pt-5 text-sm font-semibold text-violet-200">{item.action} <span aria-hidden="true">→</span></span>
          </Link>)}
        </div>
      </section>
    </main>
  );
}
