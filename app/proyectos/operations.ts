"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasOpenWorkSession } from "@/lib/attendance";

const MAX_PROJECT_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_TASK_FILE_SIZE = 20 * 1024 * 1024;
type UserContext = NonNullable<Awaited<ReturnType<typeof currentContext>>>;
type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function currentContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user
    ? { supabase, user, active: await hasOpenWorkSession(supabase, user.id) }
    : null;
}

function validateScreenshot(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("La captura debe ser un archivo de imagen.");
  }
  if (file.size > MAX_PROJECT_IMAGE_SIZE) {
    throw new Error("La captura no puede superar los 10 MB.");
  }
}

async function saveTaskScreenshot(
  context: UserContext,
  admin: AdminClient,
  projectId: string,
  taskId: string,
  file: File,
  caption: string,
  associateWithTask = true,
) {
  validateScreenshot(file);
  const { data: task, error: taskError } = await admin
    .from("project_tasks")
    .select("id,title")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .single();
  if (taskError || !task) {
    throw new Error(`No se encontró la tarea seleccionada: ${taskError?.message ?? "registro inexistente"}`);
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${projectId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("project-media")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`No se pudo subir la captura: ${uploadError.message}`);
  }

  const publicUrl = admin.storage
    .from("project-media")
    .getPublicUrl(storagePath).data.publicUrl;
  const mediaRecord = {
    project_id: projectId,
    uploaded_by: context.user.id,
    storage_path: storagePath,
    public_url: publicUrl,
    media_type: "screenshot",
    caption,
    ...(associateWithTask ? { task_id: taskId } : {}),
  };
  const { error: insertError } = await admin
    .from("project_media")
    .insert(mediaRecord);
  if (insertError) {
    const { error: cleanupError } = await admin.storage
      .from("project-media")
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Could not clean up failed screenshot upload:", cleanupError);
    }
    if (insertError.message.includes("task_id")) {
      throw new Error(
        "Falta la columna project_media.task_id en Supabase. Ejecuta supabase/link_project_media_to_tasks.sql y vuelve a subir la captura.",
      );
    }
    throw new Error(`No se pudo guardar la captura en la tarea: ${insertError.message}`);
  }

  const { error: activityError } = await context.supabase.from("project_activity").insert({
    project_id: projectId,
    task_id: associateWithTask ? taskId : null,
    actor_id: context.user.id,
    event_type: "comment",
    message: associateWithTask
      ? `Subió una captura a “${task.title}”${caption ? `: ${caption}` : ""}`
      : `Subió una captura al proyecto para “${task.title}”, pendiente de asociar${caption ? `: ${caption}` : ""}`,
    metadata: {
      media_type: "screenshot",
      storage_path: storagePath,
      intended_task_id: taskId,
    },
  });
  if (activityError) console.error("Could not record screenshot upload activity:", activityError);
}

async function ensureTaskMediaColumn(admin: AdminClient) {
  const { error } = await admin.from("project_media").select("task_id").limit(0);
  if (!error) return;
  if (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.includes("task_id")
  ) {
    throw new Error(
      "Falta la columna project_media.task_id en Supabase. Ejecuta supabase/link_project_media_to_tasks.sql antes de subir capturas a tareas.",
    );
  }
  throw new Error(`No se pudo verificar el esquema de capturas: ${error.message}`);
}

