"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedPath = String(formData.get("next") ?? "");
  const nextPath =
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.includes("\\")
      ? requestedPath
      : "/";
  if (!email || !password) {
    redirect(
      `/login?${new URLSearchParams({
        error: "Completa correo y contraseña",
        next: nextPath,
      })}`,
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(
      `/login?${new URLSearchParams({
        error: "No se pudo iniciar sesión",
        next: nextPath,
      })}`,
    );
  }
  redirect(nextPath);
}
