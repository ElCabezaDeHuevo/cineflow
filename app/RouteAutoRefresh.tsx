"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

function isLiveRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname === "/equipo" ||
    pathname === "/horarios" ||
    pathname === "/proyectos" ||
    pathname.startsWith("/proyectos/") ||
    pathname === "/timeline" ||
    pathname === "/usuarios" ||
    pathname === "/usuarios/solicitudes"
  );
}

export default function RouteAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLiveRoute(pathname)) return;

    const refreshIfIdle = () => {
      if (document.visibilityState !== "visible") return;
      if (
        document.activeElement?.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }
      router.refresh();
    };

    const interval = window.setInterval(refreshIfIdle, 10_000);
    document.addEventListener("visibilitychange", refreshIfIdle);
    window.addEventListener("focus", refreshIfIdle);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfIdle);
      window.removeEventListener("focus", refreshIfIdle);
    };
  }, [pathname, router]);

  return null;
}
