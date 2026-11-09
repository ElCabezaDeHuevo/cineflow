"use client";

import { useState, type ReactNode } from "react";

type StageWindow = {
  name: string;
  taskCount: number;
  completedCount: number;
  mediaCount: number;
  fileCount: number;
  content: ReactNode;
};

export default function StageWindows({
  stages,
  initialStage,
}: {
  stages: StageWindow[];
  initialStage: string;
}) {
  const [selectedStage, setSelectedStage] = useState(
    stages.some((stage) => stage.name === initialStage)
      ? initialStage
      : stages[0]?.name ?? "",
  );
  const selectedWindow = stages.find((stage) => stage.name === selectedStage);

  return (
    <div className="mt-5">
      <div
        role="tablist"
        aria-label="Etapas del proyecto"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {stages.map((stage, index) => {
          const selected = stage.name === selectedStage;
          const tabId = `stage-tab-${index}`;
          return (
            <button
              key={stage.name}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`stage-panel-${index}`}
              onClick={() => setSelectedStage(stage.name)}
              className={`rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-violet-400 bg-violet-400/15 ring-1 ring-violet-400/40"
                  : "border-white/10 bg-white/[0.03] hover:border-violet-400/50 hover:bg-white/[0.06]"
              }`}
            >
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">
                  {stage.name}
                </span>
                {selected && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    Seleccionada
                  </span>
                )}
              </span>
              <span className="mt-2 block text-xs text-gray-400">
                {stage.taskCount} tareas · {stage.completedCount} completadas
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {stage.mediaCount} capturas · {stage.fileCount} archivos
              </span>
            </button>
          );
        })}
      </div>
      {selectedWindow && (
        <section
          id={`stage-panel-${stages.indexOf(selectedWindow)}`}
          role="tabpanel"
          aria-labelledby={`stage-tab-${stages.indexOf(selectedWindow)}`}
          className="rounded-xl border border-violet-400/30 bg-black/10 p-4"
        >
          <h3 className="mb-4 text-lg font-semibold text-violet-100">
            {selectedWindow.name}
          </h3>
          {selectedWindow.content}
        </section>
      )}
    </div>
  );
}
