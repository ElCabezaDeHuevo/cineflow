"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  if (!fullName) redirect("/perfil?error=El%20nombre%20es%20obligatorio");
  if (fullName.length > 160 || bio.length > 4000 || avatarUrl.length > 2048) {
    redirect("/perfil?error=Revisa+la+longitud+del+nombre,+la+biografía+y+la+URL");
  }
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) redirect("/perfil?error=Usa+una+URL+de+foto+HTTP+o+HTTPS");
  const { error } = await supabase.from("profiles")
    .upsert({
      id: user.id,
      full_name: fullName,
      avatar_url: avatarUrl,
      bio,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("id")
    .single();
  if (error) {
    redirect(`/perfil?error=${encodeURIComponent("No se pudo guardar el perfil: " + error.message)}`);
  }
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { full_name: fullName, avatar_url: avatarUrl },
  });
  if (metadataError) {
    redirect("/perfil?success=" + encodeURIComponent("Tus datos del perfil se guardaron, pero no se pudo sincronizar la información de la cuenta: " + metadataError.message));
  }
  revalidatePath("/");
  revalidatePath("/perfil");
  revalidatePath("/proyectos", "layout");
  redirect("/perfil?success=Perfil%20actualizado");
}

export async function changePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 8 || password !== confirmation) redirect("/perfil?error=La%20contraseña%20debe%20tener%208%20caracteres%20y%20coincidir");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/perfil?error=${encodeURIComponent(error.message)}`);
  redirect("/perfil?success=Contraseña%20actualizada");
}


export async function changeEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/perfil?error=Escribe+un+correo+electrónico+válido");
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (email === user.email?.toLowerCase()) {
    redirect("/perfil?error=Ese+ya+es+tu+correo+actual");
  }
  const { error } = await supabase.auth.updateUser({ email });
  if (error) redirect("/perfil?error=" + encodeURIComponent(error.message));
  redirect("/perfil?success=" + encodeURIComponent("Solicitamos el cambio. Revisa tu correo nuevo y confirma el enlace de Supabase para completar la actualización."));
}
