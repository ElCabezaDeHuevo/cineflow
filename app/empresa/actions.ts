"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { CINE_ROLES } from "@/lib/cine-roles";

async function ownerContext(requestedOrganizationId: string, allowWhenSubscriptionInactive = false) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id);
  const membership = (memberships ?? []).find((m) => m.organization_id === requestedOrganizationId && ["owner", "admin"].includes(m.role));
  if (!membership) redirect("/empresa?error=No+tienes+permisos+para+administrar+esa+productora");
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/empresa?error=No+está+configurado+el+servicio+de+invitaciones");
  const { data: activeSuspension, error: suspensionLookupError } = await admin
    .from("organization_member_suspensions")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .eq("target_user_id", user.id)
    .is("reactivated_at", null)
    .maybeSingle();
  if (suspensionLookupError) redirect("/empresa?error=No+se+pudo+verificar+el+estado+de+tu+acceso");
  if (activeSuspension) redirect("/?error=Tu+acceso+a+esta+empresa+está+suspendido");
  if (!allowWhenSubscriptionInactive) {
    const { data: subscription } = await admin.from("subscriptions")
      .select("status").eq("organization_id", membership.organization_id).maybeSingle();
    if (subscription?.status === "paused" || subscription?.status === "expired" || subscription?.status === "canceled") {
      redirect("/empresa?error=El+servicio+está+suspendido.+Contacta+al+soporte");
    }
  }
  return { admin, user, organizationId: membership.organization_id, actorRole: membership.role };
}

async function findAuthUserByEmail(admin: ReturnType<typeof createSupabaseAdminClient>, email: string) {
  if (!admin) throw new Error("Servicio administrativo no disponible");
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((item) => item.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  throw new Error("Se alcanzó el límite de paginación al buscar la cuenta. Intenta de nuevo o contacta soporte.");
}

export async function inviteCompanyMember(formData: FormData) {
  if (process.env.VERCEL_ENV === "preview") {
    redirect("/empresa?error=Las+invitaciones+por+correo+solo+se+pueden+enviar+desde+la+versión+de+producción");
  }
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) redirect("/empresa?error=Selecciona+una+productora");
  const { admin, user } = await ownerContext(organizationId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/empresa?error=Correo+no+válido");
  if (!["producer", "member", "viewer"].includes(role)) redirect("/empresa?error=Permiso+no+válido");
  const { data: org, error: orgError } = await admin.from("organizations").select("name").eq("id", organizationId).single();
  if (orgError || !org) redirect("/empresa?error=No+se+encontró+la+productora");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return { ok: false as const, message: "Falta configurar NEXT_PUBLIC_SITE_URL" };

  let existingUser;
  try {
    existingUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    redirect("/empresa?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo consultar la cuenta"));
  }

  if (existingUser) {
    const { data: alreadyMember, error: membershipLookupError } = await admin.from("organization_members")
      .select("user_id").eq("organization_id", organizationId).eq("user_id", existingUser.id).maybeSingle();
    if (membershipLookupError) redirect("/empresa?error=" + encodeURIComponent(membershipLookupError.message));
    if (alreadyMember) redirect("/empresa?error=Esa+persona+ya+pertenece+a+tu+equipo");
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId, user_id: existingUser.id, role, invited_by: user.id,
    });
    if (memberError) redirect("/empresa?error=" + encodeURIComponent(memberError.message));

    // Keep the account's active organization metadata consistent with its membership.
    const previousAppMetadata = existingUser.app_metadata ?? {};
    const { error: metadataError } = await admin.auth.admin.updateUserById(existingUser.id, {
      app_metadata: { ...previousAppMetadata, organization_id: organizationId },
    });
    if (metadataError) {
      await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", existingUser.id);
      redirect("/empresa?error=" + encodeURIComponent(metadataError.message));
    }

    const { error: auditError } = await admin.from("organization_audit_log").insert({
      organization_id: organizationId, actor_id: user.id, action: "existing_member_added",
      target_type: "user", target_id: existingUser.id, metadata: { email, role },
    });
    if (auditError) {
      await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", existingUser.id);
      await admin.auth.admin.updateUserById(existingUser.id, { app_metadata: previousAppMetadata });
      redirect("/empresa?error=" + encodeURIComponent(auditError.message));
    }
    revalidatePath("/empresa");
    return {
      ok: true as const,
      kind: "existing" as const,
      email,
      organizationName: org.name,
      loginUrl: new URL("/login", siteUrl).toString(),
    };
  }

  // A new member remains outside the organization until the invite link is verified.
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const tokenHash = Array.from(tokenBytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data: invitation, error: invitationError } = await admin.from("organization_invitations").insert({
    organization_id: organizationId, email, role, token_hash: tokenHash,
    invited_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select("id").single();
  if (invitationError || !invitation) redirect("/empresa?error=" + encodeURIComponent(invitationError?.message ?? "No se pudo preparar la invitación"));

  const redirectTo = new URL("/auth/confirm", siteUrl);
  redirectTo.searchParams.set("invitation_id", invitation.id);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { invited_to: org.name, invitation_id: invitation.id },
      redirectTo: redirectTo.toString(),
    },
  });
  const supabaseTokenHash = data?.properties?.hashed_token;
  if (error || !supabaseTokenHash) {
    await admin.from("organization_invitations").delete().eq("id", invitation.id);
    return { ok: false as const, message: error?.message ?? "No se pudo generar el enlace de invitación" };
  }

  // Persist the actual Supabase one-time OTP hash, not a placeholder.
  const { error: tokenStoreError } = await admin.from("organization_invitations")
    .update({ token_hash: supabaseTokenHash })
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (tokenStoreError) {
    await admin.from("organization_invitations").delete().eq("id", invitation.id);
    return { ok: false as const, message: "No se pudo asegurar el enlace de invitación. Intenta de nuevo." };
  }

  // Send the recipient directly to our server-side confirmation route.
  // It verifies the one-time token with verifyOtp(), stores the session cookie,
  // and only then grants the invited organization membership.
  const inviteUrl = new URL("/auth/confirm", siteUrl);
  inviteUrl.searchParams.set("token_hash", supabaseTokenHash);
  inviteUrl.searchParams.set("type", "invite");
  inviteUrl.searchParams.set("invitation_id", invitation.id);
  revalidatePath("/empresa");
  return { ok: true as const, kind: "invitation" as const, email, organizationName: org.name, inviteUrl: inviteUrl.toString() };
}



