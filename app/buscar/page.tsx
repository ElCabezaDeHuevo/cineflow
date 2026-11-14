import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchPageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/buscar");

  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 100);
  let projects: { id: string; name: string; type: string; stage: string }[] = [];
  let tasks: { id: string; project_id: string; title: string; stage: string; status: string }[] = [];
  let errorMessage = "";

  if (term.length >= 2) {
    const pattern = `%${term.replace(/[,%_]/g, " ").replace(/[()]/g, "")}%`;
    const [projectResult, taskResult] = await Promise.all([
      supabase.from("projects").select("id,name,type,stage").ilike("name", pattern).order("name").limit(30),
      supabase.from("project_tasks").select("id,project_id,title,stage,status").ilike("title", pattern).order("updated_at", { ascending: false }).limit(50),
    ]);
    if (projectResult.error || taskResult.error) {
      errorMessage = "No se pudieron completar algunas búsquedas. Comprueba tus permisos e inténtalo de nuevo.";
    } else {
      projects = projectResult.data ?? [];
      tasks = taskResult.data ?? [];
    }
  }

  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const { data: relatedProjects } = projectIds.length
    ? await supabase.from("projects").select("id,name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projectNames = new Map((relatedProjects ?? []).map((project) => [project.id, project.name]));

  return (
    <main className="min-h-screen bg-[#0b0c10] px-4 py-8 text-white md:px-8">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Panel principal</Link>
        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">CineFlow / Búsqueda</p>
          <h1 className="mt-2 text-3xl font-bold">Buscar en CineFlow</h1>
          <p className="mt-2 text-gray-400">Encuentra proyectos y tareas a los que tienes acceso.</p>
        </header>
        <form action="/buscar" className="flex flex-col gap-3 sm:flex-row">
          <input name="q" defaultValue={term} minLength={2} maxLength={100} placeholder="Nombre del proyecto o tarea…" className="min-h-12 flex-1 rounded-xl border border-white/10 bg-[#14151c] px-4 text-white outline-none focus:border-violet-400" />
          <button className="min-h-12 rounded-xl bg-violet-500 px-6 font-semibold hover:bg-violet-400">Buscar</button>
        </form>
        {errorMessage && <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{errorMessage}</p>}
        {term.length > 0 && term.length < 2 && <p className="mt-5 text-sm text-amber-200">Escribe al menos 2 caracteres.</p>}
        {term.length >= 2 && !errorMessage && (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
              <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Proyectos ({projects.length})</h2></div>
              {projects.length ? <ul className="divide-y divide-white/10">{projects.map((project) => <li key={project.id} className="p-4"><Link className="font-medium text-violet-200 hover:text-violet-100" href={`/proyectos/seguimiento/${project.id}`}>{project.name}</Link><p className="mt-1 text-xs text-gray-400">{project.type} · {project.stage}</p></li>)}</ul> : <p className="p-5 text-sm text-gray-500">No se encontraron proyectos.</p>}
            </section>
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14151c]">
              <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Tareas ({tasks.length})</h2></div>
              {tasks.length ? <ul className="divide-y divide-white/10">{tasks.map((task) => <li key={task.id} className="p-4"><Link className="font-medium text-violet-200 hover:text-violet-100" href={`/proyectos/seguimiento/${task.project_id}#task-${task.id}`}>{task.title}</Link><p className="mt-1 text-xs text-gray-400">{projectNames.get(task.project_id) ?? "Proyecto"} · {task.stage} · {task.status}</p></li>)}</ul> : <p className="p-5 text-sm text-gray-500">No se encontraron tareas.</p>}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
