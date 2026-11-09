"use client";

import { deleteUser } from "./actions";

export default function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form action={deleteUser} onSubmit={(event) => {
      if (!window.confirm(`¿Eliminar la cuenta de ${email}? Esta acción no se puede deshacer.`)) event.preventDefault();
    }}>
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/10">Eliminar</button>
    </form>
  );
}
