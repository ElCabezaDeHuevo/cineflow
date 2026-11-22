import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import { updateCompanyMemberRole } from "./actions";
import InviteMemberForm from "./invite-member-form";
import { listAllAuthUsers } from "@/lib/supabase/list-all-auth-users";

const fmt = (v?: string | null) => v ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Tijuana" }).format(new Date(v)) : "—";

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; organization_id?: string }> }) {
  const { error, success, organization_id: requestedOrganizationId } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", user.id);
  const manageableMemberships = (memberships ?? []).filter((m) => ["owner", "admin"].includes(m.role));
  const membership = requestedOrganizationId ? manageableMemberships.find((m) => m.organization_id === requestedOrganizationId) : manageableMemberships[0];
  if (!membership) redirect(manageableMemberships.length ? "/empresa?error=No+tienes+acceso+a+esa+productora" : "/");
  const { data: manageableOrganizations } = manageableMemberships.length ? await supabase.from("organizations").select("id,name").in("id", manageableMemberships.map((m) => m.organization_id)) : { data: [] };
  const organizationNameById = new Map((manageableOrganizations ?? []).map((item) => [item.id, item.name]));
  const [{ data: organization }, { data: members }, { data: subscription }] = await Promise.all([
    supabase.from("organizations").select("id,name,slug,billing_email").eq("id", membership.organization_id).single(),
    supabase.from("organization_members").select("user_id,role,joined_at").eq("organization_id", membership.organization_id).order("joined_at", { ascending: true }),
    supabase.from("subscriptions").select("status,billing_interval,trial_end,current_period_end,last_manual_payment_at").eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  const admin = createSupabaseAdminClient();
  const ids = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, authUsersResult, paymentResult] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id,full_name,avatar_url").in("id", ids) : Promise.resolve({ data: [] }),
    admin ? listAllAuthUsers(admin).then((users) => ({ users, error: null })).catch((error: unknown) => ({ users: [], error: error instanceof Error ? error : new Error("No se pudieron consultar todas las cuentas") })) : Promise.resolve({ users: [], error: null }),
    admin ? admin.from("organization_manual_payments").select("amount_mxn,paid_at,billing_interval,payment_method,reference").eq("organization_id", membership.organization_id).order("paid_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const emailMap = new Map(authUsersResult.users.map((a) => [a.id, a.email]));
  const roleLabel: Record<string,string> = { owner: "Dueño", admin: "Administrador", producer: "Productor", member: "Colaborador", viewer: "Solo lectura" };
  const latestPayment = paymentResult.data;
  const isOwner = membership.role === "owner";
  const status = subscription?.status ?? "Sin plan";
  const statusLabel = status === "trialing" ? "Prueba gratuita" : status === "active" ? "Servicio activo" : status === "paused" ? "Servicio suspendido" : status === "past_due" ? "Pago pendiente" : status;
  const validUntil = status === "trialing" ? subscription?.trial_end : subscription?.current_period_end;
  return (
    <main className="cf-cinematic-page cf-bg-admin min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-5xl p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300">← Volver a CineFlow</Link>
        <header className="mb-8 mt-7"><p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Espacio de empresa</p><h1 className="mt-2 text-3xl font-bold">{organization?.name ?? "Mi productora"}</h1><p className="mt-2 text-sm text-gray-400">Administra únicamente esta productora. Tu rol no concede acceso al panel técnico ni a otras empresas.</p><p className="mt-2 inline-flex rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">{isOwner ? "Dueño de productora" : "Administrador de empresa"}</p>{manageableMemberships.length > 1 && <form method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#14151c] p-4"><label className="min-w-0 flex-1 text-sm text-gray-300">Productora activa<select name="organization_id" defaultValue={membership.organization_id} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white">{manageableMemberships.map((item) => <option key={item.organization_id} value={item.organization_id}>{organizationNameById.get(item.organization_id) ?? "Productora"}</option>)}</select></label><button className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/25">Cambiar empresa</button></form>}</header>
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        {success && <p role="status" className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</p>}
        {authUsersResult.error && <p role="alert" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">No se pudieron cargar todos los correos del equipo. Actualiza la página o contacta soporte.</p>}
        <section className="mb-6 grid gap-3 sm:grid-cols-3"><Link href={`/empresa/informes?organization_id=${membership.organization_id}`} className="rounded-2xl border border-violet-400/25 bg-violet-500/10 p-5 transition hover:bg-violet-500/15"><p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Análisis de equipo</p><h2 className="mt-2 text-lg font-semibold">Informes de la productora</h2><p className="mt-1 text-sm text-gray-400">Horas, asistencia, jornadas activas, revisiones y avance de proyectos.</p></Link><Link href="/proyectos" className="rounded-2xl border border-white/10 bg-[#14151c] p-5 transition hover:bg-white/5"><p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Operación</p><h2 className="mt-2 text-lg font-semibold">Proyectos</h2><p className="mt-1 text-sm text-gray-400">Consulta y gestiona las producciones de tu empresa.</p></Link><div className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Equipo</p><h2 className="mt-2 text-lg font-semibold">Invitaciones y roles</h2><p className="mt-1 text-sm text-gray-400">Agrega integrantes y administra sus permisos desde esta página.</p></div></section>
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Servicio</p><p className="mt-2 text-xl font-semibold">{statusLabel}</p></article>
          <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Vigencia</p><p className="mt-2 text-xl font-semibold">{fmt(validUntil)}</p><p className="mt-1 text-xs text-gray-500">{subscription?.billing_interval === "annual" ? "Anual" : "Mensual"}</p></article>
          <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Integrantes</p><p className="mt-2 text-xl font-semibold">{members?.length ?? 0}</p></article>
        </section>
        <section className="mb-6 rounded-2xl border border-white/10 bg-[#14151c] p-5"><h2 className="font-semibold">Información de pagos</h2><p className="mt-1 text-sm text-gray-400">Consulta de solo lectura. Los pagos, planes y reactivaciones los gestiona el equipo de CineFlow.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-gray-500">Último pago</p><p className="mt-1 text-sm">{latestPayment ? fmt(latestPayment.paid_at) : "Sin pagos registrados"}</p></div><div><p className="text-xs text-gray-500">Importe</p><p className="mt-1 text-sm">{latestPayment ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(latestPayment.amount_mxn)) : "—"}</p></div><div><p className="text-xs text-gray-500">Método</p><p className="mt-1 text-sm">{latestPayment?.payment_method ?? "—"}</p></div></div></section>
        <section className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <InviteMemberForm organizationId={membership.organization_id} organizationName={organization?.name ?? "tu productora"} disabled={status === "paused" || status === "expired" || status === "canceled"} />
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
            <div className="border-b border-white/10 p-5"><h2 className="text-lg font-semibold">Mi equipo</h2><p className="mt-1 text-sm text-gray-400">Miembros de esta productora.</p></div>
            <div className="divide-y divide-white/10">{(members ?? []).map((m) => { const p = profileMap.get(m.user_id); const canEdit = m.role !== "owner" && m.user_id !== user.id; return <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{p?.full_name || "Integrante"}</p><p className="truncate text-xs text-gray-500">{emailMap.get(m.user_id) ?? ""}</p><span className="mt-1 inline-block rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">{roleLabel[m.role] ?? m.role}</span></div>{canEdit && <form action={updateCompanyMemberRole} className="flex flex-wrap items-center gap-2"><input type="hidden" name="organization_id" value={membership.organization_id}/><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role} className="rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs text-white"><option value="admin">Administrador</option><option value="producer">Productor</option><option value="member">Colaborador</option><option value="viewer">Solo lectura</option></select><button className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25">Guardar rol</button></form>}</div> })}</div>
          </section>
        </section>
        <p className="mt-6 text-xs text-gray-500">Para confirmar pagos, cambiar el plan o solicitar reactivación, contacta al soporte de CineFlow.</p>
      </section>
    </main>
  );
}
