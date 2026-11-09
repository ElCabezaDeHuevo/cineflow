"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCineflowAdmin } from "@/lib/admin";

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const screenshotExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ErrorReportState = {
  error?: string;
  success?: string;
};

export async function submitErrorReport(
  _: ErrorReportState,
  formData: FormData,
): Promise<ErrorReportState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Inicia sesión para enviar un reporte." };

  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const screenshot = formData.get("screenshot");
  if (!title || title.length > 120) {
    return { error: "Escribe un título de hasta 120 caracteres." };
  }
  if (!details || details.length > 5000) {
    return { error: "Escribe los detalles del error (máximo 5000 caracteres)." };
  }
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    return { error: "Adjunta una captura de pantalla." };
  }
  const extension = screenshotExtensions[screenshot.type];
  if (!extension || screenshot.size > MAX_SCREENSHOT_SIZE) {
    return {
      error: "La captura debe ser JPG, PNG o WebP y no superar 5 MB.",
    };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { error: "No está configurado el almacenamiento de reportes." };
  }

  const screenshotPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("error-report-screenshots")
    .upload(screenshotPath, await screenshot.arrayBuffer(), {
      contentType: screenshot.type,
      upsert: false,
    });
  if (uploadError) {
    return { error: `No se pudo guardar la captura: ${uploadError.message}` };
  }

  const { error: insertError } = await admin.from("error_reports").insert({
    user_id: user.id,
    title,
    details,
    screenshot_path: screenshotPath,
  });
  if (insertError) {
    const { error: cleanupError } = await admin.storage
      .from("error-report-screenshots")
      .remove([screenshotPath]);
    if (cleanupError) {
      console.error("Could not clean up failed error report screenshot:", cleanupError);
    }
    return { error: `No se pudo guardar el reporte: ${insertError.message}` };
  }

  revalidatePath("/admin");
  return { success: "Reporte enviado. Gracias por ayudarnos a mejorar CineFlow." };
}

export async function updateErrorReportStatus(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para revisar reportes.");
  if (!isCineflowAdmin(user)) {
    throw new Error("Solo administración puede actualizar reportes.");
  }

  const reportId = String(formData.get("report_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const adminNotes = String(formData.get("admin_notes") ?? "").trim();
  const adminScreenshot = formData.get("admin_screenshot");
  if (!reportId || !["open", "reviewing", "resolved"].includes(status)) {
    throw new Error("El reporte o su estado no es válido.");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo.");

  const { data: existingReport, error: lookupError } = await admin
    .from("error_reports")
    .select("id, admin_screenshot_path")
    .eq("id", reportId)
    .maybeSingle();
  if (lookupError) throw new Error(`No se pudo consultar el reporte: ${lookupError.message}`);
  if (!existingReport) throw new Error("No se encontró el reporte que intentaste actualizar.");

  let adminScreenshotPath = existingReport.admin_screenshot_path ?? null;
  if (adminScreenshot instanceof File && adminScreenshot.size > 0) {
    const extension = screenshotExtensions[adminScreenshot.type];
    if (!extension || adminScreenshot.size > MAX_SCREENSHOT_SIZE) {
      throw new Error("La captura del administrador debe ser JPG, PNG o WebP y no superar 5 MB.");
    }
    const nextPath = `admin/${reportId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("error-report-screenshots")
      .upload(nextPath, await adminScreenshot.arrayBuffer(), {
        contentType: adminScreenshot.type,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`No se pudo guardar la captura del administrador: ${uploadError.message}`);
    }
    adminScreenshotPath = nextPath;
    if (existingReport.admin_screenshot_path) {
      const { error: removeError } = await admin.storage
        .from("error-report-screenshots")
        .remove([existingReport.admin_screenshot_path]);
      if (removeError) {
        console.error("Could not remove previous admin screenshot:", removeError);
      }
    }
  }

  const { data: report, error } = await admin
    .from("error_reports")
    .update({
      status,
      reviewed_by: user.id,
      admin_notes: adminNotes,
      admin_screenshot_path: adminScreenshotPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo actualizar el reporte: ${error.message}`);
  if (!report) throw new Error("No se encontró el reporte que intentaste actualizar.");
  revalidatePath("/admin");
}

export async function deleteErrorReport(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para eliminar reportes.");
  if (!isCineflowAdmin(user)) {
    throw new Error("Solo administración puede eliminar reportes.");
  }

  const reportId = String(formData.get("report_id") ?? "");
  if (!reportId) throw new Error("El reporte seleccionado no es válido.");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Falta configurar el acceso administrativo.");

  const { data: report, error: lookupError } = await admin
    .from("error_reports")
    .select("id,screenshot_path")
    .eq("id", reportId)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`No se pudo encontrar el reporte: ${lookupError.message}`);
  }
  if (!report) throw new Error("El reporte ya no existe.");

  const { error: storageError } = await admin.storage
    .from("error-report-screenshots")
    .remove([report.screenshot_path]);
  if (storageError) {
    throw new Error(`No se pudo eliminar la captura: ${storageError.message}`);
  }

  const { data: deletedReport, error: deleteError } = await admin
    .from("error_reports")
    .delete()
    .eq("id", report.id)
    .select("id")
    .maybeSingle();
  if (deleteError) {
    throw new Error(
      `No se pudo eliminar el reporte. Su captura ya fue eliminada: ${deleteError.message}`,
    );
  }
  if (!deletedReport) {
    throw new Error(
      "El reporte ya no existe. Su captura asociada ya fue eliminada.",
    );
  }

  revalidatePath("/admin");
}
