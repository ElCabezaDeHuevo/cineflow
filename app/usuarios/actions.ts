"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CINE_ROLES } from "@/lib/cine-roles";
import { hasOpenWorkSession, attendanceRequiredMessage } from "@/lib/attendance";
import { isCineflowAdmin } from "@/lib/admin";
import { listAllAuthUsers } from "@/lib/supabase/list-all-auth-users";

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
      !["admin", "producer", "member", "viewer"].includes(organizationRole)) {
    redirect("/usuarios?error=Revisa%20los%20datos%20del%20usuario");
  }

  const { data: company, error: companyError } = await admin.from("organizations")
    .select("id,name").eq("id", organizationId).maybeSingle();
  if (companyError || !company) redirect("/usuarios?error=La%20empresa%20seleccionada%20no%20existe");

  let allUsers;
  try { allUsers = await listAllAuthUsers(admin); }
  catch (error) { redirect(`/usuarios?error=${message(error instanceof Error ? error.message : error)}`); }
  const existing = allUsers.find((item) => item.email?.toLowerCase() === email);
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

  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: creator.id,
    action: "company_user_created", target_type: "user", target_id: data.user.id,
    metadata: { email, organization_role: organizationRole, cine_role: cineRole },
  });
  if (auditError) {
    await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", data.user.id);
    await admin.auth.admin.deleteUser(data.user.id);
    redirect(`/usuarios?error=${message(auditError.message)}`);
  }
  revalidatePath("/usuarios");
  revalidatePath("/admin/productoras");
  redirect(`/usuarios?success=${encodeURIComponent(`Usuario creado y agregado a ${company.name}.`)}`);
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
  const { data: account, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !account.user) redirect(`/usuarios?error=${message(lookupError?.message ?? "No se encontró la cuenta.")}`);
  const { error: disableError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (disableError) redirect(`/usuarios?error=${message(disableError.message)}`);
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: (await admin.from("organization_members").select("organization_id").eq("user_id", userId).limit(1).maybeSingle()).data?.organization_id ?? null,
    actor_id: user.id,
    action: "company_user_deactivated",
    target_type: "user",
    target_id: userId,
    metadata: { email: account.user.email ?? null, reason: "Desactivación desde administración; se conservaron los registros." },
  });
  if (auditError) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    redirect(`/usuarios?error=${message("No se pudo registrar la baja. Se reactivó la cuenta.")}`);
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?success=Cuenta%20desactivada.%20Se%20conservaron%20sus%20registros.");
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


export async function resetUserPassword(formData: FormData) {
  const { admin, user: actor } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!userId || userId === actor.id) redirect("/usuarios?error=No+puedes+restablecer+tu+propia+contraseña+desde+este+panel");
  if (!reason) redirect("/usuarios?error=Escribe+el+motivo+del+restablecimiento+para+el+historial");

  const [{ data: target, error: targetError }, { data: memberships, error: membershipError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("organization_members").select("organization_id,role").eq("user_id", userId),
  ]);
  if (targetError || !target?.user?.email) redirect("/usuarios?error=No+se+encontró+el+usuario");
  if (membershipError || !memberships?.length) redirect("/usuarios?error=El+usuario+no+tiene+una+productora+para+registrar+la+auditoría");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!siteUrl || !supabaseUrl || !publishableKey) {
    redirect("/usuarios?error=Falta+configurar+la+URL+del+sitio+o+la+clave+pública+de+Supabase");
  }

  const previousMetadata = target.user.app_metadata ?? {};
  const requestedAt = new Date().toISOString();
  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...previousMetadata,
      cineflow_force_password_change: true,
      cineflow_password_reset_requested_at: requestedAt,
      cineflow_password_reset_requested_by: actor.id,
    },
  });
  if (metadataError) redirect(`/usuarios?error=${message(metadataError.message)}`);

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: emailError } = await publicClient.auth.resetPasswordForEmail(target.user.email, {
    redirectTo: new URL("/auth/reset-password", siteUrl).toString(),
  });
  if (emailError) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: previousMetadata });
    redirect(`/usuarios?error=${message("No se pudo enviar el correo de restablecimiento: " + emailError.message)}`);
  }

  const auditRows = memberships.map((membership) => ({
    organization_id: membership.organization_id,
    actor_id: actor.id,
    action: "user_password_reset_requested",
    target_type: "user",
    target_id: userId,
    metadata: {
      email: target.user.email,
      requested_at: requestedAt,
      reason: reason || null,
      delivery: "recovery_email_sent",
    },
  }));
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditRows);
  if (auditError) {
    // The recovery email has already been sent. Keep the forced-reset flag
    // active so the recipient cannot bypass the required password change.
    console.error("[cineflow] No se pudo registrar la auditoría del restablecimiento:", auditError.message);
    redirect(`/usuarios?error=${message("El correo se envió, pero no se pudo guardar el registro de auditoría. El restablecimiento sigue activo.")}`);
  }

  revalidatePath("/usuarios");
  redirect(`/usuarios?success=${encodeURIComponent("Se envió el correo de restablecimiento. El usuario deberá cambiar su contraseña antes de entrar a CineFlow.")}`);
}


