import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  task_created: "Tarea creada", task_updated: "Tarea actualizada",
  task_completed: "Tarea completada", task_deleted: "Tarea eliminada",
  comment: "Comentario", stage_changed: "Cambio de etapa", project_updated: "Proyecto actualizado",
};

export default async function ActivityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/actividad");

  const { data: activity, error } = await supabase
    .from("project_activity")
    .select("id,project_id,task_id,actor_id,event_type,message,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const actorIds = [...new Set((activity ?? []).map((item) => item.actor_id).filter((id): id is string => Boolean(id)))];
  const projectIds = [...new Set((activity ?? []).map((item) => item.project_id))];
  const [{ data: profiles }, { data: projects }] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    projectIds.length ? supabase.from("projects").select("id,name").in("id", projectIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Usuario"]));
  const projectNames = new Map((projects ?? []).map((project) => [project.id, project.name]));

  return (
    <main className="cf-cinematic-page cf-bg-activity min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Panel principal</Link>
        <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Registro</p><h1 className="mt-2 text-3xl font-bold">Actividad reciente</h1><p className="mt-2 text-gray-400">Últimos movimientos registrados en los proyectos a los que tienes acceso.</p></header>
        {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudo consultar la actividad. Comprueba los permisos del proyecto.</p> : !activity?.length ? <div className="rounded-2xl border border-white/10 bg-[#14151c] p-8 text-center text-gray-400">Todavía no hay movimientos registrados.</div> : <ol className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">{activity.map((item) => <li key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-violet-200">{labels[item.event_type] ?? item.event_type}</span><time className="text-xs text-gray-500">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Tijuana" }).format(new Date(item.created_at))}</time></div><p className="mt-2 text-sm text-gray-200">{item.message || "Se registró un movimiento."}</p><p className="mt-1 text-xs text-gray-500">{names.get(item.actor_id ?? "") ?? "Miembro del equipo"} · {projectNames.get(item.project_id) ?? "Proyecto"}</p><Link href={`/proyectos/seguimiento/${item.project_id}${item.task_id ? `#task-${item.task_id}` : ""}`} className="mt-3 inline-flex text-xs text-violet-300 hover:text-violet-200">Ver proyecto →</Link></li>)}</ol>}
      </section>
    </main>
  );
}
