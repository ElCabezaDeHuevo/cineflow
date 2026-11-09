"use client";

import Link from "next/link";
import { useState } from "react";

type TimelineProject = {
  id: string;
  name: string;
  type: string;
  description: string;
  stage: string;
  start_date: string | null;
  delivery_date: string | null;
  progress: number;
};

type SortOption = "date" | "type" | "progress";

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function stageTone(stage: string) {
  const value = stage.toLowerCase();
  if (value.includes("post"))
    return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  if (value.includes("producci") || value.includes("rodaje"))
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (value.includes("entrega"))
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

export default function TimelineProjects({
  projects,
}: {
  projects: TimelineProject[];
}) {
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const sortedProjects = [...projects].sort((a, b) => {
    if (sortBy === "type") {
      return (
        a.type.localeCompare(b.type, "es", { sensitivity: "base" }) ||
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
    }
    if (sortBy === "progress") {
      return (
        b.progress - a.progress ||
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
    }
    return (
      (a.start_date ?? "9999-12-31").localeCompare(
        b.start_date ?? "9999-12-31",
      ) || a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-6">
        <div>
          <h2 className="text-xl font-semibold">Calendario de proyectos</h2>
          <p className="mt-1 text-sm text-gray-400">
            Organiza tus proyectos según lo que necesites.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-gray-300">
          Organizar por
          <select
            value={sortBy}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "date" || value === "type" || value === "progress") {
                setSortBy(value);
              }
            }}
            className="rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-white outline-none focus:border-violet-400"
          >
            <option value="date">Fecha de inicio</option>
            <option value="type">Tipo</option>
            <option value="progress">Mayor avance</option>
          </select>
        </label>
      </div>
      {sortedProjects.length ? (
        <div className="divide-y divide-white/10">
          {sortedProjects.map((project) => (
            <Link
              key={project.id}
              href={`/proyectos/seguimiento/${project.id}`}
              className="grid gap-4 p-6 transition hover:bg-white/[0.03] md:grid-cols-[1.5fr_1fr_1fr_1fr_1.4fr] md:items-center"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-violet-300">
                  {project.type}
                </p>
                <h3 className="mt-1 font-semibold">{project.name}</h3>
                <p className="mt-1 text-sm text-gray-400">
                  {project.description || "Sin descripción"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Etapa
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs ${stageTone(project.stage)}`}
                >
                  {project.stage}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Inicio
                </p>
                <p className="mt-2 text-sm text-gray-200">
                  {formatDate(project.start_date)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Entrega
                </p>
                <p className="mt-2 text-sm text-gray-200">
                  {formatDate(project.delivery_date)}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Avance</span>
                  <span className="text-violet-200">{project.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Abrir seguimiento →
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center">
          <p className="text-gray-300">Todavía no tienes proyectos con fechas.</p>
          <Link
            href="/proyectos"
            className="mt-4 inline-flex rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold"
          >
            Crear el primer proyecto
          </Link>
        </div>
      )}
    </>
  );
}