export async function createTask(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  if (!context || !context.active || !projectId) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assignedTo = String(formData.get("assigned_to") ?? "");
  if (!assignedTo) {
    throw new Error("Selecciona un responsable antes de crear esta parte.");
  }
  if (assignedTo !== context.user.id) {
    throw new Error("Solo puedes asignarte esta parte a tu propia cuenta.");
  }
  const file = formData.get("file");
  const screenshot = file instanceof File && file.size > 0 ? file : null;
  if (screenshot) validateScreenshot(screenshot);

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para crear tareas en este proyecto.");
  }

  const mediaAdmin = screenshot ? createSupabaseAdminClient() : null;
  let screenshotSchemaWarning: string | null = null;
  let canAssociateScreenshot = true;
  if (screenshot) {
    if (!mediaAdmin) {
      throw new Error("Falta configurar el acceso administrativo para guardar la captura.");
    }
    try {
      await ensureTaskMediaColumn(mediaAdmin);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("project_media.task_id")) {
        throw error;
      }
      screenshotSchemaWarning =
        "La parte se creó correctamente, pero no se pudo asociar la captura. Ejecuta supabase/link_project_media_to_tasks.sql para habilitar las capturas en tareas.";
      canAssociateScreenshot = false;
    }
  }

  const { data: task, error: taskError } = await context.supabase
    .from("project_tasks")
    .insert({
      project_id: projectId,
      title,
      description: String(formData.get("description") ?? "").trim(),
      stage: String(formData.get("stage") ?? "Desarrollo"),
      assigned_to: assignedTo || null,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (taskError || !task) {
    throw new Error(`No se pudo crear la tarea: ${taskError?.message ?? "No se recibió el registro creado."}`);
  }
  if (screenshot && mediaAdmin) {
    await saveTaskScreenshot(
      context,
      mediaAdmin,
      projectId,
      task.id,
      screenshot,
      String(formData.get("caption") ?? "").trim(),
      canAssociateScreenshot,
    );
  }
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  revalidatePath("/proyectos");
  if (screenshotSchemaWarning) {
    redirect(
      `/proyectos/seguimiento/${projectId}?assignment_error=${encodeURIComponent(screenshotSchemaWarning)}#task-${task.id}`,
    );
  }
}

export async function updateTask(formData: FormData) {
  const context = await currentContext();
  const taskId = String(formData.get("task_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!context || !context.active || !taskId || !projectId) return;
  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  }
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para editar partes de este proyecto.");
  }

  const { data: task, error: taskError } = await context.supabase
    .from("project_tasks")
    .select("assigned_to,status")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (taskError || !task) {
    throw new Error(`No se encontró la parte del proyecto: ${taskError?.message ?? "registro inexistente"}`);
  }

  const status = String(formData.get("status") ?? "pendiente");
  if (
    status === "completada" &&
    task.status !== "completada" &&
    task.assigned_to !== context.user.id
  ) {
    throw new Error("Solo la persona asignada puede completar esta tarea.");
  }

  const hasAssignment = formData.has("assigned_to");
  const assignedTo = hasAssignment ? String(formData.get("assigned_to") ?? "") : "";
  if (!task.assigned_to && !assignedTo) {
    throw new Error("Selecciona un responsable antes de actualizar esta parte.");
  }
  if (hasAssignment && assignedTo && assignedTo !== context.user.id) {
    throw new Error("Solo puedes asignarte esta parte a tu propia cuenta.");
  }
  if (
    hasAssignment &&
    task.assigned_to &&
    task.assigned_to !== context.user.id
  ) {
    throw new Error("No puedes cambiar el responsable asignado a otra persona.");
  }

  const updates = {
    status,
    stage: String(formData.get("stage") ?? "Desarrollo"),
    ...(hasAssignment ? { assigned_to: assignedTo || null } : {}),
  };
  const { error: updateError } = await context.supabase
    .from("project_tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (updateError) {
    throw new Error(`No se pudo actualizar la parte: ${updateError.message}`);
  }
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  revalidatePath("/proyectos");
}

export async function requestTaskAssignment(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  if (!context || !context.active || !projectId || !taskId) {
    throw new Error("Inicia sesión y registra tu entrada antes de solicitar una asignación.");
  }

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`No se pudo comprobar tu acceso al proyecto: ${membershipError.message}`);
  }
  if (!membership) throw new Error("Debes pertenecer al equipo del proyecto para solicitar una asignación.");

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");
  const { data: task, error: taskError } = await admin
    .from("project_tasks")
    .select("id,title,assigned_to")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .single();
  if (taskError || !task) {
    throw new Error(`No se encontró la tarea: ${taskError?.message ?? "registro inexistente"}`);
  }
  if (task.assigned_to) throw new Error("Esta tarea ya tiene responsable.");

  const { error: requestError } = await admin
    .from("project_assignment_requests")
    .insert({ project_id: projectId, task_id: taskId, user_id: context.user.id });
  if (requestError) {
    if (requestError.code === "23505") {
      throw new Error("Ya tienes una solicitud pendiente para esta tarea.");
    }
    if (
      requestError.code === "PGRST205" ||
      requestError.message.includes("project_assignment_requests")
    ) {
      redirect(
        `/proyectos/seguimiento/${projectId}?assignment_error=${encodeURIComponent("Falta crear la tabla de solicitudes. Ejecuta supabase/project_assignment_requests.sql en el SQL Editor del proyecto Supabase conectado a CineFlow.")}#task-${taskId}`,
      );
    }
    throw new Error(`No se pudo enviar la solicitud: ${requestError.message}`);
  }

  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  revalidatePath("/usuarios/solicitudes");
}

