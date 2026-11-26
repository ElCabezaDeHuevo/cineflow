import CinematicRoleOptions from "@/lib/CinematicRoleOptions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import { cineRoleLabel } from "@/lib/cine-roles";
import { assignCinematicPosition } from "./actions";

export default async function AdminCinematicPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id !== "0a12ae9b-a119-42f8-8103-4f1bf3ab5467" || !isCineflowAdmin(user)) redirect("/");

  const admin = createSupabaseAdminClient();
  if (!admin) return <main className="min-h-screen bg-[#0b0c10] p-8 text-white">No está configurado el servicio administrativo de Supabase.</main>;

  const [{ data: organizations, error: organizationsError }, usersResult] = await Promise.all([
    admin.from("organizations").select("id,name,slug").order("name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const organizationId = (organizations ?? []).some((item) => item.id === params.organization)
    ? params.organization!
    : organizations?.[0]?.id ?? "";
  const [{ data: memberships, error: membershipsError }, { data: assignments, error: assignmentsError }] = organizationId
    ? await Promise.all([
        admin.from("organization_members").select("user_id,role,joined_at")
          .eq("organization_id", organizationId).order("joined_at"),
        admin.from("organization_member_cinematic_roles")
          .select("user_id,requested_role,approved_role,status")
          .eq("organization_id", organizationId),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const memberIds = (memberships ?? []).map((item) => item.user_id);
  const { data: profiles } = memberIds.length
    ? await admin.from("profiles").select("id,full_name,avatar_url").in("id", memberIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((item) => [item.id, item]));
  const emailById = new Map((usersResult.data?.users ?? []).map((item) => [item.id, item.email ?? "Correo no disponible"]));
  const assignmentById = new Map((assignments ?? []).map((item) => [item.user_id, item]));

  return (
    <main className="min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-violet-300 hover:text-violet-200">← Panel de administración</Link>
        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Control global · CineFlow</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Asignar puestos cinematográficos</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">Asigna directamente la especialidad de cada integrante en su productora. Esta acción no modifica su permiso de acceso ni su puesto administrativo.</p>
        </header>

        {params.error && <p role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{params.error}</p>}
        {params.success && <p role="status" className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{params.success}</p>}
        {(organizationsError || membershipsError || assignmentsError || usersResult.error) && <p className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">No se pudo cargar toda la información. {organizationsError?.message ?? membershipsError?.message ?? assignmentsError?.message ?? usersResult.error?.message}</p>}

        <section className="rounded-2xl border border-white/10 bg-[#14151c] p-5 md:p-7">
          <form method="get" className="mb-6 max-w-xl">
            <label htmlFor="organization" className="mb-2 block text-sm font-medium text-gray-300">Productora</label>
            <select id="organization" name="organization" defaultValue={organizationId} className="w-full rounded-xl border border-white/15 bg-[#0b0c10] px-4 py-3 text-white">
              {(organizations ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="mt-3 rounded-lg border border-violet-300/30 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-400/10">Ver integrantes</button>
          </form>

          {!organizationId ? <p className="rounded-xl border border-white/10 p-5 text-sm text-gray-400">Todavía no hay productoras registradas.</p> : (memberships ?? []).length ? (
            <div className="space-y-4">
              {(memberships ?? []).map((member) => {
                const profile = profileById.get(member.user_id);
                const assignment = assignmentById.get(member.user_id);
                const currentPosition = assignment?.status === "approved" ? assignment.approved_role : null;
                return (
                  <article key={member.user_id} className="grid gap-4 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(320px,1.1fr)] md:items-center">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{profile?.full_name || "Integrante sin nombre"}</h2>
                      <p className="mt-1 break-all text-sm text-gray-400">{emailById.get(member.user_id) ?? "Correo no disponible"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-gray-300">Permiso: {member.role}</span>
                        <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2.5 py-1 text-violet-200">Puesto: {currentPosition ? cineRoleLabel(currentPosition) : "Sin asignar"}</span>
                      </div>
                    </div>
                    {member.role === "owner" || member.user_id === "0a12ae9b-a119-42f8-8103-4f1bf3ab5467" ? (
                      <p className="text-sm text-gray-500">Cuenta protegida: no se modifica desde esta herramienta.</p>
                    ) : (
                      <form action={assignCinematicPosition} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="organization_id" value={organizationId} />
                        <input type="hidden" name="user_id" value={member.user_id} />
                        <label className="sr-only" htmlFor={"role-" + member.user_id}>Puesto cinematográfico</label>
                        <select id={"role-" + member.user_id} name="cine_role" required defaultValue={currentPosition ?? ""} className="min-w-0 rounded-lg border border-white/15 bg-[#0b0c10] px-3 py-2.5 text-sm text-white">
                          <option value="" disabled>Selecciona un puesto</option>
                          <CinematicRoleOptions />
                        </select>
                        <button className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400">Asignar puesto</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <p className="rounded-xl border border-white/10 p-5 text-sm text-gray-400">Esta productora todavía no tiene integrantes.</p>}
        </section>
      </section>
    </main>
  );
}
