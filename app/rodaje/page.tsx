import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createFilmScene, createShootDay, scheduleFilmScene, unscheduleFilmScene } from "./actions";

export const instant = false;

const colorClass: Record<string,string> = {
  yellow: "border-amber-300/40 bg-amber-300/15",
  red: "border-rose-400/40 bg-rose-400/15",
  blue: "border-sky-400/40 bg-sky-400/15",
  green: "border-emerald-400/40 bg-emerald-400/15",
  white: "border-white/20 bg-white/5",
};

export default async function ShootingBoard({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rodaje");
  const { project: requestedProject } = await searchParams;
  const { data: memberships } = await supabase.from("project_members").select("project_id,role").eq("user_id",user.id);
  const projectIds = (memberships ?? []).map((m)=>m.project_id);
  const [{ data: projects }, { data: profile }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,name,stage").in("id",projectIds).order("name") : Promise.resolve({data:[] as {id:string;name:string;stage:string}[]}),
    supabase.from("profiles").select("full_name").eq("id",user.id).maybeSingle(),
  ]);
  const projectId = (projects ?? []).some((p)=>p.id===requestedProject) ? requestedProject! : projects?.[0]?.id;
  const selectedProject = (projects ?? []).find((p)=>p.id===projectId);
  const canEdit = (memberships ?? []).some((m)=>m.project_id===projectId && ["owner","editor"].includes(m.role));
  const [{ data: scenes, error: sceneError }, { data: days, error: dayError }] = projectId ? await Promise.all([
    supabase.from("film_scenes").select("id,project_id,scene_number,heading,int_ext,day_night,location,page_count,status,color_tag,notes").eq("project_id",projectId).order("scene_number"),
    supabase.from("shoot_days").select("id,project_id,shoot_day_number,shoot_date,call_time,wrap_time,location,notes").eq("project_id",projectId).order("shoot_day_number"),
  ]) : [{data:[],error:null},{data:[],error:null}];
  const { data: scheduled } = projectId && days?.length ? await supabase.from("shoot_day_scenes").select("shoot_day_id,scene_id,sort_order").in("shoot_day_id",days.map((d)=>d.id)).order("sort_order") : {data:[] as {shoot_day_id:string;scene_id:string;sort_order:number}[]};
  const sceneById = new Map((scenes ?? []).map((s)=>[s.id,s]));
  const scheduledIds = new Set((scheduled ?? []).map((s)=>s.scene_id));
  const unscheduled = (scenes ?? []).filter((s)=>!scheduledIds.has(s.id) && s.status!=="shot" && s.status!=="omitted");
  return (
    <main className="min-h-screen bg-[#0b0c10] px-4 py-7 text-white md:px-8">
      <section className="mx-auto max-w-[1600px]">
        <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="text-sm text-violet-300">← Panel principal</Link><Link href="/calendario" className="text-sm text-violet-300">Calendario general →</Link></div>
        <header className="my-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-violet-300">CineFlow / Producción</p><h1 className="mt-2 text-3xl font-bold">Planificador de rodaje</h1><p className="mt-2 text-sm text-gray-400">Escenas sin programar y jornadas de filmación por proyecto.</p></div>
        <form action="/rodaje" className="flex items-center gap-2"><label className="text-xs text-gray-400" htmlFor="project">Proyecto</label><select id="project" name="project" defaultValue={projectId ?? ""} className="rounded-lg border border-white/10 bg-[#171923] px-3 py-2 text-sm">{(projects ?? []).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold">Abrir</button></form></header>
        {!selectedProject ? <div className="rounded-2xl border border-white/10 bg-[#14151c] p-8 text-center"><p className="text-gray-300">Todavía no tienes proyectos disponibles.</p><Link href="/proyectos" className="mt-3 inline-flex text-violet-300">Crear o unirte a un proyecto →</Link></div> : <>
          {(sceneError || dayError) && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">No se pudo cargar toda la información del rodaje.</p>}
          <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
            <aside className="rounded-2xl border border-white/10 bg-[#171923] p-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Escenas sin programar</h2><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{unscheduled.length}</span></div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-400"><span>🟨 Amarilla</span><span>🟥 Riesgo</span><span>🟦 Día</span><span>🟩 Noche</span><span>⬜ Otra</span></div>
              {canEdit && <form action={createFilmScene} className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <input type="hidden" name="project_id" value={projectId}/>
                <p className="text-sm font-semibold">Añadir escena</p>
                <div className="grid grid-cols-2 gap-2"><input required name="scene_number" placeholder="N.º escena" className="min-w-0 rounded-lg bg-white/10 px-2 py-2 text-sm"/><select name="int_ext" className="rounded-lg bg-[#252735] px-2 py-2 text-sm"><option>INT</option><option>EXT</option><option>INT/EXT</option></select></div>
                <input required name="heading" placeholder="Encabezado de escena" className="w-full rounded-lg bg-white/10 px-2 py-2 text-sm"/>
                <div className="grid grid-cols-2 gap-2"><select name="day_night" className="rounded-lg bg-[#252735] px-2 py-2 text-sm"><option>DÍA</option><option>NOCHE</option><option>AMANECER</option><option>ATARDECER</option></select><input name="page_count" type="number" min="0" max="100" step=".125" placeholder="Páginas" className="min-w-0 rounded-lg bg-white/10 px-2 py-2 text-sm"/></div>
                <input name="location" placeholder="Locación" className="w-full rounded-lg bg-white/10 px-2 py-2 text-sm"/>
                <select name="color_tag" className="w-full rounded-lg bg-[#252735] px-2 py-2 text-sm"><option value="yellow">Amarilla</option><option value="red">Riesgo</option><option value="blue">Día</option><option value="green">Noche</option><option value="white">Otra</option></select>
                <button className="w-full rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold">Guardar escena</button>
              </form>}
              <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto">{unscheduled.map((scene)=><article key={scene.id} className={`rounded-xl border p-3 ${colorClass[scene.color_tag] ?? colorClass.white}`}><div className="flex items-center justify-between text-xs"><strong>Escena {scene.scene_number}</strong><span>{scene.page_count} pág.</span></div><p className="mt-1 text-sm font-medium">{scene.heading}</p><p className="mt-1 text-[11px] text-gray-400">{scene.int_ext} · {scene.day_night} · {scene.location || "Sin locación"}</p>{canEdit && (days ?? []).length>0 && <form action={scheduleFilmScene} className="mt-2 flex gap-2"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="scene_id" value={scene.id}/><select name="shoot_day_id" className="min-w-0 flex-1 rounded-lg bg-[#11131b] px-2 py-1 text-xs">{(days ?? []).map(d=><option key={d.id} value={d.id}>Rodaje {d.shoot_day_number}</option>)}</select><button className="rounded-md bg-violet-500 px-2 py-1 text-xs">Asignar</button></form>}</article>)}</div>
            </aside>
            <section className="min-w-0">
              {canEdit && <form action={createShootDay} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-[#171923] p-4"><input type="hidden" name="project_id" value={projectId}/><label className="text-xs text-gray-400">Jornada n.º<input required name="shoot_day_number" type="number" min="1" max="365" placeholder="1" className="mt-1 block w-24 rounded-lg bg-white/10 px-3 py-2 text-sm text-white"/></label><label className="text-xs text-gray-400">Fecha<input name="shoot_date" type="date" className="mt-1 block rounded-lg bg-white/10 px-3 py-2 text-sm text-white"/></label><label className="min-w-0 flex-1 text-xs text-gray-400">Locación<input name="location" placeholder="Locación principal" className="mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white"/></label><button className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black">+ Añadir jornada</button></form>}
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{(days ?? []).map(day=>{const dayScenes=(scheduled ?? []).filter(x=>x.shoot_day_id===day.id).map(x=>sceneById.get(x.scene_id)).filter(Boolean);const pages=dayScenes.reduce((sum,s)=>sum+(s?.page_count ?? 0),0);return <article key={day.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#171923]"><header className="border-b border-amber-300/20 bg-amber-300/10 p-3"><div className="flex items-center justify-between"><h3 className="font-semibold text-amber-200">Rodaje {day.shoot_day_number}</h3><span className="text-xs text-gray-400">{dayScenes.length} escenas</span></div><p className="mt-1 text-xs text-gray-400">{day.shoot_date || "Fecha pendiente"} · {day.location || "Locación pendiente"}</p><p className="mt-1 text-xs text-gray-500">{pages.toFixed(2)} páginas</p></header><div className="min-h-40 space-y-2 p-3">{dayScenes.map(scene=><div key={scene!.id} className={`rounded-lg border p-2 text-sm ${colorClass[scene!.color_tag] ?? colorClass.white}`}><div className="flex items-center justify-between"><strong>#{scene!.scene_number} · {scene!.heading}</strong><span className="text-xs">{scene!.page_count}p</span></div><p className="mt-1 text-[11px] text-gray-400">{scene!.int_ext} · {scene!.day_night}</p>{canEdit && <form action={unscheduleFilmScene} className="mt-2"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="shoot_day_id" value={day.id}/><input type="hidden" name="scene_id" value={scene!.id}/><button className="text-xs text-rose-300">Quitar de la jornada</button></form>}</div>)}{!dayScenes.length && <p className="py-10 text-center text-xs text-gray-500">▢ Sin escenas programadas</p>}</div></article>})}</div>
              {!days?.length && <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-gray-400">Añade tu primera jornada para comenzar a organizar las escenas.</div>}
            </section>
          </div>
        </>}
      </section>
    </main>
  );
}
