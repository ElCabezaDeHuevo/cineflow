import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import UserAvatar from "@/lib/UserAvatar";
import {
  approveAssignmentRequest,
  rejectAssignmentRequest,
} from "../actions";

export const instant = false;

export default async function AssignmentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");

  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/usuarios?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  const { error: messageError, success } = await searchParams;
  const { data: requests, error: requestsError } = await admin
    .from("project_assignment_requests")
    .select("id,project_id,task_id,user_id,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const taskIds = [...new Set((requests ?? []).map((request) => request.task_id))];
  const projectIds = [...new Set((requests ?? []).map((request) => request.project_id))];
  const userIds = [...new Set((requests ?? []).map((request) => request.user_id))];
  const [{ data: tasks }, { data: projects }, { data: profiles }] = await Promise.all([
    taskIds.length
      ? admin.from("project_tasks").select("id,title,assigned_to").in("id", taskIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? admin.from("projects").select("id,name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("profiles").select("id,full_name,avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const taskById = new Map((tasks ?? []).map((task) => [task.id, task]));
  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-5xl p-6 md:p-10">
        <Link href="/admin" className="text-sm text-violet-300">
          ← Panel de administración
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-sm text-violet-300">ADMINISTRACIÓN / ASIGNACIONES</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Solicitudes de asignación
          </h1>
          <p className="mt-2 text-gray-400">
            Solo el administrador puede ver y revisar estas solicitudes.
          </p>
        </header>
        {(messageError || requestsError) && (
          <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {messageError || requestsError?.message}
          </p>
        )}
        {success && (
          <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {success}
          </p>
        )}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          {requestsError ? null : requests?.length ? (
            <div className="divide-y divide-white/10">
              {requests.map((request) => {
                const profile = profileById.get(request.user_id);
                const name = profile?.full_name || "Usuario";
                const task = taskById.get(request.task_id);
                const project = projectById.get(request.project_id);
                return (
                  <article
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={name} avatarUrl={profile?.avatar_url} />
                      <div>
                        <p className="font-semibold">{name}</p>
                        <p className="text-sm text-gray-400">
                          {task?.title ?? "Tarea eliminada"} · {project?.name ?? "Proyecto"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Solicitada:{" "}
                          {new Intl.DateTimeFormat("es-MX", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(request.created_at))}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={approveAssignmentRequest}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <button
                          disabled={!task || Boolean(task.assigned_to)}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Aprobar
                        </button>
                      </form>
                      <form action={rejectAssignmentRequest}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200">
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="p-8 text-center text-gray-400">
              No hay solicitudes pendientes.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