export async function approveCompanyMemberCineRole(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const selectedRole = String(formData.get("cine_role") ?? "").trim();
  const decision = String(formData.get("decision") ?? "approved");
  const reason = String(formData.get("review_reason") ?? "").trim().slice(0, 300);
  if (!organizationId || !userId || !["approved", "rejected"].includes(decision) ||
      (decision === "approved" && !CINE_ROLES.some((role) => role.value === selectedRole && role.value !== "viewer")) ||
      reason.length > 300) {
    redirect("/empresa?error=La+revisión+o+el+puesto+seleccionado+no+es+válido");
  }
  const { admin, user: actor } = await ownerContext(organizationId);
  const { error } = await admin.rpc("review_organization_member_cinematic_role", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_actor_id: actor.id,
    p_approved_role: decision === "approved" ? selectedRole : null,
    p_status: decision,
    p_review_reason: reason || null,
  });
  if (error) redirect("/empresa?error=" + encodeURIComponent(error.message));
  revalidatePath("/empresa");
  revalidatePath("/equipo");
  revalidatePath("/usuarios/" + userId);
  redirect(decision === "approved"
    ? "/empresa?success=Puesto+cinematográfico+aprobado"
    : "/empresa?success=Solicitud+de+puesto+rechazada");
}

export async function updateCompanyMemberRole(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const nextRole = String(formData.get("role") ?? "").trim();
  if (!organizationId || !userId || !["admin", "producer", "member", "viewer"].includes(nextRole)) {
    redirect("/empresa?error=Rol+o+integrante+no+válido");
  }
  const { admin, user, actorRole } = await ownerContext(organizationId);
  if (user.id === userId) redirect("/empresa?error=No+puedes+cambiar+tu+propio+rol");
  const { data: target, error: targetError } = await admin.from("organization_members")
    .select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (targetError || !target) redirect("/empresa?error=No+se+encontró+al+integrante");
  if (target.role === "owner") redirect("/empresa?error=Solo+el+administrador+general+puede+transferir+la+propiedad");
  // Company owners and admins can manage access roles of every non-owner member.
  // Ownership itself remains protected and cannot be granted from this form.
  const { error: updateError } = await admin.from("organization_members")
    .update({ role: nextRole }).eq("organization_id", organizationId).eq("user_id", userId);
  if (updateError) redirect("/empresa?error=" + encodeURIComponent(updateError.message));
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: user.id, action: "organization_member_role_changed",
    target_type: "user", target_id: userId,
    metadata: { previous_role: target.role, new_role: nextRole },
  });
  if (auditError) {
    await admin.from("organization_members").update({ role: target.role })
      .eq("organization_id", organizationId).eq("user_id", userId);
    redirect("/empresa?error=No+se+pudo+registrar+el+cambio.+Se+revirtió+la+operación");
  }
  revalidatePath("/empresa");
  redirect("/empresa?success=Permiso+del+integrante+actualizado");
}



