import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function getContext(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: "Inicia sesión." }, 401);

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => token },
  );
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return json({ error: "Tu sesión terminó. Inicia sesión de nuevo." }, 401);
  if (user.app_metadata.cineflow_force_password_change === true) {
    return json({ error: "Primero cambia tu contraseña en la página de CineFlow." }, 403);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return json({ error: "El servicio de proyectos no está disponible." }, 503);

  const isAdmin = isCineflowAdmin(user);
  const [memberships, projectMemberships] = await Promise.all([
    client.from("organization_members").select("organization_id,role").eq("user_id", user.id),
    client.from("project_members").select("project_id,role").eq("user_id", user.id),
  ]);
  if (memberships.error || projectMemberships.error) {
    return json({ error: "No se pudieron comprobar tus permisos." }, 503);
  }

  const companyIds = [...new Set((memberships.data ?? []).map((row) => row.organization_id))];
  const organizationQuery = isAdmin
    ? admin.from("organizations").select("id,name").order("name")
    : companyIds.length
      ? admin.from("organizations").select("id,name").in("id", companyIds).order("name")
      : null;
  const organizations = organizationQuery ? await organizationQuery : { data: [], error: null };
  if (organizations.error) return json({ error: "No se pudieron cargar las productoras disponibles." }, 503);

  return {
    client,
    admin,
    user,
    isAdmin,
    companyIds,
    organizations: organizations.data ?? [],
    roles: new Map((projectMemberships.data ?? []).map((row) => [row.project_id, row.role])),
  };
}

