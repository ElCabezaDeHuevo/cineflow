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
  updateProject,
} from "./actions";
import ProjectForm from "./ProjectForm";
import ConfirmSubmit from "@/app/ConfirmSubmit";

export const instant = false;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ nombre?: string; error?: string; success?: string }>;
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
  const [{ data: memberships, error: membershipsError }, { nombre, error, success }] =
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

  const projectsQuery = admin
    ? admin
        .from("projects")
        .select("id,name,type,stage,delivery_date,created_at,owner_role,start_date,description")
        .order("created_at", { ascending: false })
    : null;
  const { data: projects, error: projectsError } = projectsQuery
    ? await projectsQuery
    : await supabase
        .from("projects")
        .select("id,name,type,stage,delivery_date,created_at,owner_role,start_date,description")
        .order("created_at", { ascending: false });
  if (projectsError) {
    throw new Error(`No se pudieron cargar los proyectos: ${projectsError.message}`);
  }

  const projectIds = (projects ?? []).map((project) => project.id);
  const ownedProjectIds = (memberships ?? [])
    .filter((membership) => membership.role === "owner")
    .map((membership) => membership.project_id);
  let pendingLeaveRequests: {
    id: string;
    project_id: string;
    user_id: string;
    created_at: string;
  }[] = [];
  let leaveRequestsError: string | null = null;
  if (admin && ownedProjectIds.length) {
    const result = await admin
      .from("project_leave_requests")
      .select("id,project_id,user_id,created_at")
      .eq("status", "pending")
      .in("project_id", ownedProjectIds)
      .order("created_at", { ascending: true });
    if (result.error) {
      leaveRequestsError = result.error.message;
    } else {
      pendingLeaveRequests = result.data ?? [];
    }
  }
  let ownLeaveRequests: { project_id: string; status: string; created_at: string }[] = [];
  if (admin && projectIds.length) {
    const result = await admin
      .from("project_leave_requests")
      .select("project_id,status,created_at")
      .eq("user_id", user.id)
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });
    if (result.error) {
      leaveRequestsError = leaveRequestsError ?? result.error.message;
    } else {
      ownLeaveRequests = result.data ?? [];
    }
  }
  const latestLeaveRequestByProject = new Map<string, string>();
  for (const request of ownLeaveRequests) {
    if (!latestLeaveRequestByProject.has(request.project_id)) {
      latestLeaveRequestByProject.set(request.project_id, request.status);
    }
  }
  let pendingMembershipRequests: {
    id: string;
    project_id: string;
    user_id: string;
    created_at: string;
  }[] = [];
  let membershipRequestsError: string | null = null;
  if (admin && ownedProjectIds.length) {
    const result = await admin
      .from("project_membership_requests")
      .select("id,project_id,user_id,created_at")
      .eq("status", "pending")
      .in("project_id", ownedProjectIds)
      .order("created_at", { ascending: true });
    if (result.error) {
      membershipRequestsError = result.error.message;
    } else {
      pendingMembershipRequests = result.data ?? [];
    }
  }
  const requesterIds = [...new Set([
    ...pendingMembershipRequests.map((request) => request.user_id),
    ...pendingLeaveRequests.map((request) => request.user_id),
  ])];
  const { data: requesterProfiles, error: requesterProfilesError } = requesterIds.length
    ? await (admin ?? supabase)
        .from("profiles")
        .select("id,full_name")
        .in("id", requesterIds)
    : { data: [], error: null };
  if (requesterProfilesError) {
    throw new Error(`No se pudieron cargar los perfiles solicitantes: ${requesterProfilesError.message}`);
  }
  const requesterNameById = new Map(
    (requesterProfiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const projectNameById = new Map(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const { data: covers, error: coversError } = projectIds.length
    ? await (admin ?? supabase)
        .from("project_media")
        .select("project_id,public_url,created_at")
        .eq("media_type", "cover")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (coversError) {
    throw new Error(`No se pudieron cargar las portadas: ${coversError.message}`);
  }
  const coverByProject = new Map<string, string>();
  for (const cover of covers ?? []) {
    if (!coverByProject.has(cover.project_id)) {
      coverByProject.set(cover.project_id, cover.public_url);
    }
  }
  let ownRequests: { project_id: string; status: string; created_at: string }[] = [];
  let requestsError: string | null = null;
  if (admin && projectIds.length) {
    const result = await admin
      .from("project_membership_requests")
      .select("project_id,status,created_at")
      .eq("user_id", user.id)
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });
    if (result.error) {
      requestsError = result.error.message;
    } else {
      ownRequests = result.data ?? [];
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
    name: "El último fotograma",
    type: "Cortometraje",
    stage: "Postproducción",
    owner_role: "Director de producción",
    start_date: "2026-10-01",
    delivery_date: "2026-11-15",
    description: "Cortometraje de ficción en fase de montaje y acabado.",
  };

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-4 sm:p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300">
          ← Panel principal
        </Link>
        <header className="mb-10 mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-violet-300">CINEFLOW / PROYECTOS</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              Proyectos cinematográficos
            </h1>
            <p className="mt-2 text-gray-400">
              Explora proyectos y solicita unirte al equipo.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-gray-400">
            {projects?.length ?? 0} proyectos
          </span>
        </header>

        {(error ||
          requestsError ||
          membershipRequestsError ||
          leaveRequestsError ||
          (!admin && !projectsError)) && (
          <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {error ||
              requestsError ||
              membershipRequestsError ||
              leaveRequestsError ||
              "Falta configurar SUPABASE_SERVICE_ROLE_KEY para mostrar todos los proyectos y gestionar solicitudes."}
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
          <section className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold">Proyectos disponibles</h2>
            <div className="space-y-3">
              {projects?.length ? (
                projects.map((project) => {
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
              ) : (
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
            <ProjectForm
              action={selectedProject ? updateProject : createProject}
              project={selectedProject ?? initial}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
