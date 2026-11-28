import { getContext, json } from "../context";

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const projectQuery = context.admin.from("projects")
    .select("id,name,stage,start_date,delivery_date")
    .order("delivery_date", { ascending: true }).limit(200);
  const projectsResult = context.isAdmin
    ? await projectQuery
    : context.roles.size
      ? await projectQuery.in("id", [...context.roles.keys()])
      : { data: [], error: null };
  if (projectsResult.error) return json({ error: "No se pudieron cargar tus proyectos." }, 503);
  const projects = projectsResult.data ?? [];
  const ids = projects.map((project) => project.id);
  if (!ids.length) return json({ events: [] });

  const taskResult = await context.admin.from("project_tasks")
    .select("id,project_id,title,stage,status,due_date").in("project_id", ids)
    .neq("status", "completada").not("due_date", "is", null)
    .order("due_date", { ascending: true }).limit(300);
  if (taskResult.error) return json({ error: "No se pudieron cargar las tareas de la agenda." }, 503);

  const events = [
    ...projects.flatMap((project) => [
      ...(project.start_date ? [{ id: `start-${project.id}`, date: project.start_date, type: "Inicio de proyecto", title: project.name, detail: project.stage, projectId: project.id }] : []),
      ...(project.delivery_date ? [{ id: `delivery-${project.id}`, date: project.delivery_date, type: "Entrega", title: project.name, detail: project.stage, projectId: project.id }] : []),
    ]),
    ...(taskResult.data ?? []).map((task) => ({
      id: `task-${task.id}`, date: task.due_date!, type: task.status === "bloqueada" ? "Bloqueada" : "Tarea",
      title: task.title, detail: `${task.stage} | ${projects.find((project) => project.id === task.project_id)?.name ?? "Proyecto"}`,
      projectId: task.project_id,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return json({ events });
}

