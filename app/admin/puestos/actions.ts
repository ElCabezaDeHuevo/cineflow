"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CINE_ROLES } from "@/lib/cine-roles";

const OWNER_ID = "0a12ae9b-a119-42f8-8103-4f1bf3ab5467";
const ASSIGNABLE_ROLES = CINE_ROLES.filter((role) => role.value !== "viewer");

export async function assignCinematicPosition(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id !== OWNER_ID || user.app_metadata?.cineflow_role !== "admin") {
    redirect("/?error=No+tienes+permiso+para+asignar+puestos+desde+la+administración+general");
  }

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("cine_role") ?? "").trim();
  if (!organizationId || !userId || !ASSIGNABLE_ROLES.some((item) => item.value === role)) {
    redirect("/admin/puestos?error=Selecciona+una+productora,+un+integrante+y+un+puesto+válido");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/admin/puestos?error=No+está+configurado+el+servicio+administrativo");

  const [{ data: organization }, { data: membership }] = await Promise.all([
    admin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_members").select("user_id,role")
      .eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!organization || !membership) {
    redirect("/admin/puestos?error=La+productora+o+el+integrante+no+existen");
  }
  if (userId === OWNER_ID || membership.role === "owner") {
    redirect("/admin/puestos?error=La+cuenta+propietaria+y+el+dueño+de+empresa+están+protegidos");
  }

  const { data: previous, error: previousError } = await admin
    .from("organization_member_cinematic_roles")
    .select("organization_id,user_id,requested_role,approved_role,status,review_reason,requested_at,reviewed_by,reviewed_at")
    .eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (previousError) redirect("/admin/puestos?error=" + encodeURIComponent(previousError.message));

  const now = new Date().toISOString();
  const { error: assignmentError } = await admin.from("organization_member_cinematic_roles").upsert({
    organization_id: organizationId,
    user_id: userId,
    requested_role: previous?.requested_role ?? role,
    approved_role: role,
    status: "approved",
    review_reason: "Asignado directamente por el administrador general de CineFlow",
    reviewed_by: user.id,
    reviewed_at: now,
  }, { onConflict: "organization_id,user_id" });
  if (assignmentError) redirect("/admin/puestos?error=" + encodeURIComponent(assignmentError.message));

  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId,
    actor_id: user.id,
    action: "member_cinematic_role_assigned_by_cineflow_admin",
    target_type: "user",
    target_id: userId,
    metadata: {
      organization_name: organization.name,
      previous_request: previous?.requested_role ?? null,
      previous_role: previous?.approved_role ?? previous?.requested_role ?? null,
      new_role: role,
      assignment_source: "cineflow_global_admin",
    },
  });
  if (auditError) {
    if (previous) {
      await admin.from("organization_member_cinematic_roles").upsert(previous, { onConflict: "organization_id,user_id" });
    } else {
      await admin.from("organization_member_cinematic_roles").delete()
        .eq("organization_id", organizationId).eq("user_id", userId);
    }
    redirect("/admin/puestos?error=" + encodeURIComponent("No se pudo guardar la auditoría; se revirtió la asignación."));
  }

  revalidatePath("/admin/puestos");
  revalidatePath("/empresa");
  revalidatePath("/equipo");
  revalidatePath("/usuarios");
  revalidatePath("/usuarios/" + userId);
  redirect("/admin/puestos?success=" + encodeURIComponent("Puesto cinematográfico asignado a " + organization.name + "."));
}
