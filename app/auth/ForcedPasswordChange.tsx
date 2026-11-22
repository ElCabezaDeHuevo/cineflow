"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { completeForcedPasswordChange } from "@/app/usuarios/actions";

export default function ForcedPasswordChange({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Incluye al menos una mayúscula, una minúscula y un número.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    try {
      await completeForcedPasswordChange(password);
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cambiar la contraseña.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#05060a]/90 p-4 backdrop-blur-xl">
      <section role="dialog" aria-modal="true" aria-labelledby="password-reset-title" className="w-full max-w-lg rounded-3xl border border-violet-300/25 bg-[#151620] p-7 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/15 text-xl text-violet-200">✦</span>
          <div><p className="text-xs font-semibold tracking-[0.2em] text-violet-300">CINEFLOW STUDIO</p><p className="text-xs text-gray-500">SEGURIDAD DE LA CUENTA</p></div>
        </div>
        <p className="text-sm font-medium text-violet-200">Restablecimiento obligatorio</p>
        <h1 id="password-reset-title" className="mt-2 text-2xl font-bold text-white">Crea tu nueva contraseña</h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">Por seguridad, el administrador solicitó restablecer tu acceso. Debes crear una contraseña nueva antes de continuar.</p>
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">{email}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm text-gray-300">Nueva contraseña
            <input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          <label className="block text-sm text-gray-300">Confirmar nueva contraseña
            <input type="password" autoComplete="new-password" required minLength={10} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          <p className="text-xs leading-5 text-gray-500">Usa al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60">{saving ? "Actualizando contraseña…" : "Guardar nueva contraseña"}</button>
        </form>
      </section>
    </div>
  );
}
