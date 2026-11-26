"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCineflowAdmin, CINEFLOW_OWNER_ID } from "@/lib/admin";

export async function acceptExistingInvitation(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?error=Inicia+sesión+y+vuelve+a+abrir+tu+invitación");
  if (user.id === CINEFLOW_OWNER_ID || isCineflowAdmin(user)) redirect("/");
  const id = String(formData.get("id") ?? "");
  const token = String(formData.get("token") ?? "");
  const admin = createSupabaseAdminClient();
  if (!admin || token.length !== 72) redirect("/?error=Invitación+inválida");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const { data: invitation } = await admin.from("organization_invitations")
    .select("organization_id").eq("id", id).eq("token_hash", hash).maybeSingle();
  if (!invitation) redirect("/?error=Invitación+inválida");
  const { data: other, error } = await admin.from("organization_members")
    .select("organization_id").eq("user_id", user.id).neq("organization_id", invitation.organization_id).limit(1);
  if (error || other?.length) redirect("/?error=Contacta+a+la+administración+de+tu+productora");
  const { error: acceptanceError } = await admin.rpc("accept_organization_invitation", {
    p_invitation_id: id, p_token_hash: hash, p_user_id: user.id, p_email: user.email,
  });
  if (acceptanceError) redirect("/?error=La+invitación+caducó,+ya+se+aceptó+o+no+corresponde+a+tu+correo");
  redirect("/?success=Invitación+aceptada");
}
