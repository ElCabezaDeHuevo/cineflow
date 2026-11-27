import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  // An accessToken client cannot call auth methods. Verify the token separately.
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

  const [organizations, memberships] = await Promise.all([
    client.from("organization_members").select("organization_id").eq("user_id", user.id),
    client.from("project_members").select("project_id,role").eq("user_id", user.id),
  ]);
  if (organizations.error || memberships.error) return json({ error: "No se pudieron comprobar tus permisos." }, 503);

  return {
    client, admin, user,
    companyIds: (organizations.data ?? []).map((row) => row.organization_id),
    roles: new Map((memberships.data ?? []).map((row) => [row.project_id, row.role])),
  };
}

