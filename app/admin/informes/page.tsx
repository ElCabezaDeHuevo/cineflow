import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

export const instant = false;

function hoursBetween(start: string, end: string | null) {
  const finish = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, finish - new Date(start).getTime()) / 3_600_000;
}
function hoursLabel(value: number) {
  return `${value.toFixed(1)} h`;
}

export default async function AdminReportsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  if (!admin) return <main className="cf-cinematic-page cf-bg-admin min-h-screen bg-[#0b0c10] p-8 text-white">Falta configurar el acceso administrativo a Supabase.</main>;

  const [{ data: sessions, error: sessionsError }, { data: profiles, error: profilesError }, { data: projects }, { data: tasks }] = await Promise.all([
    admin.from("work_sessions").select("id,user_id,clock_in,clock_out,review_status,deleted_at").order("clock_in", { ascending: false }).limit(5000),
    admin.from("profiles").select("id,full_name"),
    admin.from("projects").select("id,name,stage"),
    admin.from("project_tasks").select("id,status"),
  ]);
  const profileNames = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Usuario"]));
  const activeSessions = (sessions ?? []).filter((s) => !s.deleted_at);
  const byUser = new Map<string, { sessions: number; hours: number; pending: number; active: number }>();
  for (const session of activeSessions) {
    const row = byUser.get(session.user_id) ?? { sessions: 0, hours: 0, pending: 0, active: 0 };
    row.sessions += 1;
    row.hours += hoursBetween(session.clock_in, session.clock_out);
    if (session.review_status === "pending_review") row.pending += 1;
    if (!session.clock_out) row.active += 1;
    byUser.set(session.user_id, row);
  }
  const completedTasks = (tasks ?? []).filter((t) => t.status === "completada").length;
  const pendingTasks = (tasks ?? []).filter((t) => t.status !== "completada").length;
  const pendingReview = activeSessions.filter((s) => s.review_status === "pending_review").length;

  return (
    <main className="min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-violet-300">← Administración</Link>
        <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Administración</p><h1 className="mt-2 text-3xl font-bold">Informes de operación</h1><p className="mt-2 text-gray-400">Resumen de asistencia, carga de trabajo y avance general.</p></header>
        {(sessionsError || profilesError) && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudieron cargar todos los datos del informe.</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Proyectos", projects?.length ?? 0],
            ["Tareas completadas", completedTasks],
            ["Tareas abiertas", pendingTasks],
            ["Jornadas por revisar", pendingReview],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}
        </div>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Asistencia por usuario</h2><p className="mt-1 text-xs text-gray-500">Hasta 5,000 jornadas · excluye jornadas eliminadas</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-white/[0.03] text-gray-400"><tr><th className="p-4 font-medium">Usuario</th><th className="p-4 font-medium">Jornadas</th><th className="p-4 font-medium">Horas acumuladas</th><th className="p-4 font-medium">Activas</th><th className="p-4 font-medium">Por revisar</th></tr></thead><tbody className="divide-y divide-white/10">{[...byUser.entries()].sort((a,b)=>b[1].hours-a[1].hours).map(([id,row])=><tr key={id}><td className="p-4 font-medium">{profileNames.get(id) ?? "Usuario"}</td><td className="p-4 tabular-nums">{row.sessions}</td><td className="p-4 tabular-nums">{hoursLabel(row.hours)}</td><td className="p-4 tabular-nums">{row.active}</td><td className="p-4 tabular-nums">{row.pending}</td></tr>)}</tbody></table></div>
          {!byUser.size && <p className="p-5 text-sm text-gray-500">No hay jornadas para mostrar.</p>}
        </section>
        <section className="mt-8 rounded-2xl border border-white/10 bg-[#14151c] p-5"><h2 className="font-semibold">Proyectos por etapa</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[...new Set((projects ?? []).map((p)=>p.stage))].map((stage)=><div key={stage} className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4"><span className="text-sm text-gray-300">{stage}</span><strong>{(projects ?? []).filter((p)=>p.stage===stage).length}</strong></div>)}</div></section>
        <p className="mt-6 text-xs text-gray-500">Las horas de jornadas abiertas se calculan hasta el momento de consulta. Este informe es un resumen operativo, no un registro de nómina.</p>
      </section>
    </main>
  );
}