export async function generateTemporaryPassword(userId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user: actor }, error: actorError } = await supabase.auth.getUser();
  if (actorError || !actor) return { error: "Inicia sesión nuevamente." };
  if (!isCineflowAdmin(actor)) return { error: "No tienes permisos para restablecer contraseñas." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Falta configurar el servicio de administración de cuentas." };

  const targetId = String(userId ?? "").trim();
  const resetReason = String(reason ?? "").trim().slice(0, 300);
  if (!targetId || targetId === actor.id) return { error: "No puedes restablecer tu propia contraseña desde este panel." };
  if (resetReason.length < 4) return { error: "Escribe un motivo de al menos 4 caracteres." };

  const [{ data: target, error: targetError }, { data: memberships, error: membershipError }] = await Promise.all([
    admin.auth.admin.getUserById(targetId),
    admin.from("organization_members").select("organization_id,role").eq("user_id", targetId),
  ]);
  if (targetError || !target?.user?.email) return { error: "No se encontró la cuenta del usuario." };
  if (membershipError || !memberships?.length) return { error: "El usuario no tiene una productora vinculada para registrar la auditoría." };

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random = randomBytes(24);
  let temporaryPassword = "Aa9!";
  for (let index = 0; index < random.length; index++) temporaryPassword += alphabet[random[index] % alphabet.length];

  const requestedAt = new Date().toISOString();
  const previousMetadata = target.user.app_metadata ?? {};
  const auditRows = memberships.map((membership) => ({
    organization_id: membership.organization_id,
    actor_id: actor.id,
    action: "user_password_reset_requested",
    target_type: "user",
    target_id: targetId,
    metadata: {
      email: target.user.email,
      requested_at: requestedAt,
      reason: resetReason,
      delivery: "temporary_password_generated",
      reset_method: "admin_generated_temporary_password",
    },
  }));
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditRows);
  if (auditError) return { error: "No se pudo registrar el restablecimiento. No se modificó la contraseña." };

  const { error: updateError } = await admin.auth.admin.updateUserById(targetId, {
    password: temporaryPassword,
    app_metadata: {
      ...previousMetadata,
      cineflow_force_password_change: true,
      cineflow_password_reset_requested_at: requestedAt,
      cineflow_password_reset_requested_by: actor.id,
    },
  });
  if (updateError) {
    await admin.from("organization_audit_log").delete()
      .eq("action", "user_password_reset_requested")
      .eq("target_id", targetId)
      .eq("actor_id", actor.id)
      .contains("metadata", { requested_at: requestedAt });
    return { error: "Supabase no pudo actualizar la contraseña: " + updateError.message };
  }

  revalidatePath("/usuarios");
  revalidatePath("/admin");
  return { temporaryPassword, email: target.user.email };
}

export async function completeForcedPasswordChange(newPassword: string) {
  const password = String(newPassword ?? "");
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Tu sesión no es válida. Inicia sesión nuevamente.");
  if (user.app_metadata?.cineflow_force_password_change !== true) {
    throw new Error("Esta cuenta no tiene un restablecimiento pendiente.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("El servicio de cuentas no está configurado.");
  const { data: memberships, error: membershipError } = await admin
    .from("organization_members").select("organization_id").eq("user_id", user.id);
  if (membershipError || !memberships?.length) throw new Error("No se pudo verificar la productora de tu cuenta.");

  const previousMetadata = user.app_metadata ?? {};
  const completedAt = new Date().toISOString();
  const auditRows = memberships.map((membership) => ({
    organization_id: membership.organization_id,
    actor_id: user.id,
    action: "user_password_changed_after_reset",
    target_type: "user",
    target_id: user.id,
    metadata: {
      email: user.email ?? null,
      completed_at: completedAt,
      requested_at: (previousMetadata as Record<string, unknown>)["cineflow_password_reset_requested_at"] ?? null,
      requested_by: (previousMetadata as Record<string, unknown>)["cineflow_password_reset_requested_by"] ?? null,
    },
  }));
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditRows);
  if (auditError) throw new Error("No se pudo guardar el historial del cambio. No se modificó tu contraseña.");

  // Supabase Auth merges app_metadata on admin updates. Explicitly set false
  // so the forced-reset flag cannot survive as true in the stored account.
  const nextMetadata = {
    ...previousMetadata,
    cineflow_force_password_change: false,
  };
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: nextMetadata,
  });
  if (updateError) {
    await admin.from("organization_audit_log").delete()
      .eq("action", "user_password_changed_after_reset")
      .eq("target_id", user.id)
      .eq("actor_id", user.id)
      .contains("metadata", { completed_at: completedAt });
    throw new Error("No se pudo actualizar la contraseña. Inténtalo de nuevo.");
  }

  // Refresh the SSR cookie session after the admin metadata update.
  // This replaces the JWT that still carried cineflow_force_password_change=true.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session || refreshed.user?.app_metadata?.cineflow_force_password_change === true) {
    // The password and flag are already saved by the Admin API. Confirm the
    // persisted flag, then let the client sign out locally and reauthenticate.
    const { data: persisted, error: persistedError } = await admin.auth.admin.getUserById(user.id);
    if (persistedError || persisted.user?.app_metadata?.cineflow_force_password_change === true) {
      throw new Error("La contraseña no pudo confirmarse. Contacta al administrador antes de volver a intentarlo.");
    }
  }

  revalidatePath("/");
  revalidatePath("/login");
  return { success: true };
}


