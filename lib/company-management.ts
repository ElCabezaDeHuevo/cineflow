import { subscriptionIsActive } from "@/lib/subscriptions";
import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function ownerContext(requestedOrganizationId: string, allowWhenSubscriptionInactive = false) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id);
  const membership = (memberships ?? []).find((m) => m.organization_id === requestedOrganizationId && ["owner", "admin"].includes(m.role));
  if (!membership) redirect("/empresa?error=No+tienes+permisos+para+administrar+esa+productora");
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/empresa?error=No+está+configurado+el+servicio+de+invitaciones");
  const { data: activeSuspension, error: suspensionLookupError } = await admin
    .from("organization_member_suspensions")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .eq("target_user_id", user.id)
    .is("reactivated_at", null)
    .maybeSingle();
  if (suspensionLookupError) redirect("/empresa?error=No+se+pudo+verificar+el+estado+de+tu+acceso");
  if (activeSuspension) redirect("/?error=Tu+acceso+a+esta+empresa+está+suspendido");
  if (!allowWhenSubscriptionInactive) {
    const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
      .select("status,trial_end,current_period_end").eq("organization_id", membership.organization_id).maybeSingle();
    if (subscriptionError || !subscriptionIsActive(subscription)) {
      redirect("/empresa?error=La+vigencia+de+esta+productora+terminó+o+no+está+activa.+Contacta+al+soporte");
    }
  }
  return { admin, user, organizationId: membership.organization_id, actorRole: membership.role };
}
