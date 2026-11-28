import { getContext, json } from "../context";

function isProjectId(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;

  const id = new URL(request.url).searchParams.get("id");
  if (!isProjectId(id)) return json({ error: "Proyecto inv�lido." }, 400);
  if (!context.roles.has(id) && !context.isAdmin) return json({ error: "Ya no tienes acceso a este proyecto." }, 403);

  const dataClient = context.isAdmin ? context.admin : context.client;
  const [project, tasks, activity, messages] = await Promise.all([
    dataClient.from("projects").select("name,type,stage,owner_role,start_date,description,delivery_date").eq("id", id).maybeSingle(),
    dataClient.from("project_tasks").select("id,title,stage,status,due_date")
      .eq("project_id", id).order("updated_at", { ascending: false }).limit(100),
    dataClient.from("project_activity").select("id,message,created_at")
      .eq("project_id", id).order("created_at", { ascending: false }).limit(80),
    dataClient.from("project_messages").select("id,sender_id,body,created_at")
      .eq("project_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  if ([project, tasks, activity, messages].some(({ error }) => error)) {
    return json({ error: "No se pudo cargar el seguimiento del proyecto." }, 503);
  }
  if (!project.data) return json({ error: "Ya no tienes acceso a este proyecto." }, 403);

  const senders = [...new Set((messages.data ?? []).map(({ sender_id }) => sender_id))];
  const profiles = senders.length
    ? await dataClient.from("profiles").select("id,full_name").in("id", senders)
    : { data: [] };
  const names = new Map((profiles.data ?? []).map(({ id, full_name }) => [id, full_name]));
  return json({
    ...project.data,
    tasks: tasks.data,
    activity: activity.data,
    messages: (messages.data ?? []).map(({ sender_id, ...message }) => ({
      ...message, author: sender_id === context.user.id ? "T�" : names.get(sender_id) || "Integrante",
    })),
  });
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;

  const body = await request.json().catch(() => null);
  if (!body || !isProjectId(body.id) || typeof body.message !== "string" ||
      !body.message.trim() || body.message.length > 5000) {
    return json({ error: "Escribe un mensaje de hasta 5,000 caracteres." }, 400);
  }
  if (!context.roles.has(body.id) && !context.isAdmin) {
    return json({ error: "Ya no tienes acceso a este proyecto." }, 403);
  }

  const writer = context.isAdmin ? context.admin : context.client;
  const { error } = await writer.from("project_messages").insert({
    project_id: body.id, sender_id: context.user.id, body: body.message.trim(),
  });
  if (error) return json({ error: "No se pudo enviar el mensaje." }, 409);
  return json({ ok: true });
}

