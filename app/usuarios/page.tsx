import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUser, assignExistingUser } from "./actions";
import { CINE_ROLES } from "@/lib/cine-roles";
import { isCineflowAdmin } from "@/lib/admin";
import { listAllAuthUsers } from "@/lib/supabase/list-all-auth-users";

export const instant = false;

const roleLabels: Record<string, string> = {
  owner: "Dueño", admin: "Administrador", producer: "Productor",
  member: "Colaborador", viewer: "Solo lectura",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  const { error, success } = await searchParams;
  if (!admin) return <main className="cf-cinematic-page cf-bg-users min-h-screen bg-[#0b0c10] p-8 text-white">Falta configurar SUPABASE_SERVICE_ROLE_KEY.</main>;

  const [{ data: companies, error: companiesError }, usersResult] = await Promise.all([
    admin.from("organizations").select("id,name,slug,organization_members(user_id,role,joined_at)").order("name"),
    listAllAuthUsers(admin).then((users) => ({ users, error: null })).catch((error: unknown) => ({ users: [], error: error instanceof Error ? error : new Error("No se pudieron consultar todas las cuentas") })),
  ]);
  const users = usersResult.users;
  const usersError = usersResult.error;
  const userById = new Map(users.map((account) => [account.id, account]));
  const { data: profiles, error: profilesError } = users.length
    ? await admin.from("profiles").select("id,full_name,avatar_url").in("id", users.map((account) => account.id))
    : { data: [], error: null };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const assignedUserIds = new Set((companies ?? []).flatMap((company) => (company.organization_members ?? []).map((member: { user_id: string }) => member.user_id)));
  const existingUnassignedUsers = users.filter((account) => !assignedUserIds.has(account.id));

  return (
    <main className="cf-cinematic-page cf-bg-users min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-6 md:p-10">
        <Link href="/admin" className="text-sm text-violet-300 hover:text-violet-200">← Panel de administración</Link>
        <header className="mt-8">
          <p className="text-sm text-violet-300">ADMINISTRACIÓN / EMPRESAS Y ACCESOS</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Usuarios por empresa</h1>
          <p className="mt-2 max-w-3xl text-gray-400">Selecciona una productora para crearle usuarios y consultar únicamente el equipo que pertenece a esa empresa.</p>
        </header>

        {(error || companiesError || usersError || profilesError) && <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error || companiesError?.message || usersError?.message || profilesError?.message}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

        <section className="mt-8 rounded-2xl border border-violet-400/20 bg-[#14151c] p-6">
          <h2 className="text-xl font-semibold">Crear usuario dentro de una empresa</h2>
          <p className="mt-1 text-sm text-gray-400">La cuenta se crea y queda vinculada a la productora seleccionada.</p>
          <form action={createUser} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm text-gray-300">Empresa / productora
              <select name="organization_id" required defaultValue="" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white">
                <option value="" disabled>Selecciona una empresa</option>
                {(companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
            <label className="block text-sm text-gray-300">Nombre completo<input name="full_name" required maxLength={120} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" /></label>
            <label className="block text-sm text-gray-300">Correo electrónico<input name="email" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" /></label>
            <label className="block text-sm text-gray-300">Contraseña temporal<input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" /></label>
            <label className="block text-sm text-gray-300">Puesto cinematográfico
              <select name="cine_role" required defaultValue="viewer" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white">
                {CINE_ROLES.map((role) => <option key={role.value} value={role.value}>{role.department} · {role.label}</option>)}
              </select>
            </label>
            <label className="block text-sm text-gray-300">Permiso dentro de la empresa
              <select name="organization_role" required defaultValue="member" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white">
                <option value="owner">Dueño de empresa</option><option value="admin">Administrador de empresa</option><option value="producer">Productor</option><option value="member">Colaborador</option><option value="viewer">Solo lectura</option>
              </select>
            </label>
            <div className="flex items-end"><button disabled={!companies?.length} className="w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold transition hover:bg-violet-400 disabled:opacity-40">Crear usuario y asignar empresa</button></div>
          </form>
          {!companies?.length && <p className="mt-4 text-sm text-amber-200">Primero registra una productora en <Link href="/admin/productoras" className="underline">Productoras y pagos</Link>.</p>}
        </section>

        <section className="mt-8 space-y-5">
          <div><h2 className="text-xl font-semibold">Directorio de empresas</h2><p className="mt-1 text-sm text-gray-400">Cada empresa muestra su propio listado de usuarios.</p></div>
          {(companies ?? []).map((company) => {
            const members = company.organization_members ?? [];
            return <article key={company.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
                <div><h3 className="text-lg font-semibold">{company.name}</h3><p className="mt-1 text-xs text-gray-500">{company.slug}</p></div>
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-sm text-violet-200">{members.length} usuario{members.length === 1 ? "" : "s"}</span>
              </div>
              {members.length ? <div className="divide-y divide-white/10">
                {members.map((member: { user_id: string; role: string; joined_at: string }) => {
                  const account = userById.get(member.user_id);
                  const profile = profileById.get(member.user_id);
                  const displayName = profile?.full_name || String(account?.user_metadata?.full_name ?? "Sin nombre");
                  return <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0"><p className="truncate font-medium">{displayName}</p><p className="truncate text-sm text-gray-400">{account?.email ?? "Cuenta no encontrada"}</p><p className="mt-1 text-xs text-gray-600">Puesto: {String(account?.user_metadata?.cine_role ?? "Sin asignar")}</p></div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">{roleLabels[member.role] ?? member.role}</span>
                  </div>;
                })}
              </div> : <p className="p-5 text-sm text-gray-500">Esta empresa todavía no tiene usuarios vinculados.</p>}
            </article>;
          })}
          {!companies?.length && <p className="rounded-xl border border-white/10 p-8 text-center text-sm text-gray-400">No hay empresas registradas todavía.</p>}
        </section>

        <section className="mt-10 overflow-hidden rounded-2xl border border-amber-400/20 bg-[#14151c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div><h2 className="text-xl font-semibold">Cuentas existentes sin empresa</h2><p className="mt-1 text-sm text-gray-400">Usuarios que ya estaban registrados en CineFlow y todavía no pertenecen a ninguna productora.</p></div>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">{existingUnassignedUsers.length} cuenta{existingUnassignedUsers.length === 1 ? "" : "s"}</span>
          </div>
          {existingUnassignedUsers.length ? <div className="divide-y divide-white/10">
            {existingUnassignedUsers.map((account) => {
              const profile = profileById.get(account.id);
              const displayName = profile?.full_name || String(account.user_metadata?.full_name ?? "Sin nombre");
              return <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="truncate font-medium">{displayName}</p><p className="truncate text-sm text-gray-400">{account.email ?? "Sin correo"}</p><p className="mt-1 text-xs text-gray-500">Cuenta creada: {new Date(account.created_at).toLocaleDateString("es-MX")}</p></div>
                <form action={assignExistingUser} className="flex flex-wrap items-end gap-2"><input type="hidden" name="user_id" value={account.id} /><label className="min-w-[180px] text-xs text-gray-400">Asignar a<select name="organization_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"><option value="" disabled>Seleccionar productora</option>{(companies ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="min-w-[150px] text-xs text-gray-400">Permiso<select name="organization_role" defaultValue="member" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"><option value="admin">Administrador</option><option value="producer">Productor</option><option value="member">Colaborador</option><option value="viewer">Solo lectura</option></select></label><button disabled={!companies?.length} className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400 disabled:opacity-40">Vincular cuenta</button></form>
              </div>;
            })}
          </div> : <p className="p-5 text-sm text-gray-500">No hay cuentas pendientes de asignar.</p>}
        </section>
      </section>
    </main>
  );
}
