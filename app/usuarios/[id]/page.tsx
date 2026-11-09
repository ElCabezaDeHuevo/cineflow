import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";
import UserAvatar from "@/lib/UserAvatar";
import { saveUserProfileNote } from "./actions";

export const instant = false;

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));

export default async function UserProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error, success } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const isAdmin = isCineflowAdmin(user);

  const admin = createSupabaseAdminClient();
  if (isAdmin && !admin) {
    return (
      <main className="min-h-screen bg-[#0b0c10] p-6 text-white md:p-10">
        <section className="mx-auto max-w-5xl">
          <Link href="/usuarios" className="text-sm text-violet-300">
            ← Volver a usuarios
          </Link>
          <p className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            Falta configurar SUPABASE_SERVICE_ROLE_KEY para ver perfiles de usuario.
          </p>
        </section>
      </main>
    );
  }

  const [{ data: profile, error: profileError }, targetUserResult, notesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, bio")
      .eq("id", id)
      .maybeSingle(),
    isAdmin && admin
      ? admin.auth.admin.getUserById(id)
      : Promise.resolve({ data: null, error: null }),
    isAdmin && admin
      ? admin
          .from("user_profile_notes")
          .select("id, user_id, author_id, note, screenshot_path, created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileError) {
    throw new Error(`No se pudo cargar el perfil: ${profileError.message}`);
  }
  if (!profile) notFound();

  const targetUser = targetUserResult.data?.user ?? null;
  const notes = notesResult.data ?? [];
  const notesError = notesResult.error;

  const authorIds = [...new Set(notes.map((note) => note.author_id))];
  const { data: authors } = isAdmin && admin && authorIds.length
    ? await admin.from("profiles").select("id, full_name, avatar_url").in("id", authorIds)
    : { data: [] };
  const authorById = new Map((authors ?? []).map((profileEntry) => [profileEntry.id, profileEntry]));

  const notesWithScreenshots = await Promise.all(
    notes.map(async (note) => {
      if (!admin) return { ...note, screenshotUrl: null };
      if (!note.screenshot_path) return { ...note, screenshotUrl: null };
      const { data, error } = await admin.storage
        .from("error-report-screenshots")
        .createSignedUrl(note.screenshot_path, 60 * 60);
      return { ...note, screenshotUrl: error ? null : data?.signedUrl ?? null };
    }),
  );

  const fullName = profile.full_name || targetUser?.user_metadata?.full_name || "Usuario";
  const avatarUrl = profile.avatar_url || targetUser?.user_metadata?.avatar_url || "";

  return (
    <main className="min-h-screen bg-[#0b0c10] text-white">
      <section className="mx-auto max-w-5xl p-6 md:p-10">
        <Link href="/equipo" className="text-sm text-violet-300 hover:text-violet-200">
          ← Volver al equipo
        </Link>
        <header className="mt-8 mb-8">
          <p className="text-sm text-violet-300">EQUIPO / PERFIL</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Perfil de {fullName}</h1>
          <p className="mt-2 text-gray-400">
            Información del perfil. Las notas y capturas de seguimiento solo están disponibles para administración.
          </p>
        </header>

        {error && (
          <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>
        )}
        {success && (
          <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{success}</p>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <div className="flex items-center gap-4">
              <UserAvatar name={fullName} avatarUrl={avatarUrl} className="h-20 w-20" />
              <div>
                <h2 className="text-2xl font-semibold">{fullName}</h2>
                {isAdmin && targetUser?.email && (
                  <p className="text-sm text-gray-400">{targetUser.email}</p>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Rol</p>
                <p className="mt-2 text-sm font-medium text-violet-200">
                  {targetUser?.user_metadata?.cine_role || "Miembro de CineFlow"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Biografía</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                  {profile?.bio || "Este usuario todavía no ha agregado una biografía."}
                </p>
              </div>
            </div>
          </section>

          {isAdmin && (
          <section className="rounded-2xl border border-white/10 bg-[#14151c] p-6">
            <h2 className="text-xl font-semibold">Notas y evidencias</h2>
            <p className="mt-1 text-sm text-gray-400">Estas observaciones no modifican el perfil del usuario.</p>

            <form action={saveUserProfileNote} className="mt-6 space-y-4">
              <input type="hidden" name="user_id" value={id} />
              <label className="block text-sm text-gray-300">
                Nota de seguimiento
                <textarea
                  name="note"
                  rows={4}
                  required
                  placeholder="Escribe una nota, revisión o comentario del usuario..."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Captura adjunta
                <input
                  type="file"
                  name="screenshot"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-2 block w-full rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-violet-500/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-violet-200"
                />
              </label>
              <button className="rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400">
                Guardar nota
              </button>
            </form>

            <div className="mt-8 space-y-4">
              {notesError ? (
                <p className="text-sm text-red-200">No se pudieron cargar las notas: {notesError.message}</p>
              ) : notesWithScreenshots.length ? (
                notesWithScreenshots.map((note) => {
                  const authorProfile = authorById.get(note.author_id);
                  const authorName = authorProfile?.full_name || "Administrador";
                  return (
                    <article key={note.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={authorName} avatarUrl={authorProfile?.avatar_url} className="h-9 w-9" />
                          <div>
                            <p className="text-sm font-medium">{authorName}</p>
                            <p className="text-xs text-gray-500">{formatDateTime(note.created_at)}</p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-200">{note.note}</p>
                      {note.screenshotUrl && (
                        <a
                          href={note.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-block text-sm font-semibold text-violet-200 underline decoration-violet-400/40 underline-offset-4"
                        >
                          Ver captura
                        </a>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-gray-400">
                  Todavía no hay notas para este usuario.
                </p>
              )}
            </div>
          </section>
          )}
        </div>
      </section>
    </main>
  );
}
