"use server";

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
  const auditRows = memberships.map((membership) => ({
    organization_id: membership.organization_id,
    actor_id: actor.id,
    action: "user_password_reset_requested",
    target_type: "user",
    target_id: userId,
    metadata: {
      email: target.user.email,
      requested_at: requestedAt,
      reason,
      delivery: "pending",
    },
  }));
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditRows);
  if (auditError) redirect(`/usuarios?error=${message(auditError.message)}`);

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...previousMetadata,
      cineflow_force_password_change: true,
      cineflow_password_reset_requested_at: requestedAt,
      cineflow_password_reset_requested_by: actor.id,
    },
  });
  if (metadataError) {
    await admin.from("organization_audit_log").delete()
      .eq("action", "user_password_reset_requested")
      .eq("target_id", userId)
      .eq("actor_id", actor.id)
      .contains("metadata", { requested_at: requestedAt });
    redirect(`/usuarios?error=${message(metadataError.message)}`);
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: emailError } = await publicClient.auth.resetPasswordForEmail(target.user.email, {
    redirectTo: new URL("/auth/reset-password", siteUrl).toString(),
  });
  if (emailError) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: previousMetadata });
    await admin.from("organization_audit_log").delete()
      .eq("action", "user_password_reset_requested")
      .eq("target_id", userId)
      .eq("actor_id", actor.id)
      .contains("metadata", { requested_at: requestedAt });
    redirect(`/usuarios?error=${message("No se pudo enviar el correo de restablecimiento: " + emailError.message)}`);
  }

  const { error: deliveryAuditError } = await admin.from("organization_audit_log")
    .update({ metadata: { email: target.user.email, requested_at: requestedAt, reason, delivery: "recovery_email_sent" } })
    .eq("action", "user_password_reset_requested")
    .eq("target_id", userId)
    .eq("actor_id", actor.id)
    .contains("metadata", { requested_at: requestedAt });
  if (deliveryAuditError) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: previousMetadata });
    redirect(`/usuarios?error=${message("El correo se envió, pero no se pudo actualizar la auditoría. Revisa el historial antes de volver a solicitarlo.")}`);
  }

  revalidatePath("/usuarios");
  redirect(`/usuarios?success=${encodeURIComponent("Se envió el correo de restablecimiento. El usuario deberá cambiar su contraseña antes de entrar a CineFlow.")}`);
}

export async function completeForcedPasswordChange() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Tu sesión no es válida. Inicia sesión nuevamente.");
  if (user.app_metadata?.cineflow_force_password_change !== true) return;

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("El servicio de cuentas no está configurado.");
  const { data: memberships, error: membershipError } = await admin
    .from("organization_members").select("organization_id").eq("user_id", user.id);
  if (membershipError || !memberships?.length) throw new Error("No se pudo verificar la productora de tu cuenta.");

  const previousMetadata = user.app_metadata ?? {};
  const nextMetadata = { ...previousMetadata };
  delete nextMetadata.cineflow_force_password_change;
  delete nextMetadata.cineflow_password_reset_requested_at;
  delete nextMetadata.cineflow_password_reset_requested_by;

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: nextMetadata,
  });
  if (metadataError) throw new Error("La contraseña se actualizó, pero no se pudo cerrar el proceso. Inténtalo de nuevo.");

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
      requested_at: previousMetadata.cineflow_password_reset_requested_at ?? null,
      requested_by: previousMetadata.cineflow_password_reset_requested_by ?? null,
    },
  }));
  const { error: auditError } = await admin.from("organization_audit_log").insert(auditRows);
  if (auditError) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: previousMetadata });
    throw new Error("No se pudo guardar el historial del cambio. Vuelve a intentarlo.");
  }
  revalidatePath("/");
}
