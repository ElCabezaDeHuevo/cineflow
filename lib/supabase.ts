
import { createBrowserClient } from "@supabase/ssr";
import { previewCookieOptions } from "@/lib/supabase/cookie-options";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Faltan las variables de entorno de Supabase en .env.local"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey, { cookieOptions: previewCookieOptions });
}

