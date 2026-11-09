import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateProject } from "../actions";
import {
  approveProjectMembershipRequest,
  rejectProjectMembershipRequest,
} from "../actions";
import ProjectForm from "../ProjectForm";
import UserAvatar from "@/lib/UserAvatar";
import ProjectVisitTracker from "@/app/ProjectVisitTracker";

export const instant = false;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error: messageError, success } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: project }, { data: history }, { data: members }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("project_audit_log").select("id, action, changed_at").eq("project_id", id).order("changed_at", { ascending: false }).limit(10),
    supabase.from("project_members").select("user_id, role").eq("project_id", id),
  ]);
  if (!project) notFound();
  const isOwner = members?.some(
    (member) => member.user_id === user.id && member.role === "owner",
  );
  const admin = createSupabaseAdminClient();
  const { data: cover, error: coverError } = await (admin ?? supabase)
    .from("project_media")
    .select("public_url")
    .eq("project_id", id)
    .eq("media_type", "cover")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (coverError) {
    throw new Error(`No se pudo cargar la portada del proyecto: ${coverError.message}`);
  }
  const { data: membershipRequests, error: requestsError } =
    admin && isOwner
      ? await admin
          .from("project_membership_requests")
          .select("id,user_id,created_at")
          .eq("project_id", id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
      : { data: [], error: null };
  const requesterIds = (membershipRequests ?? []).map((request) => request.user_id);
  const { data: requesterProfiles } = requesterIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", requesterIds)
    : { data: [] };
  const requesterById = new Map(
    (requesterProfiles ?? []).map((profile) => [profile.id, profile]),
  );
  const memberIds = members?.map((member) => member.user_id) ?? [];
  const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", memberIds) : { data: [] };
  const team = members?.map((member) => ({ ...member, profile: profiles?.find((profile) => profile.id === member.user_id) })) ?? [];
  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <ProjectVisitTracker userId={user.id} projectId={project.id} />
      <section className="mx-auto max-w-5xl p-4 sm:p-6 md:p-10">
        <Link href="/proyectos" className="text-sm text-violet-300">
          ← Volver a proyectos
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-sm text-violet-300">DETALLE DEL PROYECTO</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">{project.name}</h1>
          <p className="mt-2 text-gray-400">
            Edita los datos que tu rol permita modificar.
          </p>
        </header>
        {cover?.public_url && (
          <Image
            src={cover.public_url}
            alt={`Portada de ${project.name}`}
            width={1600}
            height={900}
            unoptimized
            className="mb-8 max-h-[28rem] w-full rounded-2xl border border-white/10 object-cover"
          />
        )}
        {messageError && (
          <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {messageError}
          </p>
        )}
        {success && (
          <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {success}
          </p>
        )}
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <section className="rounded-2xl border border-white/10 bg-[#14151c] p-5 sm:p-6">
            <ProjectForm project={project} action={updateProject} />
          </section>
          <aside className="space-y-6">
            {isOwner && (
              <section className="rounded-2xl border border-white/10 bg-[#14151c] p-5">
                <h2 className="font-semibold">Solicitudes para unirse</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Al aprobar, la persona recibe acceso de editor.
                </p>
                {requestsError ? (
                  <p className="mt-4 text-sm text-red-200">
                    No se pudieron cargar las solicitudes: {requestsError.message}
                  </p>
                ) : membershipRequests?.length ? (
                  <div className="mt-4 space-y-4">
                    {membershipRequests.map((request) => {
                      const profile = requesterById.get(request.user_id);
                      const name = profile?.full_name || "Usuario";
                      return (
                        <article
                          key={request.id}
                          className="border-t border-white/10 pt-4"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={name}
                              avatarUrl={profile?.avatar_url}
                              className="h-9 w-9"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{name}</p>
                              <p className="text-xs text-gray-500">
                                Solicita acceso al proyecto
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <form action={approveProjectMembershipRequest}>
                              <input
                                type="hidden"
                                name="request_id"
                                value={request.id}
                              />
                              <button className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black">
                                Aprobar
                              </button>
                            </form>
                            <form action={rejectProjectMembershipRequest}>
                              <input
                                type="hidden"
                                name="request_id"
                                value={request.id}
                              />
                              <button className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200">
                                Rechazar
                              </button>
                            </form>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">
                    No hay solicitudes pendientes.
                  </p>
                )}
              </section>
            )}
            <section className="rounded-2xl border border-white/10 bg-[#14151c] p-5">
              <h2 className="font-semibold">Equipo del proyecto</h2>
              <div className="mt-4 space-y-3">
                {team.length ? (
                  team.map((member) => {
                    const name = member.profile?.full_name || "Usuario del equipo";
                    return (
                      <div key={member.user_id} className="flex items-center gap-3">
                        <UserAvatar
                          name={name}
                          avatarUrl={member.profile?.avatar_url}
                          className="h-9 w-9"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-200">{name}</p>
                          <p className="text-xs capitalize text-gray-500">
                            {member.role}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500">No hay miembros registrados.</p>
                )}
              </div>
              <h2 className="mt-8 font-semibold">Historial reciente</h2>
              <div className="mt-4 space-y-4">
                {history?.length ? (
                  history.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-l border-violet-400/40 pl-3"
                    >
                      <p className="text-sm text-gray-300">
                        {entry.action === "INSERT"
                          ? "Proyecto creado"
                          : "Proyecto actualizado"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(entry.changed_at).toLocaleString("es-MX")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="mt-4 text-sm text-gray-500">
                    El historial aparecerá después de aplicar el SQL y guardar cambios.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
