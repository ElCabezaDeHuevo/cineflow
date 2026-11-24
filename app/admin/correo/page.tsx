import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCineflowAdmin } from "@/lib/admin";
import { authorizeOwnerEmailChange } from "./actions";

export default async function OwnerEmailChangePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user) || user.id !== "0a12ae9b-a119-42f8-8103-4f1bf3ab5467") redirect("/");
  return (
    <main className="min-h-screen bg-[#0b0c10] p-6 text-white md:p-10">
      <section className="mx-auto max-w-2xl">
        <Link href="/admin" className="text-sm text-violet-300">← Administración</Link>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Cuenta del propietario</p>
          <h1 className="mt-2 text-2xl font-bold">Actualizar correo de CineFlow</h1>
          <p className="mt-3 text-sm text-gray-300">Esta acción cambia el correo de inicio de sesión de la cuenta propietaria. Se valida tu sesión de administrador y queda un registro de auditoría.</p>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <p>Correo actual: <strong>prueba@hotmail.com</strong></p>
            <p className="mt-1">Correo nuevo: <strong>cineflow@hotmail.com</strong></p>
          </div>
          {params.error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{params.error}</p>}
          {params.success && <p role="status" className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">{params.success}</p>}
          <form action={authorizeOwnerEmailChange} className="mt-6 space-y-4">
            <label className="block text-sm">Confirma tu correo actual
              <input name="confirmation_email" type="email" required autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white" placeholder="prueba@hotmail.com" />
            </label>
            <label className="block text-sm">Escribe exactamente: CONFIRMAR CAMBIO
              <input name="confirmation_phrase" required autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white" />
            </label>
            <button type="submit" className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-500">Confirmar y cambiar correo</button>
          </form>
        </div>
      </section>
    </main>
  );
}
