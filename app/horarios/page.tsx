import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clockIn, clockOut } from "./actions";

export const instant = false;

const formatTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "En curso";

const formatDuration = (milliseconds: number) => {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
};

export default async function HorariosPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const pageSize = 1000;
  const allSessions = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("work_sessions")
      .select("id,clock_in,clock_out,note")
      .eq("user_id", user.id)
      .order("clock_in", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`No se pudo cargar el historial de jornadas: ${error.message}`);
    }
    allSessions.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  const sessions = allSessions.slice(0, 100);
  const totalPersonalHours = allSessions.reduce(
    (total, session) =>
      session.clock_out
        ? total +
          Math.max(
            0,
            new Date(session.clock_out).getTime() -
              new Date(session.clock_in).getTime(),
          )
        : total,
    0,
  );
  const active = allSessions.find((session) => !session.clock_out);
  const latestPersonalSession = allSessions[0];
  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-7xl p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300">
          ← Panel principal
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-sm text-violet-300">CINEFLOW / JORNADAS</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Mi jornada</h1>
          <p className="mt-2 max-w-2xl text-gray-400">
            Registra tu entrada o salida y consulta únicamente tu historial de
            jornadas.
          </p>
        </header>
        <div className="mb-8 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-[#14151c] p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Estado de hoy
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${active ? "bg-emerald-400" : "bg-gray-500"}`}
                    aria-hidden="true"
                  />
                  <h2 className="text-2xl font-semibold">
                    {active ? "Estás en jornada" : "Aún no has checado"}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {active
                    ? `Entrada registrada ${formatTime(active.clock_in)}`
                    : "Registra tu entrada para comenzar tu jornada."}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-emerald-400/10 text-emerald-200" : "bg-white/5 text-gray-300"}`}
              >
                {active ? "En curso" : "Fuera de jornada"}
              </span>
            </div>
            {active ? (
              <form action={clockOut} className="mt-7 flex flex-col gap-3 sm:flex-row">
                <input type="hidden" name="session_id" value={active.id} />
                <label className="min-w-0 flex-1 text-sm text-gray-300">
                  Nota de salida <span className="text-gray-500">(opcional)</span>
                  <input
                    name="note"
                    placeholder="Agrega un detalle de tu jornada"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  />
                </label>
                <button className="self-end rounded-xl bg-rose-500 px-5 py-3 font-semibold text-white transition hover:bg-rose-400">
                  Checar salida
                </button>
              </form>
            ) : (
              <form action={clockIn} className="mt-7">
                <button className="w-full rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-[#07120d] transition hover:bg-emerald-300 sm:w-auto">
                  Checar entrada
                </button>
              </form>
            )}
          </section>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <article className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
              <p className="text-sm text-gray-400">Horas acumuladas</p>
              <p className="mt-3 text-3xl font-bold text-violet-200">
                {formatDuration(totalPersonalHours)}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                En jornadas completadas
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
              <p className="text-sm text-gray-400">Última jornada</p>
              <p className="mt-3 text-lg font-semibold">
                {latestPersonalSession
                  ? formatTime(latestPersonalSession.clock_in)
                  : "Sin registros"}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {allSessions.length}{" "}
                {allSessions.length === 1 ? "jornada" : "jornadas"}
              </p>
            </article>
          </section>
        </div>
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="border-b border-white/10 p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Mi historial de jornadas</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Aquí se muestran tus jornadas, sin mezclar los registros del
                  equipo. Incluye las últimas 100.
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {sessions.length} de {allSessions.length}
              </p>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {sessions.length > 0 ? (
              sessions.map((session) => {
                const duration = session.clock_out
                  ? formatDuration(
                      new Date(session.clock_out).getTime() -
                        new Date(session.clock_in).getTime(),
                    )
                  : "En curso";
                return (
                  <article
                    key={session.id}
                    className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] sm:items-center"
                  >
                    <p className="text-sm font-semibold text-gray-200">
                      {formatTime(session.clock_in)}
                    </p>
                    <div className="flex items-center justify-between gap-2 sm:block">
                      <p className="text-xs text-gray-500">Entrada</p>
                      <p className="text-sm text-gray-300">
                        {new Intl.DateTimeFormat("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(session.clock_in))}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:block">
                      <p className="text-xs text-gray-500">Salida</p>
                      <p className="text-sm text-gray-300">
                        {session.clock_out
                          ? new Intl.DateTimeFormat("es-MX", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(session.clock_out))
                          : "En curso"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:block">
                      <p className="text-xs text-gray-500">Duración</p>
                      <p className="text-sm font-medium text-gray-200">
                        {duration}
                      </p>
                    </div>
                    {session.note && (
                      <p className="text-xs text-gray-500 sm:col-span-4">
                        Nota: {session.note}
                      </p>
                    )}
                  </article>
                );
              })
            ) : (
              <p className="p-6 text-gray-400">
                Todavía no hay jornadas registradas.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
