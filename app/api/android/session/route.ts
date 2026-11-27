import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" ||
      body.email.length > 320 || body.password.length > 1024) {
    return Response.json({ error: "Ingresa tu correo y contraseña." }, { status: 400 });
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password,
  });
  if (error || !data.session) {
    return Response.json({ error: error?.status === 429 ? "Espera un momento antes de volver a intentar." : "No se pudo iniciar sesión. Revisa tus datos." },
      { status: error?.status === 429 ? 429 : 401 });
  }
  if (data.user.app_metadata.cineflow_force_password_change === true) {
    return Response.json({ error: "Primero cambia tu contraseña en la página de CineFlow." }, { status: 403 });
  }
  return Response.json({ token: data.session.access_token }, { headers: { "Cache-Control": "no-store" } });
}
