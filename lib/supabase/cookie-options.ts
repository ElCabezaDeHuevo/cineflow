// The v0 preview renders the app inside a cross-site iframe, where SameSite=Lax
// auth cookies are dropped. Production keeps the secure defaults.
export const previewCookieOptions =
  process.env.NODE_ENV === "production"
    ? undefined
    : ({ sameSite: "none", secure: true } as const);
