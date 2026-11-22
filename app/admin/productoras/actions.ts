"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

async function requireTechnician() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/admin?error=Falta+configurar+el+acceso+administrativo");
  return { admin, user };
}
function fail(message: string): never {
  redirect("/admin/productoras?error=" + encodeURIComponent(message));
}

export async function createCompany(formData: FormData) {
  const { admin } = await requireTechnician();
  const name = String(formData.get("name") ?? "").trim();
  const ownerId = String(formData.get("owner_id") ?? "").trim();
  const interval = String(formData.get("billing_interval") ?? "monthly");
  if (name.length < 2 || !ownerId || !["monthly", "annual"].includes(interval)) fail("Completa nombre, propietario y periodo.");
  const { data: owner, error: ownerError } = await admin.auth.admin.getUserById(ownerId);
  if (ownerError || !owner.user) fail("No se encontró la cuenta del dueño.");
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + crypto.randomUUID().slice(0, 6);
  const { data: org, error: orgError } = await admin.from("organizations").insert({
    name, slug, created_by: ownerId, billing_email: owner.user.email ?? null,
  }).select("id").single();
  if (orgError || !org) fail(orgError?.message ?? "No se pudo crear la productora.");
  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: org.id, user_id: ownerId, role: "owner",
  });
  if (memberError) {
    await admin.from("organizations").delete().eq("id", org.id);
    fail(memberError.message);
  }
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);
  const { error: subError } = await admin.from("subscriptions").insert({
    organization_id: org.id, plan_id: "productora", billing_interval: interval,
    status: "trialing", trial_start: now.toISOString(), trial_end: trialEnd.toISOString(),
    manual_payment_required: true,
  });
  if (subError) {
    await admin.from("organization_members").delete().eq("organization_id", org.id);
    await admin.from("organizations").delete().eq("id", org.id);
    fail(subError.message);
  }
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: org.id, action: "company_created", target_type: "organization",
    target_id: org.id, metadata: { owner_id: ownerId, trial_days: 14 },
  });
  if (auditError) {
    await admin.from("subscriptions").delete().eq("organization_id", org.id);
    await admin.from("organization_members").delete().eq("organization_id", org.id);
    await admin.from("organizations").delete().eq("id", org.id);
    fail(auditError.message);
  }
  revalidatePath("/admin/productoras");
  redirect("/admin/productoras?success=Productora+creada+con+14+dias+de+prueba");
}

export async function recordCompanyPayment(formData: FormData) {
  const { admin, user } = await requireTechnician();
  const organizationId = String(formData.get("organization_id") ?? "");
  const amount = Number(formData.get("amount_mxn"));
  const interval = String(formData.get("billing_interval") ?? "");
  const method = String(formData.get("payment_method") ?? "transferencia");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 160);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  if (!organizationId || !Number.isFinite(amount) || amount < 0 || !["monthly", "annual"].includes(interval) || !["transferencia", "efectivo", "deposito", "otro"].includes(method)) fail("Datos del pago no válidos.");
  const { data: subscription, error: subError } = await admin.from("subscriptions")
    .select("*").eq("organization_id", organizationId).maybeSingle();
  if (subError || !subscription) fail(subError?.message ?? "La productora no tiene una suscripción.");
  const now = new Date();
  const end = new Date(now);
  if (interval === "annual") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  const { data: payment, error: paymentError } = await admin.from("organization_manual_payments").insert({
    organization_id: organizationId, subscription_id: subscription.id, amount_mxn: amount,
    billing_interval: interval, paid_at: now.toISOString(),
    period_start: now.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
    payment_method: method, reference: reference || null, notes: notes || null, recorded_by: user.id,
  }).select("id").single();
  if (paymentError || !payment) fail(paymentError?.message ?? "No se pudo guardar el pago.");
  const { error: updateError } = await admin.from("subscriptions").update({
    status: "active", billing_interval: interval,
    current_period_start: now.toISOString(), current_period_end: end.toISOString(),
    last_manual_payment_at: now.toISOString(), access_suspended_at: null,
    manual_payment_required: true, updated_at: now.toISOString(),
  }).eq("id", subscription.id);
  if (updateError) {
    await admin.from("organization_manual_payments").delete()
      .eq("id", payment.id);
    fail(updateError.message);
  }
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: user.id, action: "manual_payment_recorded",
    target_type: "subscription", target_id: subscription.id,
    metadata: { amount_mxn: amount, billing_interval: interval, payment_method: method, reference },
  });
  if (auditError) {
    await admin.from("subscriptions").update({
      status: subscription.status, billing_interval: subscription.billing_interval,
      current_period_start: subscription.current_period_start, current_period_end: subscription.current_period_end,
      last_manual_payment_at: subscription.last_manual_payment_at, access_suspended_at: subscription.access_suspended_at,
      manual_payment_required: subscription.manual_payment_required, updated_at: subscription.updated_at,
    }).eq("id", subscription.id);
    await admin.from("organization_manual_payments").delete()
      .eq("organization_id", organizationId).eq("recorded_by", user.id).eq("paid_at", now.toISOString());
    fail(auditError.message);
  }
  await admin.from("organizations").update({ updated_at: now.toISOString() }).eq("id", organizationId);
  revalidatePath("/admin/productoras");
  redirect("/admin/productoras?success=Pago+registrado+y+servicio+activado");
}

export async function setCompanyAccess(formData: FormData) {
  const { admin, user } = await requireTechnician();
  const organizationId = String(formData.get("organization_id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!organizationId || !["suspend", "reactivate"].includes(mode)) fail("Acción no válida.");
  const now = new Date().toISOString();
  const { data: sub, error } = await admin.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error || !sub) fail(error?.message ?? "No existe una suscripción para esa productora.");
  const { error: updateError } = await admin.from("subscriptions").update({
    status: mode === "suspend" ? "paused" : "active",
    access_suspended_at: mode === "suspend" ? now : null,
    updated_at: now,
  }).eq("id", sub.id);
  if (updateError) fail(updateError.message);
  const { error: auditError } = await admin.from("organization_audit_log").insert({
    organization_id: organizationId, actor_id: user.id,
    action: mode === "suspend" ? "access_suspended" : "access_reactivated",
    target_type: "subscription", target_id: sub.id, metadata: {},
  });
  if (auditError) {
    await admin.from("subscriptions").update({
      status: sub.status,
      access_suspended_at: sub.access_suspended_at,
      updated_at: sub.updated_at,
    }).eq("id", sub.id);
    fail(auditError.message);
  }
  revalidatePath("/admin/productoras");
  redirect("/admin/productoras?success=" + (mode === "suspend" ? "Acceso+suspendido" : "Acceso+reactivado"));
}
