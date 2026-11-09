"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeFirstLoginIntroduction } from "./actions";

const introduction = [
  {
    title: "Proyectos",
    description:
      "Consulta las producciones del equipo y abre un proyecto para ver su seguimiento.",
  },
  {
    title: "Etapas y archivos",
    description:
      "Las tareas se organizan por etapa. En cada tarea puedes revisar avances, capturas y archivos.",
  },
  {
    title: "Tu bitácora",
    description:
      "Revisa las tareas asignadas desde el panel. Registra tu jornada en Entradas y salidas para habilitar las acciones de trabajo.",
  },
];

export default function FirstLoginIntroduction({
  name,
}: {
  name: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finishIntroduction() {
    setSaving(true);
    setError(null);
    try {
      await completeFirstLoginIntroduction();
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la introducción. Inténtalo de nuevo.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-login-title"
        className="max-h-[min(90dvh,760px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-violet-400/30 bg-[#171821] p-5 shadow-2xl shadow-black/60 sm:p-7"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">
          Bienvenida a CineFlow
        </p>
        <h1 id="first-login-title" className="mt-2 text-2xl font-bold text-white">
          Hola, {name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          Esta es una guía rápida para empezar a trabajar con tu equipo.
        </p>
        <ol className="mt-5 space-y-3">
          {introduction.map((item, index) => (
            <li
              key={item.title}
              className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-sm font-bold text-violet-200">
                {index + 1}
              </span>
              <div>
                <h2 className="font-semibold text-white">{item.title}</h2>
                <p className="mt-1 text-sm leading-5 text-gray-400">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={finishIntroduction}
          disabled={saving}
          className="mt-5 min-h-11 w-full touch-manipulation rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Entendido, empezar"}
        </button>
      </section>
    </div>
  );
}
