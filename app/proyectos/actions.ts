"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasOpenWorkSession, attendanceRequiredMessage } from "@/lib/attendance";
import { isCineflowAdmin } from "@/lib/admin";

export type ProjectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};
type ProjectValues = {
  name: string;
  type: string;
  stage: string;
  owner_role: string;
  start_date: string;
  delivery_date: string;
  description: string;
};

function valuesFromForm(formData: FormData): ProjectValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim(),
    stage: String(formData.get("stage") ?? "").trim(),
    owner_role: String(formData.get("owner_role") ?? "").trim(),
    start_date: String(formData.get("start_date") ?? ""),
    delivery_date: String(formData.get("delivery_date") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
  };
}
function validate(values: ProjectValues) {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values))
    if (key !== "description" && !value.trim())
      errors[key] = "Este campo es obligatorio.";
  if (
    values.start_date &&
    values.delivery_date &&
    values.delivery_date < values.start_date
  )
    errors.delivery_date =
      "La fecha de entrega no puede ser anterior al inicio.";
  return Object.keys(errors).length ? errors : undefined;
}
async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user, active: await hasOpenWorkSession(supabase, user.id) } : null;
}

async function saveProjectMedia(projectId: string, userId: string, file: File, mediaType: "cover" | "screenshot", caption: string) {
  const admin = createSupabaseAdminClient();
  if (!admin || !file.size) return;
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${projectId}/${crypto.randomUUID()}.${extension}`;
  const upload = await admin.storage.from("project-media").upload(storagePath, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream", upsert: false });
  if (upload.error) return upload.error.message;
  const { data } = admin.storage.from("project-media").getPublicUrl(storagePath);
  const { error } = await admin.from("project_media").insert({ project_id: projectId, uploaded_by: userId, storage_path: storagePath, public_url: data.publicUrl, media_type: mediaType, caption });
  return error?.message;
}

export async function createProject(
  _: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const values = valuesFromForm(formData);
  const fieldErrors = validate(values);
  if (fieldErrors) return { fieldErrors };
  const context = await authenticatedClient();
  if (!context)
    return { error: "Debes iniciar sesión para crear un proyecto." };
  if (!context.active) return { error: attendanceRequiredMessage };
  const projectId = crypto.randomUUID();
  const { error } = await context.supabase
    .from("projects")
    .insert({ id: projectId, ...values, created_by: context.user.id });
  if (error) return { error: error.message };
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size) await saveProjectMedia(projectId, context.user.id, cover, "cover", "Portada del proyecto");
  revalidatePath("/");
  revalidatePath("/proyectos");
  redirect("/?created=1");
}
export async function updateProject(
  _: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const projectId = String(formData.get("project_id") ?? "");
  const values = valuesFromForm(formData);
  const fieldErrors = validate(values);
  if (fieldErrors) return { fieldErrors };
  if (!projectId) return { error: "No se encontró el proyecto." };
  const context = await authenticatedClient();
  if (!context)
    return { error: "Debes iniciar sesión para editar un proyecto." };
  if (!context.active) return { error: attendanceRequiredMessage };
  const { error } = await context.supabase
    .from("projects")
    .update(values)
    .eq("id", projectId);
  if (error) return { error: error.message };
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size) await saveProjectMedia(projectId, context.user.id, cover, "cover", "Portada del proyecto");
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${projectId}`);
  return { success: "Cambios guardados correctamente." };
}

