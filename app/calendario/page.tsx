import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProductionNavigation from "@/app/ProductionNavigation";

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default async function ProductionCalendarPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/calendario");

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id,name,stage,start_date,delivery_date")
    .order("delivery_date", { ascending: true })
    .limit(200);
  const projectIds = (projects ?? []).map((project) => project.id);
  const [{ data: tasks, error: tasksError }, { data: shootDays, error: shootDaysError }, { data: scheduleItems, error: scheduleItemsError }] = await Promise.all([
    projectIds.length
      ? supabase
          .from("project_tasks")
          .select("id,project_id,title,stage,status,due_date")
          .in("project_id", projectIds)
          .neq("status", "completada")
          .not("due_date", "is", null)
          .order("due_date", { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase
          .from("shoot_days")
          .select("id,project_id,shoot_day_number,shoot_date,call_time,location")
          .in("project_id", projectIds)
          .not("shoot_date", "is", null)
          .order("shoot_date", { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase
          .from("project_schedule_items")
          .select("id,project_id,title,description,starts_at,ends_at,location")
          .in("project_id", projectIds)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const projectName = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const events = [
    ...(projects ?? []).flatMap((project) => [
      ...(project.start_date ? [{ id: `start-${project.id}`, date: project.start_date, label: "Inicio", title: project.name, detail: project.stage, href: `/proyectos/seguimiento/${project.id}` }] : []),
      ...(project.delivery_date ? [{ id: `delivery-${project.id}`, date: project.delivery_date, label: "Entrega", title: project.name, detail: project.stage, href: `/proyectos/seguimiento/${project.id}` }] : []),
    ]),
    ...(shootDays ?? []).map((day) => ({ id: `shoot-${day.id}`, date: day.shoot_date!, label: "Rodaje", title: `Jornada ${day.shoot_day_number}`, detail: `${projectName.get(day.project_id) ?? "Proyecto"} · ${day.location || "Locación pendiente"}${day.call_time ? ` · Llamado ${day.call_time.slice(0,5)}` : ""}`, href: `/rodaje?project=${day.project_id}` })),
    ...(tasks ?? []).map((task) => ({ id: `task-${task.id}`, date: task.due_date!, label: task.status === "bloqueada" ? "Bloqueada" : "Vence tarea", title: task.title, detail: `${projectName.get(task.project_id) ?? "Proyecto"} · ${task.stage}`, href: `/proyectos/seguimiento/${task.project_id}#task-${task.id}` })),
    ...(scheduleItems ?? []).map((item) => ({
      id: `schedule-${item.id}`,
      date: item.starts_at.slice(0, 10),
      label: "Evento",
      title: item.title,
      detail: `${projectName.get(item.project_id) ?? "Proyecto"} · ${new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Tijuana" }).format(new Date(item.starts_at))}${item.location ? ` · ${item.location}` : ""}`,
      href: "/centro#agenda",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="cf-cinematic-page cf-bg-calendar min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-6xl">
        <ProductionNavigation active="/calendario" />
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Panel principal</Link>
        <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Planificación</p><h1 className="mt-2 text-3xl font-bold">Calendario de producción</h1><p className="mt-2 text-gray-400">Fechas de proyectos, rodajes, eventos programados y tareas por vencer.</p></header>
        {(projectsError || tasksError || shootDaysError || scheduleItemsError) && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudo cargar toda la planificación. Revisa los permisos de tus proyectos.</p>}
        {!events.length ? <div className="rounded-2xl border border-white/10 bg-[#14151c] p-8 text-center text-gray-400">Todavía no hay fechas o tareas pendientes para mostrar.</div> : <div className="cf-dashboard-panel overflow-hidden"><div className="border-b border-white/10 p-5 sm:p-6"><h2 className="font-semibold">{events.length} eventos de planificación</h2><p className="mt-1 text-xs text-gray-500">Ordenados cronológicamente · proyectos, rodajes, eventos y tareas con fecha límite</p></div><ol className="divide-y divide-white/10">{events.map((event) => <li key={event.id} className="grid gap-3 p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><time className="text-sm font-semibold text-violet-200">{dateLabel(event.date)}</time><div className="min-w-0"><p className="font-medium">{event.title}</p><p className="mt-1 text-xs text-gray-400">{event.label} · {event.detail}</p></div><Link href={event.href} className="text-sm text-violet-300 hover:text-violet-200">Abrir →</Link></li>)}</ol></div>}
      </section>
    </main>
  );
}