export async function requestTaskDeletion(formData: FormData) {
  const context = await currentContext();
  const taskId = String(formData.get("task_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  if (!context || !context.active || !taskId || !projectId) {
    throw new Error("Necesitas una jornada activa para solicitar eliminar una parte.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");
  const { data: task, error: taskError } = await admin
    .from("project_tasks")
    .select("id,title,project_id,assigned_to,created_by")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (taskError || !task) {
    throw new Error(`No se encontró la parte del proyecto: ${taskError?.message ?? "registro inexistente"}`);
  }
  if (
    task.assigned_to !== context.user.id &&
    task.created_by !== context.user.id
  ) {
    throw new Error("Solo quien creó la parte o su responsable puede solicitar eliminarla.");
  }

  const { error: requestError } = await admin
    .from("project_task_deletion_requests")
    .insert({
      project_id: projectId,
      task_id: taskId,
      user_id: context.user.id,
    });
  if (requestError) {
    if (requestError.code === "23505") {
      throw new Error("Ya existe una solicitud pendiente para eliminar esta parte.");
    }
    if (
      requestError.code === "PGRST205" ||
      requestError.message.includes("project_task_deletion_requests")
    ) {
      throw new Error(
        "Falta crear la tabla de solicitudes. Ejecuta supabase/project_task_deletion_requests.sql en el SQL Editor de Supabase.",
      );
    }
    throw new Error(`No se pudo enviar la solicitud: ${requestError.message}`);
  }

  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}

async function reviewTaskDeletionRequest(
  formData: FormData,
  approve: boolean,
) {
  const context = await currentContext();
  const requestId = String(formData.get("request_id") ?? "");
  if (!context || !context.active || !requestId) {
    throw new Error("Necesitas iniciar sesión y tener una jornada activa para revisar solicitudes.");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");

  const { data: request, error: requestError } = await admin
    .from("project_task_deletion_requests")
    .select("id,project_id,task_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (requestError || !request) {
    throw new Error(
      `No se encontró la solicitud pendiente: ${requestError?.message ?? "ya fue atendida"}`,
    );
  }

  let taskMedia: { storage_path: string }[] = [];
  if (approve) {
    const { data, error: mediaError } = await admin
      .from("project_media")
      .select("storage_path")
      .eq("project_id", request.project_id)
      .eq("task_id", request.task_id);
    if (mediaError) {
      throw new Error(`No se pudieron consultar las capturas de la parte: ${mediaError.message}`);
    }
    taskMedia = data ?? [];
  }

  const { error } = await admin.rpc("review_project_task_deletion_request", {
    request_uuid: request.id,
    reviewer_uuid: context.user.id,
    approve,
  });
  if (error) {
    throw new Error(`No se pudo revisar la solicitud: ${error.message}`);
  }

  if (approve && taskMedia.length) {
    const { error: storageError } = await admin.storage
      .from("project-media")
      .remove(taskMedia.map((item) => item.storage_path));
    if (storageError) {
      throw new Error(
        `La parte se eliminó, pero no se pudieron limpiar sus capturas: ${storageError.message}`,
      );
    }
  }
  revalidatePath(`/proyectos/seguimiento/${request.project_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/");
}

export async function approveTaskDeletionRequest(formData: FormData) {
  await reviewTaskDeletionRequest(formData, true);
}

export async function rejectTaskDeletionRequest(formData: FormData) {
  await reviewTaskDeletionRequest(formData, false);
}

export async function addProjectComment(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!context || !context.active || !projectId || !message) return;
  await context.supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: context.user.id,
    event_type: "comment",
    message,
  });
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}

export async function uploadProjectMedia(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const file = formData.get("file");
  const caption = String(formData.get("caption") ?? "").trim();
  if (file instanceof File && file.size > 0) validateScreenshot(file);
  if (
    !context ||
    !context.active ||
    !projectId ||
    !taskId ||
    !(file instanceof File) ||
    !file.size
  )
    return;
  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para subir capturas a este proyecto.");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");
  let canAssociateScreenshot = true;
  let screenshotSchemaWarning: string | null = null;
  try {
    await ensureTaskMediaColumn(admin);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("project_media.task_id")) {
      throw error;
    }
    canAssociateScreenshot = false;
    screenshotSchemaWarning =
      "La captura se guardó sin asociar a una parte. Ejecuta supabase/link_project_media_to_tasks.sql y asígnala después.";
  }
  await saveTaskScreenshot(
    context,
    admin,
    projectId,
    taskId,
    file,
    caption,
    canAssociateScreenshot,
  );
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  if (screenshotSchemaWarning) {
    redirect(
      `/proyectos/seguimiento/${projectId}?assignment_error=${encodeURIComponent(screenshotSchemaWarning)}`,
    );
  }
}

export async function uploadTaskFile(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const file = formData.get("file");
  if (
    !context ||
    !context.active ||
    !projectId ||
    !taskId ||
    !(file instanceof File) ||
    !file.size
  ) {
    throw new Error("Inicia sesión, registra tu entrada y selecciona un archivo.");
  }
  if (file.size > MAX_TASK_FILE_SIZE) {
    throw new Error("El archivo no puede superar los 20 MB.");
  }

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  }
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para adjuntar archivos a esta parte.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");
  const { data: task, error: taskError } = await admin
    .from("project_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (taskError || !task) {
    throw new Error(`No se encontró la parte del proyecto: ${taskError?.message ?? "registro inexistente"}`);
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const storagePath = `${projectId}/${taskId}/${crypto.randomUUID()}.${extension}`;
  const bucket = admin.storage.from("project-task-files");
  const { error: uploadError } = await bucket.upload(
    storagePath,
    await file.arrayBuffer(),
    {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    },
  );
  if (uploadError) {
    throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
  }

  const { error: insertError } = await admin.from("project_task_files").insert({
    project_id: projectId,
    task_id: taskId,
    uploaded_by: context.user.id,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type || "application/octet-stream",
    file_size: file.size,
  });
  if (insertError) {
    const { error: cleanupError } = await bucket.remove([storagePath]);
    if (cleanupError) {
      throw new Error(
        `No se guardaron los datos del archivo (${insertError.message}) y tampoco se pudo limpiar el archivo subido (${cleanupError.message}).`,
      );
    }
    throw new Error(`No se pudo guardar el archivo adjunto: ${insertError.message}`);
  }

  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}

export async function assignProjectMediaToTask(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const mediaId = String(formData.get("media_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  if (!context || !context.active || !projectId || !mediaId || !taskId) {
    throw new Error("Necesitas una jornada activa para asignar la captura a una parte.");
  }

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  }
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para asignar capturas en este proyecto.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");
  await ensureTaskMediaColumn(admin);

  const [{ data: task, error: taskError }, { data: media, error: mediaError }] =
    await Promise.all([
      admin
        .from("project_tasks")
        .select("id,title")
        .eq("id", taskId)
        .eq("project_id", projectId)
        .maybeSingle(),
      admin
        .from("project_media")
        .select("id,task_id")
        .eq("id", mediaId)
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);
  if (taskError || !task) {
    throw new Error(`No se encontró la parte seleccionada: ${taskError?.message ?? "registro inexistente"}`);
  }
  if (mediaError || !media) {
    throw new Error(`No se encontró la captura: ${mediaError?.message ?? "registro inexistente"}`);
  }
  if (media.task_id) throw new Error("Esta captura ya está asociada a una parte.");

  const { error: updateError } = await admin
    .from("project_media")
    .update({ task_id: task.id })
    .eq("id", media.id)
    .eq("project_id", projectId)
    .is("task_id", null);
  if (updateError) {
    throw new Error(`No se pudo asociar la captura: ${updateError.message}`);
  }

  const { error: activityError } = await context.supabase
    .from("project_activity")
    .insert({
      project_id: projectId,
      task_id: task.id,
      actor_id: context.user.id,
      event_type: "comment",
      message: `Asoció una captura a “${task.title}”`,
      metadata: { media_id: media.id, task_id: task.id },
    });
  if (activityError) {
    console.error("Could not record screenshot assignment activity:", activityError);
  }

  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}

async function getEditableMedia(formData: FormData) {
  const context = await currentContext();
  const projectId = String(formData.get("project_id") ?? "");
  const mediaId = String(formData.get("media_id") ?? "");
  if (!context || !context.active || !projectId || !mediaId) {
    throw new Error("Necesitas una jornada activa y permisos para editar capturas.");
  }

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`No se pudieron comprobar los permisos: ${membershipError.message}`);
  if (!membership || !["owner", "editor"].includes(membership.role)) {
    throw new Error("No tienes permiso para modificar las capturas de este proyecto.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo a Supabase.");

  const { data: media, error: mediaError } = await admin
    .from("project_media")
    .select("id,project_id,task_id,storage_path")
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .single();
  if (mediaError || !media) {
    throw new Error(`No se encontró la captura: ${mediaError?.message ?? "registro inexistente"}`);
  }

  return { context, admin, projectId, media };
}

export async function updateProjectMedia(formData: FormData) {
  const { admin, projectId, media } = await getEditableMedia(formData);
  const caption = String(formData.get("caption") ?? "").trim();
  const file = formData.get("file");
  const replacement = file instanceof File && file.size > 0 ? file : null;
  if (replacement && !replacement.type.startsWith("image/")) {
    throw new Error("La captura debe ser un archivo de imagen.");
  }
  if (replacement && replacement.size > MAX_PROJECT_IMAGE_SIZE) {
    throw new Error("La captura no puede superar los 10 MB.");
  }

  let replacementPath: string | null = null;
  let publicUrl: string | null = null;
  if (replacement) {
    const extension =
      replacement.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    replacementPath = `${projectId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("project-media")
      .upload(replacementPath, await replacement.arrayBuffer(), {
        contentType: replacement.type,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`No se pudo subir la nueva captura: ${uploadError.message}`);
    }
    publicUrl = admin.storage
      .from("project-media")
      .getPublicUrl(replacementPath).data.publicUrl;
  }

  const { error } = await admin
    .from("project_media")
    .update({
      caption,
      ...(replacementPath && publicUrl
        ? { storage_path: replacementPath, public_url: publicUrl }
        : {}),
    })
    .eq("id", media.id)
    .eq("project_id", projectId);
  if (error) {
    if (replacementPath) {
      const { error: cleanupError } = await admin.storage
        .from("project-media")
        .remove([replacementPath]);
      if (cleanupError) {
        console.error("Could not clean up the replacement screenshot:", cleanupError);
      }
    }
    throw new Error(`No se pudo actualizar la captura: ${error.message}`);
  }

  if (replacementPath) {
    const { error: removeError } = await admin.storage
      .from("project-media")
      .remove([media.storage_path]);
    if (removeError) {
      throw new Error(`La captura se actualizó, pero no se pudo retirar el archivo anterior: ${removeError.message}`);
    }
  }
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}

export async function deleteProjectMedia(formData: FormData) {
  const { admin, projectId, media } = await getEditableMedia(formData);
  const { error: storageError } = await admin.storage
    .from("project-media")
    .remove([media.storage_path]);
  if (storageError) throw new Error(`No se pudo eliminar el archivo de la captura: ${storageError.message}`);

  const { error: recordError } = await admin
    .from("project_media")
    .delete()
    .eq("id", media.id)
    .eq("project_id", projectId);
  if (recordError) throw new Error(`No se pudo eliminar el registro de la captura: ${recordError.message}`);
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
}
