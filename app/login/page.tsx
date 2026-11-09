import { signIn } from "@/app/auth/actions";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-[#0b0c10] p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14151c] p-8"><span className="text-sm text-violet-300">CineFlow</span><h1 className="mt-8 text-3xl font-bold">Iniciar sesión</h1><p className="mt-2 text-sm text-gray-400">Accede a tus proyectos y permisos de producción.</p>{error && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}<form action={signIn} className="mt-6 space-y-5"><input type="hidden" name="next" value={next ?? ""} /><label className="block text-sm text-gray-300">Correo<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><label className="block text-sm text-gray-300">Contraseña<input name="password" type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><button className="w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400">Entrar</button></form></section></main>;
}