export async function requestProjectMembership(formData: FormData) {
  const context = await authenticatedClient();
  const projectId = String(formData.get("project_id") ?? "");
  if (!context) redirect("/login?error=Inicia%20sesi%C3%B3n%20para%20solicitar%20acceso");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    redirect("/proyectos?error=Proyecto%20inv%C3%A1lido");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/proyectos?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) {
    redirect(`/proyectos?error=${encodeURIComponent(projectError?.message ?? "No se encontró el proyecto.")}`);
  }

  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("user_id,role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    redirect(`/proyectos?error=${encodeURIComponent(membershipError.message)}`);
  }
  if (membership) {
    redirect(
      `/proyectos?success=${encodeURIComponent(
        membership.role === "owner"
          ? "Ya eres propietario de este proyecto."
          : "Ya perteneces a este proyecto.",
      )}`,
    );
  }

  if (isCineflowAdmin(context.user)) {
    const { error: addMemberError } = await admin.from("project_members").upsert(
      {
        project_id: projectId,
        user_id: context.user.id,
        role: "editor",
      },
      { onConflict: "project_id,user_id", ignoreDuplicates: true },
    );
    if (addMemberError) {
      redirect(`/proyectos?error=${encodeURIComponent(addMemberError.message)}`);
    }

    const { error: requestUpdateError } = await admin
      .from("project_membership_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.user.id,
      })
      .eq("project_id", projectId)
      .eq("user_id", context.user.id)
      .eq("status", "pending");
    if (requestUpdateError) {
      redirect(
        `/proyectos?error=${encodeURIComponent(
          `Ya tienes acceso al proyecto, pero no se pudo cerrar tu solicitud pendiente: ${requestUpdateError.message}`,
        )}`,
      );
    }

    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/seguimiento/${projectId}`);
    redirect(
      `/proyectos?success=${encodeURIComponent(
        "Acceso de administrador concedido automáticamente.",
      )}`,
    );
  }

  const { error } = await admin.from("project_membership_requests").insert({
    project_id: projectId,
    user_id: context.user.id,
  });
  if (error) {
    if (error.code === "23505") {
      redirect("/proyectos?error=Ya%20tienes%20una%20solicitud%20pendiente%20para%20este%20proyecto");
    }
    if (error.code === "PGRST205" || error.message.includes("project_membership_requests")) {
      redirect(`/proyectos?error=${encodeURIComponent("Falta crear la tabla de solicitudes. Ejecuta supabase/project_membership_requests.sql en el SQL Editor de Supabase.")}`);
    }
    redirect(`/proyectos?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/proyectos");
  redirect("/proyectos?success=Solicitud%20enviada%20al%20propietario%20del%20proyecto");
}

export async function requestProjectLeave(formData: FormData) {
  const context = await authenticatedClient();
  const projectId = String(formData.get("project_id") ?? "");
  if (!context) redirect("/login");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    redirect("/proyectos?error=Proyecto%20inv%C3%A1lido");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/proyectos?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    redirect(`/proyectos?error=${encodeURIComponent(membershipError.message)}`);
  }
  if (!membership) {
    redirect("/proyectos?error=No%20perteneces%20a%20este%20proyecto");
  }
  if (membership.role === "owner") {
    redirect("/proyectos?error=El%20propietario%20no%20puede%20solicitar%20salir%20de%20su%20proyecto");
  }

  const { error: requestError } = await admin
    .from("project_leave_requests")
    .insert({
      project_id: projectId,
      user_id: context.user.id,
    });
  if (requestError) {
    if (requestError.code === "23505") {
      redirect("/proyectos?error=Ya%20tienes%20una%20solicitud%20pendiente%20para%20salir");
    }
    if (
      requestError.code === "PGRST205" ||
      requestError.message.includes("project_leave_requests")
    ) {
      redirect(
        `/proyectos?error=${encodeURIComponent(
          "Falta crear la tabla de solicitudes para salir. Ejecuta supabase/project_leave_requests.sql en Supabase.",
        )}`,
      );
    }
    redirect(`/proyectos?error=${encodeURIComponent(requestError.message)}`);
  }

  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  redirect("/proyectos?success=Solicitud%20de%20salida%20enviada%20al%20propietario");
}

