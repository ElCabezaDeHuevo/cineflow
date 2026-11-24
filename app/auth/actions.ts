"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CINE_ROLES } from "@/lib/cine-roles";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedPath = String(formData.get("next") ?? "");
  const isSafeNext =
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.includes("\\") &&
    requestedPath !== "/login" &&
    !requestedPath.startsWith("/auth/");
  const nextPath = isSafeNext ? requestedPath : "/";
  if (!email || !password) {
    redirect(
      `/login?${new URLSearchParams({
        error: "Completa correo y contraseña",
        next: nextPath,
      })}`,
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(
      `/login?${new URLSearchParams({
        error: "No se pudo iniciar sesión",
        next: nextPath,
      })}`,
    );
  }
  redirect(nextPath);
}


export async function completeInvitationRegistration(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const requestedCineRole = String(formData.get("cine_role") ?? "");
  if (!CINE_ROLES.some((role) => role.value === requestedCineRole && role.value !== "viewer")) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("Selecciona un puesto cinematográfico válido."));
  }
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("Usa al menos 10 caracteres, una mayúscula, una minúscula y un número."));
  }
  if (password !== confirmation) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("Las contraseñas no coinciden."));
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) redirect("/login?error=" + encodeURIComponent("La sesión de invitación no es válida. Solicita un enlace nuevo."));
  const invitationId = String(user.user_metadata?.invitation_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    redirect("/login?error=" + encodeURIComponent("No se encontró la invitación que corresponde a esta cuenta."));
  }
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/login?error=" + encodeURIComponent("El servicio de registro no está disponible."));
  const { data: invitation, error: invitationError } = await admin
    .from("organization_invitations")
    .select("id,accepted_user_id,accepted_at,registration_completed_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (invitationError || !invitation || invitation.accepted_user_id !== user.id ||
      !invitation.accepted_at || invitation.registration_completed_at) {
    redirect("/login?error=" + encodeURIComponent("La invitación ya fue utilizada o no corresponde a esta cuenta."));
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect("/auth/complete-invitation?error=" + encodeURIComponent("No se pudo guardar la contraseña: " + passwordError.message));

  const { error: registrationError } = await admin.rpc("complete_organization_invitation_registration", {
    p_invitation_id: invitationId,
    p_user_id: user.id,
    p_requested_role: requestedCineRole,
  });
  if (registrationError) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("No se pudo registrar tu especialidad: " + registrationError.message));
  }
  redirect("/?welcome=Tu+cuenta+está+lista");
}
