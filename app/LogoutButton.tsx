"use client";

import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useState } from "react";

export default function LogoutButton({ hasActiveSession = false }: { hasActiveSession?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mobile-logout rounded-xl border border-white/10 bg-[#14151c] px-2 py-3 text-xs font-semibold text-gray-200 shadow-lg transition hover:border-violet-400/50 hover:text-white sm:fixed sm:bottom-5 sm:right-5 sm:z-50 sm:px-4 sm:py-2 sm:text-sm"
      >
        <span className="sm:hidden">Salir</span>
        <span className="hidden sm:inline">Cerrar sesión</span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-title"
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171821] p-6 shadow-2xl shadow-black/50"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-violet-500/15 text-xl text-violet-200">
                ↗
              </div>
              <h2 id="logout-title" className="text-xl font-semibold text-white">
                ¿Cerrar sesión?
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                {hasActiveSession
                  ? "Tu salida se registrará automáticamente al cerrar sesión y quedará guardada en el historial."
                  : "Se cerrará tu sesión actual. No tienes una entrada abierta para registrar."}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-white/20 hover:text-white"
                >
                  Cancelar
                </button>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
                  >
                    Confirmar cierre
                  </button>
                </form>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
