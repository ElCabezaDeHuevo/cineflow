"use client";

import { useState } from "react";
import { deleteUserPermanently } from "./actions";

export default function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-w-[190px]">
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/10">
        Eliminar permanentemente
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby={`delete-title-${userId}`} className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#14151c] p-6 text-white shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Acción irreversible</p>
            <h2 id={`delete-title-${userId}`} className="mt-2 text-xl font-bold">Eliminar cuenta permanentemente</h2>
            <p className="mt-3 text-sm text-gray-300">Se borrará la cuenta de autenticación de <strong>{email}</strong>. Ya no podrá iniciar sesión. Los registros de auditoría de esta operación se conservarán, pero los datos vinculados a la cuenta que tengan borrado en cascada podrían desaparecer.</p>
            <form action={deleteUserPermanently} onSubmit={(event) => {
              if (emailConfirmation.trim().toLowerCase() !== email.toLowerCase() || confirmationPhrase !== "ELIMINAR PERMANENTEMENTE") {
                event.preventDefault();
                return;
              }
              if (!window.confirm(`PRIMERA CONFIRMACIÓN: ¿Confirmas eliminar permanentemente la cuenta ${email}? Esta acción no se puede deshacer.`)) {
                event.preventDefault();
                return;
              }
              setBusy(true);
            }} className="mt-5 space-y-4">
              <input type="hidden" name="user_id" value={userId} />
              <label className="block text-sm text-gray-300">Primera verificación: escribe el correo exacto
                <input name="email_confirmation" type="email" required autoComplete="off" value={emailConfirmation} onChange={(event) => setEmailConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white" />
              </label>
              <label className="block text-sm text-gray-300">Segunda verificación: escribe <strong className="text-rose-200">ELIMINAR PERMANENTEMENTE</strong>
                <input name="confirmation_phrase" required autoComplete="off" value={confirmationPhrase} onChange={(event) => setConfirmationPhrase(event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white" />
              </label>
              <label className="block text-sm text-gray-300">Motivo para el historial (opcional)
                <input name="reason" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white" />
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" disabled={busy} onClick={() => { setOpen(false); setEmailConfirmation(""); setConfirmationPhrase(""); setReason(""); }} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300">Cancelar</button>
                <button type="submit" disabled={busy || emailConfirmation.trim().toLowerCase() !== email.toLowerCase() || confirmationPhrase !== "ELIMINAR PERMANENTEMENTE"} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40">{busy ? "Eliminando…" : "Confirmar eliminación permanente"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
