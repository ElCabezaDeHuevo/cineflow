"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CINEFLOW_OWNER_ID = "0a12ae9b-a119-42f8-8103-4f1bf3ab5467";

export async function updateCompanyMemberEmail(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const newEmail = String(formData.get("new_email") ?? "").trim().toLowerCase();
  const password = String(formData.get("actor_password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  const back = "/empresa/miembros" + (organizationId ? "?organization_id=" + encodeURIComponent(organizationId) : "");
  const fail = (message: string): never => redirect(back + (back.includes("?") ? "&" : "?") + "error=" + encodeURIComponent(message));

  if (!organizationId || !targetUserId || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(newEmail)) {
    fail("Completa un correo válido y selecciona al integrante.");
  }
  if (!password || confirmation !== "CAMBIAR CORREO") {
    fail("Confirma la operación e introduce tu contraseña.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user: actor } } = await supabase.auth.getUser();
  if (!actor) redirect("/login");
  if (!actor.email || actor.id === CINEFLOW_OWNER_ID) {
    fail("La cuenta propietaria de CineFlow no puede usar la administración de correos de una productora.");
  }

  const { data: actorMembership, error: actorMembershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", actor.id)
    .maybeSingle();
  if (actorMembershipError || !actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
    fail("No tienes permisos para administrar los correos de esta empresa.");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) fail("No está configurado el servicio administrativo seguro.");

  const { data: targetMembership, error: targetMembershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetMembershipError || !targetMembership) fail("El usuario no pertenece a esta empresa.");
  if (targetUserId === actor.id || targetUserId === CINEFLOW_OWNER_ID || targetMembership.role === "owner") {
    fail("No puedes cambiar el correo del dueño ni el de tu propia cuenta desde esta opción.");
  }
  if (actorMembership.role === "admin" && targetMembership.role === "admin") {
    fail("Un administrador solo puede cambiar el correo de colaboradores y productores. El dueño puede administrar cuentas de administrador.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) fail("No está configurada la verificación de identidad.");

  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({
    email: actor.email,
    password,
  });
  await verifier.auth.signOut();
  if (verificationError) fail("Tu contraseña no es correcta. No se modificó ninguna cuenta.");

  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
  const target = targetResult?.user;
  if (targetError || !target) fail("No se encontró la cuenta del integrante.");
  if (target.app_metadata?.cineflow_role === "admin") fail("No se puede modificar la cuenta global de CineFlow desde una productora.");
  if (target.email?.toLowerCase() === newEmail) fail("Ese ya es el correo actual del integrante.");

  const previousEmail = target.email ?? "";
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
    metadata: { old_email: previousEmail, new_email: newEmail, changed_by_role: actorMembership.role },
  });
  if (auditError) {
    await admin.auth.admin.updateUserById(targetUserId, { email: previousEmail, email_confirm: true });
    fail("No se pudo registrar la auditoría. Se revirtió el cambio de correo. " + auditError.message);
  }

  revalidatePath("/empresa");
  revalidatePath("/empresa/miembros");
  revalidatePath("/equipo");
  revalidatePath("/usuarios");
  redirect(back + (back.includes("?") ? "&" : "?") + "success=" + encodeURIComponent("Correo actualizado correctamente para " + newEmail + ". El usuario ya puede iniciar sesión con su nuevo correo y su misma contraseña."));
}
