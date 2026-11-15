"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getUserAndClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function requireProjectEditor(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, projectId: string, userId: string) {
  const { data, error } = await supabase.from("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["owner", "editor"].includes(data.role)) throw new Error("Solo el jefe del proyecto o un editor puede realizar esta acción.");
}

export async function createScheduleItem(formData: FormData) {
  const { supabase, user } = await getUserAndClient();
  const projectId = String(formData.get("project_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!projectId || !title || !startsAt) throw new Error("Completa el proyecto, título y fecha de inicio.");
  await requireProjectEditor(supabase, projectId, user.id);
  const { error } = await supabase.from("project_schedule_items").insert({
    project_id: projectId, title, starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    location: location || null, description: description || null, created_by: user.id,
  });
  if (error) throw new Error(`No se pudo guardar el evento: ${error.message}`);
  revalidatePath("/centro");
}

export async function createExpense(formData: FormData) {
  const { supabase, user } = await getUserAndClient();
  const projectId = String(formData.get("project_id") ?? "");
  const concept = String(formData.get("concept") ?? "").trim();
  const category = String(formData.get("category") ?? "General").trim();
  const amount = Number(formData.get("amount"));
  const spentOn = String(formData.get("spent_on") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!projectId || !concept || !Number.isFinite(amount) || amount < 0) throw new Error("Revisa el concepto y el importe del gasto.");
  await requireProjectEditor(supabase, projectId, user.id);
  const { error } = await supabase.from("project_expenses").insert({
    project_id: projectId, concept, category, amount, spent_on: spentOn || undefined,
    notes: notes || null, created_by: user.id,
  });
  if (error) throw new Error(`No se pudo guardar el gasto: ${error.message}`);
  revalidatePath("/centro");
}

export async function markNotificationRead(formData: FormData) {
  const { supabase, user } = await getUserAndClient();
  const id = String(formData.get("notification_id") ?? "");
  if (!id) return;
  const { error } = await supabase.from("project_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(`No se pudo actualizar la notificación: ${error.message}`);
  revalidatePath("/centro");
}
