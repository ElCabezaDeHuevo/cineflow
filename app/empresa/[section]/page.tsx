import CinematicRoleOptions from "@/lib/CinematicRoleOptions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ownerContext } from "@/lib/company-management";
import { CINE_ROLES } from "@/lib/cine-roles";
import { updateCompanyMemberRole, approveCompanyMemberCineRole, assignCompanyMemberCinematicPosition } from "../actions";
import { updateCompanyMemberEmail } from "../email-actions";
import InviteMemberForm from "../invite-member-form";

const sections = {
  miembros: ["Miembros y usuarios", "Directorio y estado de acceso de los integrantes."],
  roles: ["Roles y permisos", "Administra los niveles de acceso de tu equipo."],
  invitaciones: ["Invitaciones", "Invita colaboradores a tu productora."],
  solicitudes: ["Solicitudes", "Revisa las solicitudes pendientes del equipo."],
  puestos: ["Puestos cinematográficos", "Consulta las especialidades del equipo."],
  vigencia: ["Plan y vigencia", "Consulta el estado del servicio y los pagos."],
  configuracion: ["Configuración de empresa", "Consulta los datos generales de tu productora."],
} as const;
type Section = keyof typeof sections;
const fmt = (v?: string | null) => v ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Tijuana" }).format(new Date(v)) : "—";
const labels: Record<string,string> = { owner:"Dueño", admin:"Administrador", producer:"Productor", member:"Colaborador", viewer:"Solo lectura" };

