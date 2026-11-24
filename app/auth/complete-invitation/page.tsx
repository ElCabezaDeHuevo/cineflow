import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeInvitationRegistration } from "@/app/auth/actions";
import { CINE_ROLES } from "@/lib/cine-roles";

export default async function CompleteInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; welcome?: string }>;
}) {
  const { error, welcome } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=" + encodeURIComponent("Abre el enlace de invitación que recibiste para completar tu registro."));

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1);
  if (membershipError || !memberships?.length) {
    redirect("/login?error=" + encodeURIComponent("No hay una invitación aceptada para esta cuenta."));
  }

  return (
    <main className="cf-login-page">
      <div className="cf-login-backdrop" aria-hidden="true" />
      <div className="cf-login-vignette" aria-hidden="true" />
      <section className="cf-login-card cf-glass">
        <div className="cf-login-brand">
          <span className="cf-login-mark" aria-hidden="true">✦</span>
          <div><p className="cf-login-wordmark">CINE<span>FLOW</span></p><p className="cf-login-studio">STUDIO</p></div>
        </div>
        <div className="cf-login-heading">
          <p className="cf-login-eyebrow">INVITACIÓN A {welcome ?? "CINEFLOW"}</p>
          <h1>Termina tu registro</h1>
          <p>Tu invitación fue validada. Selecciona tu puesto cinematográfico y crea tu contraseña. El puesto quedará pendiente de aprobación por la empresa.</p>
        </div>
        <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">{user.email}</p>
        {error && <p role="alert" className="cf-login-error">{error}</p>}
        <form action={completeInvitationRegistration} className="cf-login-form">
          <label><span>Puesto cinematográfico</span><select name="cine_role" required defaultValue="" className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white"><option value="" disabled>Selecciona tu especialidad</option>{Object.entries(CINE_ROLES.filter((role) => role.value !== "viewer").reduce<Record<string, (typeof CINE_ROLES)[number][]>>((groups, role) => { (groups[role.department] ??= []).push(role); return groups; }, {})).map(([department, roles]) => <optgroup key={department} label={department}>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</optgroup>)}</select></label>
          <p className="text-xs leading-5 text-amber-200">Tu selección será enviada al dueño o administrador para revisión. Hasta que se apruebe, aparecerá como pendiente.</p>
          <label><span>Nueva contraseña</span><input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="Mínimo 10 caracteres" /></label>
          <label><span>Confirmar contraseña</span><input name="confirmation" type="password" required minLength={10} autoComplete="new-password" placeholder="Repite tu contraseña" /></label>
          <p className="text-xs leading-5 text-gray-400">Incluye al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
          <button type="submit">Crear cuenta y entrar <span aria-hidden="true">↗</span></button>
        </form>
      </section>
      <p className="cf-login-copyright">CINEFLOW STUDIO <span>·</span> PRODUCTION MANAGEMENT</p>
    </main>
  );
}