export async function removeCompanyMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const password = String(formData.get("owner_password") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!organizationId || !userId || confirmation !== "ELIMINAR" || password.length < 1 || reason.length < 4) {
    return { ok: false as const, message: "Completa la confirmación, tu contraseña y un motivo válido." };
  }

  const { admin, user: actor, actorRole } = await ownerContext(organizationId, true);
  if (actorRole !== "owner") return { ok: false as const, message: "Solo el dueño puede dar de baja integrantes." };
  if (actor.id === userId) return { ok: false as const, message: "No puedes darte de baja a ti mismo." };
  if (!actor.email) return { ok: false as const, message: "Tu cuenta no tiene un correo verificado para confirmar la operación." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return { ok: false as const, message: "No está configurada la verificación segura de la cuenta." };
  }

  // Re-authenticate in an isolated client; never replace the owner's active session.
  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({
    email: actor.email,
    password,
  });
  if (verificationError) {
    return { ok: false as const, message: "La contraseña del dueño no es correcta. No se realizó ningún cambio." };
  }
  await verifier.auth.signOut();

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) return { ok: false as const, message: "No se encontró la cuenta del integrante." };
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();

  const { data: removalId, error } = await admin.rpc("remove_organization_member_reversible", {
    p_organization_id: organizationId,
    p_target_user_id: userId,
    p_actor_id: actor.id,
    p_target_email: target.user.email ?? "",
    p_target_name: profile?.full_name ?? "",
    p_reason: reason,
  });
  if (error) return { ok: false as const, message: error.message || "No se pudo completar la baja." };

  revalidatePath("/empresa");
  revalidatePath("/proyectos");
  return { ok: true as const, message: "Acceso retirado. La cuenta y su historial se conservaron.", removalId };
}

export async function restoreCompanyMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!organizationId || !userId) redirect("/empresa?error=No+se+identificó+la+cuenta+para+restaurar");
  const { admin, user: actor, actorRole } = await ownerContext(organizationId, true);
  if (actorRole !== "owner") redirect("/empresa?error=Solo+el+dueño+puede+restaurar+integrantes");
  const { error } = await admin.rpc("restore_organization_member", {
    p_organization_id: organizationId,
    p_target_user_id: userId,
    p_actor_id: actor.id,
  });
  if (error) redirect("/empresa?error=" + encodeURIComponent(error.message));
  revalidatePath("/empresa");
  revalidatePath("/proyectos");
  redirect("/empresa?success=Integrante+restaurado.+Se+conservó+su+historial");
}

