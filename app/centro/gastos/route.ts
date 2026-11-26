import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\t\r\n]|^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión", { status: 401 });
  const rows = [["Proyecto", "Fecha", "Categoría", "Concepto", "Importe MXN"].map(csvCell).join(",")];
  let after: string | undefined;
  for (;;) {
    let query = supabase.from("project_expenses")
      .select("id,spent_on,category,concept,amount,projects(name)").order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) return new Response("No se pudieron consultar los gastos.", { status: 503 });
    if (!data?.length) break;
    for (const expense of data) {
      const project = Array.isArray(expense.projects) ? expense.projects[0] : expense.projects;
      rows.push([project?.name, expense.spent_on, expense.category, expense.concept, expense.amount].map(csvCell).join(","));
    }
    after = data[data.length - 1].id;
    if (data.length < 500) break;
  }
  return new Response("\uFEFF" + rows.join("\r\n"), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="gastos-cineflow.csv"',
    "Cache-Control": "private, no-store",
  } });
}
