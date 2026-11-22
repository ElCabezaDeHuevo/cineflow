import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { previewCookieOptions } from "@/lib/supabase/cookie-options";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[cineflow] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en este entorno.");
    return response;
  }
  const hasAuthCookie = request.cookies.getAll().some(({ name }) =>
    name.includes("auth-token") || name === "sb-access-token",
  );
  // Static generation and anonymous requests have no session to refresh.
  // Avoid invoking Supabase Auth (which reads the current clock) in that context.
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: previewCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Verify the JWT and refresh the session without a network user lookup.
  // Supabase recommends getClaims() in Next.js Proxy for SSR session refresh.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { app_metadata?: { cineflow_force_password_change?: boolean } } | undefined;
  const forcePasswordChange = claims?.app_metadata?.cineflow_force_password_change === true;
  const pathname = request.nextUrl.pathname;
  const isPasswordChangeRoute = pathname === "/auth/reset-password/required" || pathname === "/auth/reset-password" || pathname === "/login";
  const isSignOutRoute = pathname === "/auth/signout";
  if (forcePasswordChange && !isPasswordChangeRoute && !isSignOutRoute) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/auth/reset-password/required";
    destination.search = "";
    return NextResponse.redirect(destination);
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

