import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createScheduleItem, createExpense, markNotificationRead } from "./actions";

export const instant = false;

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const date = (s: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Tijuana" }).format(new Date(s));
const card = "rounded-2xl border border-white/10 bg-[#14151c] p-5";
const field = "w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0c10] px-3 py-2.5 text-sm text-white";
const button = "rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500";

export default async function ProductionCenter() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships, error: memberError } = await supabase.from("project_members").select("project_id,role").eq("user_id", user.id);
  if (memberError) throw new Error(memberError.message);
  const ids = (memberships ?? []).map(m => m.project_id);
  const editors = new Set((memberships ?? []).filter(m => ["owner","editor"].includes(m.role)).map(m => m.project_id));
  const [
    { data: projects },
    { data: tasks },
    { data: events },
    { data: expenses },
    { data: notifications },
    { data: activities },
  ] = await Promise.all([
    ids.length ? supabase.from("projects").select("id,name,stage,delivery_date").in("id",ids) : Promise.resolve({data:[]}),
    ids.length ? supabase.from("project_tasks").select("id,project_id,title,status,stage,assigned_to,due_date").in("project_id",ids) : Promise.resolve({data:[]}),
    ids.length ? supabase.from("project_schedule_items").select("id,project_id,title,description,starts_at,ends_at,location").in("project_id",ids).order("starts_at",{ascending:true}).limit(100) : Promise.resolve({data:[]}),
    ids.length ? supabase.from("project_expenses").select("id,project_id,concept,category,amount,spent_on").in("project_id",ids).order("spent_on",{ascending:false}).limit(200) : Promise.resolve({data:[]}),
    supabase.from("project_notifications").select("id,title,message,href,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30),
    ids.length ? supabase.from("project_activity").select("id,project_id,message,created_at").in("project_id",ids).order("created_at",{ascending:false}).limit(15) : Promise.resolve({data:[]}),
  ]);
  const names = new Map((projects ?? []).map(p => [p.id,p.name]));
  const completed = (tasks ?? []).filter(t => t.status === "completada").length;
  const overdue = (tasks ?? []).filter(t => t.due_date && t.status !== "completada" && t.due_date < new Date().toISOString().slice(0,10)).length;
  const total = (expenses ?? []).reduce((sum,e)=>sum+Number(e.amount),0);
  const unread = (notifications ?? []).filter(n=>!n.read_at).length;
  const myTasks = (tasks ?? []).filter(t=>t.assigned_to === user.id);
  const upcoming = (events ?? []).filter(e=>new Date(e.starts_at).getTime()>=Date.now()).slice(0,12);
  return <main className="cf-cinematic-page cf-bg-team min-h-screen bg-[#0b0c10] px-5 py-8 text-white md:px-10">
    <div className="mx-auto max-w-7xl space-y-8">
      <header><Link href="/" className="text-sm text-violet-300">← Inicio</Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-violet-300">CineFlow / Gestión integral</p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">Centro de producción</h1>
        <p className="mt-2 text-gray-400">Calendario, presupuesto, tareas, actividad y notificaciones de tus proyectos.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Proyectos",String(projects?.length ?? 0)],
          ["Partes completadas",`${completed}/${tasks?.length ?? 0}`],
          ["Partes atrasadas",String(overdue)],
          ["Gastos registrados",money(total)],
        ].map(([label,value])=><div key={label} className={card}><p className="text-xs text-gray-400">{label}</p><p className="mt-2 text-xl font-bold text-violet-200">{value}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-xl font-bold">Notificaciones {unread>0 && <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-1 text-sm text-rose-200">{unread} nuevas</span>}</h2>
          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
            {(notifications ?? []).length ? notifications?.map(n=><div key={n.id} className={`rounded-xl border p-3 ${n.read_at ? "border-white/10" : "border-violet-400/40 bg-violet-500/5"}`}>
              <p className="font-semibold">{n.title}</p><p className="mt-1 text-sm text-gray-300">{n.message}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400"><span>{date(n.created_at)}</span><div className="flex gap-3">{n.href?.startsWith("/") && !n.href.startsWith("//") && <Link href={n.href} className="text-violet-300">Ver</Link>}{!n.read_at && <form action={markNotificationRead}><input type="hidden" name="notification_id" value={n.id}/><button className="text-emerald-300">Marcar leída</button></form>}</div></div>
            </div>) : <p className="text-sm text-gray-400">No hay notificaciones por ahora.</p>}
          </div>
        </section>
        <section className={card}>
          <h2 className="text-xl font-bold">Mis partes</h2>
          <div className="mt-4 space-y-2">{myTasks.length ? myTasks.slice(0,15).map(t=><Link key={t.id} href={`/proyectos/seguimiento/${t.project_id}#task-${t.id}`} className="block rounded-xl border border-white/10 p-3 hover:border-violet-400/40"><p className="font-medium">{t.title}</p><p className="mt-1 text-xs text-gray-400">{names.get(t.project_id)} · {t.status}{t.due_date ? ` · Entrega ${t.due_date}` : ""}</p></Link>) : <p className="text-sm text-gray-400">No tienes partes asignadas.</p>}</div>
        </section>
        <section className={card}>
          <h2 className="text-xl font-bold">Calendario de producción</h2>
          <p className="mt-1 text-sm text-gray-400">Próximos eventos y llamados.</p>
          <div className="mt-4 space-y-2">{upcoming.length ? upcoming.map(e=><div key={e.id} className="rounded-xl border border-white/10 p-3"><p className="font-semibold">{e.title}</p><p className="text-sm text-violet-300">{date(e.starts_at)}</p><p className="text-xs text-gray-400">{names.get(e.project_id)}{e.location ? ` · ${e.location}` : ""}</p>{e.description && <p className="mt-1 text-sm text-gray-400">{e.description}</p>}</div>) : <p className="text-sm text-gray-400">Sin eventos próximos.</p>}</div>
          {editors.size>0 && <details className="mt-5 border-t border-white/10 pt-4"><summary className="cursor-pointer font-semibold text-violet-200">+ Programar evento</summary>
            <form action={createScheduleItem} className="mt-4 grid gap-3">
              <select name="project_id" required className={field}>{(projects ?? []).filter(p=>editors.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input name="title" required maxLength={150} placeholder="Nombre del evento" className={field}/>
              <label className="text-xs text-gray-300">Inicio<input name="starts_at" type="datetime-local" required className={field}/></label>
              <label className="text-xs text-gray-300">Fin (opcional)<input name="ends_at" type="datetime-local" className={field}/></label>
              <input name="location" placeholder="Locación" className={field}/>
              <textarea name="description" placeholder="Detalles" className={field} rows={2}/>
              <button className={button}>Guardar evento</button>
            </form>
          </details>}
        </section>
        <section className={card}>
          <h2 className="text-xl font-bold">Presupuesto y gastos</h2>
          <p className="mt-1 text-sm text-gray-400">Gastos registrados: {money(total)}</p>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{(expenses ?? []).length ? expenses?.map(e=><div key={e.id} className="flex justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p className="font-medium">{e.concept}</p><p className="text-xs text-gray-400">{names.get(e.project_id)} · {e.category} · {e.spent_on}</p></div><span className="shrink-0 text-sm font-semibold">{money(Number(e.amount))}</span></div>) : <p className="text-sm text-gray-400">Todavía no hay gastos registrados.</p>}</div>
          {editors.size>0 && <details className="mt-5 border-t border-white/10 pt-4"><summary className="cursor-pointer font-semibold text-violet-200">+ Registrar gasto</summary>
            <form action={createExpense} className="mt-4 grid gap-3">
              <select name="project_id" required className={field}>{(projects ?? []).filter(p=>editors.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input name="concept" required maxLength={150} placeholder="Concepto" className={field}/>
              <select name="category" className={field}>{["General","Equipo","Transporte","Alimentación","Locación","Personal","Postproducción"].map(c=><option key={c}>{c}</option>)}</select>
              <input name="amount" type="number" min="0" step="0.01" required placeholder="Importe MXN" className={field}/>
              <label className="text-xs text-gray-300">Fecha del gasto<input name="spent_on" type="date" className={field}/></label>
              <textarea name="notes" placeholder="Notas opcionales" className={field} rows={2}/>
              <button className={button}>Guardar gasto</button>
            </form>
          </details>}
        </section>
      </div>
      <section className={card}><h2 className="text-xl font-bold">Actividad reciente</h2><div className="mt-4 space-y-2">{(activities ?? []).length ? activities?.map(a=><div key={a.id} className="rounded-xl border border-white/10 p-3"><p className="text-sm">{a.message}</p><p className="mt-1 text-xs text-gray-400">{names.get(a.project_id)} · {date(a.created_at)}</p></div>) : <p className="text-sm text-gray-400">Sin movimientos recientes.</p>}</div></section>
      <nav className="flex flex-wrap gap-3 pb-10"><Link className={button} href="/proyectos">Proyectos y archivos</Link><Link className={button} href="/rodaje">Plan de rodaje</Link><Link className={button} href="/horarios">Mis jornadas</Link></nav>
    </div>
  </main>;
}
