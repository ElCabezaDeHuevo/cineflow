import ConfirmSubmit from "../../ConfirmSubmit";
import UserAvatar from "@/lib/UserAvatar";
import {
  assignProjectMediaToTask,
  deleteProjectMedia,
  updateProjectMedia,
} from "../operations";
import ScreenshotLightbox from "./ScreenshotLightbox";

type ScreenshotCardProps = {
  id: string;
  projectId: string;
  publicUrl: string;
  caption: string | null;
  uploadedByName: string;
  uploadedByAvatar?: string | null;
  canEdit: boolean;
  taskOptions?: Array<{ id: string; title: string }>;
};

export default function ScreenshotCard({
  id,
  projectId,
  publicUrl,
  caption,
  uploadedByName,
  uploadedByAvatar,
  canEdit,
  taskOptions,
}: ScreenshotCardProps) {
  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <ScreenshotLightbox
        src={publicUrl}
        alt={caption || "Captura de la tarea"}
      />
      <figcaption className="p-3 text-xs text-gray-400">
        {canEdit && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <form
              action={updateProjectMedia}
              className="flex min-w-0 flex-1 flex-wrap gap-2"
            >
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="media_id" value={id} />
              <input
                name="caption"
                defaultValue={caption ?? ""}
                aria-label="Descripción de la captura"
                placeholder="Descripción de la captura"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
              />
              <input
                type="file"
                name="file"
                accept="image/*"
                aria-label="Reemplazar captura"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-gray-300"
              />
              <button className="rounded-lg border border-violet-400/40 px-3 py-2 text-xs text-violet-200">
                Guardar cambios
              </button>
            </form>
            <ConfirmSubmit
              action={deleteProjectMedia}
              message="¿Eliminar esta captura del proyecto? Esta acción no se puede deshacer."
              className="shrink-0"
            >
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="media_id" value={id} />
              <button className="rounded-lg border border-red-400/40 px-3 py-2 text-xs text-red-200">
                Eliminar
              </button>
            </ConfirmSubmit>
          </div>
        )}
        {caption && <span className="mb-2 block">{caption}</span>}
        {canEdit && taskOptions?.length ? (
          <form
            action={assignProjectMediaToTask}
            className="mb-3 flex flex-wrap gap-2"
          >
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="media_id" value={id} />
            <select
              name="task_id"
              required
              defaultValue=""
              aria-label="Asignar captura a una parte"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
            >
              <option value="" disabled>
                Asignar a una parte…
              </option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-violet-400/40 px-3 py-2 text-xs text-violet-200">
              Asociar
            </button>
          </form>
        ) : null}
        <span className="mt-2 flex items-center gap-2">
          <UserAvatar
            name={uploadedByName}
            avatarUrl={uploadedByAvatar}
            className="h-7 w-7"
          />
          {uploadedByName}
        </span>
      </figcaption>
    </figure>
  );
}