export default async function CompanySectionPage({ params, searchParams }: { params: Promise<{section:string}>; searchParams: Promise<{organization_id?:string;error?:string;success?:string}> }) {
 const [{section:raw},query]=await Promise.all([params,searchParams]);
 if (!Object.prototype.hasOwnProperty.call(sections, raw)) notFound();
 const section=raw as Section;
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const {data:memberships}=await supabase.from("organization_members").select("organization_id,role").eq("user_id",user.id);
 const manageable=(memberships??[]).filter(m=>["owner","admin"].includes(m.role));
 const membership=query.organization_id?manageable.find(m=>m.organization_id===query.organization_id):manageable[0];
 if(!membership) redirect("/empresa");
 const admin=createSupabaseAdminClient(), owner=membership.role==="owner", orgId=membership.organization_id;
 await ownerContext(orgId, section === "vigencia" || section === "configuracion");
 const [{data:org},{data:members},{data:sub},{data:cinema},{data:payments}]=await Promise.all([
  supabase.from("organizations").select("id,name,slug,billing_email").eq("id",orgId).single(),
  owner&&admin?admin.from("organization_members").select("user_id,role,joined_at").eq("organization_id",orgId).order("joined_at"):supabase.from("organization_members").select("user_id,role,joined_at").eq("organization_id",orgId).order("joined_at"),
  supabase.from("subscriptions").select("status,billing_interval,trial_end,current_period_end").eq("organization_id",orgId).maybeSingle(),
  admin?admin.from("organization_member_cinematic_roles").select("user_id,requested_role,approved_role,status,requested_at").eq("organization_id",orgId):Promise.resolve({data:[]}),
  admin?admin.from("organization_manual_payments").select("amount_mxn,paid_at,billing_interval,payment_method").eq("organization_id",orgId).order("paid_at",{ascending:false}).limit(10):Promise.resolve({data:[]}),
 ]);
 const ids=(members??[]).map(m=>m.user_id);
 const [{data:profiles},authUsers]=await Promise.all([
  ids.length?(owner&&admin?admin.from("profiles").select("id,full_name").in("id",ids):supabase.from("profiles").select("id,full_name").in("id",ids)):Promise.resolve({data:[]}),
  admin && ["miembros","solicitudes","puestos"].includes(section)
    ? Promise.all([...new Set<string>(ids)].map(async id => (await admin.auth.admin.getUserById(id)).data.user))
    : Promise.resolve([]),
 ]);
 const profileMap=new Map((profiles??[]).map(p=>[p.id,p]));
 const emailMap=new Map(authUsers.filter(a=>a !== null).map(a=>[a.id,a.email]));
 const roleMap=new Map((cinema??[]).map(r=>[r.user_id,r]));
 const pending=(cinema??[]).filter(r=>r.status==="pending");
 const validUntil=sub?.status==="trialing"?sub.trial_end:(sub?.current_period_end??sub?.trial_end);
 const active=sub?.status==="trialing"?Boolean(sub.trial_end&&new Date(sub.trial_end)>new Date()):sub?.status==="active"&&Boolean(validUntil&&new Date(validUntil)>new Date());
 const status=active?(!sub?.current_period_end||sub?.status==="trialing"?"Prueba gratuita":"Servicio activo"):sub?.status==="paused"?"Servicio suspendido":sub?.status==="past_due"?"Pago pendiente":"Vencida";
 const links=Object.entries(sections).map(([key,value])=><Link key={key} href={`/empresa/${key}?organization_id=${orgId}`} className={`rounded-xl border px-3 py-2 text-xs ${key===section?"border-violet-300/40 bg-violet-400/15 text-violet-100":"border-white/10 bg-white/[.04] text-gray-300 hover:bg-white/10"}`}>{value[0]}</Link>);
 return <main className="cf-cinematic-page cf-bg-company min-h-screen bg-[#0b0c10] text-white"><section className="mx-auto max-w-6xl p-5 md:p-10">
  <div className="mb-6 flex flex-wrap gap-2"><Link href="/empresa" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-violet-200">← Resumen de empresa</Link>{links}</div>
  <header className="mb-8 rounded-3xl border border-white/10 bg-white/[.055] p-6 md:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Mi productora · {org?.name??"Empresa"}</p><h1 className="mt-3 text-3xl font-bold">{sections[section][0]}</h1><p className="mt-2 text-sm text-gray-400">{sections[section][1]}</p></header>
  {query.error&&<p role="alert" className="mb-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{query.error}</p>}
  {query.success&&<p role="status" className="mb-5 rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-200">{query.success}</p>}
  {section==="invitaciones"&&<InviteMemberForm organizationId={orgId} organizationName={org?.name??"tu productora"} disabled={!active}/>}
  {(section==="miembros"||section==="roles")&&<div className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">{members?.length??0} integrantes</h2><p className="mt-1 text-sm text-gray-400">Directorio de esta productora</p></div><div className="divide-y divide-white/10">{(members??[]).map(m=>{const p=profileMap.get(m.user_id),canEdit=m.role!=="owner"&&m.user_id!==user.id,canEditRole=canEdit&&(owner||m.role!=="admin");return <article key={m.user_id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{p?.full_name??"Integrante"}</p><p className="text-xs text-gray-400">{emailMap.get(m.user_id)??""}</p><span className="mt-2 inline-block rounded-full border border-white/10 px-3 py-1 text-xs">{labels[m.role]??m.role}</span></div>{section==="roles"&&canEditRole&&<form action={updateCompanyMemberRole} className="flex flex-wrap gap-2"><input type="hidden" name="organization_id" value={orgId}/><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role} className="rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs">{owner&&<option value="admin">Administrador</option>}<option value="producer">Productor</option><option value="member">Colaborador</option><option value="viewer">Solo lectura</option></select><button className="rounded-lg bg-violet-500/20 px-4 py-2 text-xs">Guardar rol</button></form>}{section==="miembros"&&canEdit&&(owner||m.role!=="admin")&&<details className="rounded-xl border border-white/10 bg-black/10 p-3"><summary className="cursor-pointer text-sm font-medium text-violet-200">Cambiar correo</summary><form action={updateCompanyMemberEmail} className="mt-3 grid gap-2"><input type="hidden" name="organization_id" value={orgId}/><input type="hidden" name="user_id" value={m.user_id}/><input name="new_email" type="email" required placeholder="Nuevo correo" className="min-w-0 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"/><input name="actor_password" type="password" required autoComplete="current-password" placeholder="Tu contraseña para autorizar" className="min-w-0 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"/><input name="confirmation" required placeholder="Escribe CAMBIAR CORREO" className="min-w-0 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm text-white"/><button className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white">Autorizar cambio de correo</button></form></details>}</article>})}</div></div>}
  {section==="solicitudes"&&<div className="space-y-4"><div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5"><p className="text-sm text-amber-100">Solicitudes pendientes</p><p className="mt-2 text-3xl font-bold">{pending.length}</p></div>{pending.length===0?<div className="rounded-2xl border border-white/10 bg-white/[.04] p-8 text-center text-gray-400">No hay solicitudes pendientes.</div>:pending.map(r=>{const p=profileMap.get(r.user_id),requested=CINE_ROLES.find(x=>x.value===r.requested_role);return <article key={r.user_id} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><h2 className="font-semibold">{p?.full_name??"Integrante"}</h2><p className="text-xs text-gray-400">{emailMap.get(r.user_id)??""}</p><p className="mt-2 text-sm text-violet-200">{requested?.label??r.requested_role} · {fmt(r.requested_at)}</p><form action={approveCompanyMemberCineRole} className="mt-4 flex flex-wrap gap-2"><input type="hidden" name="organization_id" value={orgId}/><input type="hidden" name="user_id" value={r.user_id}/><select name="cine_role" defaultValue={r.requested_role} className="min-w-48 flex-1 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm"><CinematicRoleOptions /></select><button name="decision" value="approved" className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm">Aprobar</button><button name="decision" value="rejected" className="rounded-lg border border-rose-400/20 px-4 py-2 text-sm">Rechazar</button></form></article>})}</div>}
  {section==="puestos"&&<div className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Puestos del equipo</h2><p className="mt-1 text-sm text-gray-400">Como dueño o administrador puedes asignar o cambiar directamente la especialidad cinematográfica de cada integrante.</p></div>{(members??[]).map(m=>{const r=roleMap.get(m.user_id),p=profileMap.get(m.user_id),job=CINE_ROLES.find(x=>x.value===r?.approved_role)||CINE_ROLES.find(x=>x.value===r?.requested_role);return <div key={m.user_id} className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{p?.full_name??"Integrante"}</p><p className="text-xs text-gray-400">{emailMap.get(m.user_id)??""}</p><p className="mt-1 text-sm text-violet-200">{job?.label??"Sin puesto asignado"} <span className="text-xs text-gray-500">· {r?.status??"Sin solicitud"}</span></p></div>{m.role==="owner"||m.user_id===user.id?<p className="text-xs text-gray-500">Tu cuenta y el dueño de la productora están protegidos.</p>:<form action={assignCompanyMemberCinematicPosition} className="flex flex-wrap gap-2"><input type="hidden" name="organization_id" value={orgId}/><input type="hidden" name="user_id" value={m.user_id}/><select name="cine_role" required defaultValue={r?.status==="approved"?r.approved_role:""} className="min-w-52 flex-1 rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-sm">{!job&&<option value="" disabled>Selecciona un puesto</option>}<CinematicRoleOptions /></select><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white">Asignar puesto</button></form>}</div>})}</div>}
  {section==="vigencia"&&<div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3">{[["Servicio",status],["Vigencia",fmt(validUntil)],["Facturación",sub?.billing_interval==="annual"?"Anual":"Mensual"]].map(([k,v])=><article key={k} className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><p className="text-sm text-gray-400">{k}</p><p className="mt-2 text-xl font-semibold">{v}</p></article>)}</div><div className="rounded-2xl border border-white/10 bg-[#14151c] p-5"><h2 className="font-semibold">Historial de pagos</h2>{(payments??[]).length===0?<p className="mt-3 text-sm text-gray-400">Sin pagos registrados.</p>:(payments??[]).map((pay,i)=><div key={i} className="flex justify-between gap-3 border-b border-white/10 py-4 text-sm"><span>{fmt(pay.paid_at)} · {pay.payment_method??"Método no indicado"}</span><strong>{new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(pay.amount_mxn))}</strong></div>)}</div></div>}
  {section==="configuracion"&&<div className="grid gap-4 sm:grid-cols-2">{[["Nombre",org?.name],["Correo de facturación",org?.billing_email],["Identificador",org?.id],["Slug",org?.slug]].map(([k,v])=><article key={k} className="rounded-2xl border border-white/10 bg-[#14151c] p-6"><p className="text-xs uppercase tracking-widest text-violet-300">{k}</p><p className="mt-2 break-all text-lg font-semibold">{v??"—"}</p></article>)}</div>}
 </section></main>;
}
