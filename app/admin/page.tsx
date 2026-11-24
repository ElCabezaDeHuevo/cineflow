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
import { approveProjectDeletionRequest, rejectProjectDeletionRequest } from "@/app/proyectos/actions";

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

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: actionError, success: actionSuccess } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return (
      <main className="cf-cinematic-page cf-bg-admin min-h-screen bg-[#0b0c10] p-6 text-white md:p-10">
        <section className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm text-violet-300">
            ← Panel principal
          </Link>
          <p className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            Configura SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY en Vercel para cargar el panel de administración. Incluye Preview y Production, y vuelve a desplegar.
          </p>
        </section>
      </main>
    );
  }

  const [
    { data: reports, error: reportsError },
    { count: pendingAssignments, error: assignmentsError },
    { count: accountCount, error: accountsError },
    { data: deletionRequests, error: deletionRequestsError },
    { data: passwordAuditRows, error: passwordAuditError },
    { data: permanentDeletionRows, error: permanentDeletionError },
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
    admin.from("project_deletion_requests").select("id,project_id,project_name,requester_id,reason,created_at")
      .eq("status", "pending").order("created_at", { ascending: true }),
    admin.from("organization_audit_log")
      .select("id,organization_id,actor_id,action,target_id,metadata,created_at")
      .in("action", ["user_password_reset_requested", "user_password_changed_after_reset"])
      .order("created_at", { ascending: false }).limit(100),
    admin.from("cineflow_admin_account_audit")
      .select("id,actor_id,target_user_id,target_email,target_name,action,reason,metadata,created_at")
      .order("created_at", { ascending: false }).limit(100),
  ]);
  const userIds = [...new Set([
    ...(reports ?? []).map((report) => report.user_id),
    ...(deletionRequests ?? []).map((request) => request.requester_id),
    ...(passwordAuditRows ?? []).flatMap((row) => [row.actor_id, row.target_id]).filter(Boolean),
  ])];
  const { data: profiles, error: profilesError } = userIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", userIds)
    : { data: [], error: null };
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const auditOrganizationIds = [...new Set((passwordAuditRows ?? []).map((row) => row.organization_id))];
  const { data: auditOrganizations, error: auditOrganizationsError } = auditOrganizationIds.length
    ? await admin.from("organizations").select("id,name").in("id", auditOrganizationIds)
    : { data: [], error: null };
  const auditOrganizationNameById = new Map((auditOrganizations ?? []).map((organization) => [organization.id, organization.name]));
  const passwordResetHistory = new Map<string, {
    action: string;
    targetId: string;
    actorId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    organizationIds: string[];
  }>();
  for (const row of passwordAuditRows ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const eventTime = String(metadata.requested_at ?? metadata.completed_at ?? row.created_at);
    const key = [row.action, row.target_id ?? "", eventTime].join(":");
    const existing = passwordResetHistory.get(key);
    if (existing) existing.organizationIds.push(row.organization_id);
    else passwordResetHistory.set(key, {
      action: row.action,
      targetId: row.target_id ?? "",
      actorId: row.actor_id,
      metadata,
      createdAt: row.created_at,
      organizationIds: [row.organization_id],
    });
  }
  const passwordResetEvents = [...passwordResetHistory.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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
        {actionError && (
          <p role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            No se pudo completar la operación: {actionError}
          </p>
        )}
        {actionSuccess && (
          <p role="status" className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {actionSuccess}
          </p>
        )}
        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <Link href="/admin/productoras" className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-5 transition hover:bg-violet-400/15">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Control comercial</p>
            <h2 className="mt-2 text-xl font-semibold">Productoras y pagos</h2>
            <p className="mt-1 text-sm text-gray-400">Registrar empresas, asignar dueños, controlar pruebas, pagos y acceso.</p>
          </Link>
          <Link href="/usuarios" className="rounded-2xl border border-white/10 bg-[#14151c] p-5 transition hover:bg-white/5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Administración</p>
            <h2 className="mt-2 text-xl font-semibold">Cuentas de usuario</h2>
            <p className="mt-1 text-sm text-gray-400">Gestionar accesos técnicos y cuentas de la plataforma.</p>
          </Link>
        </section>
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

        <section className="mb-8 overflow-hidden rounded-2xl border border-rose-400/20 bg-[#14151c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Seguridad de cuentas</p>
              <h2 className="mt-1 text-xl font-semibold">Historial de eliminaciones permanentes</h2>
              <p className="mt-1 text-sm text-gray-400">Registro administrativo, motivo y respaldo conservado para restauración manual.</p>
            </div>
            <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-sm text-rose-100">{permanentDeletionRows?.length ?? 0} registros</span>
          </div>
          {permanentDeletionError ? (
            <p className="p-5 text-sm text-rose-200">No se pudo cargar el historial: {permanentDeletionError.message}</p>
          ) : permanentDeletionRows?.length ? (
            <div className="divide-y divide-white/10">
              {permanentDeletionRows.map((event) => {
                const metadata = (event.metadata ?? {}) as Record<string, unknown>;
                const status = String(metadata.status ?? "registrado");
                const statusLabel = status === "completed" ? "Eliminación completada" : status === "failed" ? "Eliminación fallida" : "Registro pendiente";
                const actorName = String(metadata.actor_name ?? "Administrador");
                return (
                  <article key={event.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{event.target_name || event.deleted_email || event.target_email || "Cuenta sin nombre"}</h3>
                        <span className={status === "completed" ? "rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200" : "rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100"}>{statusLabel}</span>
                      </div>
                      <p className="mt-1 break-all text-sm text-gray-400">{event.target_email || "Correo no disponible"}</p>
                      <p className="mt-2 text-sm text-gray-300">Realizado por <strong className="text-gray-100">{actorName}</strong></p>
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Motivo</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{event.reason || "No se indicó motivo."}</p>
                      </div>
                      {typeof metadata.failure === "string" ? <p className="mt-2 text-xs text-rose-200">Error: {metadata.failure}</p> : null}
                      <p className="mt-2 text-xs text-gray-500">ID de auditoría: {event.id}</p>
                    </div>
                    <div className="text-left text-xs text-gray-400 md:text-right">{dateTime(event.created_at)}</div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-gray-400">Todavía no hay eliminaciones permanentes registradas.</p>
          )}
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-amber-400/20 bg-[#14151c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-200">Seguridad de cuentas</p>
              <h2 className="mt-1 text-xl font-semibold">Historial de restablecimientos de contraseña</h2>
              <p className="mt-1 text-sm text-gray-400">Registro de solicitudes administrativas y cambios completados por los usuarios.</p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-100">{passwordResetEvents.length} eventos</span>
          </div>
          {passwordAuditError || auditOrganizationsError ? (
            <p className="p-5 text-sm text-rose-200">No se pudo cargar el historial: {passwordAuditError?.message ?? auditOrganizationsError?.message}</p>
          ) : passwordResetEvents.length ? (
            <div className="divide-y divide-white/10">
              {passwordResetEvents.map((event, index) => {
                const actor = event.actorId ? profileById.get(event.actorId) : null;
                const target = profileById.get(event.targetId);
                const isCompleted = event.action === "user_password_changed_after_reset";
                const email = String(event.metadata.email ?? "Correo no disponible");
                const orgNames = [...new Set(event.organizationIds.map((id) => auditOrganizationNameById.get(id) ?? "Productora"))];
                return (
                  <article key={event.action + event.targetId + event.createdAt + index} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{target?.full_name || email}</h3>
                        <span className={isCompleted ? "rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200" : "rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100"}>
                          {isCompleted ? "Contraseña cambiada" : "Restablecimiento solicitado"}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-sm text-gray-400">{email}</p>
                      <p className="mt-2 text-sm text-gray-300">
                        {isCompleted ? "Cambio completado por el usuario" : <>Solicitado por <strong className="font-semibold text-gray-100">{actor?.full_name || "Administrador"}</strong></>}
                      </p>
                      {!isCompleted && event.metadata.reason ? (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Motivo registrado</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{String(event.metadata.reason)}</p>
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-gray-500">Productora: {orgNames.join(" · ")}</p>
                    </div>
                    <div className="text-left text-xs text-gray-400 md:text-right">
                      <p>{dateTime(event.createdAt)}</p>
                      {event.metadata.requested_at ? <p className="mt-1">Solicitud: {dateTime(String(event.metadata.requested_at))}</p> : null}
                      {event.metadata.completed_at ? <p className="mt-1">Completado: {dateTime(String(event.metadata.completed_at))}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-gray-400">Todavía no hay restablecimientos de contraseña registrados.</p>
          )}
        </section>

        {(reportsError || assignmentsError || accountsError || profilesError || deletionRequestsError || passwordAuditError || auditOrganizationsError || permanentDeletionError) && (
          <p className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            No se pudo cargar toda la información:{" "}
            {reportsError?.message ??
              assignmentsError?.message ??
              accountsError?.message ??
              profilesError?.message ??
              deletionRequestsError?.message ??
              passwordAuditError?.message ??
              auditOrganizationsError?.message}
          </p>
        )}

        <section className="mb-8 overflow-hidden rounded-2xl border border-rose-400/20 bg-[#14151c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Revisión administrativa</p>
              <h2 className="mt-1 text-xl font-semibold">Solicitudes de eliminación de proyectos</h2>
              <p className="mt-1 text-sm text-gray-400">Solo se elimina un proyecto cuando un administrador aprueba la solicitud del propietario.</p>
            </div>
            <span className="rounded-full bg-rose-400/10 px-3 py-1 text-sm text-rose-200">{deletionRequests?.length ?? 0} pendientes</span>
          </div>
          {deletionRequestsError ? (
            <p className="p-5 text-sm text-rose-200">No se pudieron cargar las solicitudes: {deletionRequestsError.message}</p>
          ) : deletionRequests?.length ? (
            <div className="divide-y divide-white/10">
              {deletionRequests.map((request) => {
                const profile = profileById.get(request.requester_id);
                return (
                  <article key={request.id} className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{request.project_name}</h3>
                        <p className="mt-1 text-xs text-gray-400">Solicitado por {profile?.full_name || "Propietario"} · {dateTime(request.created_at)}</p>
                      </div>
                      <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Pendiente</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Motivo</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">{request.reason}</p>
                    </div>
                    <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" action={approveProjectDeletionRequest}>
                      <input type="hidden" name="request_id" value={request.id} />
                      <input name="admin_note" maxLength={1000} placeholder="Nota administrativa (opcional)" className="min-w-0 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" />
                      <button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400">Aprobar y eliminar proyecto</button>
                    </form>
                    <form action={rejectProjectDeletionRequest} className="flex flex-wrap gap-2">
                      <input type="hidden" name="request_id" value={request.id} />
                      <input name="admin_note" maxLength={1000} placeholder="Motivo del rechazo (opcional)" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" />
                      <button className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300 hover:bg-white/5">Rechazar solicitud</button>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-gray-400">No hay solicitudes de eliminación pendientes.</p>
          )}
        </section>

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
            href="/admin/horarios"
            className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5 transition hover:border-emerald-300/40"
          >
            <p className="text-sm text-emerald-200">Asistencia</p>
            <h2 className="mt-2 text-xl font-semibold">Control de horarios</h2>
            <p className="mt-2 text-sm text-gray-400">
              Corregir entradas y salidas, revisar cierres automáticos y ajustar horas por usuario.
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
