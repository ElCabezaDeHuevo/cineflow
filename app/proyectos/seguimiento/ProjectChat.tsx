"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase";
import { sendProjectMessage } from "../operations";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  reply_to: string | null;
};
type Member = { id: string; name: string };

const dateTime = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function ProjectChat({
  projectId,
  userId,
  initialMessages,
  members,
}: {
  projectId: string;
  userId: string;
  initialMessages: Message[];
  members: Member[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendNotice, setSendNotice] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMessages, setArchiveMessages] = useState<Message[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveHasMore, setArchiveHasMore] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const client = useMemo(() => createClient(), []);
  const archiveCutoff = useMemo(
    () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const nameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of members) names.set(member.id, member.name);
    return names;
  }, [members]);
  const messageById = useMemo(() => {
    const indexed = new Map<string, Message>();
    for (const message of [...messages, ...archiveMessages]) indexed.set(message.id, message);
    return indexed;
  }, [messages, archiveMessages]);

  useEffect(() => {
    const channel = client
      .channel("project-chat-" + projectId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_messages",
          filter: "project_id=eq." + projectId,
        },
        (payload) => {
          const next = payload.new as Message;
          setMessages((current) =>
            current.some((message) => message.id === next.id)
              ? current
              : [next, ...current].sort(
                  (left, right) =>
                    new Date(right.created_at).getTime() -
                    new Date(left.created_at).getTime(),
                ).slice(0, 60),
          );
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, projectId]);

  async function loadArchive() {
    if (archiveLoading) return;
    setArchiveLoading(true);
    setArchiveError("");
    const start = archiveMessages.length;
    const { data, error } = await client
      .from("project_messages")
      .select("id,sender_id,body,created_at,reply_to")
      .eq("project_id", projectId)
      .lt("created_at", archiveCutoff)
      .order("created_at", { ascending: false })
      .range(start, start + 49);
    if (error) {
      setArchiveError("No se pudo cargar el archivo. Intenta de nuevo.");
    } else {
      const existing = new Set(archiveMessages.map((message) => message.id));
      const next = (data ?? []).filter((message) => !existing.has(message.id)) as Message[];
      setArchiveMessages((current) => [...current, ...next]);
      setArchiveHasMore((data ?? []).length === 50);
    }
    setArchiveLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSending(true);
    setSendError("");
    setSendNotice("");
    try {
      await sendProjectMessage(new FormData(form));
      form.reset();
      setReplyTo(null);
      setSelectedMentions([]);
      setSendNotice("Mensaje enviado.");
      const { data } = await client
        .from("project_messages")
        .select("id,sender_id,body,created_at,reply_to")
        .eq("project_id", projectId)
        .gte("created_at", archiveCutoff)
        .order("created_at", { ascending: false })
        .limit(60);
      if (data) setMessages(data as Message[]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  const mentionableMembers = members.filter(
    (member) => member.id !== userId && !selectedMentions.includes(member.id),
  );

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#14151c] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Chat del proyecto</h2>
          <p className="mt-1 text-sm text-gray-400">
            Conversación en vivo con el equipo de esta producción.
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300" aria-live="polite">
          {connected ? "En vivo" : "Conectando…"} · {messages.length} recientes
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="reply_to" value={replyTo?.id ?? ""} />
        <input type="hidden" name="mentioned_user_ids" value={JSON.stringify(selectedMentions)} />
        {replyTo && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-violet-300/20 bg-violet-400/10 p-3">
            <p className="min-w-0 text-sm text-violet-100">
              <span className="block font-semibold">
                Respondiendo a {nameById.get(replyTo.sender_id) ?? "Integrante"}
              </span>
              <span className="mt-1 block truncate text-violet-100/70">{replyTo.body}</span>
            </p>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        )}
        <textarea
          name="body"
          required
          maxLength={5000}
          rows={3}
          placeholder={replyTo ? "Escribe tu respuesta…" : "Escribe un mensaje para el equipo…"}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-gray-500"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`project-chat-mention-${projectId}`} className="text-xs text-gray-400">
            Mencionar:
          </label>
          <select
            id={`project-chat-mention-${projectId}`}
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id && !selectedMentions.includes(id)) {
                setSelectedMentions((current) => [...current, id]);
              }
            }}
            className="max-w-full rounded-lg border border-white/10 bg-[#1b1c25] px-3 py-2 text-sm text-white"
          >
            <option value="">Seleccionar integrante…</option>
            {mentionableMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          {selectedMentions.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => setSelectedMentions((current) => current.filter((item) => item !== id))}
              className="rounded-full bg-violet-500/20 px-3 py-1 text-xs text-violet-200"
            >
              @{nameById.get(id) ?? "integrante"} ×
            </button>
          ))}
          <button
            disabled={sending}
            className="ml-auto rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
          >
            {sending ? "Enviando…" : replyTo ? "Enviar respuesta" : "Enviar mensaje"}
          </button>
        </div>
        {sendError && <p role="alert" className="text-sm text-rose-300">{sendError}</p>}
        {sendNotice && <p role="status" className="text-sm text-emerald-300">{sendNotice}</p>}
      </form>

      <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {messages.length ? messages.map((message) => {
          const parent = message.reply_to ? messageById.get(message.reply_to) : null;
          return (
            <article key={message.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
              {message.reply_to && (
                <p className="mb-2 border-l-2 border-violet-400/50 pl-2 text-xs text-gray-400">
                  Respuesta a {parent ? nameById.get(parent.sender_id) ?? "Integrante" : "un mensaje anterior"}
                  {parent ? <span className="ml-1 text-gray-500">· {parent.body.slice(0, 100)}</span> : null}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{nameById.get(message.sender_id) ?? "Integrante"}</strong>
                <time className="text-xs text-gray-500" dateTime={message.created_at}>
                  {dateTime.format(new Date(message.created_at))}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{message.body}</p>
              <button
                type="button"
                onClick={() => { setReplyTo(message); setSendNotice(""); }}
                className="mt-2 rounded-md px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-400/10 hover:text-violet-200"
              >
                Responder a {nameById.get(message.sender_id) ?? "Integrante"}
              </button>
            </article>
          );
        }) : (
          <p className="text-sm text-gray-400">No hay mensajes recientes. Inicia la conversación.</p>
        )}
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={async () => {
            const nextOpen = !archiveOpen;
            setArchiveOpen(nextOpen);
            if (nextOpen && !archiveMessages.length) await loadArchive();
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-400/10"
          aria-expanded={archiveOpen}
          disabled={archiveLoading}
        >
          {archiveOpen ? "Ocultar archivo" : "Consultar archivo de más de 90 días"}
        </button>
        {archiveOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-gray-500">
              Los mensajes antiguos se conservan aquí; no se eliminan. Se muestran los más recientes primero.
            </p>
            {archiveLoading && !archiveMessages.length && <p className="text-sm text-gray-400">Cargando archivo…</p>}
            {archiveError && <p role="alert" className="text-sm text-rose-300">{archiveError}</p>}
            {archiveMessages.map((message) => {
              const parent = message.reply_to ? messageById.get(message.reply_to) : null;
              return (
                <article key={message.id} className="rounded-xl border border-white/10 bg-black/10 p-3">
                  {message.reply_to && (
                    <p className="mb-2 border-l-2 border-violet-400/50 pl-2 text-xs text-gray-400">
                      Respuesta a {parent ? nameById.get(parent.sender_id) ?? "Integrante" : "un mensaje anterior"}
                      {parent ? <span className="ml-1 text-gray-500">· {parent.body.slice(0, 100)}</span> : null}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{nameById.get(message.sender_id) ?? "Integrante"}</strong>
                    <time className="text-xs text-gray-500" dateTime={message.created_at}>
                      {dateTime.format(new Date(message.created_at))}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{message.body}</p>
                  <button
                    type="button"
                    onClick={() => { setReplyTo(message); setSendNotice(""); }}
                    className="mt-2 rounded-md px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-400/10 hover:text-violet-200"
                  >
                    Responder a {nameById.get(message.sender_id) ?? "Integrante"}
                  </button>
                </article>
              );
            })}
            {!archiveLoading && !archiveError && !archiveMessages.length && (
              <p className="text-sm text-gray-400">Todavía no hay mensajes de más de 90 días.</p>
            )}
            {archiveHasMore && (
              <button
                type="button"
                disabled={archiveLoading}
                onClick={loadArchive}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50"
              >
                {archiveLoading ? "Cargando…" : "Cargar mensajes anteriores"}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
