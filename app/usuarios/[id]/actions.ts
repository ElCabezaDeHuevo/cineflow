"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function saveUserProfileNote(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");

  const userId = String(formData.get("user_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const screenshot = formData.get("screenshot");

  if (!userId) {
    redirect("/usuarios?error=No%20se%20encontr%C3%B3%20el%20usuario%20seleccionado");
  }
  if (!note || note.length > 5000) {
    redirect(`/usuarios/${userId}?error=${encodeURIComponent("Escribe una nota de hasta 5000 caracteres.")}`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    redirect(`/usuarios/${userId}?error=${encodeURIComponent("Falta configurar la conexión administrativa.")}`);
  }

  const { data: targetUser, error: targetUserError } = await admin.auth.admin.getUserById(userId);
  if (targetUserError || !targetUser?.user) {
    redirect(`/usuarios/${userId}?error=${encodeURIComponent("No se pudo localizar al usuario.")}`);
  }

  let screenshotPath: string | null = null;
  if (screenshot instanceof File && screenshot.size > 0) {
    const extension = imageExtensions[screenshot.type];
    if (!extension || screenshot.size > MAX_ATTACHMENT_SIZE) {
      redirect(`/usuarios/${userId}?error=${encodeURIComponent("La captura debe ser JPG, PNG o WebP y no superar 5 MB.")}`);
    }

    screenshotPath = `user-profile-notes/${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("error-report-screenshots")
      .upload(screenshotPath, await screenshot.arrayBuffer(), {
        contentType: screenshot.type,
        upsert: false,
      });

    if (uploadError) {
      redirect(`/usuarios/${userId}?error=${encodeURIComponent(`No se pudo guardar la captura: ${uploadError.message}`)}`);
    }
  }

  const { error: insertError } = await admin.from("user_profile_notes").insert({
    user_id: userId,
    author_id: user.id,
    note,
    screenshot_path: screenshotPath,
  });

  if (insertError) {
    if (screenshotPath) {
      await admin.storage.from("error-report-screenshots").remove([screenshotPath]);
    }
    redirect(`/usuarios/${userId}?error=${encodeURIComponent(`No se pudo guardar la nota: ${insertError.message}`)}`);
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${userId}`);
  redirect(`/usuarios/${userId}?success=${encodeURIComponent("Nota y captura guardadas correctamente.")}`);
}
