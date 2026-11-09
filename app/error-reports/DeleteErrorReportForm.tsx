"use client";

import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { deleteErrorReport } from "./actions";

const ReportDeletedContext = createContext<(() => void) | null>(null);

export function ErrorReportCard({ children }: { children: ReactNode }) {
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  return (
    <ReportDeletedContext.Provider value={() => setDeleted(true)}>
      <article className="p-5 sm:p-6">{children}</article>
    </ReportDeletedContext.Provider>
  );
}

export default function DeleteErrorReportForm({
  reportId,
  reportTitle,
}: {
  reportId: string;
  reportTitle: string;
}) {
  const router = useRouter();
  const markReportDeleted = useContext(ReportDeletedContext);
  if (!markReportDeleted) {
    throw new Error("DeleteErrorReportForm debe estar dentro de ErrorReportCard.");
  }

  function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `¿Eliminar permanentemente el reporte “${reportTitle}” y su captura?`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={async (formData) => {
        await deleteErrorReport(formData);
        markReportDeleted();
        router.refresh();
      }}
      onSubmit={confirmDeletion}
      className="m-0"
    >
      <input type="hidden" name="report_id" value={reportId} />
      <button className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/10">
        Eliminar
      </button>
    </form>
  );
}
