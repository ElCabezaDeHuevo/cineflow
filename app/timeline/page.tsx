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

  const [{ data: projects }, { data: tasks }, { data: activity }, { data: profiles }] = await Promise.all([
    supabase.from("projects").select("id, name, type, stage, owner_role, start_date, delivery_date, description").order("start_date", { ascending: true }),
    supabase.from("project_tasks").select("id,project_id,title,status,stage,created_by,updated_at"),
    supabase.from("project_activity").select("id,project_id,actor_id,message,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id,full_name,avatar_url"),
  ]);
  const progressFor = (projectId: string) => {
    const projectTasks = tasks?.filter((task) => task.project_id === projectId) ?? [];
    return projectTasks.length ? Math.round((projectTasks.filter((task) => task.status === "completada").length / projectTasks.length) * 100) : 0;
  };
  const profileOf = (id: string | null) =>
    profiles?.find((profile) => profile.id === id);

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-6 md:p-10">
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
                  new Date(`${project.delivery_date}T00:00:00`) >= new Date(),
              ).length ?? 0}
            </p>
          </article>
        </section>

        <section className="cf-card mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <TimelineProjects
            projects={(projects ?? []).map((project) => ({
              ...project,
              progress: progressFor(project.id),
            }))}
          />
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
