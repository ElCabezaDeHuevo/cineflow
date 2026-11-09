import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changePassword, updateProfile } from "./actions";

export const instant = false;

const formatDuration = (milliseconds: number) => {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, bio").eq("id", user.id).maybeSingle(),
    supabase.from("work_sessions").select("clock_in, clock_out").eq("user_id", user.id).order("clock_in", { ascending: false }),
  ]);

  const displayName: string = profile?.full_name || String(user.user_metadata?.full_name ?? "") || user.email?.split("@")[0] || "Usuario";
  const { error, success } = await searchParams;
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  const totalMilliseconds = (sessions ?? []).reduce((sum, session) => {
    if (!session.clock_out) return sum;
    return sum + (new Date(session.clock_out).getTime() - new Date(session.clock_in).getTime());
  }, 0);
  const totalSessions = (sessions ?? []).filter((session) => session.clock_out).length;
  const lastSession = (sessions ?? []).find((session) => session.clock_out)?.clock_out ?? null;
  const activeSession = (sessions ?? []).find((session) => !session.clock_out);

  return <main className="min-h-screen bg-[#0b0c10] text-white"><section className="mx-auto max-w-5xl p-6 md:p-10"><Link href="/" className="text-sm text-violet-300">← Panel principal</Link><header className="mb-8 mt-6"><p className="text-sm text-violet-300">CINEFLOW / PERFIL</p><h1 className="mt-2 text-4xl font-bold">Mi perfil</h1><p className="mt-2 text-gray-400">Administra tus datos básicos y la seguridad de tu cuenta.</p></header>{error && <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}{success && <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{success}</p>}<div className="grid gap-8 lg:grid-cols-[1fr_380px]"><section className="rounded-2xl border border-white/10 bg-[#14151c] p-6"><div className="mb-6 flex items-center gap-4">{profile?.avatar_url ? <Image src={profile.avatar_url} alt={`Foto de ${displayName}`} width={80} height={80} unoptimized className="h-20 w-20 rounded-full object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/20 text-xl font-bold text-violet-200">{initials}</div>}<div><h2 className="text-xl font-semibold">{displayName}</h2><p className="text-sm text-gray-400">{user.email}</p></div></div><form action={updateProfile} className="space-y-5"><label className="block text-sm text-gray-300">Nombre completo<input name="full_name" defaultValue={displayName} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><label className="block text-sm text-gray-300">URL de foto de perfil<input name="avatar_url" type="url" defaultValue={profile?.avatar_url ?? ""} placeholder="https://…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><label className="block text-sm text-gray-300">Biografía<textarea name="bio" defaultValue={profile?.bio ?? ""} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><button className="rounded-xl bg-violet-500 px-5 py-3 font-semibold hover:bg-violet-400">Guardar perfil</button></form></section><aside className="space-y-6"><section className="rounded-2xl border border-white/10 bg-[#14151c] p-6"><h2 className="text-xl font-semibold">Tus horas</h2>{sessionsError ? <p className="mt-3 text-sm text-red-200">No se pudo cargar tu historial de jornadas.</p> : <><div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/5 p-4"><p className="text-xs uppercase tracking-[0.2em] text-violet-200">Total acumulado</p><p className="mt-2 text-3xl font-bold text-violet-100">{formatDuration(totalMilliseconds)}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><p className="text-xs uppercase tracking-[0.2em] text-gray-400">Jornadas</p><p className="mt-2 text-xl font-semibold">{totalSessions}</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-4"><p className="text-xs uppercase tracking-[0.2em] text-gray-400">Estado</p><p className="mt-2 text-sm font-medium text-emerald-200">{activeSession ? "En jornada" : "Fuera de jornada"}</p></div></div>{lastSession && <p className="mt-4 text-sm text-gray-400">Última salida: {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastSession))}</p>}</> }</section><section className="rounded-2xl border border-white/10 bg-[#14151c] p-6"><h2 className="text-xl font-semibold">Cambiar contraseña</h2><p className="mt-2 text-sm text-gray-400">Usa al menos 8 caracteres.</p><form action={changePassword} className="mt-6 space-y-5"><label className="block text-sm text-gray-300">Nueva contraseña<input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><label className="block text-sm text-gray-300">Confirmar contraseña<input name="confirmation" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400" /></label><button className="rounded-xl border border-violet-400/50 px-5 py-3 font-semibold text-violet-200 hover:bg-violet-500/10">Actualizar contraseña</button></form></section></aside></div></section></main>;
}

