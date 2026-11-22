import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ForcedPasswordChange from "@/app/auth/ForcedPasswordChange";

export default async function RequiredPasswordChangePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.cineflow_force_password_change !== true) redirect("/");
  return (
    <main className="min-h-[calc(100dvh-5rem)] flex items-center justify-center bg-[#08090d] px-4 py-10">
      <ForcedPasswordChange email={user.email ?? ""} />
    </main>
  );
}
