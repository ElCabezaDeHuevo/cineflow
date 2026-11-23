"use client";

import { useState, useTransition } from "react";
import { reactivateCompanyMember, suspendCompanyMember } from "./actions";

export default function CompanyMemberSuspensionButton({
  organizationId, userId, memberName, suspended, disabled,
}: {
  organizationId: string; userId: string; memberName: string; suspended: boolean; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const expected = suspended ? "REACTIVAR" : "SUSPENDER";

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
        const result = suspended ? await reactivateCompanyMember(data) : await suspendCompanyMember(data);
        setMessage(result.message || (result.ok ? "Operación completada." : "No se pudo completar la operación."));
        if (result.ok) window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ocurrió un error al confirmar la operación. Intenta de nuevo.");
      }
    });
  }

  return <div className="w-full sm:w-auto">
    {!open ? <button type="button" disabled={disabled} onClick={() => setOpen(true)}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${suspended ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20" : "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"}`}>
      {suspended ? "Reactivar acceso" : "Suspender acceso"}
    </button> : <div className="w-full min-w-0 space-y-3 rounded-xl border border-amber-400/30 bg-amber-950/20 p-4 sm:w-80">
      <p className="font-semibold text-amber-100">{suspended ? "Reactivar" : "Suspender"} a {memberName}</p>
      <p className="text-xs text-gray-300">{suspended ? "Se restaurará su acceso a esta empresa con el mismo rol. Su historial permanece intacto." : "Se bloqueará su acceso a esta empresa y sus proyectos. Su cuenta, rol, historial y acceso a otras empresas se conservarán."}</p>
      {!suspended && <label className="block text-xs text-gray-300">Motivo de la suspensión
        <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={4} maxLength={300} rows={2}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
      </label>}
      <label className="block text-xs text-gray-300">Escribe {expected} para confirmar
        <input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
      </label>
      <label className="block text-xs text-gray-300">Confirma tu contraseña de dueño
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white" />
      </label>
      {message && <p role="alert" className="text-xs text-red-200">{message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending || confirmation !== expected || !password || (!suspended && reason.trim().length < 4)}
          onClick={submit} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-40">
          {pending ? "Verificando…" : suspended ? "Confirmar reactivación" : "Confirmar suspensión"}
        </button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setMessage(""); setConfirmation(""); setPassword(""); setReason(""); }}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-200">Cancelar</button>
      </div>
    </div>}
  </div>;
}
