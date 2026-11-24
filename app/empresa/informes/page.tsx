import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const instant = false;

const durationLabel = (milliseconds: number) => {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Tijuana",
}).format(new Date(value));

export default async function CompanyReportsPage({ searchParams }: {
  searchParams: Promise<{ organization_id?: string }>;
}) {
  const { organization_id: requestedId } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members").select("organization_id,role")
    .eq("user_id", user.id).in("role", ["owner", "admin"]);
  if (membershipError) throw new Error("No se pudieron verificar tus permisos de empresa.");
  const membership = (memberships ?? []).find((item) => !requestedId || item.organization_id === requestedId);
  if (!membership) redirect("/empresa?error=No+tienes+permisos+para+ver+informes+de+esa+productora");

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("No está configurado el servicio de informes.");
  const [{ data: organization }, { data: members, error: membersError }, { data: projects, error: projectsError }] = await Promise.all([
    admin.from("organizations").select("id,name").eq("id", membership.organization_id).single(),
    admin.from("organization_members").select("user_id,role,joined_at").eq("organization_id", membership.organization_id),
    admin.from("projects").select("id,name,stage,start_date,delivery_date").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }),
  ]);
  if (membersError || projectsError) throw new Error("No se pudieron cargar los datos de la productora.");
  const memberIds = (members ?? []).map((item) => item.user_id);
  const projectIds = (projects ?? []).map((item) => item.id);
  const [{ data: sessions, error: sessionsError }, { data: profiles }, { data: tasks }] = await Promise.all([
    memberIds.length ? admin.from("work_sessions").select("id,user_id,clock_in,clock_out,review_status,deleted_at").in("user_id", memberIds).order("clock_in", { ascending: false }).limit(10000) : Promise.resolve({ data: [], error: null }),
    memberIds.length ? admin.from("profiles").select("id,full_name").in("id", memberIds) : Promise.resolve({ data: [] }),
    projectIds.length ? admin.from("project_tasks").select("id,project_id,status").in("project_id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  if (sessionsError) throw new Error("No se pudieron cargar las jornadas del equipo.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Integrante"]));
  const rows = new Map<string, { count: number; hours: number; active: number; pending: number }>();
  for (const id of memberIds) rows.set(id, { count: 0, hours: 0, active: 0, pending: 0 });
  for (const session of sessions ?? []) {
    if (session.deleted_at) continue;
    const row = rows.get(session.user_id);
    if (!row) continue;
    row.count += 1;
    row.hours += Math.max(0, new Date(session.clock_out ?? new Date().toISOString()).getTime() - new Date(session.clock_in).getTime());
    if (!session.clock_out) row.active += 1;
    if (session.review_status === "pending_review") row.pending += 1;
  }
  const totalHours = [...rows.values()].reduce((sum, row) => sum + row.hours, 0);
  const completedTasks = (tasks ?? []).filter((task) => task.status === "completada").length;
  const pendingTasks = (tasks ?? []).filter((task) => task.status !== "completada").length;
  const openSessions = [...rows.values()].reduce((sum, row) => sum + row.active, 0);
  const pendingReviews = [...rows.values()].reduce((sum, row) => sum + row.pending, 0);

  return <main className="cf-cinematic-page cf-bg-company-reports min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
    <section className="mx-auto max-w-6xl">
      <Link href="/empresa" className="text-sm text-violet-300">← Espacio de empresa</Link>
      <header className="mb-8 mt-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Informes de productora</p><h1 className="mt-2 text-3xl font-bold">Informes de {organization?.name ?? "mi empresa"}</h1><p className="mt-2 text-gray-400">Indicadores de asistencia y carga operativa exclusivamente de los integrantes de esta productora.</p></header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Integrantes", memberIds.length],
          ["Horas acumuladas", durationLabel(totalHours)],
          ["Proyectos", projects?.length ?? 0],
          ["Tareas completadas", completedTasks],
        ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[["Tareas abiertas", pendingTasks], ["Jornadas activas", openSessions], ["Jornadas por revisar", pendingReviews]].map(([label,value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}
      </div>
      <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
        <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Asistencia por integrante</h2><p className="mt-1 text-xs text-gray-500">Jornadas eliminadas excluidas. Las jornadas abiertas se calculan hasta el momento de consulta. Máximo 10,000 registros consultados.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-white/[0.03] text-gray-400"><tr><th className="p-4 font-medium">Integrante</th><th className="p-4 font-medium">Jornadas</th><th className="p-4 font-medium">Horas</th><th className="p-4 font-medium">Activas</th><th className="p-4 font-medium">Por revisar</th></tr></thead><tbody className="divide-y divide-white/10">{memberIds.map((id) => { const row = rows.get(id)!; return <tr key={id}><td className="p-4 font-medium">{names.get(id) ?? "Integrante"}</td><td className="p-4 tabular-nums">{row.count}</td><td className="p-4 tabular-nums">{durationLabel(row.hours)}</td><td className="p-4 tabular-nums">{row.active}</td><td className="p-4 tabular-nums">{row.pending}</td></tr>; })}</tbody></table></div>
        {!memberIds.length && <p className="p-5 text-sm text-gray-500">Esta productora aún no tiene integrantes.</p>}
      </section>
      <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
        <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Proyectos y avance</h2></div>
        <div className="divide-y divide-white/10">{(projects ?? []).map((project) => { const related = (tasks ?? []).filter((task) => task.project_id === project.id); const done = related.filter((task) => task.status === "completada").length; return <article key={project.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-medium">{project.name}</p><p className="mt-1 text-xs text-gray-500">{project.stage} · Entrega: {project.delivery_date ? dateLabel(project.delivery_date) : "Sin fecha"}</p></div><div className="text-right"><p className="font-semibold">{related.length ? Math.round(done / related.length * 100) : 0}%</p><p className="text-xs text-gray-500">{done}/{related.length} tareas</p></div></article>; })}</div>
        {!projects?.length && <p className="p-5 text-sm text-gray-500">No hay proyectos vinculados a esta productora.</p>}
      </section>
    </section>
  </main>;
}
