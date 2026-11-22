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
  const invitationId = url.searchParams.get("invitation_id");
  if (!code || !invitationId) {
    return loginError(request, "El enlace de invitación no es válido o ha caducado.");
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return loginError(request, "No se pudo verificar el correo. Solicita una nueva invitación.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return loginError(request, "No se pudo verificar la cuenta.");

  const admin = createSupabaseAdminClient();
  if (!admin) return loginError(request, "El servicio de invitaciones no está configurado.");

  const { data: invitation, error: invitationError } = await admin
    .from("organization_invitations")
    .select("id,organization_id,email,role,expires_at,accepted_at,invited_by")
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError || !invitation) return loginError(request, "La invitación no existe.");
  if (invitation.accepted_at) return loginError(request, "Esta invitación ya fue utilizada.");
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

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: invitation.organization_id,
    user_id: user.id,
    role: invitation.role,
    invited_by: invitation.invited_by,
  });
  if (memberError && memberError.code !== "23505") {
    return loginError(request, "No se pudo activar tu acceso. Contacta al administrador.");
  }

  const { error: acceptedError } = await admin.from("organization_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (acceptedError) {
    if (!memberError) {
      await admin.from("organization_members").delete()
        .eq("organization_id", invitation.organization_id).eq("user_id", user.id);
    }
    return loginError(request, "No se pudo completar la aceptación. Contacta al administrador.");
  }

  const { data: org } = await admin.from("organizations").select("name")
    .eq("id", invitation.organization_id).maybeSingle();
  await admin.from("organization_audit_log").insert({
    organization_id: invitation.organization_id,
    actor_id: user.id,
    action: "invitation_accepted",
    target_type: "user",
    target_id: user.id,
    metadata: { email: user.email, role: invitation.role },
  });

  const destination = new URL("/", request.url);
  destination.searchParams.set("welcome", org?.name ?? "CineFlow");
  return NextResponse.redirect(destination);
}
