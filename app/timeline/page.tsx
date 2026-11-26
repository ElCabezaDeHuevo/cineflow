import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UserAvatar from "@/lib/UserAvatar";
import TimelineProjects from "./TimelineProjects";

export const instant = false;

async function TimelineContent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await connection();

  const [{ data: projects }, { data: tasks }, { data: activity }] = await Promise.all([
    supabase.from("projects").select("id, name, type, stage, owner_role, start_date, delivery_date, description").order("start_date", { ascending: true }),
    supabase.from("project_tasks").select("project_id,status"),
    supabase.from("project_activity").select("id,project_id,actor_id,message,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const projectIds = (projects ?? []).map((project) => project.id);
  const activityUserIds = [...new Set((activity ?? []).map((event) => event.actor_id).filter(Boolean))];
  const [{ data: shootDays }, { data: dueTasks }, { data: profiles }] = await Promise.all([
    projectIds.length
      ? supabase.from("shoot_days").select("id,project_id,shoot_day_number,shoot_date,call_time").in("project_id", projectIds).not("shoot_date", "is", null).order("shoot_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("project_tasks").select("id,project_id,title,due_date,status").in("project_id", projectIds).not("due_date", "is", null).neq("status", "completada").order("due_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    activityUserIds.length
      ? supabase.from("profiles").select("id,full_name,avatar_url").in("id", activityUserIds)
      : Promise.resolve({ data: [] }),
  ]);
  const taskProgress = new Map<string, { total: number; complete: number }>();
  for (const task of tasks ?? []) {
    const progress = taskProgress.get(task.project_id) ?? { total: 0, complete: 0 };
    progress.total += 1;
    if (task.status === "completada") progress.complete += 1;
    taskProgress.set(task.project_id, progress);
  }
  const progressFor = (projectId: string) => {
    const progress = taskProgress.get(projectId);
    return progress?.total ? Math.round((progress.complete / progress.total) * 100) : 0;
  };
  const profileOf = (id: string | null) =>
    profiles?.find((profile) => profile.id === id);

  return (
    <main className="cf-cinematic-page cf-bg-timeline min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-4 sm:p-6 md:p-10">
        <Link
          href="/"
          className="text-sm text-violet-300 hover:text-violet-200"
        >
          ← Volver al panel
        </Link>
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-violet-300">
              PRODUCCIÓN / PLANIFICACIÓN
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              Línea de tiempo
            </h1>
            <p className="mt-2 max-w-2xl text-gray-400">
              Una vista ordenada de rodajes, entregas y próximos hitos de tus
              proyectos.
            </p>
          </div>
          <Link
            href="/proyectos"
            className="cf-action rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400"
          >
            + Nuevo proyecto
          </Link>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <p className="text-sm text-gray-400">Proyectos planificados</p>
            <p className="mt-3 text-3xl font-bold">{projects?.length ?? 0}</p>
          </article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <p className="text-sm text-gray-400">En producción</p>
            <p className="mt-3 text-3xl font-bold">
              {projects?.filter(
                (project) =>
                  project.stage.toLowerCase().includes("producci") ||
                  project.stage.toLowerCase().includes("rodaje"),
              ).length ?? 0}
            </p>
          </article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <p className="text-sm text-gray-400">Próximas entregas</p>
            <p className="mt-3 text-3xl font-bold">
              {projects?.filter(
                (project) =>
                  Boolean(project.delivery_date) && new Date(`${project.delivery_date}T00:00:00`) >= new Date(),
              ).length ?? 0}
            </p>
          </article>
        </section>

        <section className="cf-dashboard-panel mt-8 overflow-hidden">
          <TimelineProjects
            projects={(projects ?? []).map((project) => ({
              ...project,
              progress: progressFor(project.id),
            }))}
          />
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-2">
          <article className="cf-dashboard-panel overflow-hidden">
            <div className="border-b border-white/10 p-5"><p className="cf-eyebrow">Plan de rodaje</p><h2 className="mt-1 text-lg font-semibold">Próximas jornadas</h2><p className="mt-1 text-xs text-slate-400">Jornadas con fecha confirmada en tus proyectos.</p></div>
            <div className="divide-y divide-white/10">
              {shootDays?.length ? shootDays.slice(0,8).map((day) => (
                <Link key={day.id} href={`/rodaje?project=${day.project_id}`} className="flex items-center justify-between gap-4 p-4 transition hover:bg-white/[.03]">
                  <div className="min-w-0"><p className="text-sm font-semibold text-slate-100">Jornada {day.shoot_day_number}</p><p className="mt-1 text-xs text-slate-400">{projects?.find((project) => project.id === day.project_id)?.name ?? "Proyecto"}{day.call_time ? ` · Llamado ${day.call_time.slice(0,5)}` : ""}</p></div>
                  <time className="shrink-0 text-xs font-semibold text-violet-200">{new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(`${day.shoot_date}T12:00:00Z`))}</time>
                </Link>
              )) : <p className="p-5 text-sm text-slate-400">Todavía no hay jornadas con fecha programada.</p>}
            </div>
          </article>
          <article className="cf-dashboard-panel overflow-hidden">
            <div className="border-b border-white/10 p-5"><p className="cf-eyebrow">Seguimiento</p><h2 className="mt-1 text-lg font-semibold">Próximos vencimientos</h2><p className="mt-1 text-xs text-slate-400">Tareas abiertas con fecha límite asignada.</p></div>
            <div className="divide-y divide-white/10">
              {dueTasks?.length ? dueTasks.slice(0,8).map((task) => (
                <Link key={task.id} href={`/proyectos/seguimiento/${task.project_id}#task-${task.id}`} className="flex items-center justify-between gap-4 p-4 transition hover:bg-white/[.03]">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{task.title}</p><p className="mt-1 text-xs text-slate-400">{projects?.find((project) => project.id === task.project_id)?.name ?? "Proyecto"} · {task.status}</p></div>
                  <time className="shrink-0 text-xs font-semibold text-amber-200">{new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(`${task.due_date}T12:00:00Z`))}</time>
                </Link>
              )) : <p className="p-5 text-sm text-slate-400">No hay tareas abiertas con fecha límite.</p>}
            </div>
          </article>
        </section>

        <section className="cf-card mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-6"><h2 className="text-xl font-semibold">Historial de actividad</h2><p className="mt-1 text-sm text-gray-400">Quién hizo cada cambio y cuándo.</p></div>
          <div className="divide-y divide-white/10">
            {activity?.length ? activity.map((event) => {
              const profile = profileOf(event.actor_id);
              const name = profile?.full_name || "Usuario";
              return <div key={event.id} className="grid gap-2 p-5 md:grid-cols-[1fr_1.4fr_1fr]"><div className="flex items-center gap-3"><UserAvatar name={name} avatarUrl={profile?.avatar_url} /><div><p className="font-semibold text-gray-200">{name}</p><p className="text-xs text-gray-500">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</p></div></div><p className="text-sm text-gray-300">{event.message}</p><p className="text-xs text-violet-300">{projects?.find((project) => project.id === event.project_id)?.name || "Proyecto"}</p></div>;
            }) : <p className="p-6 text-sm text-gray-400">Todavía no hay actividad registrada.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b0c10] p-8 text-white">
          <div className="mx-auto max-w-7xl animate-pulse">
            <div className="h-10 w-72 rounded-lg bg-white/10" />
            <div className="mt-8 h-40 rounded-2xl bg-white/5" />
          </div>
        </main>
      }
    >
      <TimelineContent />
    </Suspense>
  );
}
