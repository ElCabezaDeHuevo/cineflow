"use client";

import { useState } from "react";
import { permanentlyDeleteUser } from "./actions";

export default function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [phrase, setPhrase] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [reason, setReason] = useState("");

  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/10">
        Eliminar permanentemente
      </summary>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.closest("details")?.removeAttribute("open");
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`delete-title-${userId}`} className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#14151c] p-6 text-white shadow-2xl">
          <h2 id={`delete-title-${userId}`} className="text-xl font-bold text-rose-200">Eliminar cuenta permanentemente</h2>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            Se eliminará el acceso de <strong>{email}</strong>. La acción no se puede deshacer automáticamente.
            CineFlow conservará el registro administrativo y una copia de los datos de perfil y pertenencia para facilitar una restauración manual.
          </p>
          <form action={permanentlyDeleteUser} className="mt-5 space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <label className="block text-sm text-gray-300">
              Motivo de la eliminación
              <textarea name="reason" required minLength={4} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" rows={3} placeholder="Describe por qué se elimina esta cuenta." />
            </label>
            <label className="block text-sm text-gray-300">
              Escribe exactamente ELIMINAR
              <input name="confirmation_phrase" required value={phrase} onChange={(event) => setPhrase(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" autoComplete="off" />
            </label>
            <label className="block text-sm text-gray-300">
              Confirma el correo de la cuenta: {email}
              <input name="confirmation_email" type="email" required value={confirmedEmail} onChange={(event) => setConfirmedEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" autoComplete="off" />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300">Cancelar</button>
              <button type="submit" disabled={phrase !== "ELIMINAR" || confirmedEmail.trim().toLowerCase() !== email.trim().toLowerCase() || reason.trim().length < 4} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40">Confirmar eliminación</button>
            </div>
          </form>
        </section>
      </div>
    </details>
  );
}
