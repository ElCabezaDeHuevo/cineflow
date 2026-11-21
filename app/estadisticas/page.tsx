import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCineflowAdmin } from "@/lib/admin";

export default async function StatisticsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/estadisticas");

  const [{ data: projects, error: pError }, { data: tasks, error: tError }, { data: sessions, error: sError }] = await Promise.all([
    supabase.from("projects").select("id,stage"),
    supabase.from("project_tasks").select("id,status,stage,project_id"),
    supabase.from("work_sessions").select("id,clock_in,clock_out,review_status,deleted_at").is("deleted_at", null),
  ]);
  const projectRows = projects ?? [];
  const taskRows = tasks ?? [];
  const sessionRows = sessions ?? [];
  const completed = taskRows.filter((task) => task.status === "completada").length;
  const active = taskRows.filter((task) => task.status === "en curso").length;
  const blocked = taskRows.filter((task) => task.status === "bloqueada").length;
  const pending = taskRows.filter((task) => task.status === "pendiente").length;
  const stages = [...new Set(projectRows.map((project) => project.stage))].map((stage) => ({ stage, count: projectRows.filter((project) => project.stage === stage).length }));
  const review = sessionRows.filter((session) => session.review_status === "pending_review").length;
  const totalHours = sessionRows.reduce((sum, session) => {
    if (!session.clock_out) return sum;
    return sum + Math.max(0, new Date(session.clock_out).getTime() - new Date(session.clock_in).getTime()) / 3600000;
  }, 0);
  const failed = pError || tError || sError;

  return <main className="cf-cinematic-page cf-bg-statistics min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8"><section className="mx-auto max-w-6xl">
    <Link href="/" className="text-sm text-violet-300">← Panel principal</Link>
    <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Métricas</p><h1 className="mt-2 text-3xl font-bold">Estadísticas</h1><p className="mt-2 text-gray-400">Resumen calculado con los registros a los que tienes acceso.</p></header>
    {failed ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudieron cargar todas las métricas. Revisa tus permisos.</p> : <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Proyectos", projectRows.length], ["Tareas", taskRows.length], ["Completadas", completed], ["Bloqueadas", blocked],
          ["En curso", active], ["Pendientes", pending], ["Jornadas registradas", sessionRows.length], ["Horas cerradas", totalHours.toFixed(1)],
        ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p></article>)}
      </div>
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#14151c] p-5"><h2 className="font-semibold">Proyectos por etapa</h2><div className="mt-4 space-y-4">{stages.length ? stages.map(({stage,count}) => <div key={stage}><div className="mb-1 flex justify-between text-sm"><span>{stage}</span><span className="text-gray-400">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400" style={{width:`${projectRows.length ? count/projectRows.length*100 : 0}%`}} /></div></div>) : <p className="text-sm text-gray-500">Sin proyectos visibles.</p>}</div></section>
      <p className="mt-4 text-xs text-gray-500">Jornadas pendientes de revisión: {review}. Las jornadas eliminadas no se incluyen. Las horas se calculan solo con jornadas cerradas.</p>
    </>}
    {isCineflowAdmin(user) && <Link href="/reportes" className="mt-6 inline-flex rounded-xl border border-violet-400/30 px-4 py-3 text-sm text-violet-200">Abrir informes administrativos →</Link>}
  </section></main>;
}
