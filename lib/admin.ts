export const CINEFLOW_OWNER_ID = "0a12ae9b-a119-42f8-8103-4f1bf3ab5467";

type AdminUser = { email?: string; app_metadata?: Record<string, unknown> } | null;

export function isCineflowAdmin(user: AdminUser) {
  return user?.app_metadata?.cineflow_role === "admin";
}
