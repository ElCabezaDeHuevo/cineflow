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
  if (!isCineflowAdmin(user)) redirect("/?error=No%20tienes%20permisos%20para%20administrar%20cuentas");
  if (!(await hasOpenWorkSession(supabase, user.id))) redirect(`/horarios?error=${encodeURIComponent(attendanceRequiredMessage)}`);
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/usuarios?error=Falta%20configurar%20SUPABASE_SERVICE_ROLE_KEY");
  return { admin, user };
}

function message(value: unknown) {
  return encodeURIComponent(String(value ?? "Ocurrió un error inesperado."));
}

export async function createUser(formData: FormData) {
  const { admin, user: creator } = await requireAdmin();
  const organizationId = String(formData.get("organization_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const cineRole = String(formData.get("cine_role") ?? "");
  const organizationRole = String(formData.get("organization_role") ?? "member");

  if (!organizationId || !fullName || !email || password.length < 8 ||
      !CINE_ROLES.some((role) => role.value === cineRole) ||
      !["owner", "admin", "producer", "member", "viewer"].includes(organizationRole)) {
    redirect("/usuarios?error=Revisa%20los%20datos%20del%20usuario");
  }

  const { data: company, error: companyError } = await admin.from("organizations")
    .select("id,name").eq("id", organizationId).maybeSingle();
  if (companyError || !company) redirect("/usuarios?error=La%20empresa%20seleccionada%20no%20existe");

  if (organizationRole === "owner") {
    const { data: currentOwner, error: ownerLookupError } = await admin.from("organization_members")
      .select("user_id").eq("organization_id", organizationId).eq("role", "owner").maybeSingle();
    if (ownerLookupError) redirect(`/usuarios?error=${message(ownerLookupError.message)}`);
    if (currentOwner) redirect("/usuarios?error=Esta empresa ya tiene un dueño. Primero transfiere la propiedad.");
  }

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) redirect(`/usuarios?error=${message(listError.message)}`);
  const existing = existingUsers.users.find((item) => item.email?.toLowerCase() === email);
  if (existing) {
    const { data: membership } = await admin.from("organization_members").select("user_id")
      .eq("organization_id", organizationId).eq("user_id", existing.id).maybeSingle();
    redirect(`/usuarios?error=${encodeURIComponent(membership ? "Ese usuario ya pertenece a esta empresa." : "Ese correo ya tiene una cuenta. Usa otro correo o solicita vincular la cuenta existente.")}`);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, cine_role: cineRole },
    app_metadata: { cineflow_role: "user", organization_id: organizationId },
  });
  if (error || !data.user) redirect(`/usuarios?error=${message(error?.message ?? "No se pudo crear la cuenta.")}`);

  const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, full_name: fullName });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect(`/usuarios?error=${message(profileError.message)}`);
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId, user_id: data.user.id,
    role: organizationRole, invited_by: creator.id,
  });
  if (memberError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect(`/usuarios?error=${message(memberError.message)}`);
  }

  await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: creator.id,
    action: "company_user_created", target_type: "user", target_id: data.user.id,
    metadata: { email, organization_role: organizationRole, cine_role: cineRole },
  });
  revalidatePath("/usuarios");
  revalidatePath("/admin/productoras");
  redirect(`/usuarios?success=${encodeURIComponent(`Usuario creado y agregado a ${company.name}.`)}`);
}

export async function deleteUser(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === user.id) redirect("/usuarios?error=No%20puedes%20eliminar%20tu%20propia%20cuenta");
  const { data: ownership, error: ownershipError } = await admin.from("organization_members")
    .select("organization_id").eq("user_id", userId).eq("role", "owner").limit(1);
  if (ownershipError) redirect(`/usuarios?error=${message(ownershipError.message)}`);
  if (ownership?.length) redirect("/usuarios?error=No puedes eliminar al dueño de una empresa. Transfiere la propiedad primero.");
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
  if (userId === user.id && accountRole !== "admin") redirect("/usuarios?error=No%20puedes%20quitarte%20tu%20propio%20acceso%20de%20administrador");
  if (!userId || !CINE_ROLES.some((role) => role.value === cineRole)) redirect("/usuarios?error=Rango%20cinematográfico%20no%20válido");
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !account.user) redirect(`/usuarios?error=${message(lookupError?.message ?? "No se encontró la cuenta.")}`);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...account.user.user_metadata, cine_role: cineRole },
    app_metadata: { ...account.user.app_metadata, cineflow_role: accountRole },
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
  const { data: request, error: requestError } = await admin.from("project_assignment_requests")
    .select("id,project_id").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (requestError || !request) redirect(`/usuarios/solicitudes?error=${message(requestError?.message ?? "La solicitud ya no está pendiente.")}`);
  const { error } = await admin.rpc("review_project_assignment_request", {
    request_uuid: request.id, reviewer_uuid: user.id, approve,
  });
  if (error) redirect(`/usuarios/solicitudes?error=${message(error.message)}`);
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

