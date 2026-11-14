import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import { deleteWorkSession, markWorkSessionReviewed, updateWorkSession } from "./actions";

export const instant = false;

const localInput = (value: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Tijuana", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value)).replace(" ", "T");
};
const displayTime = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Tijuana", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
const statusLabel: Record<string, string> = {
  normal: "Normal", pending_review: "Pendiente por revisar", reviewed: "Revisada",
};

export default async function AdminWorkHoursPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY.");
  const [{ data: sessions, error }, { data: usersData }, params] = await Promise.all([
    admin.from("work_sessions").select("id,user_id,clock_in,clock_out,note,review_status,admin_note,reviewed_at,deleted_at,deleted_reason")
      .order("clock_in", { ascending: false }).limit(300),
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    searchParams,
  ]);
  if (error) throw new Error("No se pudieron cargar las jornadas: " + error.message);
  const users = usersData?.users ?? [];
  const ids = [...new Set((sessions ?? []).map(s => s.user_id))];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,full_name,avatar_url").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));
  const emailById = new Map(users.map(u => [u.id, u.email ?? "Sin correo"]));
  const pending = (sessions ?? []).filter(s => !s.deleted_at && s.review_status === "pending_review").length;
  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-5 md:p-10">
        <Link href="/admin" className="text-sm text-violet-300 hover:text-violet-200">← Panel de administración</Link>
        <header className="mb-7 mt-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">CineFlow / Asistencia</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Control de horarios</h1>
          <p className="mt-2 text-gray-400">Corrige entradas y salidas, ajusta horas por usuario y revisa cierres automáticos.</p>
        </header>
        {params.error && <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{params.error}</p>}
        {params.success && <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{params.success}</p>}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Jornadas cargadas</p><p className="mt-2 text-3xl font-bold">{sessions?.length ?? 0}</p></article>
          <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5"><p className="text-sm text-amber-200">Pendientes por revisar</p><p className="mt-2 text-3xl font-bold">{pending}</p></article>
          <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Usuarios registrados</p><p className="mt-2 text-3xl font-bold">{users.length}</p></article>
        </div>
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-5"><h2 className="text-xl font-semibold">Jornadas del equipo</h2><p className="mt-1 text-sm text-gray-400">Se muestran las últimas 300. Las horas se interpretan en la zona de Tijuana.</p></div>
          <div className="divide-y divide-white/10">
            {(sessions ?? []).map(session => {
              const profile = profileById.get(session.user_id);
              const name = profile?.full_name || emailById.get(session.user_id) || "Usuario";
              return (
                <article key={session.id} className="p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div><h3 className="font-semibold">{name}</h3><p className="text-xs text-gray-500">{emailById.get(session.user_id)} · Entrada {displayTime(session.clock_in)}</p></div>
                    <div className="flex flex-wrap gap-2"><span className={session.deleted_at ? "rounded-full bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-200" : session.review_status === "pending_review" ? "rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200" : session.review_status === "reviewed" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200" : "rounded-full bg-white/5 px-3 py-1 text-xs text-gray-300"}>{session.deleted_at ? "Eliminado" : statusLabel[session.review_status] ?? session.review_status}</span>{session.deleted_at && <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">Conservado en historial</span>}</div>
                  </div>
                  {!session.deleted_at && <form action={updateWorkSession} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <input type="hidden" name="session_id" value={session.id} />
                    <label className="text-xs text-gray-400">Entrada<input required type="datetime-local" name="clock_in" defaultValue={localInput(session.clock_in)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-gray-400">Salida (vacía = abierta)<input type="datetime-local" name="clock_out" defaultValue={localInput(session.clock_out)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-gray-400">Estado<select name="review_status" defaultValue={session.review_status ?? "normal"} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"><option value="normal">Normal</option><option value="pending_review">Pendiente por revisar</option><option value="reviewed">Revisada</option></select></label>
                    <label className="text-xs text-gray-400 md:col-span-2">Nota del usuario<input name="note" defaultValue={session.note ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-gray-400 md:col-span-2 xl:col-span-3">Nota administrativa<input name="admin_note" defaultValue={session.admin_note ?? ""} placeholder="Motivo de corrección o revisión" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                    <div className="flex items-end gap-2 xl:col-span-3">
                      <button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">Guardar corrección</button>
                      {session.review_status === "pending_review" && <button formAction={markWorkSessionReviewed} formNoValidate className="rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/10">Marcar revisada</button>}
                    </div>
                  </form>
                  <p className="mt-3 text-xs text-gray-500">Entrada: {displayTime(session.clock_in)} · Salida: {session.clock_out ? displayTime(session.clock_out) : "En curso"}{session.reviewed_at ? " · Revisada el " + displayTime(session.reviewed_at) : ""}</p>
                  {session.deleted_at ? <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">Eliminado el {displayTime(session.deleted_at)}. Motivo: {session.deleted_reason}</p> : (
                    <form action={deleteWorkSession} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="session_id" value={session.id} />
                      <label className="flex-1 text-xs text-gray-400">Razón obligatoria para eliminar<textarea required minLength={5} maxLength={1000} name="deleted_reason" rows={2} placeholder="Explica por qué debe marcarse como eliminado..." className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                      <button className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-400/10">Eliminar registro</button>
                    </form>
                  )}
                </article>
              );
            })}
            {!sessions?.length && <p className="p-8 text-center text-sm text-gray-400">Todavía no hay jornadas registradas.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
