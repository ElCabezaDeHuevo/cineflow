"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

function authError(message: string, path = "/login"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) authError("Escribe tu correo y contraseña.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authError("No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.");
  redirect(next);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) authError("Escribe el correo asociado a tu cuenta.", "/recuperar");
  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) authError("La dirección pública del sitio no está configurada. Contacta al administrador.", "/recuperar");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin.replace(/\/$/, "")}/auth/callback?next=/restablecer`,
  });
  if (error) authError("No se pudo enviar el correo. Comprueba la dirección e inténtalo más tarde.", "/recuperar");
  redirect("/recuperar?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 10) authError("La contraseña debe tener al menos 10 caracteres.", "/restablecer");
  if (password !== confirmation) authError("Las contraseñas no coinciden.", "/restablecer");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) authError("El enlace expiró o ya fue utilizado. Solicita uno nuevo.", "/recuperar");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) authError("No se pudo actualizar la contraseña. Solicita un enlace nuevo.", "/restablecer");
  redirect("/login?updated=1");
}
