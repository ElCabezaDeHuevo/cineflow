import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UpcomingDeliveryCount from "./UpcomingDeliveryCount";
import RecentProjects from "./RecentProjects";
import PendingLogbookNotifications from "./PendingLogbookNotifications";
import UserAvatar from "@/lib/UserAvatar";
import { isCineflowAdmin } from "@/lib/admin";
import { clockIn } from "./horarios/actions";

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
  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Invitado";
  const isAdmin = isCineflowAdmin(user);

  await connection();
  const { data: activeWorkSessions, error: activeSessionsError } =
    await supabase
      .from("work_sessions")
      .select("user_id,clock_in")
      .is("clock_out", null)
      .order("clock_in", { ascending: true });
  if (activeSessionsError) {
    throw new Error(
      `No se pudo cargar el equipo que está trabajando: ${activeSessionsError.message}`,
    );
  }
  const myActiveSession = (activeWorkSessions ?? []).find(
    (session) => session.user_id === user.id,
  );
  const activeUserIds = (activeWorkSessions ?? []).map(
    (session) => session.user_id,
  );
  const { data: activeProfiles, error: activeProfilesError } = activeUserIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", activeUserIds)
    : { data: [], error: null };
  if (activeProfilesError) {
    throw new Error(
      `No se pudieron cargar los perfiles del equipo: ${activeProfilesError.message}`,
    );
  }
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
            .select("project_id,public_url,created_at")
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
  for (const cover of projectCovers ?? []) {
    if (!coverByProject.has(cover.project_id)) {
      coverByProject.set(cover.project_id, cover.public_url);
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
    rodaje: projects.filter(
      (project) =>
        project.stage.toLowerCase().includes("rodaje") ||
        (project.stage.toLowerCase().includes("producci") &&
          !project.stage.toLowerCase().includes("post")),
    ).length,
    postproduccion: projects.filter((project) =>
      project.stage.toLowerCase().includes("post"),
    ).length,
  };
  const deliveryDates = projects.map((project) => project.delivery_date);

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0c10]/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-lg font-bold tracking-widest">
            CINE<span className="text-violet-400">FLOW</span>
          </div>
          <Link href={user ? "/perfil" : "/login"} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-gray-200">
            {user ? "Perfil" : "Login"}
          </Link>
        </div>
        <nav className="grid grid-cols-2 gap-2 px-4 pb-3 text-sm">
          <Link href="/" className="flex min-h-11 items-center justify-center rounded-lg bg-violet-500/15 px-3 py-2 text-center text-violet-200">Panel</Link>
          <Link href="/proyectos" className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-3 py-2 text-center text-gray-300">Proyectos</Link>
          <Link href="/timeline" className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-3 py-2 text-center text-gray-300">Timeline</Link>
          {myActiveSession ? (
            <Link href="/horarios" className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-3 py-2 text-center text-gray-300">Ver mi jornada</Link>
          ) : (
            <form action={clockIn}>
              <button className="flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-400 px-3 py-2 text-center font-semibold text-[#07120d] transition hover:bg-emerald-300">Checar entrada</button>
            </form>
          )}
          <Link href="/equipo" className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-3 py-2 text-center text-gray-300">Equipo</Link>
        </nav>
      </div>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-[#101116] p-6 md:block">
        <div className="mb-12 text-2xl font-bold tracking-widest">
          CINE<span className="text-violet-400">FLOW</span>
        </div>

        <p className="mb-3 text-xs uppercase tracking-widest text-gray-500">
          Producción
        </p>

        <nav className="space-y-2">
          <Link
            href="/"
            className="block rounded-xl bg-violet-500/15 px-4 py-3 text-violet-300"
          >
            ▦ &nbsp; Panel principal
          </Link>
          <Link
            href="/proyectos"
            className="block rounded-xl px-4 py-3 text-gray-400 hover:bg-white/5"
          >
            🎬 &nbsp; Proyectos
          </Link>
          <Link
            href="/timeline"
            className="block rounded-xl px-4 py-3 text-gray-400 hover:bg-white/5"
          >
            ◷ &nbsp; Línea de tiempo
          </Link>
          <Link
            href="/equipo"
            className="block rounded-xl px-4 py-3 text-gray-400 hover:bg-white/5"
          >
            ♙ &nbsp; Equipo
          </Link>
          {myActiveSession ? (
            <Link
              href="/horarios"
              className="block rounded-xl px-4 py-3 text-gray-400 hover:bg-white/5"
            >
              ◷ &nbsp; Ver mi jornada
            </Link>
          ) : (
            <form action={clockIn}>
              <button className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-left font-semibold text-[#07120d] transition hover:bg-emerald-300">
                ◷ &nbsp; Checar entrada
              </button>
            </form>
          )}
        </nav>

        <Link
          href={user ? "/perfil" : "/login"}
          className="absolute bottom-6 left-6 right-6 rounded-xl border border-white/10 p-4 transition hover:border-violet-400/50"
        >
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="mt-1 text-xs text-gray-500">
                {user ? "Ver mi perfil" : "Iniciar sesión"}
              </p>
            </div>
          </div>
        </Link>
      </aside>

      <section className="mx-auto max-w-7xl p-4 sm:p-6 md:ml-64 md:p-10">
        {created && (
          <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
            Proyecto creado correctamente.
          </div>
        )}
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-violet-300">
              ESPACIO DE TRABAJO / GENERAL
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              Panel de producción
            </h1>
            <p className="mt-2 text-sm text-gray-400 sm:text-base">
              Todo tu universo cinematográfico en un solo lugar.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/proyectos"
              className="cf-action rounded-xl bg-violet-500 px-5 py-3 text-center font-semibold transition hover:bg-violet-400"
            >
              + Nuevo proyecto
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 text-center font-semibold text-amber-200 transition hover:bg-amber-400/20"
              >
                Panel de administración
              </Link>
            )}
          </div>
        </header>

        <PendingLogbookNotifications
          tasks={pendingLogbookTasks}
          signInKey={user.last_sign_in_at ?? user.id}
        />

        <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Proyectos activos",
              String(panel.total).padStart(2, "0"),
              "En desarrollo",
            ],
            ["En producción", String(panel.rodaje).padStart(2, "0"), "Rodajes activos"],
            ["En postproducción", String(panel.postproduccion).padStart(2, "0"), "En edición y acabado"],
          ].map(([titulo, valor, detalle]) => (
            <article
              key={titulo}
              className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5"
            >
              <p className="text-sm text-gray-400">{titulo}</p>
              <p className="my-3 text-4xl font-bold">{valor}</p>
              <p className="text-xs text-gray-500">{detalle}</p>
            </article>
          ))}
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5">
            <p className="text-sm text-gray-400">Próximas entregas</p>
            <p className="my-3 text-4xl font-bold">
              <UpcomingDeliveryCount
                deliveryDates={deliveryDates}
                total={panel.total}
              />
            </p>
            <p className="text-xs text-gray-500">Siguientes 30 días</p>
          </article>
        </div>

        <section className="mb-10 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-violet-300">
                  Resumen operativo
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Estado de la producción
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Una lectura rápida de tu cartera actual.
                </p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                Datos actuales
              </span>
            </div>
            <div className="space-y-5">
              {[
                ["Proyectos en rodaje", panel.rodaje, "bg-amber-400"],
                [
                  "Proyectos en postproducción",
                  panel.postproduccion,
                  "bg-violet-400",
                ],
              ].map(([label, value, color]) => (
                <div key={String(label)}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-gray-300">{label}</span>
                    <span className="font-semibold text-white">{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{
                        width: `${panel.total ? Math.max(8, (Number(value) / panel.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <UpcomingDeliveryCount
                deliveryDates={deliveryDates}
                total={panel.total}
                showProgress
              />
            </div>
          </article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <p className="text-xs uppercase tracking-widest text-violet-300">
              Centro de acción
            </p>
            <h2 className="mt-2 text-xl font-semibold">Siguiente paso</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Organiza tus producciones, revisa las fechas de entrega y mantén
              al equipo alineado desde un mismo espacio.
            </p>
            <div className="mt-6 grid gap-3">
              <Link
                href="/proyectos"
                className="cf-action rounded-xl bg-violet-500 px-4 py-3 text-center text-sm font-semibold transition hover:bg-violet-400"
              >
                Gestionar proyectos
              </Link>
              <Link
                href="/horarios"
                className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
              >
                Registros de entradas y salidas
              </Link>
              <Link
                href="/perfil"
                className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-gray-300 transition hover:border-violet-400/50 hover:text-white"
              >
                Revisar mi perfil
              </Link>
            </div>
          </article>
        </section>

        <section id="proyectos" className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Proyectos recientes</h2>
              <p className="mt-1 text-sm text-gray-400">
                Seguimiento general de tus producciones.
              </p>
            </div>
            <Link href="/timeline" className="text-sm text-violet-300">
              Abrir línea de tiempo →
            </Link>
          </div>

          <RecentProjects
            userId={user?.id ?? null}
            projects={dashboardProjects}
            signedIn={Boolean(user)}
          />
        </section>

        <section
          id="timeline"
          className="mb-10 rounded-2xl border border-white/10 bg-[#14151c] p-6"
        >
          <h2 className="text-xl font-semibold">Etapas de producción</h2>
          <p className="mb-6 mt-1 text-sm text-gray-400">
            Avance de proyectos y partes en cada fase del flujo de trabajo.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {etapaResumen.map((etapa, index) => (
              <article
                key={etapa.nombre}
                className="cf-card rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-300">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white">{etapa.nombre}</h3>
                    <p className="mt-1 text-xs text-gray-400">
                      {etapa.descripcion}
                    </p>
                  </div>
                  <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                    {etapa.projects.length}{" "}
                    {etapa.projects.length === 1 ? "proyecto" : "proyectos"}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <span className="text-gray-300">
                      {etapa.completed}/{etapa.taskCount} partes completadas
                    </span>
                    <span className="text-amber-200">
                      {etapa.pending} pendientes
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label={`Avance de ${etapa.nombre}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={etapa.progress}
                  >
                    <div
                      className="cf-progress-fill h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${etapa.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-gray-500">
                    {etapa.progress}% completado
                  </p>
                </div>
                {etapa.projects.length ? (
                  <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
                    {etapa.projects.slice(0, 3).map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/proyectos/${project.id}`}
                          className="block truncate text-sm text-violet-200 transition hover:text-violet-100 hover:underline"
                        >
                          {project.name}
                        </Link>
                      </li>
                    ))}
                    {etapa.projects.length > 3 && (
                      <li className="text-xs text-gray-500">
                        y {etapa.projects.length - 3} más
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="mt-3 border-t border-white/10 pt-3 text-xs text-gray-500">
                    No hay proyectos en esta etapa.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section
          id="equipo"
          className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Equipo de producción</h2>
              <p className="mt-1 text-sm text-gray-400">
                Personas que registraron su entrada y siguen en jornada.
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
              {activeWorkSessions?.length ?? 0} trabajando
            </span>
          </div>
          {activeWorkSessions?.length ? (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeWorkSessions.map((session) => {
                const activeProfile = activeProfiles?.find(
                  (item) => item.id === session.user_id,
                );
                const name =
                  activeProfile?.full_name || "Usuario sin nombre";
                return (
                  <li
                    key={session.user_id}
                    className="flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4"
                  >
                    <UserAvatar
                      name={name}
                      avatarUrl={activeProfile?.avatar_url}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{name}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Entrada{" "}
                        {new Intl.DateTimeFormat("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(session.clock_in))}
                      </p>
                    </div>
                    <span
                      aria-label="En jornada"
                      className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400"
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
              Nadie ha registrado su entrada todavía.
            </p>
          )}
        </section>

        <footer className="py-8 text-center text-xs text-gray-600">
          CINEFLOW STUDIO · GESTIÓN DE PRODUCCIÓN AUDIOVISUAL
        </footer>
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
