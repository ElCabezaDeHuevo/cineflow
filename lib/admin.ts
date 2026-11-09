type AdminUser = {
  email?: string;
  app_metadata?: Record<string, unknown>;
} | null;

export function isCineflowAdmin(user: AdminUser) {
  if (!user) return false;
  const configuredAdmin = process.env.CINEFLOW_ADMIN_EMAIL?.trim().toLowerCase();
  return (
    user.app_metadata?.cineflow_role === "admin" ||
    Boolean(configuredAdmin && user.email?.toLowerCase() === configuredAdmin)
  );
}
