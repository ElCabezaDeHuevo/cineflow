"use client";
import { useActionState } from "react";
import type { ProjectFormState } from "./actions";
type Project = {
  id?: string;
  name: string;
  type: string;
  stage: string;
  owner_role: string;
  start_date: string;
  delivery_date: string;
  description: string;
};
type Action = (
  state: ProjectFormState,
  formData: FormData,
) => Promise<ProjectFormState>;
export default function ProjectForm({
  project,
  action,
}: {
  project?: Project;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (key: keyof Project) => project?.[key] ?? "";
  return (
    <form action={formAction} className="space-y-6" onSubmit={(event) => { if (project?.id && !window.confirm("¿Confirmas guardar los cambios de este proyecto?")) event.preventDefault(); }}>
      {project?.id && (
        <input type="hidden" name="project_id" value={project.id} />
      )}
      {state.error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          {state.success}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          name="name"
          label="Nombre"
          defaultValue={value("name")}
          error={state.fieldErrors?.name}
          required
        />
        <Field
          name="type"
          label="Tipo"
          defaultValue={value("type")}
          error={state.fieldErrors?.type}
          required
        />
        <Field
          name="stage"
          label="Etapa"
          defaultValue={value("stage")}
          error={state.fieldErrors?.stage}
          required
        />
        <Field
          name="owner_role"
          label="Responsable"
          defaultValue={value("owner_role")}
          error={state.fieldErrors?.owner_role}
          required
        />
        <Field
          name="start_date"
          label="Fecha de inicio"
          type="date"
          defaultValue={value("start_date")}
          error={state.fieldErrors?.start_date}
          required
        />
        <Field
          name="delivery_date"
          label="Fecha de entrega"
          type="date"
          defaultValue={value("delivery_date")}
          error={state.fieldErrors?.delivery_date}
          required
        />
      </div>
      <label className="block text-sm text-gray-300">
        Descripción
        <textarea
          name="description"
          defaultValue={value("description")}
          rows={4}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400"
        />
      </label>
      <label className="block text-sm text-gray-300">
        Foto de portada del proyecto
        <input name="cover" type="file" accept="image/*" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-300" />
        <span className="mt-1 block text-xs text-gray-500">Opcional. Se guardará en la galería del proyecto.</span>
      </label>
      <button
        disabled={pending}
        className="rounded-xl bg-violet-500 px-5 py-3 font-semibold transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
      >
        {pending
          ? "Guardando…"
          : project?.id
            ? "Guardar cambios"
            : "Crear proyecto"}
      </button>
    </form>
  );
}
function Field({
  name,
  label,
  type = "text",
  defaultValue,
  error,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-gray-300">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-violet-400"
      />
      {error && (
        <span className="mt-1 block text-xs text-red-300">{error}</span>
      )}
    </label>
  );
}
