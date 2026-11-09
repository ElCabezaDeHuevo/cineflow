import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import {
  updateErrorReportStatus,
} from "@/app/error-reports/actions";
import UserAvatar from "@/lib/UserAvatar";
import DeleteErrorReportForm, {
  ErrorReportCard,
} from "@/app/error-reports/DeleteErrorReportForm";

export const instant = false;

const reportStatusLabel: Record<string, string> = {
  open: "Nuevo",
  reviewing: "En revisión",
  resolved: "Resuelto",
};

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return (
      <main className="min-h-screen bg-[#0b0c10] p-6 text-white md:p-10">
        <section className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm text-violet-300">
            ← Panel principal
          </Link>
          <p className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            Falta configurar SUPABASE_SERVICE_ROLE_KEY para cargar el panel de
            administración.
          </p>
        </section>
      </main>
    );
  }

  const [
    { data: reports, error: reportsError },
    { count: pendingAssignments, error: assignmentsError },
    { count: accountCount, error: accountsError },
  ] = await Promise.all([
    admin
      .from("error_reports")
      .select("id,user_id,title,details,screenshot_path,admin_notes,admin_screenshot_path,status,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false }),
    admin
      .from("project_assignment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const userIds = [...new Set((reports ?? []).map((report) => report.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", userIds)
    : { data: [], error: null };
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const reportsWithScreenshots = await Promise.all(
    (reports ?? []).map(async (report) => {
      const [userShot, adminShot] = await Promise.all([
        admin.storage.from("error-report-screenshots").createSignedUrl(report.screenshot_path, 60 * 60),
        report.admin_screenshot_path
          ? admin.storage.from("error-report-screenshots").createSignedUrl(report.admin_screenshot_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
      ]);
      return {
        ...report,
        screenshotUrl: userShot.error ? null : userShot.data?.signedUrl ?? null,
        adminScreenshotUrl: adminShot.error ? null : adminShot.data?.signedUrl ?? null,
      };
    }),
  );
  const openCount = (reports ?? []).filter(
    (report) => report.status !== "resolved",
  ).length;

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-6xl p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
          ← Panel principal
        </Link>
        <header className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-300">
            CineFlow / Administración
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Panel de administración
          </h1>
          <p className="mt-2 text-gray-400">
            Cuentas, solicitudes y reportes en un solo lugar.
          </p>
        </header>

        {(reportsError || assignmentsError || accountsError || profilesError) && (
          <p className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            No se pudo cargar toda la información:{" "}
            {reportsError?.message ??
              assignmentsError?.message ??
              accountsError?.message ??
              profilesError?.message}
          </p>
        )}

        <section
          aria-label="Herramientas de administración"
          className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Link
            href="/usuarios"
            className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-5 transition hover:border-violet-300/40"
          >
            <p className="text-sm text-violet-200">Cuentas</p>
            <h2 className="mt-2 text-xl font-semibold">Gestionar usuarios</h2>
            <p className="mt-2 text-sm text-gray-400">
              Crear cuentas, cambiar permisos y administrar accesos.
            </p>
            <p className="mt-4 text-xs text-gray-500">
              {accountsError ? "No disponible" : `${accountCount ?? 0} cuentas`}
            </p>
          </Link>
          <Link
            href="/usuarios/solicitudes"
            className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5 transition hover:border-amber-300/40"
          >
            <p className="text-sm text-amber-200">Solicitudes</p>
            <h2 className="mt-2 text-xl font-semibold">Asignaciones</h2>
            <p className="mt-2 text-sm text-gray-400">
              Revisar las solicitudes pendientes de las tareas.
            </p>
            <p className="mt-4 text-xs text-amber-200">
              {pendingAssignments ?? 0} pendientes
            </p>
          </Link>
          <Link
            href="/proyectos"
            className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-5 transition hover:border-sky-300/40"
          >
            <p className="text-sm text-sky-200">Proyectos</p>
            <h2 className="mt-2 text-xl font-semibold">Accesos y equipos</h2>
            <p className="mt-2 text-sm text-gray-400">
              Consultar los proyectos y solicitudes de acceso.
            </p>
          </Link>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">
                Soporte
              </p>
              <h2 className="mt-1 text-xl font-semibold">Reportes de errores</h2>
              <p className="mt-1 text-sm text-gray-400">
                Reportes enviados por los usuarios con fecha y captura.
              </p>
            </div>
            <span className="rounded-full bg-rose-400/10 px-3 py-1 text-sm font-semibold text-rose-200">
              {openCount} por atender
            </span>
          </div>
          {reportsError ? (
            <p className="p-6 text-sm text-gray-400">
              No se pudieron consultar los reportes. Comprueba que ejecutaste{" "}
              <code>supabase/error_reports.sql</code>.
            </p>
          ) : reports?.length ? (
            <div className="divide-y divide-white/10">
              {reportsWithScreenshots.map((report) => {
                const profile = profileById.get(report.user_id);
                const name = profile?.full_name || "Usuario";
                return (
                  <ErrorReportCard key={report.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          name={name}
                          avatarUrl={profile?.avatar_url}
                        />
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">
                            {report.title}
                          </h3>
                          <p className="mt-1 text-xs text-gray-400">
                            {name} · {dateTime(report.created_at)}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">
                        {reportStatusLabel[report.status] ?? report.status}
                      </span>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                      {report.details}
                    </p>
                    {report.admin_notes ? (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                          Nota del administrador
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-amber-50">
                          {report.admin_notes}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {report.screenshotUrl ? (
                          <a
                            href={report.screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-violet-200 underline decoration-violet-400/40 underline-offset-4"
                          >
                            Ver captura del usuario
                          </a>
                        ) : (
                          <span className="text-xs text-amber-200">
                            Captura no disponible
                          </span>
                        )}
                        {report.adminScreenshotUrl ? (
                          <a
                            href={report.adminScreenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4"
                          >
                            Ver captura del admin
                          </a>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form
                          action={updateErrorReportStatus}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="report_id"
                            value={report.id}
                          />
                          <textarea
                            name="admin_notes"
                            defaultValue={report.admin_notes ?? ""}
                            rows={2}
                            placeholder="Añade una nota de seguimiento"
                            className="min-w-[220px] rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs text-white"
                          />
                          <input
                            type="file"
                            name="admin_screenshot"
                            accept="image/png,image/jpeg,image/webp"
                            className="max-w-[180px] rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs text-white file:mr-2 file:rounded file:border-0 file:bg-violet-500/20 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-violet-200"
                          />
                          <select
                            name="status"
                            defaultValue={report.status}
                            aria-label={`Estado del reporte ${report.title}`}
                            className="rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs text-white"
                          >
                            <option value="open">Nuevo</option>
                            <option value="reviewing">En revisión</option>
                            <option value="resolved">Resuelto</option>
                          </select>
                          <button className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-400/10">
                            Guardar
                          </button>
                        </form>
                        <DeleteErrorReportForm
                          reportId={report.id}
                          reportTitle={report.title}
                        />
                      </div>
                    </div>
                  </ErrorReportCard>
                );
              })}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-gray-400">
              Todavía no hay reportes de errores.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
