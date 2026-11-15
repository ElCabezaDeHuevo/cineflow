import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CineFlow · Producción cinematográfica",
    short_name: "CineFlow",
    description: "Gestión de proyectos y producción cinematográfica",
    start_url: "/centro",
    display: "standalone",
    background_color: "#0b0c10",
    theme_color: "#0b0c10",
    lang: "es-MX",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}