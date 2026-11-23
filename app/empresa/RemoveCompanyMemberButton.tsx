"use client";

import { useState, useTransition } from "react";
import { removeCompanyMember } from "./actions";

export default function RemoveCompanyMemberButton({
  organizationId,
  userId,
  memberName,
  disabled,
}: {
  organizationId: string;
  userId: string;
  memberName: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = new FormData();
    data.set("organization_id", organizationId);
    data.set("user_id", userId);
    data.set("confirmation", confirmation);
    data.set("owner_password", password);
    data.set("reason", reason);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await removeCompanyMember(data);
        setMessage(result.message || (result.ok ? "Baja completada." : "No se pudo completar la baja."));
        if (result.ok) {
          setOpen(false);
          setConfirmation("");
          setPassword("");
          setReason("");
          window.location.reload();
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ocurrió un error al confirmar la baja. Intenta de nuevo.");
      }
    });
  }

  return (
    <div className="w-full sm:w-auto">
      {!open ? (
        <button type="button" disabled={disabled} onClick={() => setOpen(true)}
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-40">
          Dar de baja
        </button>
      ) : (
        <div className="w-full min-w-0 space-y-3 rounded-xl border border-red-400/30 bg-red-950/20 p-4 sm:w-80">
          <p className="font-semibold text-red-100">Dar de baja a {memberName}</p>
          <p className="text-xs text-gray-300">Se retirará su acceso a esta empresa. Su cuenta, jornadas y actividad histórica se conservarán y podrán restaurarse.</p>
          <label className="block text-xs text-gray-300">Motivo de la baja
            <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={4} maxLength={300} rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-gray-300">Escribe ELIMINAR para confirmar
            <input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-gray-300">Confirma tu contraseña de dueño
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
          </label>
          {message && <p role="alert" className="text-xs text-red-200">{message}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pending || confirmation !== "ELIMINAR" || password.length === 0 || reason.trim().length < 4}
              onClick={submit} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40">
              {pending ? "Verificando…" : "Confirmar baja"}
            </button>
            <button type="button" disabled={pending} onClick={() => { setOpen(false); setMessage(""); setConfirmation(""); setPassword(""); setReason(""); }}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-200">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
