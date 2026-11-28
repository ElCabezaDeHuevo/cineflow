import { getContext, json } from "../context";

const tables = {
  join: "project_membership_requests",
  leave: "project_leave_requests",
} as const;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function projectValues(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  const owner_role = typeof body.owner_role === "string" ? body.owner_role.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 160 || !type || type.length > 80 || !stage || stage.length > 80 ||
      !owner_role || owner_role.length > 120 || description.length > 4000 ||
      !isDateOnly(body.start_date) || !isDateOnly(body.delivery_date) ||
      String(body.delivery_date) < String(body.start_date)) {
    return null;
  }
  return {
    name, type, stage, owner_role,
    start_date: body.start_date,
    delivery_date: body.delivery_date,
    description,
  };
}

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const { admin, companyIds, organizations, roles, user } = context;
  if (!companyIds.length && !context.isAdmin) {
    return json({ projects: [], inbox: [], organizations });
  }
  const projectQuery = admin.from("projects").select("id,name,type,stage,organization_id")
    .order("created_at", { ascending: false });
  const projects = context.isAdmin
    ? await projectQuery
    : await projectQuery.in("organization_id", companyIds);
  if (projects.error) return json({ error: "No se pudieron cargar los proyectos." }, 503);

  const ids = projects.data.map(({ id }) => id);
  if (!ids.length) return json({ projects: [], inbox: [], organizations });
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
      ...project, role: roles.get(project.id) ?? (context.isAdmin ? "owner" : null),
      pending: rows.find((row) => row.user_id === user.id && row.project_id === project.id)?.kind ?? null,
    })),
    inbox: inbox.map((row) => ({
      id: row.id, kind: row.kind,
      person: names.get(row.user_id) || "Integrante",
      project: projects.data.find(({ id }) => id === row.project_id)?.name,
    })),
    organizations,
  });
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const { admin, client, user, roles, companyIds, isAdmin } = context;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitud inválida." }, 400);

  if (body.action === "create" || body.action === "update") {
    const values = projectValues(body);
    if (!values) return json({ error: "Revisa los campos y las fechas del proyecto." }, 400);
    const activeSession = async () => {
      const result = await client.from("work_sessions").select("id").eq("user_id", user.id)
        .is("clock_out", null).is("deleted_at", null).limit(1).maybeSingle();
      if (result.error) throw result.error;
      return Boolean(result.data);
    };

    if (body.action === "create") {
      let organizationId: string;
      if (isAdmin) {
        if (!isUuid(body.organization_id)) return json({ error: "Selecciona una productora válida." }, 400);
        organizationId = body.organization_id;
      } else {
        if (!companyIds.length) return json({ error: "Tu cuenta no está vinculada a una productora." }, 403);
        if (companyIds.length === 1) {
          organizationId = companyIds[0];
        } else if (isUuid(body.organization_id) && companyIds.includes(body.organization_id)) {
          organizationId = body.organization_id;
        } else {
          return json({ error: "Selecciona una de las productoras a las que perteneces." }, 409);
        }
        if (!await activeSession()) return json({ error: "Registra tu entrada antes de crear un proyecto." }, 403);
      }
      const organization = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
      if (organization.error) return json({ error: "No se pudo comprobar la productora." }, 503);
      if (!organization.data) return json({ error: "La productora seleccionada ya no está disponible." }, 404);
      const id = crypto.randomUUID();
      const result = await admin.from("projects").insert({ id, ...values, organization_id: organizationId, created_by: user.id });
      if (result.error) return json({ error: "No se pudo crear el proyecto. Revisa los permisos de la productora." }, 409);
      return json({ ok: true, id });
    }

    if (!isUuid(body.id)) return json({ error: "Proyecto inválido." }, 400);
    const project = await admin.from("projects").select("id,organization_id").eq("id", body.id).maybeSingle();
    if (project.error) return json({ error: "No se pudo comprobar el proyecto." }, 503);
    if (!project.data || (!isAdmin && (!companyIds.includes(project.data.organization_id) || !["owner", "editor"].includes(roles.get(body.id) ?? "")))) {
      return json({ error: "No tienes permiso para editar este proyecto." }, 403);
    }
    if (!isAdmin && !await activeSession()) return json({ error: "Registra tu entrada antes de editar el proyecto." }, 403);
    const update = await admin.from("projects").update(values).eq("id", body.id).select("id").maybeSingle();
    if (update.error || !update.data) return json({ error: "No se pudieron guardar los cambios del proyecto." }, 409);
    return json({ ok: true, id: body.id });
  }

  if ((body.kind !== "join" && body.kind !== "leave") || !isUuid(body.id)) {
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

