"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function clockIn() {
  const current = await context();
  if (!current) redirect("/login");
  const { data: active, error: activeError } = await current.supabase
    .from("work_sessions")
    .select("id")
    .eq("user_id", current.user.id)
    .is("clock_out", null)
    .maybeSingle();
  if (activeError) {
    throw new Error(`No se pudo consultar tu jornada activa: ${activeError.message}`);
  }
  if (!active) {
    const { error } = await current.supabase
      .from("work_sessions")
      .insert({ user_id: current.user.id });
    if (error) {
      throw new Error(`No se pudo registrar tu entrada: ${error.message}`);
    }
  }
  revalidatePath("/");
  revalidatePath("/horarios");
}

export async function clockOut(formData: FormData) {
  const current = await context();
  const id = String(formData.get("session_id") ?? "");
  if (!current) redirect("/login");
  if (!id) throw new Error("No se encontró la jornada que quieres cerrar.");
  const { data: updatedSession, error } = await current.supabase
    .from("work_sessions")
    .update({
      clock_out: new Date().toISOString(),
      note: String(formData.get("note") ?? "").trim(),
    })
    .eq("id", id)
    .eq("user_id", current.user.id)
    .is("clock_out", null)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo registrar tu salida: ${error.message}`);
  }
  if (!updatedSession) {
    throw new Error("No se encontró una jornada activa para cerrar.");
  }
  revalidatePath("/");
  revalidatePath("/horarios");
}
