import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import DeleteUserButton from "./DeleteUserButton";
import { createUser, updateUserRole } from "./actions";
import { CINE_ROLES, cineRoleLabel } from "@/lib/cine-roles";
import UserAvatar from "@/lib/UserAvatar";
import { isCineflowAdmin } from "@/lib/admin";

export const instant = false;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  const { error, success } = await searchParams;
  const { data: usersData, error: usersError } = admin ? await admin.auth.admin.listUsers({ page: 1, perPage: 100 }) : { data: null, error: null };
  const users = usersData?.users ?? [];
  const { data: profiles, error: profilesError } = admin && users.length
    ? await admin
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", users.map((account) => account.id))
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-6xl p-6 md:p-10">
        <Link href="/admin" className="text-sm text-violet-300 hover:text-violet-200">← Panel de administración</Link>
        <header className="mt-8">
          <p className="text-sm text-violet-300">ADMINISTRACIÓN / ACCESOS</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Cuentas de usuario</h1>
          <p className="mt-2 max-w-2xl text-gray-400">Crea accesos para tu equipo y elimina cuentas que ya no deban entrar a Cineflow.</p>
          <Link
            href="/usuarios/solicitudes"
            className="mt-5 inline-flex rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-200 hover:bg-violet-400/20"
          >
            Revisar solicitudes de asignación
          </Link>
        </header>

        {(error || usersError || profilesError) && <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error || usersError?.message || profilesError?.message}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={createUser} className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <h2 className="text-xl font-semibold">Añadir cuenta</h2>
            <p className="mt-1 text-sm text-gray-400">La cuenta quedará confirmada y podrá iniciar sesión de inmediato.</p>
            <label className="mt-6 block text-sm text-gray-300">Nombre completo<input name="full_name" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label>
            <label className="mt-4 block text-sm text-gray-300">Correo<input name="email" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label>
            <label className="mt-4 block text-sm text-gray-300">Contraseña temporal<input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label>
            <label className="mt-4 block text-sm text-gray-300">Rango cinematográfico<select name="cine_role" required defaultValue="viewer" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white outline-none focus:border-violet-400">{CINE_ROLES.map((role) => <option key={role.value} value={role.value}>{role.department} · {role.label}</option>)}</select></label>
            <label className="mt-4 block text-sm text-gray-300">Permisos de la cuenta<select name="account_role" required defaultValue="user" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white outline-none focus:border-violet-400"><option value="user">Usuario</option><option value="admin">Administrador</option></select><span className="mt-1 block text-xs text-gray-500">Los administradores pueden gestionar cuentas y revisar solicitudes de asignación.</span></label>
            <button className="mt-6 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold transition hover:bg-violet-400">Crear cuenta</button>
          </form>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
            <div className="border-b border-white/10 p-6"><h2 className="text-xl font-semibold">Cuentas registradas</h2><p className="mt-1 text-sm text-gray-400">{users.length} cuenta{users.length === 1 ? "" : "s"} en Supabase Auth.</p></div>
            <div className="divide-y divide-white/10">
              {users.map((account) => {
                const profile = profileById.get(account.id);
                const name = profile?.full_name || String(account.user_metadata?.full_name ?? "Sin nombre");
                const isAccountAdmin = account.app_metadata?.cineflow_role === "admin" || isCineflowAdmin(account);
                return <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex min-w-0 items-center gap-3"><UserAvatar name={name} avatarUrl={profile?.avatar_url ?? String(account.user_metadata?.avatar_url ?? "")} /><div className="min-w-0"><p className="truncate font-medium">{name}</p><p className="truncate text-sm text-gray-400">{account.email}</p><p className="mt-1 text-xs text-violet-300">{cineRoleLabel(account.user_metadata?.cine_role)} · {isAccountAdmin ? "Administrador" : "Usuario"}</p><p className="mt-1 text-xs text-gray-600">Creada: {account.created_at.slice(0, 10)}</p></div></div><div className="flex flex-wrap items-center gap-2"><Link href={`/usuarios/${account.id}`} className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-400/20">Ver perfil</Link><form action={updateUserRole} className="flex flex-wrap items-center gap-2"><input type="hidden" name="user_id" value={account.id} /><select name="cine_role" defaultValue={String(account.user_metadata?.cine_role ?? "viewer")} className="rounded-lg border border-white/10 bg-[#0b0c10] px-2 py-2 text-xs text-white">{CINE_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select><select name="account_role" defaultValue={isAccountAdmin ? "admin" : "user"} aria-label={`Permisos de ${name}`} className="rounded-lg border border-white/10 bg-[#0b0c10] px-2 py-2 text-xs text-white"><option value="user">Usuario</option><option value="admin">Administrador</option></select><button className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-400/10">Guardar</button></form>{account.id === user.id ? <span className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs text-violet-200">Tu cuenta</span> : <DeleteUserButton userId={account.id} email={account.email ?? "esta cuenta"} />}</div></div>;
              })}
              {!users.length && <p className="p-6 text-sm text-gray-400">No se encontraron cuentas.</p>}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
