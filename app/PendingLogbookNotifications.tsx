"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export type PendingLogbookTask = {
  id: string;
  title: string;
  stage: string;
  projectId: string;
  projectName: string;
};

export default function PendingLogbookNotifications({
  tasks,
  signInKey,
}: {
  tasks: PendingLogbookTask[];
  signInKey: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const storageKey = `cineflow:pending-logbook-seen:${signInKey}`;

  useEffect(() => {
    if (!tasks.length) return;
    let shouldOpen = true;
    try {
      shouldOpen = window.sessionStorage.getItem(storageKey) !== "seen";
    } catch (error) {
      console.warn("Session storage is unavailable for pending notifications:", error);
    }
    const timeout = window.setTimeout(() => setIsOpen(shouldOpen), 0);
    return () => window.clearTimeout(timeout);
  }, [storageKey, tasks.length]);

  function dismiss() {
    setIsOpen(false);
    try {
      window.sessionStorage.setItem(storageKey, "seen");
    } catch (error) {
      console.warn("Could not save pending notification state:", error);
    }
  }

  if (!tasks.length) return null;

  return (
    <>
      <section
        aria-labelledby="pending-logbook-title"
        className="mb-8 overflow-hidden rounded-xl border border-amber-400/30 bg-amber-400/[0.06]"
      >
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls="pending-logbook-list"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="flex min-h-11 w-full touch-manipulation items-center gap-3 px-4 py-3 text-left transition hover:bg-amber-400/[0.05]"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
          <span
            id="pending-logbook-title"
            className="min-w-0 flex-1 truncate text-sm font-medium text-amber-100"
          >
            {tasks.length} {tasks.length === 1 ? "pendiente" : "pendientes"} en tu bitácora
          </span>
          <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-200">
            {tasks.length}
          </span>
          <span
            aria-hidden="true"
            className={`text-xs text-amber-200 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          >
            ▼
          </span>
        </button>
        {isExpanded && (
          <div id="pending-logbook-list">
            <ul className="divide-y divide-white/10 border-t border-amber-400/15 px-4">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-100">
                      {task.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-400">
                      {task.projectName} · {task.stage}
                    </p>
                  </div>
                  <Link
                    href={`/proyectos/seguimiento/${task.projectId}#task-${task.id}`}
                    className="min-h-11 touch-manipulation rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/10"
                  >
                    Ver parte
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
            role="presentation"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="pending-logbook-dialog-title"
              className="max-h-[min(85dvh,700px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-amber-400/30 bg-[#171821] p-5 shadow-2xl shadow-black/60 sm:p-6"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
                Pendientes de la bitácora
              </p>
              <h2
                id="pending-logbook-dialog-title"
                className="mt-2 text-2xl font-bold text-white"
              >
                Esto te falta por atender
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Tienes {tasks.length} {tasks.length === 1 ? "parte pendiente" : "partes pendientes"} asignadas a tu cuenta.
              </p>
              <ul className="mt-5 space-y-3">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-white">
                        {task.title}
                      </p>
                      <p className="mt-1 break-words text-xs text-gray-400">
                        {task.projectName} · {task.stage}
                      </p>
                    </div>
                    <Link
                      href={`/proyectos/seguimiento/${task.projectId}#task-${task.id}`}
                      onClick={dismiss}
                      className="min-h-11 shrink-0 touch-manipulation rounded-lg bg-amber-400 px-3 py-3 text-xs font-bold text-gray-950 transition hover:bg-amber-300"
                    >
                      Revisar
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={dismiss}
                className="mt-5 min-h-11 w-full touch-manipulation rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/5"
              >
                Entendido
              </button>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
