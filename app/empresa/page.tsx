import { ownerContext } from "@/lib/company-management";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";


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
  const { admin } = await ownerContext(membership.organization_id, true);
  const isOwner = membership.role === "owner";
  const [{ data: organization }, crew, requests, suspensions] = await Promise.all([
    supabase.from("organizations").select("id,name").eq("id", membership.organization_id).single(),
    admin.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
    admin.from("organization_member_cinematic_roles").select("user_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "pending"),
    admin.from("organization_member_suspensions").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).is("reactivated_at", null),
  ]);
  const organizationQuery = "?organization_id=" + encodeURIComponent(membership.organization_id);
  return (
    <main id="resumen" className="cf-cinematic-page cf-bg-company min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-5xl p-6 md:p-10">
        <Link href="/" className="text-sm text-violet-300">← Volver a CineFlow</Link>
        <header className="mb-8 mt-7"><p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Espacio de empresa</p><h1 className="mt-2 text-3xl font-bold">{organization?.name ?? "Mi productora"}</h1><p className="mt-2 text-sm text-gray-400">Administra únicamente esta productora. Tu rol no concede acceso al panel técnico ni a otras empresas.</p><p className="mt-2 inline-flex rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">{isOwner ? "Dueño de productora" : "Administrador de empresa"}</p>{manageableMemberships.length > 1 && <form method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-[#14151c] p-4"><label className="min-w-0 flex-1 text-sm text-gray-300">Productora activa<select name="organization_id" defaultValue={membership.organization_id} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white">{manageableMemberships.map((item) => <option key={item.organization_id} value={item.organization_id}>{organizationNameById.get(item.organization_id) ?? "Productora"}</option>)}</select></label><button className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/25">Cambiar empresa</button></form>}</header>
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        {success && <p role="status" className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</p>}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Integrantes", result: crew, section: "miembros" },
            { label: "Puestos pendientes", result: requests, section: "solicitudes" },
            { label: "Suspensiones activas", result: suspensions, section: "miembros" },
          ].map(({ label, result, section }) => <Link key={label} href={`/empresa/${section}${organizationQuery}`} className="rounded-xl border border-white/10 p-4"><span className="block text-sm text-slate-300">{label}</span><strong className="mt-2 block text-2xl">{result.error ? "—" : result.count ?? "—"}</strong></Link>)}
        </div>
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/empresa/miembros", title: "Miembros y usuarios", detail: "Consulta integrantes y el estado de sus cuentas.", icon: "♙" },
            { href: "/empresa/roles", title: "Roles y permisos", detail: "Administra los niveles de acceso del equipo.", icon: "⚿" },
            { href: "/empresa/invitaciones", title: "Invitaciones", detail: "Invita colaboradores y genera enlaces de acceso.", icon: "✉" },
            { href: "/empresa/solicitudes", title: "Solicitudes", detail: "Revisa y responde las solicitudes pendientes.", icon: "☷" },
            { href: "/empresa/puestos", title: "Puestos cinematográficos", detail: "Consulta las especialidades del equipo.", icon: "▣" },
            { href: "/empresa/vigencia", title: "Plan y vigencia", detail: "Consulta el estado del servicio y los pagos.", icon: "◷" },
            { href: "/empresa/configuracion", title: "Configuración", detail: "Consulta los datos generales de tu productora.", icon: "⚙" },
          ].map((item) => <Link key={item.href} href={item.href + organizationQuery} className="group rounded-2xl border border-white/10 bg-white/[.055] p-5 transition hover:border-violet-300/30 hover:bg-violet-400/[.09]">
            <span className="text-xl text-violet-200" aria-hidden="true">{item.icon}</span>
            <h2 className="mt-3 font-semibold">{item.title}<span className="ml-2 text-violet-300">→</span></h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">{item.detail}</p>
          </Link>)}
        </section>
        <p className="mt-6 text-xs text-gray-500">Para confirmar pagos, cambiar el plan o solicitar reactivación, contacta al soporte de CineFlow.</p>
      </section>
    </main>
  );
}
