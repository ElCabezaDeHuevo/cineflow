"use client";

import { useState } from "react";
import { generateTemporaryPassword } from "./actions";

export default function PasswordResetControl({ userId }: { userId: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTemporaryPassword("");
    setEmail("");
    setCopied(false);
    if (reason.trim().length < 4) {
      setError("Escribe un motivo de al menos 4 caracteres.");
      return;
    }
    if (!window.confirm("Se cambiará inmediatamente la contraseña de esta cuenta y se cerrarán sus sesiones activas. ¿Continuar?")) return;
    setBusy(true);
    try {
      const result = await generateTemporaryPassword(userId, reason);
      if (result.error) setError(result.error);
      else {
        setTemporaryPassword(result.temporaryPassword ?? "");
        setEmail(result.email ?? "");
        setReason("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
  }

  return (
    <div className="flex min-w-[260px] flex-col gap-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} required minLength={4} placeholder="Motivo obligatorio" aria-label="Motivo del restablecimiento" className="w-40 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-gray-600" />
        <button type="submit" disabled={busy} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-300/20 disabled:opacity-50">{busy ? "Generando…" : "Generar contraseña"}</button>
      </form>
      {error && <p role="alert" className="max-w-sm text-xs text-rose-300">{error}</p>}
      {temporaryPassword && (
        <div className="max-w-md rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3">
          <p className="text-xs font-semibold text-emerald-200">Contraseña temporal generada para {email}</p>
          <p className="mt-1 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-sm text-white">{temporaryPassword}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={copyPassword} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#102018]">{copied ? "Copiada" : "Copiar contraseña"}</button>
            <span className="text-xs text-emerald-100/80">Se muestra solo ahora. El usuario deberá cambiarla al entrar.</span>
          </div>
        </div>
      )}
    </div>
  );
}
