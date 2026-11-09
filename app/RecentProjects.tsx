"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useSyncExternalStore } from "react";
import {
  getRecentProjectIdsSnapshot,
  parseRecentProjectIds,
  subscribeToRecentProjects,
} from "@/lib/recent-projects";

type Project = {
  id: string;
  name: string;
  type: string;
  stage: string;
  progress: number;
  taskCount: number;
  coverUrl: string | null;
};

export default function RecentProjects({
  userId,
  projects,
  signedIn,
}: {
  userId: string | null;
  projects: Project[];
  signedIn: boolean;
}) {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToRecentProjects(userId, onStoreChange),
    [userId],
  );
  const getSnapshot = useCallback(
    () => getRecentProjectIdsSnapshot(userId),
    [userId],
  );
  const recentIdsSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "[]",
  );
  const recentIds = parseRecentProjectIds(recentIdsSnapshot);

  const recentOrder = new Map(recentIds.map((id, index) => [id, index]));
  const orderedProjects = [...projects]
    .sort((a, b) => {
      const aIndex = recentOrder.get(a.id);
      const bIndex = recentOrder.get(b.id);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return 0;
    })
    .slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {orderedProjects.map((project) => (
        <article
          key={project.id}
          className="cf-card cf-fade-up rounded-2xl border border-white/10 bg-[#14151c] p-5"
        >
          {project.coverUrl ? (
            <Image
              src={project.coverUrl}
              alt={`Portada de ${project.name}`}
              width={640}
              height={360}
              unoptimized
              className="cf-media mb-5 h-40 w-full rounded-xl object-cover sm:h-28"
            />
          ) : (
            <div className="mb-5 flex h-40 items-center justify-center rounded-xl bg-gradient-to-br from-violet-950 via-[#20202b] to-black text-4xl sm:h-28">
              🎬
            </div>
          )}
          <p className="text-xs uppercase tracking-wider text-violet-300">
            {project.type}
          </p>
          <h3 className="mt-2 text-lg font-semibold">{project.name}</h3>
          <p className="mt-1 text-sm text-gray-400">{project.stage}</p>
          <Link
            href={`/proyectos/seguimiento/${project.id}`}
            className="cf-action mt-4 inline-flex text-sm text-violet-300 hover:text-violet-200"
          >
            Ver seguimiento y bitácora →
          </Link>
          <div className="mt-5 flex justify-between text-sm">
            <span className="text-gray-400">Avance · {project.taskCount} tareas</span>
            <span>{project.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="cf-progress-fill h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </article>
      ))}
      {!orderedProjects.length && (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-gray-400 lg:col-span-3">
          {signedIn
            ? "Todavía no tienes proyectos. Crea uno para que aparezca aquí."
            : "Inicia sesión para ver los proyectos recientes de tu equipo."}
          {signedIn && (
            <Link
              href="/proyectos"
              className="ml-2 text-violet-300 hover:text-violet-200"
            >
              Crear proyecto →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
