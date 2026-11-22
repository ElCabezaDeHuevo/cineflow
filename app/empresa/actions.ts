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

export async function inviteCompanyMember(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) redirect("/empresa?error=Selecciona+una+productora");
  const { admin, user } = await ownerContext(organizationId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/empresa?error=Correo+no+válido");
  if (!["producer", "member", "viewer"].includes(role)) redirect("/empresa?error=Permiso+no+válido");
  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).single();
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) redirect("/empresa?error=" + encodeURIComponent(listError.message));
  const existingUser = existingUsers.users.find((item) => item.email?.toLowerCase() === email);
  let invitedUserId: string;
  if (existingUser) {
    const { data: alreadyMember } = await admin.from("organization_members").select("user_id")
      .eq("organization_id", organizationId).eq("user_id", existingUser.id).maybeSingle();
    if (alreadyMember) redirect("/empresa?error=Esa+persona+ya+pertenece+a+tu+equipo");
    invitedUserId = existingUser.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_to: org?.name ?? "CineFlow" },
      redirectTo: process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL + "/auth/callback" : undefined,
    });
    if (error || !data.user) redirect("/empresa?error=" + encodeURIComponent(error?.message ?? "No se pudo enviar la invitación"));
    invitedUserId = data.user.id;
  }
  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId, user_id: invitedUserId, role, invited_by: user.id,
  });
  if (memberError) redirect("/empresa?error=" + encodeURIComponent(memberError.message));
  const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(crypto.randomUUID() + email));
  const token = Array.from(new Uint8Array(tokenHash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  await admin.from("organization_invitations").insert({
    organization_id: organizationId, email, role, token_hash: token,
    invited_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: user.id, action: "member_invited",
    target_type: "user", target_id: invitedUserId, metadata: { email, role },
  });
  revalidatePath("/empresa");
  redirect("/empresa?success=Invitación+enviada");
}
