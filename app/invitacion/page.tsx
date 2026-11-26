"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { acceptExistingInvitation } from "./actions";

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export default function InvitationPage() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const params = new URLSearchParams(hash.slice(1));
  const id = params.get("id");
  const token = params.get("token");
  return <main className="cf-login-page"><section className="cf-login-card cf-glass">
    <h1 className="text-2xl font-bold">Invitación a una productora</h1>
    <p className="my-4">Inicia sesión en CineFlow con el correo invitado. Después vuelve a abrir el enlace del mensaje para aceptar.</p>
    <Link href="/login" className="text-violet-200 underline">Ir al inicio de sesión</Link>
    {id && token && <form action={acceptExistingInvitation} className="mt-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="token" value={token} />
      <button className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white">Aceptar con mi cuenta actual</button>
    </form>}
  </section></main>;
}
