"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { submitErrorReport, type ErrorReportState } from "./error-reports/actions";

export default function ErrorReportButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mobile-error-report touch-manipulation rounded-full border border-rose-400/30 bg-[#14151c]/95 px-2 py-3 text-xs font-semibold text-rose-200 shadow-lg backdrop-blur transition hover:bg-rose-400/10 sm:pointer-events-auto sm:fixed sm:bottom-20 sm:right-5 sm:z-40 sm:px-3"
      >
        Reportar error
      </button>
      {isOpen &&
        createPortal(
          <ErrorReportDialog onClose={() => setIsOpen(false)} />,
          document.body,
        )}
    </>
  );
}

function ErrorReportDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    submitErrorReport,
    {} satisfies ErrorReportState,
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-report-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-rose-400/20 bg-[#171821] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">
              Ayuda de CineFlow
            </p>
            <h2 id="error-report-title" className="mt-2 text-2xl font-bold">
              Reportar un error
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Incluye una captura y explica qué ocurrió. La fecha y hora se
              guardan automáticamente.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>
        {state.success ? (
          <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {state.success}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 block rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-gray-950"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-5 space-y-4">
            {state.error && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
              >
                {state.error}
              </p>
            )}
            <label className="block text-sm text-gray-300">
              Título
              <input
                name="title"
                required
                maxLength={120}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-rose-300"
                placeholder="¿Qué problema encontraste?"
              />
            </label>
            <label className="block text-sm text-gray-300">
              Detalles
              <textarea
                name="details"
                required
                maxLength={5000}
                rows={4}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-rose-300"
                placeholder="Describe qué estabas haciendo y qué ocurrió."
              />
            </label>
            <label className="block text-sm text-gray-300">
              Captura de pantalla
              <input
                name="screenshot"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-rose-400/15 file:px-3 file:py-2 file:text-rose-200"
              />
              <span className="mt-1 block text-xs text-gray-500">
                JPG, PNG o WebP · máximo 5 MB
              </span>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-xl bg-rose-400 px-5 py-3 font-semibold text-gray-950 transition hover:bg-rose-300 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar reporte"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
