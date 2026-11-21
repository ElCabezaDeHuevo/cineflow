import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { previewCookieOptions } from "@/lib/supabase/cookie-options";

export async function createSupabaseServerClient() {
  // Supabase Auth reads the current clock while restoring the session.
  // Explicitly opt into request-time rendering before creating the client.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: previewCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Middleware owns refresh writes. */ } },
    },
  });
}

