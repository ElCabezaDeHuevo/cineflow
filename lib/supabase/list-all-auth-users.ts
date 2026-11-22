import type { User } from "@supabase/supabase-js";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Fetches every Auth user in pages; never silently searches only the first 1,000 accounts. */
export async function listAllAuthUsers(admin: AdminClient): Promise<User[]> {
  const users: User[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
  throw new Error("Se alcanzó el límite de paginación de cuentas de Auth.");
}