export async function updateOrganizationMemberRole(formData: FormData) {
  const { admin, user: actor } = await requireAdmin();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const nextRole = String(formData.get("organization_role") ?? "").trim();
  const allowedRoles = ["owner", "admin", "producer", "member", "viewer"];
  if (!organizationId || !userId || !allowedRoles.includes(nextRole)) {
    redirect("/usuarios?error=Selecciona+una+empresa,+cuenta+y+rol+válidos");
  }
  if (userId === actor.id) {
    redirect("/usuarios?error=No+puedes+cambiar+tu+propio+rol+desde+este+panel");
  }

  const [{ data: company, error: companyError }, { data: target, error: targetError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    admin.from("organization_members").select("user_id,role").eq("organization_id", organizationId),
  ]);
  if (companyError || !company) redirect("/usuarios?error=No+se+encontró+la+productora");
  if (targetError || !target) redirect("/usuarios?error=El+usuario+no+pertenece+a+esta+productora");
  if (membershipsError || !memberships) redirect("/usuarios?error=No+se+pudo+consultar+el+equipo");

  const previousRole = target.role;
  if (previousRole === nextRole) redirect("/usuarios?success=El+usuario+ya+tiene+ese+rol");

  const owners = memberships.filter((member) => member.role === "owner");
  if (previousRole === "owner" && nextRole !== "owner" && owners.length <= 1) {
    redirect("/usuarios?error=La+productora+debe+conservar+al+menos+un+dueño.+Asigna+otro+dueño+primero");
  }

  // Ownership is transferred deliberately: the previous owner becomes admin,
  // then the selected member becomes owner. On failure, restore the previous state.
  let previousOwnerId: string | null = null;
  if (nextRole === "owner") {
    previousOwnerId = owners.find((member) => member.user_id !== userId)?.user_id ?? null;
    if (previousOwnerId) {
      const { error: demoteError } = await admin.from("organization_members")
        .update({ role: "admin" }).eq("organization_id", organizationId).eq("user_id", previousOwnerId).eq("role", "owner");
      if (demoteError) redirect("/usuarios?error=No+se+pudo+preparar+la+transferencia+de+propiedad");
    }
  }

  const { error: updateError } = await admin.from("organization_members")
    .update({ role: nextRole }).eq("organization_id", organizationId).eq("user_id", userId);
  if (updateError) {
    if (previousOwnerId) {
      await admin.from("organization_members").update({ role: "owner" })
        .eq("organization_id", organizationId).eq("user_id", previousOwnerId);
    }
    redirect("/usuarios?error=" + message(updateError.message));
  }

  const auditEntries: Array<{ organization_id: string; actor_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown> }> = [{
    organization_id: organizationId,
    actor_id: actor.id,
    action: nextRole === "owner" ? "organization_ownership_transferred" : "organization_member_role_changed",
    target_type: "user",
    target_id: userId,
    metadata: { email: (await admin.auth.admin.getUserById(userId)).data.user?.email ?? null, previous_role: previousRole, new_role: nextRole, previous_owner_id: previousOwnerId, transferred_to: null },
  }];
  if (previousOwnerId) {
    auditEntries.push({
      organization_id: organizationId,
      actor_id: actor.id,
      action: "organization_member_role_changed",
      target_type: "user",
      target_id: previousOwnerId,
      metadata: { email: null, previous_role: "owner", new_role: "admin", previous_owner_id: null, transferred_to: userId },
    });
  }
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditEntries);
  if (auditError) {
    await admin.from("organization_members").update({ role: previousRole })
      .eq("organization_id", organizationId).eq("user_id", userId);
    if (previousOwnerId) {
      await admin.from("organization_members").update({ role: "owner" })
        .eq("organization_id", organizationId).eq("user_id", previousOwnerId);
    }
    redirect("/usuarios?error=" + message("No se pudo registrar el cambio de rol. Se revirtió la operación."));
  }

  revalidatePath("/usuarios");
  revalidatePath("/empresa");
  revalidatePath("/admin/productoras");
  redirect("/usuarios?success=" + encodeURIComponent(nextRole === "owner"
    ? "Propiedad de la productora transferida correctamente."
    : "Rol del usuario actualizado correctamente."));
}