export async function requestCompanyMemberPasswordReset(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!organizationId || !userId || reason.length < 4) {
    redirect("/empresa?error=Indica+el+integrante+y+un+motivo+de+al+menos+4+caracteres");
  }

  const { admin, user: actor } = await ownerContext(organizationId);
  if (actor.id === userId) redirect("/empresa?error=No+puedes+restablecer+tu+propia+contraseña+desde+este+panel");

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError || !membership) redirect("/empresa?error=El+integrante+no+pertenece+a+esta+productora");

  // Company admins may reset only non-admin team members. Owners may also reset
  // company administrators, but neither role can reset an owner from this screen.
  if (membership.role === "owner" || (membership.role === "admin" && (await admin
    .from("organization_members").select("role").eq("organization_id", organizationId)
    .eq("user_id", actor.id).maybeSingle()).data?.role !== "owner")) {
    redirect("/empresa?error=No+tienes+permiso+para+restablecer+la+contraseña+de+ese+integrante");
  }

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user?.email) redirect("/empresa?error=No+se+encontró+el+correo+de+esa+cuenta");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!siteUrl || !supabaseUrl || !publishableKey) {
    redirect("/empresa?error=Falta+configurar+la+URL+del+sitio+o+la+clave+pública+de+Supabase");
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
  if (metadataError) redirect("/empresa?error=" + encodeURIComponent(metadataError.message));

  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId,
    actor_id: actor.id,
    action: "user_password_reset_requested",
    target_type: "user",
    target_id: userId,
    metadata: { email: target.user.email, requested_at: requestedAt, reason, delivery: "company_recovery_email" },
  });
  if (auditError) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: previousMetadata });
    redirect("/empresa?error=No+se+pudo+registrar+el+restablecimiento.+No+se+envió+el+correo");
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
      .eq("organization_id", organizationId)
      .eq("actor_id", actor.id)
      .eq("target_id", userId)
      .eq("action", "user_password_reset_requested")
      .contains("metadata", { requested_at: requestedAt });
    redirect("/empresa?error=" + encodeURIComponent("No se pudo enviar el correo: " + emailError.message));
  }

  revalidatePath("/empresa");
  redirect("/empresa?success=" + encodeURIComponent("Se envió el enlace para restablecer la contraseña a " + target.user.email));
}


export async function suspendCompanyMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const password = String(formData.get("owner_password") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!organizationId || !userId || confirmation !== "SUSPENDER" || !password || reason.length < 4) {
    return { ok: false as const, message: "Completa la confirmación, tu contraseña y un motivo válido." };
  }
  const { admin, user: actor, actorRole } = await ownerContext(organizationId, true);
  if (actorRole !== "owner") return { ok: false as const, message: "Solo el dueño puede suspender integrantes." };
  if (actor.id === userId || !actor.email) return { ok: false as const, message: "No puedes suspender tu propia cuenta." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return { ok: false as const, message: "No está configurada la verificación segura." };
  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({ email: actor.email, password });
  if (verificationError) return { ok: false as const, message: "La contraseña del dueño no es correcta. No se realizó ningún cambio." };
  await verifier.auth.signOut();

  const { data: result, error } = await admin.rpc("suspend_organization_member", {
    p_organization_id: organizationId,
    p_target_user_id: userId,
    p_actor_id: actor.id,
    p_reason: reason,
  });
  if (error) return { ok: false as const, message: error.message || "No se pudo suspender el acceso." };
  revalidatePath("/empresa");
  revalidatePath("/proyectos");
  return { ok: true as const, message: "Acceso suspendido únicamente en esta empresa.", suspensionId: result };
}

export async function reactivateCompanyMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const password = String(formData.get("owner_password") ?? "");
  if (!organizationId || !userId || confirmation !== "REACTIVAR" || !password) {
    return { ok: false as const, message: "Confirma la palabra REACTIVAR e introduce tu contraseña." };
  }
  const { admin, user: actor, actorRole } = await ownerContext(organizationId, true);
  if (actorRole !== "owner") return { ok: false as const, message: "Solo el dueño puede reactivar integrantes." };
  if (actor.id === userId || !actor.email) return { ok: false as const, message: "No puedes reactivar tu propia cuenta desde aquí." };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return { ok: false as const, message: "No está configurada la verificación segura." };
  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({ email: actor.email, password });
  if (verificationError) return { ok: false as const, message: "La contraseña del dueño no es correcta. No se realizó ningún cambio." };
  await verifier.auth.signOut();

  const { data: result, error } = await admin.rpc("reactivate_organization_member", {
    p_organization_id: organizationId,
    p_target_user_id: userId,
    p_actor_id: actor.id,
  });
  if (error) return { ok: false as const, message: error.message || "No se pudo reactivar el acceso." };
  revalidatePath("/empresa");
  revalidatePath("/proyectos");
  return { ok: true as const, message: "Acceso reactivado. Se conservaron el rol y los permisos anteriores.", suspensionId: result };
}
