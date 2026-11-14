import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default async function ProductionCalendarPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/calendario");

  const [{ data: projects, error: projectsError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from("projects").select("id,name,stage,start_date,delivery_date").order("delivery_date", { ascending: true }).limit(200),
    supabase.from("project_tasks").select("id,project_id,title,stage,status,updated_at").neq("status", "completada").order("updated_at", { ascending: true }).limit(300),
  ]);
  const projectName = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const events = [
    ...(projects ?? []).flatMap((project) => [
      ...(project.start_date ? [{ id: `start-${project.id}`, date: project.start_date, label: "Inicio", title: project.name, detail: project.stage, href: `/proyectos/seguimiento/${project.id}` }] : []),
      ...(project.delivery_date ? [{ id: `delivery-${project.id}`, date: project.delivery_date, label: "Entrega", title: project.name, detail: project.stage, href: `/proyectos/seguimiento/${project.id}` }] : []),
    ]),
    ...(tasks ?? []).map((task) => ({ id: `task-${task.id}`, date: task.updated_at.slice(0, 10), label: task.status === "bloqueada" ? "Bloqueada" : "Pendiente", title: task.title, detail: `${projectName.get(task.project_id) ?? "Proyecto"} · ${task.stage}`, href: `/proyectos/seguimiento/${task.project_id}#task-${task.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Panel principal</Link>
        <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Planificación</p><h1 className="mt-2 text-3xl font-bold">Calendario de producción</h1><p className="mt-2 text-gray-400">Fechas de inicio, entregas y tareas aún no completadas.</p></header>
        {(projectsError || tasksError) && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudo cargar toda la planificación. Revisa los permisos de tus proyectos.</p>}
        {!events.length ? <div className="rounded-2xl border border-white/10 bg-[#14151c] p-8 text-center text-gray-400">Todavía no hay fechas o tareas pendientes para mostrar.</div> : <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">{events.length} eventos de planificación</h2><p className="mt-1 text-xs text-gray-500">Ordenados cronológicamente · hasta 200 proyectos y 300 tareas</p></div><ol className="divide-y divide-white/10">{events.map((event) => <li key={event.id} className="grid gap-3 p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><time className="text-sm font-semibold text-violet-200">{dateLabel(event.date)}</time><div className="min-w-0"><p className="font-medium">{event.title}</p><p className="mt-1 text-xs text-gray-400">{event.label} · {event.detail}</p></div><Link href={event.href} className="text-sm text-violet-300 hover:text-violet-200">Abrir →</Link></li>)}</ol></div>}
      </section>
    </main>
  );
}
