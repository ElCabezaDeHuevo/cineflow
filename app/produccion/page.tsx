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
  { group: "Seguimiento", title: "Equipo de producción", description: "Consulta colaboradores y responsabilidades del proyecto.", href: "/equipo", icon: "♙", action: "Ver equipo" },
];
const toolGroups = [
  { title: "Planificación", description: "Define el proyecto, organiza jornadas y revisa fechas.", items: destinations.filter((item) => item.group === "Planificación") },
  { title: "Seguimiento y equipo", description: "Consulta avances y coordina a las personas del proyecto.", items: destinations.filter((item) => item.group === "Seguimiento") },
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
    .select("id,name,stage,delivery_date")
    .order("delivery_date", { ascending: true })
    .limit(500);
  const projectIds = (projects ?? []).map((project) => project.id);
  const [{ data: tasks }, { data: shootDays }] = await Promise.all([
    projectIds.length
      ? dataClient.from("project_tasks").select("id,project_id,title,status,due_date").in("project_id", projectIds).neq("status", "completada")
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? dataClient.from("shoot_days").select("id,project_id,shoot_day_number,shoot_date,location").in("project_id", projectIds).not("shoot_date", "is", null)
      : Promise.resolve({ data: [] }),
  ]);
  const todayParts = new Intl.DateTimeFormat("en", { timeZone: "America/Tijuana", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayPart = (type: string) => todayParts.find((item) => item.type === type)?.value ?? "";
  const today = `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;
  const monthAheadDate = new Date(`${today}T12:00:00.000Z`);
  monthAheadDate.setUTCDate(monthAheadDate.getUTCDate() + 30);
  const monthAhead = monthAheadDate.toISOString().slice(0, 10);
  const activeProjects = (projects ?? []).filter((project) => project.stage !== "Distribución").length;
  const upcomingTasks = (tasks ?? []).filter((task) => task.due_date && task.due_date >= today).length;
  const upcomingShootDays = (shootDays ?? []).filter((day) => day.shoot_date && day.shoot_date >= today && day.shoot_date <= monthAhead).length;
  const projectNames = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const nextTasks = (tasks ?? []).filter((task) => task.due_date && task.due_date <= monthAhead).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 3);
  const nextShootDays = (shootDays ?? []).filter((day) => day.shoot_date && day.shoot_date >= today).sort((a, b) => a.shoot_date!.localeCompare(b.shoot_date!)).slice(0, 3);

  return (
    <main className="cf-cinematic-page cf-production-surface min-h-screen px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-7xl">
        <ProductionNavigation active="/produccion" />
        <header className="mb-7 mt-5 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">CineFlow / Espacio de producción</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Producción</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">Planifica cada proyecto, coordina el rodaje y mantén al equipo al día desde un solo espacio.</p>
        </header>
        {projectsError && <p role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudieron cargar las métricas de producción. Aún puedes abrir las herramientas de abajo.</p>}
        <section aria-label="Resumen de producción" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ["Proyectos activos", activeProjects],
            ["Vencimientos futuros", upcomingTasks],
            ["Rodajes próximos 30 días", upcomingShootDays],
          ].map(([label, value]) => <article key={label} className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-4 sm:p-5">
            <p className="text-xs text-gray-400 sm:text-sm">{label}</p>
            <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{value}</p>
          </article>)}
        </section>
        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Próximas tareas</h2><Link href="/calendario?type=tarea&range=month" className="text-xs text-violet-300">Ver agenda →</Link></div>
            {nextTasks.length ? <ul className="mt-3 divide-y divide-white/10">{nextTasks.map((task) => <li key={task.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/proyectos/seguimiento/${task.project_id}#task-${task.id}`} className="block truncate text-sm font-medium hover:text-violet-200">{task.title}</Link><p className="mt-1 truncate text-xs text-gray-500">{projectNames.get(task.project_id) ?? "Proyecto"}</p></div><time className={`shrink-0 text-xs ${task.due_date! < today ? "text-rose-300" : "text-gray-400"}`}>{task.due_date}{task.due_date! < today ? " · vencida" : ""}</time></li>)}</ul> : <p className="mt-3 text-sm text-gray-400">No hay tareas abiertas con vencimiento en los próximos 30 días.</p>}
          </article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Próximos rodajes</h2><Link href="/calendario?type=rodaje&range=month" className="text-xs text-violet-300">Ver agenda →</Link></div>
            {nextShootDays.length ? <ul className="mt-3 divide-y divide-white/10">{nextShootDays.map((day) => <li key={day.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/rodaje?project=${day.project_id}`} className="block truncate text-sm font-medium hover:text-violet-200">Jornada {day.shoot_day_number}</Link><p className="mt-1 truncate text-xs text-gray-500">{projectNames.get(day.project_id) ?? "Proyecto"} · {day.location || "Locación pendiente"}</p></div><time className="shrink-0 text-xs text-gray-400">{day.shoot_date}</time></li>)}</ul> : <p className="mt-3 text-sm text-gray-400">No hay rodajes próximos registrados.</p>}
          </article>
        </section>
        <section aria-labelledby="production-tools-title" className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-gray-400">Herramientas</p>
          <h2 id="production-tools-title" className="mt-1 text-xl font-semibold">Organiza el trabajo</h2>
        </section>
        <div className="grid gap-4 xl:grid-cols-2">
          {toolGroups.map((group) => <section key={group.title} className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-4 sm:p-5">
            <header className="mb-2 border-b border-white/10 pb-3">
              <h3 className="font-semibold">{group.title}</h3>
              <p className="mt-1 text-sm text-gray-400">{group.description}</p>
            </header>
            <div className="divide-y divide-white/10">
              {group.items.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-14 items-center justify-between gap-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
                <span className="min-w-0"><strong className="block text-sm font-medium text-gray-100 group-hover:text-white">{item.title}</strong><small className="mt-1 block text-xs text-gray-400">{item.description}</small></span>
                <span aria-hidden="true" className="shrink-0 text-gray-500 transition group-hover:translate-x-1 group-hover:text-gray-200">→</span>
              </Link>)}
            </div>
          </section>)}
        </div>
      </section>
    </main>
  );
}
