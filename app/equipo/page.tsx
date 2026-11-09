import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UserAvatar from "@/lib/UserAvatar";
import { isCineflowAdmin } from "@/lib/admin";

export const instant = false;

const roleLabels: Record<string, string> = { owner: "Propietario", editor: "Editor", viewer: "Consulta" };

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const isAdmin = isCineflowAdmin(user);

  const [{ data: projects }, { data: memberships }] = await Promise.all([
    supabase.from("projects").select("id, name, stage, owner_role").order("name"),
    supabase.from("project_members").select("project_id, user_id, role").order("created_at"),
  ]);
  const { data: directoryProfiles, error: directoryError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, bio")
    .order("full_name");
  const userIds = [...new Set((memberships ?? []).map((member) => member.user_id))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id, full_name, avatar_url, bio").in("id", userIds) : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Volver al panel</Link>
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm text-violet-300">PRODUCCIÓN / COLABORACIÓN</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Equipo de producción</h1>
          <p className="mt-2 max-w-2xl text-gray-400">Consulta quién participa en cada proyecto y qué nivel de acceso tiene.</p></div>
          {isAdmin && <Link href="/usuarios" className="cf-action rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold transition hover:bg-violet-400">Administrar cuentas</Link>}
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Colaboradores</p><p className="mt-3 text-3xl font-bold">{userIds.length}</p></article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Proyectos compartidos</p><p className="mt-3 text-3xl font-bold">{projects?.length ?? 0}</p></article>
          <article className="cf-card rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Tu acceso</p><p className="mt-3 text-3xl font-bold">{memberships?.some((member) => member.user_id === user.id && member.role === "owner") ? "Owner" : "Miembro"}</p></article>
        </section>

        <section className="cf-card mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-6">
            <h2 className="text-xl font-semibold">Directorio de perfiles</h2>
            <p className="mt-1 text-sm text-gray-400">
              Consulta los perfiles del equipo. Las notas y capturas son de uso administrativo.
            </p>
          </div>
          {directoryError ? (
            <p className="p-6 text-sm text-red-200">
              No se pudieron cargar los perfiles: {directoryError.message}
            </p>
          ) : directoryProfiles?.length ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {directoryProfiles.map((profile) => {
                const name = profile.full_name || "Usuario";
                return (
                  <Link
                    key={profile.id}
                    href={`/usuarios/${profile.id}`}
                    className="cf-card flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-4 transition hover:border-violet-400/30 hover:bg-violet-400/5"
                  >
                    <UserAvatar name={name} avatarUrl={profile.avatar_url} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{name}</span>
                      <span className="mt-1 block truncate text-sm text-gray-500">
                        {profile.bio || "Ver perfil"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-gray-400">Todavía no hay perfiles para mostrar.</p>
          )}
        </section>

        <section className="cf-card mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-6"><h2 className="text-xl font-semibold">Miembros y responsabilidades</h2><p className="mt-1 text-sm text-gray-400">Los permisos se aplican por proyecto.</p></div>
          {memberships?.length ? (
            <div className="divide-y divide-white/10">
              {memberships.map((member) => {
                const profile = profileById.get(member.user_id);
                const project = projectById.get(member.project_id);
                const name = profile?.full_name || (member.user_id === user.id ? user.email?.split("@")[0] : "Usuario sin nombre") || "Usuario";
                return <div key={`${member.project_id}-${member.user_id}`} className="grid gap-4 p-6 md:grid-cols-[1.4fr_1fr_1fr] md:items-center"><div className="flex items-center gap-3"><UserAvatar name={name} avatarUrl={profile?.avatar_url} /><div><p className="font-medium">{name}</p><p className="text-sm text-gray-500">{profile?.bio || "Sin descripción"}</p></div></div><div><p className="text-xs uppercase tracking-widest text-gray-500">Proyecto</p><p className="mt-2 text-sm text-gray-200">{project?.name || "Proyecto"}</p></div><div><p className="text-xs uppercase tracking-widest text-gray-500">Permiso</p><span className="mt-2 inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">{roleLabels[member.role] || member.role}</span></div></div>;
              })}
            </div>
          ) : (
            <div className="p-10 text-center"><p className="text-gray-300">Aún no hay miembros registrados.</p><Link href="/proyectos" className="mt-4 inline-flex rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold">Gestionar proyectos</Link></div>
          )}
        </section>
      </section>
    </main>
  );
}
