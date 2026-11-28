import { getContext, json } from "../context";

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  if (!context.companyIds.length) return json({ members: [] });

  const [membershipResult, organizationResult, projectResult] = await Promise.all([
    context.admin.from("organization_members")
      .select("organization_id,user_id,role")
      .in("organization_id", context.companyIds),
    context.admin.from("organizations").select("id,name").in("id", context.companyIds),
    context.admin.from("projects").select("id,name,organization_id")
      .in("organization_id", context.companyIds).order("name"),
  ]);
  if (membershipResult.error || organizationResult.error || projectResult.error) {
    return json({ error: "No se pudo cargar el directorio del equipo." }, 503);
  }
  const memberships = membershipResult.data ?? [];
  const userIds = [...new Set(memberships.map((row) => row.user_id))];
  const projectIds = (projectResult.data ?? []).map((row) => row.id);
  const [profileResult, projectRoleResult, cineRoleResult] = await Promise.all([
    userIds.length
      ? context.admin.from("profiles").select("id,full_name,avatar_url,bio").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? context.admin.from("project_members").select("project_id,user_id,role").in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? context.admin.from("organization_member_cinematic_roles")
          .select("organization_id,user_id,requested_role,approved_role,status")
          .in("organization_id", context.companyIds).in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error || projectRoleResult.error || cineRoleResult.error) {
    return json({ error: "No se pudo completar la informacion del equipo." }, 503);
  }

  const organizations = new Map((organizationResult.data ?? []).map((row) => [row.id, row.name]));
  const profiles = new Map((profileResult.data ?? []).map((row) => [row.id, row]));
  const projects = new Map((projectResult.data ?? []).map((row) => [row.id, row]));
  const cinematicRoles = new Map((cineRoleResult.data ?? []).map((row) => [`${row.organization_id}:${row.user_id}`, row]));
  return json({
    members: memberships.map((membership) => {
      const profile = profiles.get(membership.user_id);
      const cinematic = cinematicRoles.get(`${membership.organization_id}:${membership.user_id}`);
      return {
        id: membership.user_id,
        organizationId: membership.organization_id,
        organizationName: organizations.get(membership.organization_id) ?? "Productora",
        companyRole: membership.role,
        name: profile?.full_name || "Integrante",
        avatarUrl: profile?.avatar_url || null,
        bio: profile?.bio || "",
        cinematicRole: cinematic?.approved_role ?? cinematic?.requested_role ?? null,
        cinematicRoleStatus: cinematic?.status ?? null,
        projects: (projectRoleResult.data ?? []).filter((row) => row.user_id === membership.user_id)
          .map((row) => ({ id: row.project_id, name: projects.get(row.project_id)?.name ?? "Proyecto", role: row.role })),
      };
    }),
  });
}

