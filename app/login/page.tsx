import Link from "next/link";
import { signIn } from "@/app/auth/actions";

export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; updated?: string }> }) {
  const { error, next, updated } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090a10] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[110px]" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#14151c]/95 p-7 shadow-2xl shadow-black/40 sm:p-9">
        <Link href="/" className="text-sm font-bold tracking-[.22em] text-white">CINE<span className="text-violet-400">FLOW</span></Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Tu producción, en un solo lugar</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Bienvenido de nuevo</h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">Inicia sesión para continuar con tus proyectos y tu equipo.</p>
        {updated && <p role="status" className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">Tu contraseña se actualizó. Ya puedes iniciar sesión.</p>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        <form action={signIn} className="mt-7 space-y-5">
          <input type="hidden" name="next" value={next ?? ""} />
          <label className="block text-sm font-medium text-gray-200">Correo electrónico
            <input name="email" type="email" required autoComplete="email" placeholder="nombre@productora.com" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15" />
          </label>
          <label className="block text-sm font-medium text-gray-200">Contraseña
            <input name="password" type="password" required autoComplete="current-password" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15" />
          </label>
          <div className="flex justify-end"><Link href="/recuperar" className="text-sm text-violet-300 hover:text-violet-200 hover:underline">¿Olvidaste tu contraseña?</Link></div>
          <button className="min-h-12 w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">Iniciar sesión</button>
        </form>
        <p className="mt-7 text-center text-xs leading-5 text-gray-500">¿No tienes acceso? Solicita una invitación al administrador de tu productora.</p>
      </section>
    </main>
  );
}
