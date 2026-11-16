import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import { createCompany, recordCompanyPayment, setCompanyAccess } from "./actions";
import ConfirmSubmit from "@/app/ConfirmSubmit";

const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Tijuana" }).format(new Date(value)) : "—";
const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export default async function CompaniesAdmin({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const { error, success } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCineflowAdmin(user)) redirect("/");
  const admin = createSupabaseAdminClient();
  if (!admin) return <main className="min-h-screen bg-[#0b0c10] p-8 text-white">Falta configurar SUPABASE_SERVICE_ROLE_KEY.</main>;
  const [{ data: companies, error: companiesError }, { data: accounts }, { data: subscriptions }, { data: payments }] = await Promise.all([
    admin.from("organizations").select("id,name,slug,created_at,billing_email,organization_members(user_id,role)").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("subscriptions").select("*").order("created_at", { ascending: false }),
    admin.from("organization_manual_payments").select("organization_id,amount_mxn,paid_at,billing_interval,payment_method,reference").order("paid_at", { ascending: false }),
  ]);
  const accountById = new Map((accounts?.users ?? []).map((x) => [x.id, x]));
  const subByOrg = new Map((subscriptions ?? []).map((x) => [x.organization_id, x]));
  const latestPaymentByOrg = new Map<string, { amount_mxn: number; paid_at: string; billing_interval: string; payment_method: string; reference: string | null }>();
  for (const payment of payments ?? []) if (!latestPaymentByOrg.has(payment.organization_id)) latestPaymentByOrg.set(payment.organization_id, payment);
  const activeCount = (subscriptions ?? []).filter((x) => x.status === "active" || x.status === "trialing").length;
  return (
    <main className="min-h-screen bg-[#0b0c10] text-white"><section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-10">
      <Link href="/admin" className="text-sm text-violet-300">← Panel técnico</Link>
      <header className="mb-8 mt-6 rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.12] to-[#14151c] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">CineFlow / Control global</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Productoras y pagos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Administra responsables, periodos de prueba, pagos y acceso de cada empresa.</p></header>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      {success && <p role="status" className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</p>}
      {companiesError && <p className="mb-5 rounded-xl border border-red-400/30 p-4 text-sm text-red-200">{companiesError.message}</p>}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Productoras</p><p className="mt-2 text-3xl font-bold">{companies?.length ?? 0}</p></article>
        <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Activas o en prueba</p><p className="mt-2 text-3xl font-bold">{activeCount}</p></article>
        <article className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">Cuentas disponibles</p><p className="mt-2 text-3xl font-bold">{accounts?.users.length ?? 0}</p></article>
      </div>
      <form action={createCompany} className="mb-8 grid gap-4 rounded-2xl border border-violet-400/20 bg-[#14151c] p-4 sm:p-6 sm:grid-cols-2 xl:grid-cols-3">
        <h2 className="text-lg font-semibold md:col-span-3">Registrar productora · 14 días de prueba</h2>
        <label className="block text-sm text-gray-300">Nombre de empresa<input name="name" required minLength={2} maxLength={120} placeholder="Ej. Horizonte Films" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-white" /></label>
        <label className="block text-sm text-gray-300">Cuenta del dueño<select name="owner_id" required defaultValue="" className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white"><option value="" disabled>Seleccionar usuario</option>{(accounts?.users ?? []).map((account) => <option key={account.id} value={account.id}>{account.email} · {String(account.user_metadata?.full_name ?? "Sin nombre")}</option>)}</select></label>
        <div className="flex flex-col gap-3 sm:col-span-2 xl:col-span-1"><label className="block flex-1 text-sm text-gray-300">Cobro<select name="billing_interval" className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white"><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label><button className="min-h-11 w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400">Crear empresa</button></div>
      </form>
      <section className="space-y-5">
        {(companies ?? []).map((company) => {
          const sub = subByOrg.get(company.id);
          const ownerMembership = (company.organization_members ?? []).find((m: { role: string }) => m.role === "owner");
          const owner = ownerMembership ? accountById.get(ownerMembership.user_id) : null;
          const latest = latestPaymentByOrg.get(company.id);
          const status = sub?.status ?? "sin_suscripcion";
          const statusLabel = status === "trialing" ? "Prueba gratuita" : status === "active" ? "Pagada / activa" : status === "paused" ? "Suspendida" : status === "past_due" ? "Pago pendiente" : status;
          return <article key={company.id} className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{company.name}</h2><p className="mt-1 text-sm text-gray-400">{owner?.email ?? "Sin dueño asignado"} · {company.slug}</p><p className="mt-1 text-xs text-gray-500">Alta: {dateLabel(company.created_at)}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs">{statusLabel}</span></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-gray-500">Fin de prueba</p><p className="mt-1 text-sm">{dateLabel(sub?.trial_end)}</p></div>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-gray-500">Vigencia pagada</p><p className="mt-1 text-sm">{dateLabel(sub?.current_period_end)}</p></div>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-gray-500">Último pago</p><p className="mt-1 text-sm">{latest ? money(Number(latest.amount_mxn)) + " · " + dateLabel(latest.paid_at) : "Sin pagos"}</p></div>
            </div>
            <div className="mt-5 grid gap-4">
              <form action={recordCompanyPayment} className="grid min-w-0 gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4 sm:grid-cols-2 xl:grid-cols-5">
                <input type="hidden" name="organization_id" value={company.id} />
                <label className="text-xs text-gray-400">Importe MXN<input name="amount_mxn" type="number" min="0" step="0.01" required placeholder="0.00" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                <label className="text-xs text-gray-400">Periodo<select name="billing_interval" defaultValue={sub?.billing_interval ?? "monthly"} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>
                <label className="text-xs text-gray-400">Método<select name="payment_method" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="deposito">Depósito</option><option value="otro">Otro</option></select></label>
                <label className="text-xs text-gray-400">Referencia<input name="reference" maxLength={160} placeholder="Folio / referencia" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white" /></label>
                <button className="min-h-10 w-full self-end rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400">Registrar pago</button>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4"><ConfirmSubmit action={setCompanyAccess} message={`¿Suspender el acceso de ${company.name}? Sus integrantes no podrán trabajar hasta reactivarlo.`}><input type="hidden" name="organization_id" value={company.id} /><input type="hidden" name="mode" value="suspend" /><button className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-200 hover:bg-rose-400/10">Suspender</button></ConfirmSubmit><ConfirmSubmit action={setCompanyAccess} message={`¿Reactivar el acceso de ${company.name}? Se habilitará nuevamente su espacio de trabajo.`}><input type="hidden" name="organization_id" value={company.id} /><input type="hidden" name="mode" value="reactivate" /><button className="rounded-lg border border-sky-400/30 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/10">Reactivar</button></ConfirmSubmit></div>
            </div>
          </article>;
        })}
        {!companies?.length && <p className="rounded-xl border border-white/10 p-8 text-center text-sm text-gray-400">Todavía no hay productoras registradas.</p>}
      </section>
    </section></main>
  );
}
