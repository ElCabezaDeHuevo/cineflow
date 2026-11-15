"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { sendProjectMessage } from "../operations";

type Message = { id: string; sender_id: string; body: string; created_at: string };
type Member = { id: string; name: string };
export default function ProjectChat({ projectId, userId, initialMessages, members }: {
  projectId: string; userId: string; initialMessages: Message[]; members: Member[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [selected, setSelected] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const client = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  ), []);
  useEffect(() => {
    const channel = client.channel("project-chat-" + projectId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_messages", filter: "project_id=eq." + projectId }, (payload) => {
        const next = payload.new as Message;
        setMessages((current) => current.some((m) => m.id === next.id) ? current : [next, ...current]);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { void client.removeChannel(channel); };
  }, [client, projectId]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  return <section className="mb-8 rounded-2xl border border-white/10 bg-[#14151c] p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Chat del equipo</h2><p className="mt-1 text-sm text-gray-400">Mensajes en vivo y menciones a integrantes.</p></div>
      <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300">{connected ? "En vivo" : "Conectando…"} · {messages.length} mensajes</span>
    </div>
    <form action={sendProjectMessage} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="project_id" value={projectId}/>
      <input type="hidden" name="mentioned_user_ids" value={JSON.stringify(selected)}/>
      <textarea name="body" required maxLength={5000} rows={3} placeholder="Escribe un mensaje para el equipo..." className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"/>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-400">Mencionar:</label>
        <select value="" onChange={(e) => { if(e.target.value && !selected.includes(e.target.value)) setSelected([...selected,e.target.value]); }} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
          <option value="">Seleccionar integrante…</option>
          {members.filter(m => m.id !== userId && !selected.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {selected.map(id => <button type="button" key={id} onClick={() => setSelected(selected.filter(x => x !== id))} className="rounded-full bg-violet-500/20 px-3 py-1 text-xs text-violet-200"> @{names.get(id) ?? "integrante"} × </button>)}
        <button className="ml-auto rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold">Enviar mensaje</button>
      </div>
    </form>
    <div className="mt-5 max-h-96 space-y-3 overflow-y-auto">
      {messages.length ? messages.map(message => <article key={message.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{names.get(message.sender_id) ?? "Integrante"}</strong><time className="text-xs text-gray-500">{new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"}).format(new Date(message.created_at))}</time></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{message.body}</p>
      </article>) : <p className="text-sm text-gray-400">Todavía no hay mensajes. Inicia la conversación.</p>}
    </div>
  </section>;
}