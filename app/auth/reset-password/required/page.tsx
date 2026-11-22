import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ForcedPasswordChange from "@/app/auth/ForcedPasswordChange";

export default async function RequiredPasswordChangePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fauth%2Freset-password%2Frequired&error=Inicia%20sesion%20con%20tu%20contraseña%20temporal%20para%20continuar");
  if (user.app_metadata?.cineflow_force_password_change !== true) redirect("/");
  return (
    <main className="min-h-[calc(100dvh-5rem)] flex items-center justify-center bg-[#08090d] px-4 py-10">
      <ForcedPasswordChange email={user.email ?? ""} />
    </main>
  );
}
