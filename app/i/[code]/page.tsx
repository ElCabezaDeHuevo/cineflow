import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptExistingInvitation } from "@/app/invitacion/actions";

export const dynamic = "force-dynamic";

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function InvitationMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="cf-login-page">
      <section className="cf-login-card cf-glass">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="my-4 text-sm text-gray-300">{message}</p>
        <Link href="/login" className="text-violet-200 underline">Ir al inicio de sesión</Link>
      </section>
    </main>
  );
}

export default async function ShortInvitationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[0-9a-f]{32}$/i.test(code)) {
    return <InvitationMessage title="Enlace no válido" message="Solicita una invitación nueva a la productora." />;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return <InvitationMessage title="Servicio temporalmente no disponible" message="No se pudo verificar la invitación. Intenta de nuevo más tarde." />;
  }

  const codeHash = await sha256Hex(code);
  const { data: invitation, error } = await admin
    .from("organization_invitations")
    .select("id,organization_id,email,role,expires_at,accepted_at,token_hash,invite_kind,short_code_hash")
    .eq("short_code_hash", codeHash)
    .maybeSingle();

  if (error || !invitation || invitation.short_code_hash !== codeHash ||
      invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
    return <InvitationMessage title="Invitación vencida o utilizada" message="Solicita una invitación nueva a la productora." />;
  }

  if (invitation.invite_kind === "signup") {
    return (
      <main className="cf-login-page">
        <section className="cf-login-card cf-glass">
          <h1 className="text-2xl font-bold">Invitación para registrarte</h1>
          <p className="my-4 text-sm text-gray-300">
            Continúa para verificar tu correo y terminar tu registro. El enlace caduca en 7 días y solo puede usarse una vez.
          </p>
          <form action="/auth/confirm" method="get">
            <input type="hidden" name="short_code" value={code} />
            <button className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white">
              Continuar con la invitación
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (invitation.invite_kind !== "existing" || invitation.token_hash !== codeHash) {
    return <InvitationMessage title="Enlace no válido" message="Solicita una invitación nueva a la productora." />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return (
      <main className="cf-login-page">
        <section className="cf-login-card cf-glass">
          <h1 className="text-2xl font-bold">Invitación a una productora</h1>
          <p className="my-4 text-sm text-gray-300">
            Inicia sesión en CineFlow con el correo invitado y vuelve a abrir este enlace corto para aceptar.
          </p>
          <Link href="/login" className="text-violet-200 underline">Iniciar sesión</Link>
        </section>
      </main>
    );
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return <InvitationMessage title="Cuenta distinta" message="Inicia sesión con la cuenta que recibió la invitación y vuelve a abrir este enlace." />;
  }

  const { data: organization } = await admin.from("organizations")
    .select("name").eq("id", invitation.organization_id).maybeSingle();

  return (
    <main className="cf-login-page">
      <section className="cf-login-card cf-glass">
        <p className="cf-login-eyebrow">INVITACIÓN A {organization?.name ?? "CINEFLOW"}</p>
        <h1 className="mt-2 text-2xl font-bold">Únete a la productora</h1>
        <p className="my-4 text-sm text-gray-300">
          Confirma que esta es tu cuenta y acepta la invitación. El enlace caduca en 7 días y solo puede usarse una vez.
        </p>
        <form action={acceptExistingInvitation} className="mt-6">
          <input type="hidden" name="id" value={invitation.id} />
          <input type="hidden" name="token" value={code} />
          <button className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white">
            Aceptar invitación
          </button>
        </form>
      </section>
    </main>
  );
}
