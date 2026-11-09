export function recentProjectsStorageKey(userId: string) {
  return `cineflow:recent-projects:${userId}`;
}

export function readRecentProjectIds(userId: string) {
  try {
    const stored = localStorage.getItem(recentProjectsStorageKey(userId));
    return parseRecentProjectIds(stored ?? "[]");
  } catch {
    return [];
  }
}

export function parseRecentProjectIds(stored: string) {
  try {
    const ids: unknown = JSON.parse(stored);
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function getRecentProjectIdsSnapshot(userId: string | null) {
  if (!userId) return "[]";
  try {
    return localStorage.getItem(recentProjectsStorageKey(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}

export function subscribeToRecentProjects(
  userId: string | null,
  onStoreChange: () => void,
) {
  if (!userId) return () => {};
  const key = recentProjectsStorageKey(userId);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) onStoreChange();
  };
  const onRecentProjectsUpdated = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("cineflow:recent-projects-updated", onRecentProjectsUpdated);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("cineflow:recent-projects-updated", onRecentProjectsUpdated);
  };
}

export function rememberRecentProject(userId: string, projectId: string) {
  const ids = readRecentProjectIds(userId).filter((id) => id !== projectId);
  ids.unshift(projectId);
  try {
    localStorage.setItem(
      recentProjectsStorageKey(userId),
      JSON.stringify(ids.slice(0, 50)),
    );
    window.dispatchEvent(
      new CustomEvent("cineflow:recent-projects-updated", {
        detail: recentProjectsStorageKey(userId),
      }),
    );
  } catch {
    // Recent-project history is a convenience and must not block navigation.
  }
}
