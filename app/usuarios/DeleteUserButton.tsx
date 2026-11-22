"use client";

import { deleteUser } from "./actions";

export default function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form action={deleteUser} onSubmit={(event) => {
      if (!window.confirm(`¿Desactivar la cuenta de ${email}? Se bloqueará su acceso, pero se conservarán sus registros e historial.`)) event.preventDefault();
    }}>
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10">Desactivar cuenta</button>
    </form>
  );
}
