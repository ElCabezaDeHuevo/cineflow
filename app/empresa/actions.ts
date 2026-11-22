"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function ownerContext(requestedOrganizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id);
  const membership = (memberships ?? []).find((m) => m.organization_id === requestedOrganizationId && ["owner", "admin"].includes(m.role));
  if (!membership) redirect("/empresa?error=No+tienes+permisos+para+administrar+esa+productora");
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/empresa?error=No+está+configurado+el+servicio+de+invitaciones");
  const { data: subscription } = await admin.from("subscriptions")
    .select("status").eq("organization_id", membership.organization_id).maybeSingle();
  if (subscription?.status === "paused" || subscription?.status === "expired" || subscription?.status === "canceled") {
    redirect("/empresa?error=El+servicio+está+suspendido.+Contacta+al+soporte");
  }
  return { admin, user, organizationId: membership.organization_id };
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
    redirect("/empresa?success=Miembro+agregado+al+equipo");
  }

  // A new member remains outside the organization until the invite link is verified.
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const tokenHash = Array.from(tokenBytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data: invitation, error: invitationError } = await admin.from("organization_invitations").insert({
    organization_id: organizationId, email, role, token_hash: tokenHash,
    invited_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select("id").single();
  if (invitationError || !invitation) redirect("/empresa?error=" + encodeURIComponent(invitationError?.message ?? "No se pudo preparar la invitación"));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    await admin.from("organization_invitations").delete().eq("id", invitation.id);
    redirect("/empresa?error=Falta+configurar+NEXT_PUBLIC_SITE_URL");
  }
  const redirectTo = new URL("/auth/confirm", siteUrl);
  redirectTo.searchParams.set("invitation_id", invitation.id);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to: org.name, invitation_id: invitation.id },
    redirectTo: redirectTo.toString(),
  });
  if (error || !data.user) {
    await admin.from("organization_invitations").delete().eq("id", invitation.id);
    redirect("/empresa?error=" + encodeURIComponent(error?.message ?? "No se pudo enviar la invitación"));
  }
  revalidatePath("/empresa");
  redirect("/empresa?success=Invitación+enviada.+El+acceso+se+activará+al+confirmar+el+correo");
}


export async function updateCompanyMemberRole(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const nextRole = String(formData.get("role") ?? "").trim();
  if (!organizationId || !userId || !["admin", "producer", "member", "viewer"].includes(nextRole)) {
    redirect("/empresa?error=Rol+o+integrante+no+válido");
  }
  const { admin, user } = await ownerContext(organizationId);
  if (user.id === userId) redirect("/empresa?error=No+puedes+cambiar+tu+propio+rol");
  const { data: target, error: targetError } = await admin.from("organization_members")
    .select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (targetError || !target) redirect("/empresa?error=No+se+encontró+al+integrante");
  if (target.role === "owner") redirect("/empresa?error=Solo+el+administrador+general+puede+transferir+la+propiedad");
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
