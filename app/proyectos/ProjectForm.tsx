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
          label="Nombre del proyecto"
          defaultValue={value("name")}
          error={state.fieldErrors?.name}
          required
        />
        <SelectField
          name="type"
          label="Tipo de producción"
          defaultValue={value("type")}
          options={["Cortometraje", "Largometraje", "Serie", "Documental", "Videoclip", "Publicidad", "Contenido digital", "Otro"]}
          error={state.fieldErrors?.type}
        />
        <SelectField
          name="stage"
          label="Etapa actual"
          defaultValue={value("stage")}
          options={["Desarrollo", "Preproducción", "Producción", "Postproducción", "Distribución"]}
          error={state.fieldErrors?.stage}
        />
        <Field
          name="owner_role"
          label="Responsable del proyecto"
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
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-xs text-gray-400">
          <strong className="block text-sm text-gray-200">Inicio del proyecto</strong>
          Define cuándo comienza formalmente el trabajo de esta producción.
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-xs text-gray-400">
          <strong className="block text-sm text-gray-200">Fecha de entrega</strong>
          Se utiliza para organizar las próximas entregas del calendario.
        </div>
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
function SelectField({
  name,
  label,
  defaultValue,
  options,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: string[];
  error?: string;
}) {
  const choices = defaultValue && !options.includes(defaultValue)
    ? [defaultValue, ...options]
    : options;
  return (
    <label className="block text-sm text-gray-300">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        required
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#171b29] px-4 py-3 text-white outline-none focus:border-violet-400"
      >
        {!defaultValue && <option value="" disabled>Selecciona una opción</option>}
        {choices.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {error && <span className="mt-1 block text-xs text-red-300">{error}</span>}
    </label>
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
