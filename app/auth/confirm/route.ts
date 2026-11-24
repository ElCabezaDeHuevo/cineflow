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

  // Only the stored, matching OTP may create the recipient's Supabase session.
  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
  if (verifyError) return loginError(request, "No se pudo verificar la invitación. Solicita un enlace nuevo.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return loginError(request, "No se pudo verificar la cuenta.");
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    await supabase.auth.signOut();
    return loginError(request, "El correo autenticado no coincide con el correo invitado.");
  }
  if (!["producer", "member", "viewer"].includes(invitation.role)) {
    return loginError(request, "El permiso de esta invitación no es válido.");
  }

  const { data: organizationId, error: acceptanceError } = await admin.rpc("accept_organization_invitation", {
    p_invitation_id: invitation.id,
    p_token_hash: tokenHash,
    p_user_id: user.id,
    p_email: user.email,
  });
  if (acceptanceError || !organizationId) {
    await supabase.auth.signOut();
    return loginError(request, acceptanceError?.message ?? "No se pudo aceptar la invitación.");
  }

  const previousAppMetadata = user.app_metadata ?? {};
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...previousAppMetadata, organization_id: organizationId },
  });
  if (metadataError) {
    // Membership and audit are already committed atomically. Keep the session
    // valid and let the user continue; organization_id is only a convenience
    // selector, never an authorization source.
    console.error("No se pudo actualizar organization_id de la sesión:", metadataError.message);
  }

  const { data: org } = await admin.from("organizations").select("name")
    .eq("id", organizationId).maybeSingle();

  const destination = new URL("/auth/complete-invitation", request.url);
  destination.searchParams.set("welcome", org?.name ?? "CineFlow");
  return NextResponse.redirect(destination);
}
