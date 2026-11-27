import { getContext, json } from "../context";

const tables = {
  join: "project_membership_requests",
  leave: "project_leave_requests",
} as const;

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const { admin, companyIds, roles, user } = context;
  if (!companyIds.length) return json({ projects: [], inbox: [] });

  const projects = await admin.from("projects").select("id,name,type,stage")
    .in("organization_id", companyIds).order("created_at", { ascending: false });
  if (projects.error) return json({ error: "No se pudieron cargar los proyectos." }, 503);

  const ids = projects.data.map(({ id }) => id);
  if (!ids.length) return json({ projects: [], inbox: [] });
  const ownedIds = ids.filter((id) => roles.get(id) === "owner");
  const requests = await Promise.all((["join", "leave"] as const).map(async (kind) => {
    const result = await admin.from(tables[kind]).select("id,project_id,user_id").eq("status", "pending")
      .in("project_id", ids)
      .or(ownedIds.length ? `user_id.eq.${user.id},project_id.in.(${ownedIds.join(",")})` : `user_id.eq.${user.id}`);
    return { kind, ...result };
  }));
  if (requests.some(({ error }) => error)) return json({ error: "No se pudieron cargar las solicitudes." }, 503);

  const rows = requests.flatMap(({ kind, data }) => (data ?? []).map((row) => ({ ...row, kind })));
  const inbox = rows.filter((row) => row.user_id !== user.id && roles.get(row.project_id) === "owner");
  const requesterIds = [...new Set(inbox.map(({ user_id }) => user_id))];
  const profiles = requesterIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", requesterIds)
    : { data: [], error: null };
  if (profiles.error) return json({ error: "No se pudieron cargar los solicitantes." }, 503);
  const names = new Map((profiles.data ?? []).map(({ id, full_name }) => [id, full_name]));
  return json({
    projects: projects.data.map((project) => ({
      ...project, role: roles.get(project.id) ?? null,
      pending: rows.find((row) => row.user_id === user.id && row.project_id === project.id)?.kind ?? null,
    })),
    inbox: inbox.map((row) => ({
      id: row.id, kind: row.kind,
      person: names.get(row.user_id) || "Integrante",
      project: projects.data.find(({ id }) => id === row.project_id)?.name,
    })),
  });
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const { admin, client, user, roles, companyIds } = context;
  const body = await request.json().catch(() => null);
  if (!body || (body.kind !== "join" && body.kind !== "leave") ||
      typeof body.id !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.id)) {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const kind: keyof typeof tables = body.kind;
  const table = tables[kind];
  if (body.action === "request") {
    if (!companyIds.length) return json({ error: "Tu cuenta no tiene una productora activa." }, 403);
    const project = await admin.from("projects").select("id").eq("id", body.id)
      .in("organization_id", companyIds).maybeSingle();
    if (project.error) return json({ error: "No se pudo comprobar el proyecto." }, 503);
    const role = roles.get(body.id);
    if (!project.data || (kind === "join" ? role : !role || role === "owner")) {
      return json({ error: "Esta solicitud no está disponible para tu cuenta." }, 403);
    }
    const result = await admin.from(table).insert({ project_id: body.id, user_id: user.id });
    if (result.error && result.error.code !== "23505") return json({ error: "No se pudo enviar la solicitud." }, 503);
    return json({ ok: true });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return json({ error: "Acción inválida." }, 400);
  }
  const pending = await admin.from(table).select("project_id").eq("id", body.id).eq("status", "pending").maybeSingle();
  if (pending.error) return json({ error: "No se pudo comprobar la solicitud." }, 503);
  if (!pending.data || roles.get(pending.data.project_id) !== "owner") {
    return json({ error: "La solicitud no está disponible para tu cuenta." }, 403);
  }
  const arguments_ = { request_uuid: body.id, reviewer_uuid: user.id, approve: body.action === "approve" };
  const result = kind === "join"
    ? await admin.rpc("review_project_membership_request", arguments_)
    : await client.rpc("review_project_leave_request", arguments_);
  if (result.error) return json({ error: "No se pudo resolver la solicitud. Actualiza e inténtalo otra vez." }, 409);
  return json({ ok: true });
}
