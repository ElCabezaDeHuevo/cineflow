"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasOpenWorkSession, attendanceRequiredMessage } from "@/lib/attendance";

export async function updateProfile(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasOpenWorkSession(supabase, user.id))) redirect(`/perfil?error=${encodeURIComponent(attendanceRequiredMessage)}`);
  const fullName = String(formData.get("full_name") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  if (!fullName) redirect("/perfil?error=El%20nombre%20es%20obligatorio");
  const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName, avatar_url: avatarUrl, bio, updated_at: new Date().toISOString() });
  if (error) redirect(`/perfil?error=${encodeURIComponent(error.message)}`);
  await supabase.auth.updateUser({ data: { full_name: fullName, avatar_url: avatarUrl } });
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
  if (!(await hasOpenWorkSession(supabase, user.id))) redirect(`/perfil?error=${encodeURIComponent(attendanceRequiredMessage)}`);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/perfil?error=${encodeURIComponent(error.message)}`);
  redirect("/perfil?success=Contraseña%20actualizada");
}

