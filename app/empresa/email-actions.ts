"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ownerContext } from "@/lib/company-management";
import { CINEFLOW_OWNER_ID } from "@/lib/admin";


export async function updateCompanyMemberEmail(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const newEmail = String(formData.get("new_email") ?? "").trim().toLowerCase();
  const password = String(formData.get("actor_password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  const back = "/empresa/miembros" + (organizationId ? "?organization_id=" + encodeURIComponent(organizationId) : "");
  const fail = (message: string): never => redirect(back + (back.includes("?") ? "&" : "?") + "error=" + encodeURIComponent(message));

  if (!organizationId || !targetUserId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    fail("Completa un correo válido y selecciona al integrante.");
  }
  if (!password || confirmation !== "CAMBIAR CORREO") {
    fail("Confirma la operación e introduce tu contraseña.");
  }

  const { admin, user: actor, actorRole } = await ownerContext(organizationId);
  if (!actor.email || actor.id === CINEFLOW_OWNER_ID) fail("Usa una cuenta de administración de la productora.");

  const { data: otherMemberships, error: scopeError } = await admin.from("organization_members")
    .select("organization_id").eq("user_id", targetUserId).neq("organization_id", organizationId).limit(1);
  if (scopeError || otherMemberships?.length) fail("La cuenta requiere revisión por la administración global.");

  const { data: targetMembership, error: targetMembershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetMembershipError || !targetMembership) redirect(back + "&error=" + encodeURIComponent("El usuario no pertenece a esta empresa."));
  if (targetUserId === actor.id || targetUserId === CINEFLOW_OWNER_ID || targetMembership.role === "owner") {
    fail("No puedes cambiar el correo del dueño ni el de tu propia cuenta desde esta opción.");
  }
  if (actorRole === "admin" && targetMembership.role === "admin") {
    redirect(back + "&error=" + encodeURIComponent("Un administrador solo puede cambiar el correo de colaboradores y productores. El dueño puede administrar cuentas de administrador."));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) fail("No está configurada la verificación de identidad.");

  const verifier = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({
    email: actor.email!,
    password,
  });
  await verifier.auth.signOut({ scope: "local" });
  if (verificationError) fail("Tu contraseña no es correcta. No se modificó ninguna cuenta.");

  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
  const target = targetResult?.user;
  if (targetError || !target) redirect(back + "&error=" + encodeURIComponent("No se encontró la cuenta del integrante."));
  if (target.app_metadata?.cineflow_role === "admin") fail("No se puede modificar la cuenta global de CineFlow desde una productora.");
  if (target.email?.toLowerCase() === newEmail) fail("Ese ya es el correo actual del integrante.");

  const previousEmail = target.email;
  if (!previousEmail) fail("La cuenta no tiene un correo anterior válido.");
  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: true,
  });
  if (updateError) fail("Supabase no pudo actualizar el correo: " + updateError.message);

  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId,
    actor_id: actor.id,
    action: "company_member_email_changed",
    target_type: "user",
    target_id: targetUserId,
    metadata: { old_email: previousEmail, new_email: newEmail, changed_by_role: actorRole },
  });
  if (auditError) {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(targetUserId, { email: previousEmail, email_confirm: true });
    if (rollbackError) fail("El correo cambió y fallaron la auditoría y la reversión. Solicita revisión administrativa.");
    fail("No se pudo registrar la auditoría. Se revirtió el cambio de correo. " + auditError.message);
  }

  revalidatePath("/empresa");
  revalidatePath("/empresa/miembros");
  revalidatePath("/equipo");
  revalidatePath("/usuarios");
  redirect(back + (back.includes("?") ? "&" : "?") + "success=" + encodeURIComponent("Correo actualizado correctamente para " + newEmail + ". El usuario ya puede iniciar sesión con su nuevo correo y su misma contraseña."));
}
