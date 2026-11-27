import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import {
  approveProjectMembershipRequest,
  approveProjectLeaveRequest,
  createProject,
  leaveProject,
  rejectProjectLeaveRequest,
  rejectProjectMembershipRequest,
  requestProjectMembership,
  requestProjectDeletion,
  updateProject,
} from "./actions";
import ProjectForm from "./ProjectForm";
import ConfirmSubmit from "@/app/ConfirmSubmit";

export const instant = false;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ nombre?: string; error?: string; success?: string; q?: string; etapa?: string; tipo?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?${new URLSearchParams({
        error: "Inicia sesión para ver los proyectos y solicitar unirte.",
        next: "/proyectos",
      })}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const [{ data: memberships, error: membershipsError }, { nombre, error, success, q: rawQuery, etapa: rawStage, tipo: rawType }] =
    await Promise.all([
      supabase
        .from("project_members")
        .select("project_id,role")
        .eq("user_id", user.id),
      searchParams,
    ]);
  if (membershipsError) {
    throw new Error(`No se pudo consultar tu acceso a los proyectos: ${membershipsError.message}`);
  }
  const isAdmin = isCineflowAdmin(user);
  const { data: organizations, error: organizationsError } =
    isAdmin && admin
      ? await admin.from("organizations").select("id,name").order("name")
      : { data: [], error: null };

  const projectsQuery = isAdmin && admin
    ? admin
        .from("projects")
        .select("id,name,type,stage,delivery_date,created_at,owner_role,start_date,description")
        .order("created_at", { ascending: false })
    : supabase
        .from("projects")
        .select("id,name,type,stage,delivery_date,created_at,owner_role,start_date,description")
        .order("created_at", { ascending: false });
  const { data: projects, error: projectsError } = await projectsQuery;
  if (projectsError) {
    throw new Error(`No se pudieron cargar los proyectos: ${projectsError.message}`);
  }

  let joinableProjects: { id: string; name: string; type: string; stage: string }[] = [];
  if (!isAdmin && admin) {
    const { data: companyMemberships, error: companyMembershipsError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id);
    if (companyMembershipsError) throw companyMembershipsError;

    const companyIds = (companyMemberships ?? []).map(({ organization_id }) => organization_id);
    if (companyIds.length) {
      // Membership is checked through the session's RLS before using the admin client.
      const { data: catalog, error: catalogError } = await admin
        .from("projects")
        .select("id,name,type,stage")
        .in("organization_id", companyIds)
        .order("created_at", { ascending: false });
      if (catalogError) throw catalogError;
      const accessibleIds = new Set((projects ?? []).map(({ id }) => id));
      joinableProjects = (catalog ?? []).filter(({ id }) => !accessibleIds.has(id));
    }
  }

  const q = typeof rawQuery === "string" ? rawQuery : "";
  const etapa = typeof rawStage === "string" ? rawStage : "";
  const tipo = typeof rawType === "string" ? rawType : "";
  const normalizedQuery = q.trim().toLocaleLowerCase("es-MX");
  const visibleProjects = (projects ?? []).filter((project) =>
    (!normalizedQuery || project.name.toLocaleLowerCase("es-MX").includes(normalizedQuery) || (project.description ?? "").toLocaleLowerCase("es-MX").includes(normalizedQuery)) &&
    (!etapa || project.stage === etapa) &&
    (!tipo || project.type === tipo),
  );
  const visibleJoinableProjects = joinableProjects.filter((project) =>
    (!normalizedQuery || project.name.toLocaleLowerCase("es-MX").includes(normalizedQuery)) &&
    (!etapa || project.stage === etapa) &&
    (!tipo || project.type === tipo),
  );
  const catalog = [...(projects ?? []), ...joinableProjects];
  const projectIds = catalog.map((project) => project.id);
  const ownedProjectIds = (memberships ?? [])
    .filter((membership) => membership.role === "owner")
    .map((membership) => membership.project_id);
  const visibleProjectIds = visibleProjects.map((project) => project.id);
  const [
    pendingLeaveResult,
    ownLeaveResult,
    ownDeletionResult,
    pendingMembershipResult,
    ownRequestResult,
  ] = await Promise.all([
    admin && ownedProjectIds.length
      ? admin.from("project_leave_requests").select("id,project_id,user_id,created_at").eq("status", "pending").in("project_id", ownedProjectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    admin && projectIds.length
      ? admin.from("project_leave_requests").select("project_id,status,created_at").eq("user_id", user.id).in("project_id", projectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin && projectIds.length
      ? admin.from("project_deletion_requests").select("project_id,status,created_at").eq("requester_id", user.id).in("project_id", projectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin && ownedProjectIds.length
      ? admin.from("project_membership_requests").select("id,project_id,user_id,created_at").eq("status", "pending").in("project_id", ownedProjectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    admin && projectIds.length
      ? admin.from("project_membership_requests").select("project_id,status,created_at").eq("user_id", user.id).in("project_id", projectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const pendingLeaveRequests = pendingLeaveResult.data ?? [];
  const ownLeaveRequests = ownLeaveResult.data ?? [];
  const ownDeletionRequests = ownDeletionResult.data ?? [];
  const pendingMembershipRequests = pendingMembershipResult.data ?? [];
  const ownRequests = ownRequestResult.data ?? [];
  const leaveRequestsError = pendingLeaveResult.error?.message ?? ownLeaveResult.error?.message ?? null;
  const membershipRequestsError = pendingMembershipResult.error?.message ?? null;
  const requestsError = ownRequestResult.error?.message ?? null;

  const latestLeaveRequestByProject = new Map<string, string>();
  for (const request of ownLeaveRequests) {
    if (!latestLeaveRequestByProject.has(request.project_id)) {
      latestLeaveRequestByProject.set(request.project_id, request.status);
    }
  }
  const latestDeletionRequestByProject = new Map<string, string>();
  for (const request of ownDeletionRequests) {
    if (!latestDeletionRequestByProject.has(request.project_id)) {
      latestDeletionRequestByProject.set(request.project_id, request.status);
    }
  }

  const requesterIds = [...new Set([
    ...pendingMembershipRequests.map((request) => request.user_id),
    ...pendingLeaveRequests.map((request) => request.user_id),
  ])];
  const [{ data: requesterProfiles, error: requesterProfilesError }, { data: covers, error: coversError }] = await Promise.all([
    requesterIds.length
      ? (admin ?? supabase).from("profiles").select("id,full_name").in("id", requesterIds)
      : Promise.resolve({ data: [], error: null }),
    admin && visibleProjectIds.length
      ? admin.from("project_media").select("project_id,storage_path,created_at").eq("media_type", "cover").in("project_id", visibleProjectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (requesterProfilesError) {
    throw new Error(`No se pudieron cargar los perfiles solicitantes: ${requesterProfilesError.message}`);
  }
  if (coversError) {
    throw new Error(`No se pudieron cargar las portadas: ${coversError.message}`);
  }
  const requesterNameById = new Map(
    (requesterProfiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const projectNameById = new Map(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const coverByProject = new Map<string, string>();
  if (admin && covers?.length) {
    const latestCoverByProject = new Map<string, (typeof covers)[number]>();
    for (const cover of covers) {
      if (!latestCoverByProject.has(cover.project_id)) latestCoverByProject.set(cover.project_id, cover);
    }
    const signedCovers = await Promise.all(
      [...latestCoverByProject.values()].map(async (cover) => {
        const { data: signed } = await admin.storage.from("project-media").createSignedUrl(cover.storage_path, 60 * 60);
        return signed?.signedUrl ? [cover.project_id, signed.signedUrl] as const : null;
      }),
    );
    for (const signed of signedCovers) {
      if (signed) coverByProject.set(signed[0], signed[1]);
    }
  }
  const latestRequestByProject = new Map<string, string>();
  for (const request of ownRequests) {
    if (!latestRequestByProject.has(request.project_id)) {
      latestRequestByProject.set(request.project_id, request.status);
    }
  }
  const roleByProject = new Map(
    (memberships ?? []).map((membership) => [membership.project_id, membership.role]),
  );
  const selectedProject = projects?.find(
    (project) =>
      project.name === nombre &&
      ["owner", "editor"].includes(roleByProject.get(project.id) ?? ""),
  );
  const initial = {
    name: "",
    type: "",
    stage: "Desarrollo",
    owner_role: "",
    start_date: "",
    delivery_date: "",
    description: "",
  };

  return (
    <main className="cf-cinematic-page cf-bg-projects min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-4 sm:p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300">
          ← Panel principal
        </Link>
        <header className="mb-8 mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-violet-300">CINEFLOW / PROYECTOS</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              Proyectos cinematográficos
            </h1>
            <p className="mt-2 text-gray-400">
              Administra tu cartera, descubre producciones disponibles y coordina la participación de cada equipo.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-gray-400">
            {visibleProjects.length + visibleJoinableProjects.length} de {catalog.length} proyectos
          </span>
        </header>

        {(error ||
          requestsError ||
          membershipRequestsError ||
          leaveRequestsError ||
          (!admin && !projectsError) ||
          organizationsError) && (
          <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {error ||
              requestsError ||
              membershipRequestsError ||
              leaveRequestsError ||
              organizationsError?.message ||
              "Falta configurar SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY para mostrar todos los proyectos y gestionar solicitudes."}
          </p>
        )}
        {success && (
          <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {success}
          </p>
        )}

        {ownedProjectIds.length > 0 && (
          <section className="cf-card mb-8 space-y-6 rounded-2xl border border-violet-400/20 bg-[#14151c] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Solicitudes para unirse</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Como propietario, puedes aceptar o rechazar solicitudes para tus proyectos.
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">
                {pendingMembershipRequests.length} pendientes
              </span>
            </div>
            {membershipRequestsError ? (
              <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                No se pudieron cargar las solicitudes: {membershipRequestsError}
              </p>
            ) : pendingMembershipRequests.length ? (
              <div className="divide-y divide-white/10">
                {pendingMembershipRequests.map((request) => (
                  <article
                    key={request.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-white">
                        {requesterNameById.get(request.user_id) || "Usuario"}
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        Solicita unirse a{" "}
                        <span className="text-gray-200">
                          {projectNameById.get(request.project_id) || "un proyecto"}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={approveProjectMembershipRequest}>
                        <input
                          type="hidden"
                          name="request_id"
                          value={request.id}
                        />
                        <button className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">
                          Aceptar
                        </button>
                      </form>
                      <form action={rejectProjectMembershipRequest}>
                        <input
                          type="hidden"
                          name="request_id"
                          value={request.id}
                        />
                        <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200">
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-gray-400">
                No tienes solicitudes pendientes para tus proyectos.
              </p>
            )}
            <div className="border-t border-white/10 pt-5">
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Solicitudes para salir</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Autoriza o rechaza la salida de miembros de tus proyectos.
                </p>
              </div>
              {leaveRequestsError ? (
                <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                  No se pudieron cargar las solicitudes de salida: {leaveRequestsError}
                </p>
              ) : pendingLeaveRequests.length ? (
                <div className="divide-y divide-white/10">
                  {pendingLeaveRequests.map((request) => (
                    <article
                      key={request.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white">
                          {requesterNameById.get(request.user_id) || "Usuario"}
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                          Solicita salir de{" "}
                          <span className="text-gray-200">
                            {projectNameById.get(request.project_id) || "un proyecto"}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <form action={approveProjectLeaveRequest}>
                          <input type="hidden" name="request_id" value={request.id} />
                          <button className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">
                            Autorizar salida
                          </button>
                        </form>
                        <form action={rejectProjectLeaveRequest}>
                          <input type="hidden" name="request_id" value={request.id} />
                          <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200">
                            Rechazar
                          </button>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-gray-400">
                  No tienes solicitudes para salir pendientes.
                </p>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <section className="cf-dashboard-panel p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold">Proyectos disponibles</h2>
            <form action="/proyectos" className="mb-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="q" defaultValue={q} placeholder="Buscar por nombre o descripción" className="min-h-11 min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400 sm:col-span-2" />
              <select name="etapa" defaultValue={etapa} className="min-h-11 min-w-0 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="">Todas las etapas</option>{[...new Set(catalog.map((p) => p.stage))].map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
              <select name="tipo" defaultValue={tipo} className="min-h-11 min-w-0 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="">Todos los tipos</option>{[...new Set(catalog.map((p) => p.type))].map((type) => <option key={type} value={type}>{type}</option>)}</select>
              <button className="min-h-11 w-full rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold transition hover:bg-violet-400 sm:col-span-2">Filtrar</button>
            </form>
            <div className="space-y-3">
              {visibleJoinableProjects.map((project) => (
                <article key={project.id} className="cf-card flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-violet-300">{project.type} · {project.stage}</p>
                    <h3 className="mt-1 font-semibold">{project.name}</h3>
                  </div>
                  {latestRequestByProject.get(project.id) === "pending" ? (
                    <span className="text-sm text-amber-200">Solicitud pendiente</span>
                  ) : (
                    <form action={requestProjectMembership}>
                      <input type="hidden" name="project_id" value={project.id} />
                      <button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
                        {latestRequestByProject.get(project.id) === "rejected" ? "Volver a solicitar" : "Solicitar unirme"}
                      </button>
                    </form>
                  )}
                </article>
              ))}
              {visibleProjects.length ? (
                visibleProjects.map((project) => {
                  const role = roleByProject.get(project.id);
                  const requestStatus = latestRequestByProject.get(project.id);
                  const coverUrl = coverByProject.get(project.id);
                  return (
                    <article
                      key={project.id}
                      className="cf-card overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] sm:flex"
                    >
                      {coverUrl ? (
                        <Image
                          src={coverUrl}
                          alt={`Portada de ${project.name}`}
                          width={640}
                          height={360}
                          unoptimized
                          className="h-44 w-full object-cover sm:h-auto sm:w-40 sm:shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="flex h-32 items-center justify-center bg-gradient-to-br from-violet-950 via-[#20202b] to-black text-4xl sm:h-auto sm:w-40 sm:shrink-0"
                        >
                          🎬
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-wider text-violet-300">
                            {project.type} · {project.stage}
                          </p>
                          <h3 className="mt-1 font-semibold">{project.name}</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            Entrega: {project.delivery_date}
                          </p>
                        </div>
                        {role ? (
                          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                            <Link
                              href={`/proyectos/seguimiento/${project.id}`}
                              className="rounded-lg border border-violet-400/30 px-4 py-2 text-center text-sm text-violet-200"
                            >
                              Abrir timeline →
                            </Link>
                            {role === "owner" && (
                              latestDeletionRequestByProject.get(project.id) === "pending" ? (
                                <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">Solicitud de eliminación pendiente de administración</span>
                              ) : (
                                <ConfirmSubmit action={requestProjectDeletion} message={`Solicitar a administración la eliminación de “${project.name}”. El proyecto no se eliminará hasta que un administrador lo apruebe.`}>
                                  <input type="hidden" name="project_id" value={project.id} />
                                  <label className="block text-left text-xs text-gray-400">Motivo de eliminación
                                    <textarea required minLength={10} maxLength={1000} name="reason" rows={2} placeholder="Explica por qué debe eliminarse este proyecto" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" />
                                  </label>
                                  <button className="rounded-lg border border-rose-400/30 px-4 py-2 text-center text-xs text-rose-200 hover:bg-rose-400/10">{latestDeletionRequestByProject.get(project.id) === "rejected" ? "Volver a solicitar eliminación" : "Solicitar eliminación"}</button>
                                </ConfirmSubmit>
                              )
                            )}
                            {role !== "owner" && (
                              latestLeaveRequestByProject.get(project.id) === "pending" ? (
                                <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">
                                  Solicitud de salida pendiente
                                </span>
                              ) : (
                                <ConfirmSubmit
                                  action={leaveProject}
                                  message={`¿Solicitas salir de “${project.name}”? El propietario debe autorizarlo antes de que pierdas el acceso.`}
                                >
                                  <input
                                    type="hidden"
                                    name="project_id"
                                    value={project.id}
                                  />
                                  <button className="rounded-lg border border-red-400/30 px-4 py-2 text-center text-xs text-red-200 hover:bg-red-400/10">
                                    {latestLeaveRequestByProject.get(project.id) === "rejected"
                                      ? "Volver a solicitar salida"
                                      : "Solicitar salir"}
                                  </button>
                                </ConfirmSubmit>
                              )
                            )}
                          </div>
                        ) : requestStatus === "pending" && !isAdmin ? (
                          <span className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-200">
                            Solicitud pendiente
                          </span>
                        ) : (
                          <form action={requestProjectMembership}>
                            <input type="hidden" name="project_id" value={project.id} />
                            <button className="w-full rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 sm:w-auto">
                              {isAdmin
                                ? "Unirme ahora (admin)"
                                : requestStatus === "rejected"
                                ? "Volver a solicitar"
                                : "Solicitar unirme"}
                            </button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : !visibleJoinableProjects.length && (
                <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-gray-400">
                  Aún no hay proyectos visibles para tu usuario.
                </p>
              )}
            </div>
          </section>

          <section className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5 sm:p-6">
            <h2 className="mb-1 text-xl font-semibold">
              {selectedProject ? "Editar proyecto" : "Nuevo proyecto"}
            </h2>
            <p className="mb-5 text-sm text-gray-400">
              Las solicitudes para unirse deben ser aprobadas por el propietario.
            </p>
            {isAdmin && !selectedProject && !(organizations?.length) && (
              <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
                No hay productoras disponibles para asignar este proyecto.
              </p>
            )}
            <ProjectForm
              action={selectedProject ? updateProject : createProject}
              project={selectedProject ?? initial}
              organizations={isAdmin && !selectedProject ? organizations ?? [] : undefined}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
