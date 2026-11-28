import { getContext, json } from "../context";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const result = await context.client.from("work_sessions")
    .select("id,clock_in,clock_out,note,review_status,admin_note,deleted_at,deleted_reason")
    .eq("user_id", context.user.id)
    .order("clock_in", { ascending: false })
    .limit(100);
  if (result.error) return json({ error: "No se pudo cargar tu historial de jornadas." }, 503);
  return json({ sessions: result.data ?? [] });
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if (context instanceof Response) return context;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") return json({ error: "Acción inválida." }, 400);

  if (body.action === "clock-in") {
    const active = await context.client.from("work_sessions").select("id,clock_in")
      .eq("user_id", context.user.id).is("clock_out", null).is("deleted_at", null).maybeSingle();
    if (active.error) return json({ error: "No se pudo consultar tu jornada actual." }, 503);
    if (active.data) return json({ ok: true, session: active.data });
    const created = await context.client.from("work_sessions").insert({ user_id: context.user.id })
      .select("id,clock_in,clock_out,note,review_status,admin_note,deleted_at,deleted_reason").single();
    if (created.error) return json({ error: "No se pudo registrar tu entrada." }, 409);
    return json({ ok: true, session: created.data });
  }

  if (body.action === "clock-out") {
    if (!isUuid(body.id)) return json({ error: "Jornada inválida." }, 400);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    const updated = await context.client.from("work_sessions").update({
      clock_out: new Date().toISOString(), note,
    }).eq("id", body.id).eq("user_id", context.user.id)
      .is("clock_out", null).is("deleted_at", null)
      .select("id,clock_in,clock_out,note,review_status,admin_note,deleted_at,deleted_reason").maybeSingle();
    if (updated.error) return json({ error: "No se pudo registrar tu salida." }, 409);
    if (!updated.data) return json({ error: "No encontramos una jornada activa para cerrar." }, 404);
    return json({ ok: true, session: updated.data });
  }

  return json({ error: "Acción no disponible." }, 400);
}

