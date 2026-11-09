import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasOpenWorkSession(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("user_id", userId)
    .is("clock_out", null)
    .maybeSingle();
  return Boolean(data);
}

export const attendanceRequiredMessage = "Registra tu entrada en Entradas y salidas antes de modificar Cineflow.";
