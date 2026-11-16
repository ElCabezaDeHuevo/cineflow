"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeFirstLoginIntroduction } from "./actions";

const steps = [
  {
    eyebrow: "Organiza tu trabajo",
    title: "Tus proyectos, siempre a la mano",
    description: "Encuentra las producciones en las que participas, consulta sus etapas y entra al detalle para ver tareas, responsables y fechas de entrega.",
    icon: "🎬",
    action: "Ver proyectos",
    href: "/proyectos",
  },
  {
    eyebrow: "Colabora con tu equipo",
    title: "Avances y comunicación en contexto",
    description: "Cada proyecto reúne sus tareas, archivos y conversaciones. Comparte avances donde sucede el trabajo para que el equipo tenga la información clara.",
    icon: "🗂️",
    action: "Explorar el equipo",
    href: "/equipo",
  },
  {
    eyebrow: "Tu espacio de trabajo",
    title: "Empieza por lo que tienes pendiente",
    description: "Revisa tus asignaciones, consulta el calendario y actualiza tu perfil. Si tu productora utiliza el registro de jornada, podrás iniciar o cerrar tu jornada desde Horarios.",
    icon: "✨",
    action: "Ir a mi panel",
    href: "/",
  },
];

export default function FirstLoginIntroduction({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finishIntroduction() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await completeFirstLoginIntroduction();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar la introducción. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-[#05060a]/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md">
      <section role="dialog" aria-modal="true" aria-labelledby="first-login-title" className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#14151c] shadow-2xl shadow-black/60">
        <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-violet-500/20 via-[#171821] to-cyan-500/10 px-6 pb-7 pt-6 sm:px-8 sm:pt-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[.22em] text-violet-200">CINE<span className="text-white">FLOW</span> · PRIMEROS PASOS</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">{step + 1} de {steps.length}</span>
          </div>
          <div className="relative mt-7 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-3xl shadow-lg">{current.icon}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-200">{current.eyebrow}</p>
              <h1 id="first-login-title" className="mt-2 text-2xl font-bold leading-tight text-white sm:text-3xl">{step === 0 ? `¡Hola, ${name}!` : current.title}</h1>
              {step === 0 && <p className="mt-2 text-sm text-gray-300">{current.title}</p>}
            </div>
          </div>
          <div className="relative mt-7 flex gap-2" aria-label={`Paso ${step + 1} de ${steps.length}`}>
            {steps.map((item, index) => <div key={item.title} className={`h-1.5 flex-1 rounded-full transition-colors ${index <= step ? "bg-violet-300" : "bg-white/15"}`} />)}
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm leading-7 text-gray-300">{current.description}</p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Consejo</p>
            <p className="mt-2 text-sm leading-6 text-gray-300">{step === 0 ? "Abre un proyecto para ver su información, responsables, calendario y avance." : step === 1 ? "Mantén comentarios y archivos dentro del proyecto correspondiente para que todo el equipo encuentre el contexto." : "Puedes volver al panel cuando quieras. Tus permisos determinan las secciones y acciones que aparecen disponibles."}</p>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={finishIntroduction} disabled={saving} className="min-h-11 rounded-xl px-3 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50">Omitir guía</button>
            <div className="flex gap-2">
              {step > 0 && <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={saving} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5">Atrás</button>}
              {step < steps.length - 1 ? <button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} className="min-h-11 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 hover:bg-violet-400">Continuar</button> : <button type="button" onClick={finishIntroduction} disabled={saving} className="min-h-11 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 hover:bg-violet-400 disabled:opacity-60">{saving ? "Guardando…" : "Entrar a CineFlow"}</button>}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-gray-600">Puedes explorar la plataforma a tu ritmo. Esta guía solo aparece en tu primer acceso.</p>
        </div>
      </section>
    </div>
  );
}
