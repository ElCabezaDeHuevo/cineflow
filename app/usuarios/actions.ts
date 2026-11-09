"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CINE_ROLES } from "@/lib/cine-roles";
import { hasOpenWorkSession, attendanceRequiredMessage } from "@/lib/attendance";
import { isCineflowAdmin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) {
    redirect("/?error=No%20tienes%20permisos%20para%20administrar%20cuentas");
  }
  if (!(await hasOpenWorkSession(supabase, user.id)) && user) {
    redirect(`/horarios?error=${encodeURIComponent(attendanceRequiredMessage)}`);
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect("/usuarios?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  }
  return { admin, user };
}

function message(value: unknown) {
  return encodeURIComponent(String(value ?? "Ocurrió un error inesperado."));
}

export async function createUser(formData: FormData) {
  const { admin } = await requireAdmin();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const cineRole = String(formData.get("cine_role") ?? "");
  const accountRole = String(formData.get("account_role") ?? "user");
  if (!["user", "admin"].includes(accountRole)) {
    redirect("/usuarios?error=Rol%20de%20cuenta%20inv%C3%A1lido");
  }
  if (!fullName || !email || password.length < 8 || !CINE_ROLES.some((role) => role.value === cineRole)) {
    redirect("/usuarios?error=Completa%20el%20nombre%2C%20un%20correo%20válido%20y%20una%20contraseña%20de%208%20caracteres");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, cine_role: cineRole },
    app_metadata: {
      cineflow_role: accountRole,
      cineflow_onboarding_pending: true,
    },
  });
  if (error || !data.user) redirect(`/usuarios?error=${message(error?.message ?? "No se pudo crear la cuenta.")}`);

  const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, full_name: fullName });
  if (profileError) redirect(`/usuarios?error=${message(profileError.message)}`);
  revalidatePath("/usuarios");
  redirect("/usuarios?success=Cuenta%20creada%20correctamente");
}

export async function deleteUser(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === user.id) redirect("/usuarios?error=No%20puedes%20eliminar%20tu%20propia%20cuenta");
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) redirect(`/usuarios?error=${message(error.message)}`);
  revalidatePath("/usuarios");
  redirect("/usuarios?success=Cuenta%20eliminada");
}

export async function updateUserRole(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const cineRole = String(formData.get("cine_role") ?? "");
  const accountRole = String(formData.get("account_role") ?? "user");
  if (!["user", "admin"].includes(accountRole)) redirect("/usuarios?error=Rol%20de%20cuenta%20inv%C3%A1lido");
  if (userId === user.id && accountRole !== "admin") {
    redirect("/usuarios?error=No%20puedes%20quitarte%20tu%20propio%20acceso%20de%20administrador");
  }
  if (!userId || !CINE_ROLES.some((role) => role.value === cineRole)) redirect("/usuarios?error=Rango%20cinematográfico%20no%20válido");
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !account.user) redirect(`/usuarios?error=${message(lookupError?.message ?? "No se encontró la cuenta.")}`);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...account.user.user_metadata, cine_role: cineRole },
    app_metadata: {
      ...account.user.app_metadata,
      cineflow_role: accountRole,
    },
  });
  if (error) redirect(`/usuarios?error=${message(error.message)}`);
  revalidatePath("/usuarios");
  revalidatePath("/usuarios/solicitudes");
  redirect("/usuarios?success=Cuenta%20actualizada");
}

async function reviewAssignmentRequest(formData: FormData, approve: boolean) {
  const { admin, user } = await requireAdmin();
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) redirect("/usuarios/solicitudes?error=Solicitud%20inv%C3%A1lida");

  const { data: request, error: requestError } = await admin
    .from("project_assignment_requests")
    .select("id,project_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (requestError || !request) {
    redirect(`/usuarios/solicitudes?error=${message(requestError?.message ?? "La solicitud ya no está pendiente.")}`);
  }

  const { error } = await admin.rpc("review_project_assignment_request", {
    request_uuid: request.id,
    reviewer_uuid: user.id,
    approve,
  });
  if (error) {
    redirect(`/usuarios/solicitudes?error=${message(error.message)}`);
  }

  revalidatePath("/usuarios/solicitudes");
  revalidatePath(`/proyectos/seguimiento/${request.project_id}`);
  revalidatePath("/");
  redirect(`/usuarios/solicitudes?success=${approve ? "Solicitud%20aprobada" : "Solicitud%20rechazada"}`);
}

export async function approveAssignmentRequest(formData: FormData) {
  await reviewAssignmentRequest(formData, true);
}

export async function rejectAssignmentRequest(formData: FormData) {
  await reviewAssignmentRequest(formData, false);
}
