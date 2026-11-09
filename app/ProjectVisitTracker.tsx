"use client";

import { useEffect } from "react";
import { rememberRecentProject } from "@/lib/recent-projects";

export default function ProjectVisitTracker({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  useEffect(() => {
    rememberRecentProject(userId, projectId);
  }, [projectId, userId]);

  return null;
}
