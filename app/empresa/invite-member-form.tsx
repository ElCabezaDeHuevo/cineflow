"use client";

import { useState, useTransition } from "react";
import { inviteCompanyMember } from "./actions";

type InviteResult = {
  ok: true;
  kind: "invitation";
  email: string;
  organizationName: string;
  inviteUrl: string;
} | {
  ok: true;
  kind: "existing";
  email: string;
  organizationName: string;
  loginUrl: string;
} | {
  ok: false;
  message: string;
};

export default function InviteMemberForm({
  organizationId,
  organizationName,
  disabled,
}: {
  organizationId: string;
  organizationName: string;
  disabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const response = await inviteCompanyMember(formData);
      setResult(response);
    });
  }

  const emailSubject = encodeURIComponent(`Invitación para unirte a ${organizationName} en CineFlow`);
  const invitationMailto = result?.ok && result.kind === "invitation"
    ? `mailto:${encodeURIComponent(result.email)}?subject=${emailSubject}&body=${encodeURIComponent(`Hola,

Te invito a unirte a ${organizationName} en CineFlow.

Abre este enlace para registrarte y aceptar la invitación:
${result.inviteUrl}

Este enlace es personal y caduca en 7 días.

¡Te esperamos!`)}`
    : null;
  const existingAccountMailto = result?.ok && result.kind === "existing"
    ? `mailto:${encodeURIComponent(result.email)}?subject=${emailSubject}&body=${encodeURIComponent(`Hola,

Ya tienes una cuenta de CineFlow. Para entrar a ${organizationName}, inicia sesión aquí:
${result.loginUrl}

Si no recuerdas tu contraseña, contacta al administrador de tu productora.

¡Te esperamos!`)}`
    : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
      <h2 className="text-lg font-semibold">Invitar colaborador</h2>
      <p className="mt-1 text-sm text-gray-400">Genera un enlace personal y envíalo desde tu propia aplicación de correo. CineFlow no enviará el correo por ti.</p>
      <form onSubmit={submit}>
        <input type="hidden" name="organization_id" value={organizationId} />
        <label className="mt-5 block text-sm text-gray-300">Correo electrónico
          <input name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-white" />
        </label>
        <label className="mt-4 block text-sm text-gray-300">Permiso
          <select name="role" value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-3 text-white">
            <option value="producer">Productor</option>
            <option value="member">Colaborador</option>
            <option value="viewer">Solo lectura</option>
          </select>
        </label>
        <button type="submit" disabled={disabled || pending} className="mt-5 w-full rounded-lg bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Generando enlace…" : "Generar invitación"}
        </button>
      </form>
      {result && !result.ok && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{result.message}</p>}
      {result?.ok && result.kind === "invitation" && invitationMailto && (
        <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
          <p className="font-semibold text-emerald-200">Invitación lista para enviar</p>
          <p className="mt-1 text-sm text-gray-300">El enlace es válido durante 7 días. Envíalo únicamente a {result.email}.</p>
          <label className="mt-3 block text-xs text-gray-400">Enlace personal de registro
            <textarea readOnly value={result.inviteUrl} rows={3} className="mt-2 w-full break-all rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigator.clipboard.writeText(result.inviteUrl)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Copiar enlace</button>
            <a href={invitationMailto} className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">Abrir aplicación de correo</a>
          </div>
        </div>
      )}
      {result?.ok && result.kind === "existing" && existingAccountMailto && (
        <div className="mt-5 rounded-xl border border-sky-400/25 bg-sky-400/5 p-4">
          <p className="font-semibold text-sky-200">Esta persona ya tiene una cuenta</p>
          <p className="mt-1 text-sm text-gray-300">Se agregó a {result.organizationName} con el permiso seleccionado. No necesita registrarse otra vez; debe iniciar sesión con {result.email}.</p>
          <label className="mt-3 block text-xs text-gray-400">Enlace para iniciar sesión
            <textarea readOnly value={result.loginUrl} rows={2} className="mt-2 w-full break-all rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
          </label>
          <a href={existingAccountMailto} className="mt-3 inline-flex rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">Abrir aplicación de correo</a>
        </div>
      )}
    </section>
  );
}
