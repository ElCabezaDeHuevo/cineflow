"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY.");
  return { admin, user };
}

// Convierte una fecha/hora escrita como hora local de Tijuana a un instante UTC,
// respetando automáticamente los cambios de horario de verano.
function tijuanaLocalToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Fecha u hora no válida.");
  }
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tijuana",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p => [p.type, p.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const delta = target - represented;
    if (!delta) break;
    guess += delta;
  }
  const result = new Date(guess);
  if (!Number.isFinite(result.getTime())) throw new Error("Fecha u hora no válida.");
  return result.toISOString();
}

export async function updateWorkSession(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const id = String(formData.get("session_id") ?? "");
  const clockIn = tijuanaLocalToIso(String(formData.get("clock_in") ?? ""));
  const clockOutRaw = String(formData.get("clock_out") ?? "");
  const clockOut = clockOutRaw ? tijuanaLocalToIso(clockOutRaw) : null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const adminNote = String(formData.get("admin_note") ?? "").trim().slice(0, 2000);
  const reviewStatus = String(formData.get("review_status") ?? "normal");
  if (!id || !["normal", "pending_review", "reviewed"].includes(reviewStatus)) {
    redirect("/admin/horarios?error=Datos%20de%20jornada%20no%20v%C3%A1lidos");
  }
  if (clockOut && new Date(clockOut) < new Date(clockIn)) {
    redirect("/admin/horarios?error=La%20salida%20no%20puede%20ser%20anterior%20a%20la%20entrada");
  }
  const { data: existing, error: lookupError } = await admin
    .from("work_sessions").select("id,user_id,deleted_at").eq("id", id).maybeSingle();
  if (lookupError || !existing) redirect("/admin/horarios?error=No%20se%20encontr%C3%B3%20la%20jornada");
  if (existing.deleted_at) redirect("/admin/horarios?error=" + encodeURIComponent("No se pueden modificar jornadas eliminadas."));
  const { error } = await admin.from("work_sessions").update({
    clock_in: clockIn,
    clock_out: clockOut,
    note,
    admin_note: adminNote,
    review_status: reviewStatus,
    reviewed_by: reviewStatus === "reviewed" ? user.id : null,
    reviewed_at: reviewStatus === "reviewed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).is("deleted_at", null);
  if (error) redirect("/admin/horarios?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/horarios");
  revalidatePath("/horarios");
  redirect("/admin/horarios?success=Jornada%20actualizada");
}

export async function markWorkSessionReviewed(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const id = String(formData.get("session_id") ?? "");
  if (!id) redirect("/admin/horarios?error=Jornada%20no%20v%C3%A1lida");
  const { error } = await admin.from("work_sessions").update({
    review_status: "reviewed",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("review_status", "pending_review").is("deleted_at", null);
  if (error) redirect("/admin/horarios?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/horarios");
  revalidatePath("/horarios");
  redirect("/admin/horarios?success=Jornada%20marcada%20como%20revisada");
}

export async function deleteWorkSession(formData: FormData) {
  const { admin, user } = await requireAdmin();
  const id = String(formData.get("session_id") ?? "");
  const reason = String(formData.get("deleted_reason") ?? "").trim();
  if (!id || reason.length < 5) redirect("/admin/horarios?error=" + encodeURIComponent("Debes escribir una razón de al menos 5 caracteres."));
  if (reason.length > 1000) redirect("/admin/horarios?error=" + encodeURIComponent("La razón no puede superar 1000 caracteres."));
  const { data: session, error: lookupError } = await admin.from("work_sessions").select("id,deleted_at").eq("id", id).maybeSingle();
  if (lookupError || !session) redirect("/admin/horarios?error=" + encodeURIComponent("No se encontró la jornada."));
  if (session.deleted_at) redirect("/admin/horarios?error=" + encodeURIComponent("Este registro ya estaba eliminado."));
  const { error } = await admin.from("work_sessions").update({
    deleted_at: new Date().toISOString(), deleted_reason: reason, deleted_by: user.id, updated_at: new Date().toISOString(),
  }).eq("id", id).is("deleted_at", null);
  if (error) redirect("/admin/horarios?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/horarios"); revalidatePath("/horarios");
  redirect("/admin/horarios?success=" + encodeURIComponent("Registro marcado como eliminado y conservado en el historial."));
}
