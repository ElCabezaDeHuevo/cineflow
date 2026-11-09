"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function completeFirstLoginIntroduction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para guardar tu introducción.");
  if (user.app_metadata?.cineflow_onboarding_pending !== true) return;

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo.");

  const { data: account, error: lookupError } =
    await admin.auth.admin.getUserById(user.id);
  if (lookupError || !account.user) {
    throw new Error(
      `No se pudo cargar tu cuenta: ${lookupError?.message ?? "registro inexistente"}`,
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...account.user.app_metadata,
      cineflow_onboarding_pending: false,
    },
  });
  if (updateError) {
    throw new Error(`No se pudo guardar la introducción: ${updateError.message}`);
  }
}
