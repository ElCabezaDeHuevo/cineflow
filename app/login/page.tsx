import { redirect } from "next/navigation";
import { signIn } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // Do not render the public login form inside an already-authenticated app shell.
  // This also prevents the sidebar/account chip from showing a different account
  // alongside a browser-autofilled email from another saved login.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    if (user.app_metadata?.cineflow_force_password_change === true) {
      redirect("/auth/reset-password/required");
    }
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    redirect(destination);
  }

  return (
    <main className="cf-login-page">
      <div className="cf-login-backdrop" aria-hidden="true" />
      <div className="cf-login-vignette" aria-hidden="true" />
      <section className="cf-login-card cf-glass">
        <div className="cf-login-brand">
          <span className="cf-login-mark" aria-hidden="true">✦</span>
          <div>
            <p className="cf-login-wordmark">CINE<span>FLOW</span></p>
            <p className="cf-login-studio">STUDIO</p>
          </div>
        </div>

        <div className="cf-login-heading">
          <p className="cf-login-eyebrow">PRODUCTION WORKSPACE</p>
          <h1>Bienvenido de nuevo</h1>
          <p>Tu producción, organizada en un solo lugar.</p>
        </div>

        {error && <p role="alert" className="cf-login-error">{error}</p>}

        <form action={signIn} className="cf-login-form">
          <input type="hidden" name="next" value={next ?? ""} />
          <label>
            <span>Correo electrónico</span>
            <input name="email" type="email" required autoComplete="username" placeholder="nombre@productora.com" />
          </label>
          <label>
            <span>Contraseña</span>
            <input name="password" type="password" required autoComplete="current-password" placeholder="Ingresa tu contraseña" />
          </label>
          <button type="submit">Iniciar sesión <span aria-hidden="true">↗</span></button>
        </form>

        <p className="cf-login-footnote">Acceso seguro a tus proyectos y equipos de producción.</p>
      </section>
      <p className="cf-login-copyright">CINEFLOW STUDIO <span>·</span> PRODUCTION MANAGEMENT</p>
    </main>
  );
}
