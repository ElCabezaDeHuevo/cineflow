import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "El enlace de restablecimiento no es válido o ha caducado.");
    return NextResponse.redirect(login);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "No se pudo verificar el enlace. Solicita un nuevo restablecimiento.");
    return NextResponse.redirect(login);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "No se pudo verificar tu cuenta.");
    return NextResponse.redirect(login);
  }

  const destination = new URL("/", request.url);
  return NextResponse.redirect(destination);
}