async function reviewProjectLeaveRequest(
  formData: FormData,
  approve: boolean,
) {
  const context = await authenticatedClient();
  const requestId = String(formData.get("request_id") ?? "");
  if (!context) redirect("/login");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    redirect("/proyectos?error=Solicitud%20inv%C3%A1lida");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/proyectos?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  const { data: request, error: requestError } = await admin
    .from("project_leave_requests")
    .select("id,project_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (requestError || !request) {
    redirect(
      `/proyectos?error=${encodeURIComponent(
        requestError?.message ?? "La solicitud ya no está pendiente.",
      )}`,
    );
  }
  const { error } = await admin.rpc("review_project_leave_request", {
    request_uuid: request.id,
    reviewer_uuid: context.user.id,
    approve,
  });
  if (error) {
    redirect(`/proyectos?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/seguimiento/${request.project_id}`);
  redirect(
    `/proyectos?success=${encodeURIComponent(
      approve ? "Salida aprobada; el miembro ya no tiene acceso." : "Solicitud de salida rechazada.",
    )}`,
  );
}

export async function approveProjectLeaveRequest(formData: FormData) {
  await reviewProjectLeaveRequest(formData, true);
}

export async function rejectProjectLeaveRequest(formData: FormData) {
  await reviewProjectLeaveRequest(formData, false);
}

export async function leaveProject(formData: FormData) {
  const context = await authenticatedClient();
  const projectId = String(formData.get("project_id") ?? "");
  if (!context) redirect("/login");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    redirect("/proyectos?error=Proyecto%20inv%C3%A1lido");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/proyectos?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  const { data: membership, error: membershipError } = await context.supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (membershipError) {
    redirect(`/proyectos?error=${encodeURIComponent(membershipError.message)}`);
  }
  if (!membership) {
    redirect("/proyectos?error=No%20perteneces%20a%20este%20proyecto");
  }
  if (membership.role === "owner") {
    redirect("/proyectos?error=El%20propietario%20no%20puede%20salir%20de%20su%20proyecto");
  }

  const { error: requestError } = await admin
    .from("project_leave_requests")
    .insert({ project_id: projectId, user_id: context.user.id });
  if (requestError) {
    if (requestError.code === "23505") {
      redirect("/proyectos?error=Ya%20tienes%20una%20solicitud%20pendiente%20para%20salir");
    }
    if (
      requestError.code === "PGRST205" ||
      requestError.message.includes("project_leave_requests")
    ) {
      redirect(
        `/proyectos?error=${encodeURIComponent(
          "Falta crear la tabla de solicitudes para salir. Ejecuta supabase/project_leave_requests.sql en Supabase.",
        )}`,
      );
    }
    redirect(`/proyectos?error=${encodeURIComponent(requestError.message)}`);
  }

  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/seguimiento/${projectId}`);
  redirect("/proyectos?success=Solicitud%20de%20salida%20enviada%20al%20propietario");
}

async function reviewProjectMembershipRequest(
  formData: FormData,
  approve: boolean,
) {
  const context = await authenticatedClient();
  const requestId = String(formData.get("request_id") ?? "");
  if (!context) redirect("/login");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    redirect("/proyectos?error=Solicitud%20inv%C3%A1lida");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/proyectos?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  const { data: request, error: requestError } = await admin
    .from("project_membership_requests")
    .select("id,project_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (requestError || !request) {
    redirect(`/proyectos?error=${encodeURIComponent(requestError?.message ?? "La solicitud ya no está pendiente.")}`);
  }
  const { error } = await admin.rpc("review_project_membership_request", {
    request_uuid: request.id,
    reviewer_uuid: context.user.id,
    approve,
  });
  if (error) {
    redirect(`/proyectos/${request.project_id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${request.project_id}`);
  redirect(`/proyectos/${request.project_id}?success=${approve ? "Solicitud%20aprobada" : "Solicitud%20rechazada"}`);
}

export async function approveProjectMembershipRequest(formData: FormData) {
  await reviewProjectMembershipRequest(formData, true);
}

export async function rejectProjectMembershipRequest(formData: FormData) {
  await reviewProjectMembershipRequest(formData, false);
}
