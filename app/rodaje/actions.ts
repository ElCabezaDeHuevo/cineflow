"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function textValue(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}
function uuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function projectAccess(projectId: string, write = true) {
  if (!uuidValue(projectId)) throw new Error("Proyecto no válido.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para continuar.");
  const { data: membership } = await supabase.from("project_members").select("role").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
  if (!membership || (write && !["owner", "editor"].includes(membership.role))) throw new Error("No tienes permisos para modificar la planificación de este proyecto.");
  return supabase;
}

export async function createFilmScene(formData: FormData) {
  const projectId = textValue(formData, "project_id");
  const supabase = await projectAccess(projectId);
  const sceneNumber = textValue(formData, "scene_number").slice(0, 20);
  const heading = textValue(formData, "heading").slice(0, 180);
  const intExt = textValue(formData, "int_ext");
  const dayNight = textValue(formData, "day_night");
  const location = textValue(formData, "location").slice(0, 180);
  const pages = Number(textValue(formData, "page_count") || "0");
  const color = textValue(formData, "color_tag");
  if (!sceneNumber || !heading || !["INT","EXT","INT/EXT"].includes(intExt) || !["DÍA","NOCHE","AMANECER","ATARDECER"].includes(dayNight) || !Number.isFinite(pages) || pages < 0 || pages > 100 || !["yellow","red","blue","green","white"].includes(color)) throw new Error("Revisa los datos de la escena.");
  const { error } = await supabase.from("film_scenes").insert({ project_id: projectId, scene_number: sceneNumber, heading, int_ext: intExt, day_night: dayNight, location, page_count: pages, color_tag: color });
  if (error) throw new Error(error.message);
  revalidatePath("/rodaje");
}

export async function createShootDay(formData: FormData) {
  const projectId = textValue(formData, "project_id");
  const supabase = await projectAccess(projectId);
  const number = Number(textValue(formData, "shoot_day_number"));
  if (!Number.isInteger(number) || number < 1 || number > 365) throw new Error("El número de jornada debe estar entre 1 y 365.");
  const { error } = await supabase.from("shoot_days").insert({ project_id: projectId, shoot_day_number: number, shoot_date: textValue(formData, "shoot_date") || null, location: textValue(formData, "location").slice(0,180), notes: textValue(formData, "notes").slice(0,2000) });
  if (error) throw new Error(error.message);
  revalidatePath("/rodaje");
}

export async function scheduleFilmScene(formData: FormData) {
  const projectId = textValue(formData, "project_id");
  const shootDayId = textValue(formData, "shoot_day_id");
  const sceneId = textValue(formData, "scene_id");
  const supabase = await projectAccess(projectId);
  if (!uuidValue(shootDayId) || !uuidValue(sceneId)) throw new Error("Escena o jornada no válida.");
  const [{ data: day }, { data: scene }] = await Promise.all([
    supabase.from("shoot_days").select("id,project_id").eq("id", shootDayId).eq("project_id", projectId).maybeSingle(),
    supabase.from("film_scenes").select("id,project_id,status").eq("id", sceneId).eq("project_id", projectId).maybeSingle(),
  ]);
  if (!day || !scene) throw new Error("La escena y la jornada deben pertenecer al mismo proyecto.");
  const { error } = await supabase.from("shoot_day_scenes").insert({ shoot_day_id: shootDayId, scene_id: sceneId });
  if (error) throw new Error(error.message);
  await supabase.from("film_scenes").update({ status: "scheduled" }).eq("id", sceneId);
  revalidatePath("/rodaje");
}

export async function unscheduleFilmScene(formData: FormData) {
  const projectId = textValue(formData, "project_id");
  const shootDayId = textValue(formData, "shoot_day_id");
  const sceneId = textValue(formData, "scene_id");
  const supabase = await projectAccess(projectId);
  if (!uuidValue(shootDayId) || !uuidValue(sceneId)) throw new Error("Escena o jornada no válida.");
  const { error } = await supabase.from("shoot_day_scenes").delete().eq("shoot_day_id", shootDayId).eq("scene_id", sceneId);
  if (error) throw new Error(error.message);
  const { data: remaining } = await supabase.from("shoot_day_scenes").select("shoot_day_id").eq("scene_id", sceneId).limit(1);
  if (!remaining?.length) await supabase.from("film_scenes").update({ status: "unscheduled" }).eq("id", sceneId).eq("project_id", projectId);
  revalidatePath("/rodaje");
}
