"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedPath = String(formData.get("next") ?? "");
  const isSafeNext =
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.includes("\\") &&
    requestedPath !== "/login" &&
    !requestedPath.startsWith("/auth/");
  const nextPath = isSafeNext ? requestedPath : "/";
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


export async function completeInvitationRegistration(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("Usa al menos 10 caracteres, una mayúscula, una minúscula y un número."));
  }
  if (password !== confirmation) {
    redirect("/auth/complete-invitation?error=" + encodeURIComponent("Las contraseñas no coinciden."));
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?error=" + encodeURIComponent("La sesión de invitación no es válida. Solicita un enlace nuevo."));
  const { data: membership, error: membershipError } = await supabase.from("organization_members")
    .select("organization_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (membershipError || !membership) redirect("/login?error=" + encodeURIComponent("No se encontró una invitación aceptada para esta cuenta."));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/auth/complete-invitation?error=" + encodeURIComponent("No se pudo guardar la contraseña: " + error.message));
  redirect("/?welcome=Tu+cuenta+está+lista");
}
