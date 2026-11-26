"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCineflowAdmin } from "@/lib/admin";

export async function authorizeOwnerEmailChange(formData: FormData) {
  const confirmationEmail = String(formData.get("confirmation_email") ?? "").trim().toLowerCase();
  const confirmationPhrase = String(formData.get("confirmation_phrase") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user) || user.id !== "0a12ae9b-a119-42f8-8103-4f1bf3ab5467") {
    redirect("/?error=No+autorizado");
  }
  if (user.email?.toLowerCase() !== "prueba@hotmail.com") redirect("/admin/correo");
  if (confirmationEmail !== "prueba@hotmail.com" || confirmationPhrase !== "CONFIRMAR CAMBIO") {
    redirect("/admin/correo?error=Confirma+el+correo+actual+y+la+frase+exacta");
  }
  const { data, error } = await supabase.functions.invoke("cineflow-owner-email-change", {
    body: { confirmation_email: confirmationEmail, confirmation_phrase: confirmationPhrase },
  });
  if (error) redirect("/admin/correo?error=" + encodeURIComponent(error.message));
  if (!data?.ok) redirect("/admin/correo?error=" + encodeURIComponent(data?.error ?? "No se pudo verificar el cambio"));
  redirect("/admin/correo?success=Correo+actualizado+y+registrado");
}
