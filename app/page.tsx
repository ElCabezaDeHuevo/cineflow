import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import UpcomingDeliveryCount from "./UpcomingDeliveryCount";
import RecentProjects from "./RecentProjects";
import PendingLogbookNotifications from "./PendingLogbookNotifications";
import UserAvatar from "@/lib/UserAvatar";
import { isCineflowAdmin } from "@/lib/admin";

export const instant = false;

const etapas = [
  {
    nombre: "Preproducción",
    descripcion: "Guion, presupuesto y planificación",
  },
  { nombre: "Producción", descripcion: "Rodaje y coordinación del equipo" },
  { nombre: "Postproducción", descripcion: "Edición, sonido y color" },
  { nombre: "Entrega final", descripcion: "Revisión y distribución" },
];

function etapaIndex(stage: string) {
  const normalized = stage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("post")) return 2;
  if (
    normalized.includes("distrib") ||
    normalized.includes("entrega") ||
    normalized.includes("final")
  ) {
    return 3;
  }
  if (
    normalized.includes("pre") ||
    normalized.includes("desarrollo") ||
    normalized.includes("guion") ||
    normalized.includes("plan")
  ) {
    return 0;
  }
  if (normalized.includes("produ") || normalized.includes("rodaje")) return 1;
  return -1;
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const created = (await searchParams).created === "1";
  const storageAdmin = createSupabaseAdminClient();
  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Invitado";
  const isAdmin = isCineflowAdmin(user);
  const { data: companyMemberships, error: companyMembershipsError } = isAdmin
    ? { data: [], error: null }
    : await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id);
  if (companyMembershipsError) {
    throw new Error(`No se pudo determinar tu rol en la productora: ${companyMembershipsError.message}`);
  }
  const companyRolePriority: Record<string, number> = { owner: 5, admin: 4, producer: 3, member: 2, viewer: 1 };
  const companyRole = (companyMemberships ?? [])
    .map((membership) => membership.role)
    .sort((a, b) => (companyRolePriority[b] ?? 0) - (companyRolePriority[a] ?? 0))[0] ?? null;
  const canManageCompany = companyRole === "owner" || companyRole === "admin";

  await connection();
  const { data: allProjects, error: projectsError } = user
    ? await supabase
        .from("projects")
        .select("id,name,type,stage,delivery_date,created_at")
        .order("created_at", { ascending: false })
    : { data: [] };
  if (projectsError) {
    throw new Error(`No se pudieron cargar los proyectos recientes: ${projectsError.message}`);
  }
  const projectIds = (allProjects ?? []).map((project) => project.id);
  const [{ data: projectTasks, error: tasksError }, { data: projectCovers, error: coversError }] =
    await Promise.all([
      projectIds.length > 0
        ? supabase
            .from("project_tasks")
            .select("id,project_id,title,stage,status,assigned_to")
            .in("project_id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length > 0
        ? supabase
            .from("project_media")
            .select("project_id,storage_path,created_at")
            .eq("media_type", "cover")
            .in("project_id", projectIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (tasksError) {
    throw new Error(`No se pudo calcular el avance de los proyectos: ${tasksError.message}`);
  }
  if (coversError) {
    throw new Error(`No se pudieron cargar las portadas: ${coversError.message}`);
  }
  const { data: ownActiveSessions, error: ownActiveSessionsError } = await supabase
    .from("work_sessions")
    .select("clock_in")
    .eq("user_id", user.id)
    .is("clock_out", null)
    .is("deleted_at", null)
    .order("clock_in", { ascending: false })
    .limit(1);
  if (ownActiveSessionsError) {
    throw new Error(`No se pudo consultar tu jornada actual: ${ownActiveSessionsError.message}`);
  }
  const ownActiveSession = ownActiveSessions?.[0] ?? null;
  const projectNameById = new Map(
    (allProjects ?? []).map((project) => [project.id, project.name]),
  );
  const pendingLogbookTasks = (projectTasks ?? [])
    .filter(
      (task) => task.assigned_to === user.id && task.status === "pendiente",
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      stage: task.stage,
      projectId: task.project_id,
      projectName: projectNameById.get(task.project_id) ?? "Proyecto",
    }));
  const coverByProject = new Map<string, string>();
  if (storageAdmin) {
    for (const cover of projectCovers ?? []) {
      if (coverByProject.has(cover.project_id)) continue;
      const { data: signed } = await storageAdmin.storage
        .from("project-media")
        .createSignedUrl(cover.storage_path, 60 * 60);
      if (signed?.signedUrl) coverByProject.set(cover.project_id, signed.signedUrl);
    }
  }
  const tasksByProject = new Map<string, { total: number; completed: number }>();
  for (const task of projectTasks ?? []) {
    const progress = tasksByProject.get(task.project_id) ?? {
      total: 0,
      completed: 0,
    };
    progress.total += 1;
    if (task.status === "completada") progress.completed += 1;
    tasksByProject.set(task.project_id, progress);
  }
  const projects = allProjects ?? [];
  const etapaResumen = etapas.map((etapa, index) => {
    const stageProjects = projects.filter(
      (project) => etapaIndex(project.stage) === index,
    );
    const stageTasks = (projectTasks ?? []).filter(
      (task) => etapaIndex(task.stage) === index,
    );
    const completed = stageTasks.filter(
      (task) => task.status === "completada",
    ).length;
    return {
      ...etapa,
      projects: stageProjects,
      taskCount: stageTasks.length,
      completed,
      pending: stageTasks.filter((task) => task.status === "pendiente").length,
      progress: stageTasks.length
        ? Math.round((completed / stageTasks.length) * 100)
        : 0,
    };
  });
  const dashboardProjects = projects.map((project) => {
    const progress = tasksByProject.get(project.id) ?? {
      total: 0,
      completed: 0,
    };
    return {
      ...project,
      progress: progress.total
        ? Math.round((progress.completed / progress.total) * 100)
        : 0,
      taskCount: progress.total,
      coverUrl: coverByProject.get(project.id) ?? null,
    };
  });
  const panel = {
    total: projects.length,
    active: projects.filter((project) => {
      const stage = project.stage.toLowerCase();
      return !["entreg", "final", "complet", "cancel", "archiv"].some((term) => stage.includes(term));
    }).length,
    rodaje: projects.filter((project) => etapaIndex(project.stage) === 1).length,
    postproduccion: projects.filter((project) =>
      project.stage.toLowerCase().includes("post"),
    ).length,
  };
  const myOpenTasks = (projectTasks ?? []).filter(
    (task) => task.assigned_to === user.id && task.status !== "completada",
  ).length;
  const deliveryDates = projects.map((project) => project.delivery_date);

  return (
    <main className="cf-cinematic-page cf-bg-dashboard cf-dashboard min-h-screen text-white">
      <section className="mx-auto max-w-[1500px] p-4 sm:p-6 xl:p-10">
        {created && (
          <div role="status" className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 text-sm font-medium text-emerald-200">
            <span className="mr-2">✓</span> Proyecto creado correctamente. Ya puedes organizar su equipo y calendario.
          </div>
        )}

        <header className="cf-dashboard-hero cf-motion-hero mb-8 overflow-hidden rounded-[28px] border border-white/10 p-6 sm:p-8 xl:p-10">
          <div className="relative z-10 flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-violet-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                CineFlow Studio Workspace
              </div>
              <p className="text-sm font-medium text-violet-200">Tu centro de producción</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl xl:text-5xl">
                Hola, {displayName}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Organiza tus proyectos, coordina a tu equipo y mantén cada etapa de la producción bajo control.
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {isAdmin ? "Dueño de CineFlow" : companyRole === "owner" ? "Dueño de productora" : companyRole === "admin" ? "Administrador de productora" : companyRole === "producer" ? "Productor" : companyRole === "member" ? "Colaborador" : companyRole === "viewer" ? "Acceso de solo lectura" : "Espacio personal"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/proyectos" className="cf-dashboard-primary">
                <span aria-hidden="true">＋</span> Crear proyecto
              </Link>
              <Link href="/rodaje" className="cf-dashboard-secondary">
                <span aria-hidden="true">▤</span> Planificar rodaje
              </Link>
              {canManageCompany && <Link href="/empresa" className="cf-dashboard-secondary">
                <span aria-hidden="true">⌂</span> Mi productora
              </Link>}
              {isAdmin && <Link href="/admin" className="cf-dashboard-secondary">
                <span aria-hidden="true">⚙</span> Administración global
              </Link>}
            </div>
          </div>
          <div className="relative z-10 mt-8 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Proyectos en cartera</p><p className="mt-1 text-sm font-semibold text-white">{panel.total} proyectos visibles</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Actividad asignada</p><p className="mt-1 text-sm font-semibold text-white">{myOpenTasks} tareas abiertas para ti</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Mi jornada</p><p className="mt-1 text-sm font-semibold text-white">{ownActiveSession ? `En curso desde ${new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(new Date(ownActiveSession.clock_in))}` : "Sin jornada activa"}</p></div>
          </div>
        </header>

        <PendingLogbookNotifications tasks={pendingLogbookTasks} signInKey={user.last_sign_in_at ?? user.id} />

        <section className="cf-motion-section cf-motion-delay-1 mb-9" aria-label="Indicadores de producción">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="cf-eyebrow">Visión general</p><h2 className="mt-1 text-xl font-semibold">Tu producción de un vistazo</h2></div>
            <Link href="/estadisticas" className="text-sm font-medium text-violet-200 hover:text-white">Ver estadísticas completas →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="cf-metric-card cf-motion-card">
              <div className="flex items-center justify-between"><span className="cf-metric-icon">▣</span><span className="cf-metric-tag">Cartera</span></div>
              <p className="mt-5 text-sm text-slate-400">Proyectos visibles</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">{String(panel.total).padStart(2,"0")}</p>
              <p className="mt-2 text-xs text-slate-500">{panel.active} en etapas activas</p>
            </article>
            <article className="cf-metric-card">
              <div className="flex items-center justify-between"><span className="cf-metric-icon cf-metric-amber">▤</span><span className="cf-metric-tag">Rodaje</span></div>
              <p className="mt-5 text-sm text-slate-400">En producción</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">{String(panel.rodaje).padStart(2,"0")}</p>
              <p className="mt-2 text-xs text-slate-500">Proyectos en filmación</p>
            </article>
            <article className="cf-metric-card">
              <div className="flex items-center justify-between"><span className="cf-metric-icon cf-metric-cyan">◷</span><span className="cf-metric-tag">Postproducción</span></div>
              <p className="mt-5 text-sm text-slate-400">En edición y acabado</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">{String(panel.postproduccion).padStart(2,"0")}</p>
              <p className="mt-2 text-xs text-slate-500">Proyectos en etapa final</p>
            </article>
            <article className="cf-metric-card">
              <div className="flex items-center justify-between"><span className="cf-metric-icon cf-metric-green">⌁</span><span className="cf-metric-tag">Entregas</span></div>
              <p className="mt-5 text-sm text-slate-400">Próximos 30 días</p>
              <p className="mt-1 text-4xl font-bold tracking-tight"><UpcomingDeliveryCount deliveryDates={deliveryDates} total={panel.total} /></p>
              <p className="mt-2 text-xs text-slate-500">Fechas de entrega programadas</p>
            </article>
          </div>
        </section>

        <section className="cf-motion-section cf-motion-delay-2 mb-9 grid gap-5 xl:grid-cols-[1.3fr_.9fr]">
          <article className="cf-dashboard-panel cf-motion-panel p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div><p className="cf-eyebrow">Flujo de trabajo</p><h2 className="mt-1 text-xl font-semibold">Etapas de producción</h2><p className="mt-1 text-sm text-slate-400">Distribución de proyectos y tareas por fase.</p></div>
              <Link href="/timeline" className="text-sm font-medium text-violet-200">Abrir línea de tiempo →</Link>
            </div>
            <div className="space-y-5">
              {etapaResumen.map((etapa,index) => (
                <div key={etapa.nombre}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-300/10 text-xs font-bold text-violet-200">{String(index+1).padStart(2,"0")}</span><div><p className="text-sm font-semibold text-slate-100">{etapa.nombre}</p><p className="text-xs text-slate-500">{etapa.projects.length} proyectos · {etapa.taskCount} tareas</p></div></div>
                    <span className="text-sm font-semibold text-slate-200">{etapa.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[.07]" role="progressbar" aria-label={`Avance de ${etapa.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={etapa.progress}>
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300" style={{width:`${etapa.progress}%`}} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="cf-dashboard-panel p-5 sm:p-7">
            <p className="cf-eyebrow">Accesos directos</p>
            <h2 className="mt-1 text-xl font-semibold">¿Qué necesitas hacer?</h2>
            <p className="mt-1 text-sm text-slate-400">Entra directamente a las herramientas de tu día.</p>
            <div className="mt-6 grid gap-2.5">
              <Link href="/proyectos" className="cf-quick-link"><span className="cf-quick-icon">▣</span><span><strong>Proyectos</strong><small>Crear, explorar y administrar producciones</small></span><span className="ml-auto">→</span></Link>
              <Link href="/rodaje" className="cf-quick-link"><span className="cf-quick-icon">▤</span><span><strong>Planificador de rodaje</strong><small>Escenas, jornadas y locaciones</small></span><span className="ml-auto">→</span></Link>
              <Link href="/calendario" className="cf-quick-link"><span className="cf-quick-icon">▦</span><span><strong>Calendario</strong><small>Entregas, tareas y días de rodaje</small></span><span className="ml-auto">→</span></Link>
              <Link href="/equipo" className="cf-quick-link"><span className="cf-quick-icon">♙</span><span><strong>Equipo</strong><small>Personas y perfiles de producción</small></span><span className="ml-auto">→</span></Link>
              <Link href="/centro" className="cf-quick-link"><span className="cf-quick-icon">⌂</span><span><strong>Centro de trabajo</strong><small>Herramientas y actividad del equipo</small></span><span className="ml-auto">→</span></Link>
            </div>
          </article>
        </section>

        <section id="proyectos" className="cf-motion-section cf-motion-delay-3 mb-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="cf-eyebrow">Actividad reciente</p><h2 className="mt-1 text-xl font-semibold">Proyectos recientes</h2><p className="mt-1 text-sm text-slate-400">Continúa donde dejaste cada producción.</p></div>
            <Link href="/proyectos" className="text-sm font-medium text-violet-200 hover:text-white">Ver todos los proyectos →</Link>
          </div>
          <RecentProjects userId={user.id} projects={dashboardProjects} signedIn />
        </section>

        <section id="mi-jornada" className="cf-dashboard-panel cf-motion-section cf-motion-delay-4 flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7">
          <div className="flex items-center gap-4">
            <span className={ownActiveSession ? "flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-xl text-emerald-200" : "flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] text-xl text-slate-300"} aria-hidden="true">◷</span>
            <div><p className="cf-eyebrow">Control personal</p><h2 className="mt-1 text-lg font-semibold">Mi jornada</h2><p className="mt-1 text-sm text-slate-400">{ownActiveSession ? `Tu jornada está abierta desde las ${new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(new Date(ownActiveSession.clock_in))}.` : "Todavía no tienes una jornada activa."}</p></div>
          </div>
          <Link href="/horarios" className="cf-dashboard-secondary">Consultar mis jornadas →</Link>
        </section>
        <footer className="py-8 text-center text-[10px] font-medium uppercase tracking-[.2em] text-slate-600">CineFlow Studio · Producción conectada</footer>
      </section>
    </main>
  );

}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
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
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}
