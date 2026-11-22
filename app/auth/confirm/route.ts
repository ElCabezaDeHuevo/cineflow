import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function loginError(request: NextRequest, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const invitationId = url.searchParams.get("invitation_id");

  if (!invitationId || !tokenHash || type !== "invite" || code) {
    return loginError(request, "El enlace de invitación no es válido o ha caducado.");
  }

  const supabase = await createSupabaseServerClient();

  // The invitation token is checked against its database record below before it can be consumed.

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return loginError(request, "No se pudo verificar la cuenta.");

  const admin = createSupabaseAdminClient();
  if (!admin) return loginError(request, "El servicio de invitaciones no está configurado.");

  const { data: invitation, error: invitationError } = await admin
    .from("organization_invitations")
    .select("id,organization_id,email,role,expires_at,accepted_at,invited_by,token_hash")
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError || !invitation) return loginError(request, "La invitación no existe.");
  if (invitation.accepted_at || !invitation.token_hash) return loginError(request, "Esta invitación ya fue utilizada.");
  if (invitation.token_hash !== tokenHash) return loginError(request, "La llave no corresponde a esta invitación.");
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return loginError(request, "La invitación ha caducado. Solicita una nueva.");
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    await supabase.auth.signOut();
    return loginError(request, "El correo autenticado no coincide con el correo invitado.");
  }
  if (!["producer", "member", "viewer"].includes(invitation.role)) {
    return loginError(request, "El permiso de esta invitación no es válido.");
  }

  // Claim the invitation before creating membership. This makes concurrent
  // callbacks mutually exclusive and prevents a losing request from reverting
  // metadata written by the request that actually accepted the invitation.
  const acceptedAt = new Date().toISOString();
  const { data: claimedInvitation, error: claimError } = await admin
    .from("organization_invitations")
    .update({ accepted_at: acceptedAt, token_hash: null })
    .eq("id", invitation.id)
    .eq("token_hash", tokenHash)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimedInvitation) {
    return loginError(request, claimError
      ? "No se pudo completar la aceptación. Contacta al administrador."
      : "Esta invitación ya fue utilizada.");
  }

  const releaseClaim = async () => {
    await admin.from("organization_invitations")
      .update({ accepted_at: null, token_hash: tokenHash })
      .eq("id", invitation.id)
      .eq("accepted_at", acceptedAt)
      .is("token_hash", null);
  };

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: invitation.organization_id,
    user_id: user.id,
    role: invitation.role,
    invited_by: invitation.invited_by,
  });
  let membershipInserted = !memberError;
  if (memberError) {
    if (memberError.code !== "23505") {
      await releaseClaim();
      return loginError(request, "No se pudo activar tu acceso. Contacta al administrador.");
    }

    // A duplicate membership must never silently overwrite an existing role.
    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMembershipError || !existingMembership || existingMembership.role !== invitation.role) {
      await releaseClaim();
      return loginError(request, "Esta cuenta ya pertenece a la productora con otro permiso. Contacta al administrador.");
    }
    membershipInserted = false;
  }

  const previousAppMetadata = user.app_metadata ?? {};
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...previousAppMetadata, organization_id: invitation.organization_id },
  });
  if (metadataError) {
    if (membershipInserted) {
      await admin.from("organization_members").delete()
        .eq("organization_id", invitation.organization_id).eq("user_id", user.id);
    }
    await releaseClaim();
    return loginError(request, "No se pudo actualizar el acceso de la cuenta. Contacta al administrador.");
  }

  const { data: org } = await admin.from("organizations").select("name")
    .eq("id", invitation.organization_id).maybeSingle();
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: invitation.organization_id,
    actor_id: user.id,
    action: "invitation_accepted",
    target_type: "user",
    target_id: user.id,
    metadata: { email: user.email, role: invitation.role },
  });
  if (auditError) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: previousAppMetadata });
    if (membershipInserted) {
      await admin.from("organization_members").delete()
        .eq("organization_id", invitation.organization_id).eq("user_id", user.id);
    }
    await releaseClaim();
    return loginError(request, "No se pudo registrar la aceptación. Contacta al administrador.");
  }

  const destination = new URL("/", request.url);
  destination.searchParams.set("welcome", org?.name ?? "CineFlow");
  return NextResponse.redirect(destination);
}
