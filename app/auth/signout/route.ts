import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("Could not verify the user before sign-out:", authError);
    return new NextResponse("No se pudo verificar la sesión. Inténtalo de nuevo.", { status: 503 });
  }

  if (user) {
    const { data: activeSession, error: lookupError } = await supabase
      .from("work_sessions")
      .select("id")
      .eq("user_id", user.id)
      .is("clock_out", null)
      .maybeSingle();

    if (lookupError) {
      console.error("Could not find the active work session during sign-out:", lookupError);
      return new NextResponse("No se pudo consultar tu entrada activa. Inténtalo de nuevo.", { status: 500 });
    }

    if (activeSession) {
      const { data: closedSession, error: updateError } = await supabase
        .from("work_sessions")
        .update({
          clock_out: new Date().toISOString(),
          note: "Salida registrada automáticamente al cerrar sesión.",
        })
        .eq("id", activeSession.id)
        .eq("user_id", user.id)
        .is("clock_out", null)
        .select("id")
        .maybeSingle();

      if (updateError || !closedSession) {
        console.error("Could not register the work-session clock-out:", updateError ?? "No active session was updated");
        return new NextResponse("No se pudo registrar tu salida. Tu sesión sigue abierta; inténtalo de nuevo.", { status: 500 });
      }
    }
  }

  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) cookieStore.delete(cookie.name);
  }

  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
