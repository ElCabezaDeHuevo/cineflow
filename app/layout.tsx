import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import LogoutButton from "./LogoutButton";
import AppNavigation from "./AppNavigation";
import ErrorReportButton from "./ErrorReportButton";
import FirstLoginIntroduction from "./onboarding/FirstLoginIntroduction";
import RouteAutoRefresh from "./RouteAutoRefresh";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCineflowAdmin } from "@/lib/admin";

export const instant = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineFlow",
  description: "Gestión de producción cinematográfica",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: activeSession } = user
    ? await supabase
        .from("work_sessions")
        .select("id")
        .eq("user_id", user.id)
        .is("clock_out", null)
        .maybeSingle()
    : { data: null };
  const isAdmin = isCineflowAdmin(user);
  const { data: navProfile } = user ? await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle() : { data: null };
  const displayName = navProfile?.full_name || user?.email?.split("@")[0] || "Mi cuenta";
  console.log("[v0] admin check:", {
    email: user?.email ?? null,
    appRole: user?.app_metadata?.cineflow_role ?? null,
    userMetadataRole: user?.user_metadata?.cineflow_role ?? user?.user_metadata?.role ?? null,
    isAdmin,
  });

  return (
    <html
      lang="es-MX"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {user && <AppNavigation name={displayName} email={user.email ?? ""} avatarUrl={navProfile?.avatar_url} isAdmin={isAdmin} />}
        <div className={user ? "cf-app-enter cf-app-frame" : "cf-app-enter"}>{children}</div>
        {user && (
          <>
            <RouteAutoRefresh />
            <div className="mobile-action-dock">
              <ErrorReportButton />
              <LogoutButton hasActiveSession={Boolean(activeSession)} />
            </div>
            {user.app_metadata?.cineflow_onboarding_pending === true && (
              <FirstLoginIntroduction
                name={
                  String(user.user_metadata?.full_name ?? "").trim() ||
                  user.email?.split("@")[0] ||
                  "equipo"
                }
              />
            )}
          </>
        )}
      </body>
    </html>
  );
}
