import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasOpenWorkSession } from "@/lib/attendance";
import UserAvatar from "@/lib/UserAvatar";
import ScreenshotCard from "../ScreenshotCard";
import StageWindows from "../StageWindows";
import ProjectVisitTracker from "@/app/ProjectVisitTracker";
import { updateProject } from "../../actions";
import ProjectForm from "../../ProjectForm";
import ConfirmSubmit from "../../../ConfirmSubmit";
import {
  addProjectComment,
  approveTaskDeletionRequest,
  createTask,
  rejectTaskDeletionRequest,
  requestTaskDeletion,
  requestTaskAssignment,
  uploadTaskFile,
  uploadProjectMedia,
  updateTask,
} from "../../operations";

export const instant = false;
const stages = [
  "Desarrollo",
  "Preproducción",
  "Producción",
  "Postproducción",
  "Distribución",
];
const statuses = ["pendiente", "en curso", "bloqueada", "completada"];
type ProjectMediaItem = {
  id: string;
  task_id: string | null;
  public_url: string;
  caption: string | null;
  media_type: string;
  uploaded_by: string | null;
  created_at: string;
};
const fmt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export default async function ProjectTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assignment_error?: string }>;
}) {
  await connection();
  const [{ id }, { assignment_error: assignmentError }] = await Promise.all([
    params,
    searchParams,
  ]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const activeSession = await hasOpenWorkSession(supabase, user.id);
  const [
    { data: project },
    { data: tasks },
    { data: activity },
    { data: members },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("project_tasks")
      .select(
        "id,title,description,stage,status,assigned_to,created_by,created_at,updated_at,completed_at",
      )
      .eq("project_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("project_activity")
      .select("id,task_id,actor_id,event_type,message,metadata,created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("project_members")
      .select("user_id,role")
      .eq("project_id", id),
  ]);
  if (!project) notFound();
  const mediaSelect = () =>
    supabase
      .from("project_media")
      .select("id,task_id,public_url,caption,media_type,uploaded_by,created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
  let media: ProjectMediaItem[] = [];
  let mediaTaskColumnAvailable = true;
  let mediaError: string | null = null;
  const { data: linkedMedia, error: linkedMediaError } = await mediaSelect();
  if (
    linkedMediaError?.code === "42703" ||
    linkedMediaError?.code === "PGRST204" ||
    linkedMediaError?.message.includes("task_id")
  ) {
    mediaTaskColumnAvailable = false;
    const { data: legacyMedia, error: legacyMediaError } = await supabase
      .from("project_media")
      .select("id,public_url,caption,media_type,uploaded_by,created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    if (legacyMediaError) {
      mediaError = legacyMediaError.message;
    } else {
      media = (legacyMedia ?? []).map((item) => ({ ...item, task_id: null }));
    }
  } else if (linkedMediaError) {
    mediaError = linkedMediaError.message;
  } else {
    media = (linkedMedia ?? []) as ProjectMediaItem[];
  }
  const admin = createSupabaseAdminClient();
  const { data: taskFiles, error: taskFilesError } =
    admin && tasks?.length
      ? await admin
          .from("project_task_files")
          .select("id,task_id,storage_path,file_name,content_type,file_size,created_at")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  const signedFiles = await Promise.all(
    (taskFiles ?? []).map(async (file) => {
      if (!admin) return { ...file, signedUrl: null };
      const { data, error } = await admin.storage
        .from("project-task-files")
        .createSignedUrl(file.storage_path, 60 * 60);
      return {
        ...file,
        signedUrl: error ? null : data.signedUrl,
      };
    }),
  );
  const filesByTask = new Map<string, typeof signedFiles>();
  for (const file of signedFiles) {
    const files = filesByTask.get(file.task_id) ?? [];
    files.push(file);
    filesByTask.set(file.task_id, files);
  }
  const { data: deletionRequests, error: deletionRequestsError } =
    admin && tasks?.length
      ? await admin
          .from("project_task_deletion_requests")
          .select("id,task_id,user_id,status,created_at")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  const latestDeletionRequestByTask = new Map<
    string,
    { id: string; user_id: string; status: string }
  >();
  for (const request of deletionRequests ?? []) {
    if (!latestDeletionRequestByTask.has(request.task_id)) {
      latestDeletionRequestByTask.set(request.task_id, request);
    }
  }
  const { data: assignmentRequests, error: assignmentRequestsError } =
    admin && tasks?.length
      ? await admin
          .from("project_assignment_requests")
          .select("task_id,status,created_at")
          .eq("project_id", id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  const latestRequestByTask = new Map<string, string>();
  for (const request of assignmentRequests ?? []) {
    if (!latestRequestByTask.has(request.task_id)) {
      latestRequestByTask.set(request.task_id, request.status);
    }
  }
  const ids = Array.from(
    new Set(
      [
        ...(members ?? []).map((item) => item.user_id),
        ...(tasks ?? []).flatMap((item) => [item.assigned_to, item.created_by]),
        ...(activity ?? []).map((item) => item.actor_id),
        ...(media ?? []).map((item) => item.uploaded_by),
      ].filter(Boolean),
    ),
  ) as string[];
  const { data: profiles } = ids.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", ids)
    : { data: [] };
  const profileOf = (uid: string | null) =>
    profiles?.find((profile) => profile.id === uid);
  const nameOf = (uid: string | null) =>
    profileOf(uid)?.full_name || "Sin asignar";
  const canEdit =
    activeSession &&
    members?.some(
      (member) =>
        member.user_id === user.id && ["owner", "editor"].includes(member.role),
    );
  const completedCount =
    tasks?.filter((task) => task.status === "completada").length ?? 0;
  const progress = tasks?.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;
  const projectStages = [
    ...new Set([
      project.stage,
      ...stages,
      ...(tasks ?? []).map((task) => task.stage),
    ]),
  ];
  const projectForm = {
    id: project.id,
    name: project.name,
    type: project.type,
    stage: project.stage,
    owner_role: project.owner_role,
    start_date: project.start_date,
    delivery_date: project.delivery_date,
    description: project.description,
  };
  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <ProjectVisitTracker userId={user.id} projectId={project.id} />
      <section className="mx-auto max-w-7xl p-6 md:p-10">
        {!activeSession && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <span>
              Tu jornada está cerrada. Registra tu entrada para poder editar el
              proyecto o registrar avances.
            </span>
            <Link
              href="/horarios"
              className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-slate-950"
            >
              Registrar entrada
            </Link>
          </div>
        )}
        {mediaError && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            No se pudieron cargar las capturas: {mediaError}
          </p>
        )}
        {!mediaTaskColumnAvailable && !mediaError && (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Las capturas se muestran sin asociar. Para verlas
            dentro de las partes, aplica{" "}
            <code>supabase/link_project_media_to_tasks.sql</code> y luego
            asígnalas a una parte desde la tarjeta de la captura.
          </p>
        )}
        {assignmentError && (
          <div className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {assignmentError}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/proyectos" className="text-sm text-violet-300">
            ← Proyectos
          </Link>
          <Link href="/horarios" className="text-sm text-violet-300">
            Ver jornadas del equipo →
          </Link>
        </div>
        <header className="mb-8 mt-6">
          <p className="text-sm text-violet-300">
            CINEFLOW / SEGUIMIENTO DE PRODUCCIÓN
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">{project.name}</h1>
              <p className="mt-2 text-gray-400">
                {project.type} · responsable general: {project.owner_role}
              </p>
            </div>
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm text-violet-200">
              Etapa actual: {project.stage}
            </span>
          </div>
        </header>
        <div className="mb-8 rounded-2xl border border-white/10 bg-[#14151c] p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">Completado del proyecto</span>
            <span className="font-semibold text-violet-200">
              {progress}% · {completedCount}/{tasks?.length ?? 0} partes
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="grid gap-8 xl:grid-cols-[1.4fr_.8fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">
                    Partes del proyecto
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Cada tarea tiene etapa, estado, responsable y trazabilidad.
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-gray-300">
                  {tasks?.length ?? 0} tareas
                </span>
              </div>
              {canEdit && (
                <form
                  action={createTask}
                  id="create-task"
                  className="mt-5 grid gap-3 rounded-xl border border-dashed border-violet-400/30 bg-violet-400/5 p-4 md:grid-cols-2"
                >
                  <input type="hidden" name="project_id" value={id} />
                  <input
                    name="title"
                    required
                    placeholder="Nombre de la tarea"
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  />
                  <select
                    name="stage"
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  >
                    {stages.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                  <textarea
                    name="description"
                    placeholder="Qué se debe hacer"
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white md:col-span-2"
                    rows={2}
                  />
                  <label className="block text-xs text-gray-400">
                    Captura inicial (opcional)
                    <input
                      type="file"
                      name="file"
                      accept="image/*"
                      aria-label="Captura inicial de la tarea"
                      className="mt-2 block w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-gray-300"
                    />
                  </label>
                  <input
                    name="caption"
                    placeholder="Descripción de la captura (opcional)"
                    className="self-end rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  />
                  <select
                    name="assigned_to"
                    aria-label="Responsable"
                    required
                    className="scheme-dark rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/30 invalid:border-red-400 invalid:bg-red-400/10 invalid:text-red-200 invalid:focus:border-red-300 invalid:focus:ring-red-400/30"
                  >
                    <option value="" className="bg-gray-900 text-gray-400">
                      Selecciona responsable
                    </option>
                    <option value={user.id}>{nameOf(user.id)} (yo)</option>
                  </select>
                  <button className="rounded-xl bg-violet-500 px-5 py-3 font-semibold">
                    Añadir parte
                  </button>
                </form>
              )}
              {media?.some((item) => !item.task_id) && (
                <details className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-300">
                    Capturas sin parte asociada
                  </summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {media.filter((item) => !item.task_id).map((item) => (
                      <ScreenshotCard
                        key={item.id}
                        id={item.id}
                        projectId={id}
                        publicUrl={item.public_url}
                        caption={item.caption}
                        uploadedByName={nameOf(item.uploaded_by)}
                        uploadedByAvatar={profileOf(item.uploaded_by)?.avatar_url}
                        canEdit={Boolean(canEdit)}
                        taskOptions={
                          mediaTaskColumnAvailable
                            ? (tasks ?? []).map(({ id: taskId, title }) => ({
                                id: taskId,
                                title,
                              }))
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </details>
              )}
              {assignmentRequestsError && (
                <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                  No se pudo consultar el estado de tus solicitudes. Aplica la
                  migración de solicitudes de asignación en Supabase.
                </p>
              )}
              {deletionRequestsError && (
                <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                  No se pudieron consultar las solicitudes para eliminar partes.
                  Ejecuta <code>supabase/project_task_deletion_requests.sql</code> en Supabase.
                </p>
              )}
              {taskFilesError && (
                <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                  No se pudieron cargar los archivos adjuntos. Ejecuta{" "}
                  <code>supabase/project_task_files.sql</code> en Supabase.
                </p>
              )}
              <StageWindows
                initialStage={project.stage}
                stages={projectStages.map((stage) => {
                  const stageTasks =
                    tasks?.filter((task) => task.stage === stage) ?? [];
                  const stageTaskIds = new Set(
                    stageTasks.map((task) => task.id),
                  );
                  const stageMediaCount = media.filter(
                    (item) => item.task_id && stageTaskIds.has(item.task_id),
                  ).length;
                  const stageFileCount = stageTasks.reduce(
                    (count, task) =>
                      count + (filesByTask.get(task.id)?.length ?? 0),
                    0,
                  );
                  return {
                    name: stage,
                    taskCount: stageTasks.length,
                    completedCount: stageTasks.filter(
                      (task) => task.status === "completada",
                    ).length,
                    mediaCount: stageMediaCount,
                    fileCount: stageFileCount,
                    content: stageTasks.length ? (
                      <div className="space-y-3">
                        {stageTasks.map((task) => (
                  <article
                    key={task.id}
                    id={`task-${task.id}`}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-sky-400/10 px-2 py-1 text-sky-200">
                            {task.stage}
                          </span>
                          <span className="rounded-full bg-white/10 px-2 py-1 text-gray-300">
                            {task.status}
                          </span>
                        </div>
                        <h3 className="mt-2 font-semibold">{task.title}</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Creada: {fmt(task.created_at)}
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                          {task.description || "Sin descripción"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        Responsable
                        <div className="mt-1 flex items-center justify-end gap-2 text-sm text-gray-200">
                          <UserAvatar
                            name={nameOf(task.assigned_to)}
                            avatarUrl={profileOf(task.assigned_to)?.avatar_url}
                            className="h-7 w-7"
                          />
                          {nameOf(task.assigned_to)}
                        </div>
                      </div>
                    </div>
                    {!task.assigned_to &&
                      members?.some((member) => member.user_id === user.id) &&
                      (latestRequestByTask.get(task.id) === "pending" ? (
                        <p className="mt-3 text-sm text-amber-200">
                          Tu solicitud de asignación está pendiente de aprobación.
                        </p>
                      ) : activeSession ? (
                        <form action={requestTaskAssignment} className="mt-3">
                          <input type="hidden" name="project_id" value={id} />
                          <input type="hidden" name="task_id" value={task.id} />
                          <button className="rounded-lg border border-violet-400/40 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-400/10">
                            {latestRequestByTask.get(task.id) === "rejected"
                              ? "Volver a solicitar asignación"
                              : "Solicitar asignación"}
                          </button>
                          {latestRequestByTask.get(task.id) === "rejected" && (
                            <span className="ml-2 text-xs text-gray-400">
                              Tu solicitud anterior fue rechazada.
                            </span>
                          )}
                        </form>
                      ) : (
                        <p className="mt-3 text-xs text-gray-400">
                          Registra tu entrada para solicitar esta asignación.
                        </p>
                      ))}
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-gray-200">
                          Capturas de esta tarea
                        </h4>
                        <span className="text-xs text-gray-500">
                          {media?.filter((item) => item.task_id === task.id).length ?? 0}
                        </span>
                      </div>
                      {canEdit && (
                        <form
                          action={uploadProjectMedia}
                          className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <input type="hidden" name="project_id" value={id} />
                          <input type="hidden" name="task_id" value={task.id} />
                          <input
                            type="file"
                            name="file"
                            accept="image/*"
                            required
                            aria-label={`Captura para ${task.title}`}
                            className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-gray-300"
                          />
                          <input
                            name="caption"
                            placeholder="Descripción"
                            className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
                          />
                          <button className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950">
                            Añadir captura
                          </button>
                        </form>
                      )}
                      {media?.some((item) => item.task_id === task.id) ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {media
                            .filter((item) => item.task_id === task.id)
                            .map((item) => (
                              <ScreenshotCard
                                key={item.id}
                                id={item.id}
                                projectId={id}
                                publicUrl={item.public_url}
                                caption={item.caption}
                                uploadedByName={nameOf(item.uploaded_by)}
                                uploadedByAvatar={
                                  profileOf(item.uploaded_by)?.avatar_url
                                }
                                canEdit={Boolean(canEdit)}
                              />
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Aún no hay capturas para esta tarea.
                        </p>
                      )}
                      <div className="mt-5 border-t border-white/10 pt-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-gray-200">
                            Archivos de esta parte
                          </h4>
                          <span className="text-xs text-gray-500">
                            {filesByTask.get(task.id)?.length ?? 0}
                          </span>
                        </div>
                        {canEdit && (
                          <form
                            action={uploadTaskFile}
                            encType="multipart/form-data"
                            className="mb-4 flex flex-col gap-2 sm:flex-row"
                          >
                            <input type="hidden" name="project_id" value={id} />
                            <input type="hidden" name="task_id" value={task.id} />
                            <input
                              type="file"
                              name="file"
                              required
                              aria-label={`Archivo para ${task.title}`}
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-gray-300"
                            />
                            <button className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white">
                              Adjuntar archivo
                            </button>
                          </form>
                        )}
                        {filesByTask.get(task.id)?.length ? (
                          <ul className="space-y-2">
                            {filesByTask.get(task.id)?.map((file) => (
                              <li
                                key={file.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2"
                              >
                                <span className="min-w-0 truncate text-sm text-gray-300">
                                  {file.file_name}
                                  <span className="ml-2 text-xs text-gray-500">
                                    {file.file_size < 1024 * 1024
                                      ? `${Math.max(1, Math.round(file.file_size / 1024))} KB`
                                      : `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`}
                                  </span>
                                </span>
                                {file.signedUrl ? (
                                  <a
                                    href={file.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 text-xs font-medium text-violet-300 hover:text-violet-200"
                                  >
                                    Abrir / descargar
                                  </a>
                                ) : (
                                  <span className="shrink-0 text-xs text-red-300">
                                    No se pudo generar el enlace
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Aún no hay archivos adjuntos.
                          </p>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <ConfirmSubmit
                        action={updateTask}
                        message="¿Confirmas guardar los cambios de esta parte?"
                        className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3"
                      >
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="project_id" value={id} />
                        <select
                          name="stage"
                          defaultValue={task.stage}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
                        >
                          {stages.map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                        <select
                          name="status"
                          defaultValue={task.status}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
                        >
                          {statuses.map((status) => {
                            const cannotComplete =
                              status === "completada" &&
                              task.status !== "completada" &&
                              task.assigned_to !== user.id;
                            return (
                              <option
                                key={status}
                                disabled={cannotComplete}
                              >
                                {status}
                              </option>
                            );
                          })}
                        </select>
                        {task.status !== "completada" &&
                          task.assigned_to !== user.id && (
                            <span className="self-center text-xs text-gray-400">
                              Solo la persona asignada puede completarla.
                            </span>
                          )}
                        {(!task.assigned_to || task.assigned_to === user.id) ? (
                          <select
                            name="assigned_to"
                            aria-label="Responsable"
                            defaultValue={task.assigned_to ?? ""}
                            required
                            className="scheme-dark rounded-lg border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/30 invalid:border-red-400 invalid:bg-red-400/10 invalid:text-red-200 invalid:focus:border-red-300 invalid:focus:ring-red-400/30"
                          >
                            <option value="" className="bg-gray-900 text-gray-400">
                              Selecciona responsable
                            </option>
                            <option value={user.id}>{nameOf(user.id)} (yo)</option>
                          </select>
                        ) : (
                          <span className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                            Solo puedes asignarte a ti mismo
                          </span>
                        )}
                        <button className="rounded-lg border border-violet-400/40 px-3 py-2 text-xs text-violet-200">
                          Actualizar
                        </button>
                      </ConfirmSubmit>
                    )}
                    {(() => {
                      const deletionRequest = latestDeletionRequestByTask.get(task.id);
                      const canRequestDeletion =
                        task.created_by === user.id || task.assigned_to === user.id;
                      return (
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                          {canRequestDeletion &&
                            (deletionRequest?.status === "pending" ? (
                              <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                                Solicitud de eliminación pendiente
                              </span>
                            ) : (
                              <ConfirmSubmit
                                action={requestTaskDeletion}
                                message="¿Enviar una solicitud para eliminar esta parte? El propietario tendrá que aprobarla."
                              >
                                <input
                                  type="hidden"
                                  name="task_id"
                                  value={task.id}
                                />
                                <input
                                  type="hidden"
                                  name="project_id"
                                  value={id}
                                />
                                <button className="rounded-lg border border-red-400/40 px-3 py-2 text-xs text-red-200">
                                  {deletionRequest?.status === "rejected"
                                    ? "Volver a solicitar eliminación"
                                    : "Solicitar eliminación"}
                                </button>
                              </ConfirmSubmit>
                            ))}
                          {members?.some(
                            (member) =>
                              member.user_id === user.id &&
                              member.role === "owner",
                          ) &&
                            deletionRequest?.status === "pending" && (
                              <>
                                <form action={approveTaskDeletionRequest}>
                                  <input
                                    type="hidden"
                                    name="request_id"
                                    value={deletionRequest.id}
                                  />
                                  <button className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black">
                                    Aprobar eliminación
                                  </button>
                                </form>
                                <form action={rejectTaskDeletionRequest}>
                                  <input
                                    type="hidden"
                                    name="request_id"
                                    value={deletionRequest.id}
                                  />
                                  <button className="rounded-lg border border-white/20 px-3 py-2 text-xs text-gray-300">
                                    Rechazar
                                  </button>
                                </form>
                              </>
                            )}
                        </div>
                      );
                    })()}
                  </article>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-gray-400">
                        Aún no hay tareas en esta etapa.
                      </p>
                    ),
                  };
                })}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
              <h2 className="text-xl font-semibold">
                Bitácora pública del proyecto
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Quién hizo cada acción y cuándo.
              </p>
              {canEdit && (
                <form action={addProjectComment} className="mt-4 flex gap-2">
                  <input type="hidden" name="project_id" value={id} />
                  <input
                    name="message"
                    required
                    placeholder="Añadir nota a la bitácora"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  />
                  <button className="rounded-xl bg-white/10 px-4 py-3 text-sm">
                    Registrar
                  </button>
                </form>
              )}
              <div className="mt-5 space-y-4">
                  {activity?.length ? activity.map((event) => (
                  <div
                    key={event.id}
                      className={`flex gap-3 border-l-2 pl-4 ${
                        event.event_type === "task_deleted"
                          ? "border-red-400/60"
                          : "border-violet-400/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                        name={nameOf(event.actor_id)}
                        avatarUrl={profileOf(event.actor_id)?.avatar_url}
                        className="h-9 w-9"
                      />
                      <div>
                        <p className="text-sm text-gray-200">
                          <span className="font-semibold">
                            {nameOf(event.actor_id)}
                          </span>{" "}
                          · {event.message}
                        </p>
                        {event.event_type === "task_deleted" && (
                          <span className="mt-1 inline-flex rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-200">
                            Eliminación registrada
                          </span>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          {fmt(event.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="mt-4 text-sm text-gray-400">
                    Sin actividad registrada.
                  </p>
                )}
              </div>
            </div>
          </section>
          <aside className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
              <h2 className="text-xl font-semibold">Equipo con acceso</h2>
              <div className="mt-4 space-y-3">
                {members?.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={nameOf(member.user_id)}
                        avatarUrl={profileOf(member.user_id)?.avatar_url}
                        className="h-9 w-9"
                      />
                      <div>
                        <p className="font-medium">{nameOf(member.user_id)}</p>
                        <p className="text-xs text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  </div>
                )) ?? <p className="text-sm text-gray-400">Sin miembros.</p>}
              </div>
            </div>
            {canEdit && (
              <details className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
                <summary className="cursor-pointer text-xl font-semibold">
                  Editar ficha del proyecto
                </summary>
                <div className="mt-5">
                  <ProjectForm action={updateProject} project={projectForm} />
                </div>
              </details>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