export async function assignExistingUser(formData: FormData) {
  const { admin, user: actor } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const role = String(formData.get("organization_role") ?? "member");
  if (!userId || !organizationId || !["admin", "producer", "member", "viewer"].includes(role)) {
    redirect("/usuarios?error=Selecciona+una+cuenta,+empresa+y+permiso+válidos");
  }
  if (userId === actor.id) redirect("/usuarios?error=No+puedes+reasignarte+desde+este+formulario");
  const [{ data: account, error: accountError }, { data: company, error: companyError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_members").select("organization_id").eq("user_id", userId),
  ]);
  if (accountError || !account?.user) redirect("/usuarios?error=No+se+encontró+la+cuenta+seleccionada");
  if (companyError || !company) redirect("/usuarios?error=La+productora+seleccionada+no+existe");
  if (membershipsError) redirect(`/usuarios?error=${message(membershipsError.message)}`);
  if (memberships?.length) redirect("/usuarios?error=La+cuenta+ya+pertenece+a+una+productora.+No+se+modificó+su+pertenencia");
  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId, user_id: userId, role, invited_by: actor.id,
  });
  if (memberError) redirect(`/usuarios?error=${message(memberError.message)}`);
  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...account.user.app_metadata, organization_id: organizationId },
  });
  if (metadataError) {
    await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", userId);
    redirect(`/usuarios?error=${message(metadataError.message)}`);
  }
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: actor.id, action: "existing_user_assigned",
    target_type: "user", target_id: userId,
    metadata: { email: account.user.email ?? null, role },
  });
  if (auditError) {
    await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", userId);
    await admin.auth.admin.updateUserById(userId, { app_metadata: account.user.app_metadata });
    redirect(`/usuarios?error=${message(auditError.message)}`);
  }
  revalidatePath("/usuarios");
  revalidatePath("/empresa");
  revalidatePath("/admin/productoras");
  redirect(`/usuarios?success=${encodeURIComponent(`Cuenta vinculada a ${company.name} correctamente.`)}`);
}

export async function deleteUser(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === user.id) redirect("/usuarios?error=No%20puedes%20eliminar%20tu%20propia%20cuenta");
  const { data: ownership, error: ownershipError } = await admin.from("organization_members")
    .select("organization_id").eq("user_id", userId).eq("role", "owner").limit(1);
  if (ownershipError) redirect(`/usuarios?error=${message(ownershipError.message)}`);
  if (ownership?.length) redirect("/usuarios?error=No puedes eliminar al dueño de una empresa. Transfiere la propiedad primero.");
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
  if (userId === user.id && accountRole !== "admin") redirect("/usuarios?error=No%20puedes%20quitarte%20tu%20propio%20acceso%20de%20administrador");
  if (!userId || !CINE_ROLES.some((role) => role.value === cineRole)) redirect("/usuarios?error=Rango%20cinematográfico%20no%20válido");
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !account.user) redirect(`/usuarios?error=${message(lookupError?.message ?? "No se encontró la cuenta.")}`);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...account.user.user_metadata, cine_role: cineRole },
    app_metadata: { ...account.user.app_metadata, cineflow_role: accountRole },
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
  const { data: request, error: requestError } = await admin.from("project_assignment_requests")
    .select("id,project_id").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (requestError || !request) redirect(`/usuarios/solicitudes?error=${message(requestError?.message ?? "La solicitud ya no está pendiente.")}`);
  const { error } = await admin.rpc("review_project_assignment_request", {
    request_uuid: request.id, reviewer_uuid: user.id, approve,
  });
  if (error) redirect(`/usuarios/solicitudes?error=${message(error.message)}`);
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
