/**
 * Product branding — the single source of truth.
 *
 * Everything the user sees that identifies the *product* (name, tagline, logo,
 * brand colors) reads from here, so a rebrand is a one-file change. This is the
 * product identity, distinct from the tenant/business identity (e.g. the venue
 * operating the app), which stays wherever that business data lives.
 */
export const BRAND = {
  name: "EventCore",
  tagline: "The Event Operating System",
  /**
   * Logo asset set. Naming follows the background it sits on:
   *   *Light  → for LIGHT backgrounds (white cards, PDFs, emails)
   *   *Dark   → for DARK backgrounds (the navy sidebar)
   * "never place the logo inside a white card" → always pick by background.
   */
  logoLight: "/brand/eventcore-logo-light.png",
  logoDark: "/brand/eventcore-logo-dark.png",
  horizontalLight: "/brand/eventcore-horizontal-light.png",
  horizontalDark: "/brand/eventcore-horizontal-dark.png",
  iconLight: "/brand/eventcore-icon-light.png",
  iconDark: "/brand/eventcore-icon-dark.png",
  colors: {
    navy: "#103A73",
    blue: "#63A9F8",
    white: "#FFFFFF",
  },
} as const;

/**
 * Absolute URL for a brand asset — required when embedding a logo in an
 * HTML email, where relative paths won't resolve in mail clients. Prefers an
 * explicit base URL, then Vercel's, else returns the relative path (fine for
 * in-app <img>, but set NEXT_PUBLIC_BASE_URL for emails to render remotely).
 */
export function brandAsset(path: string): string {
  const base =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""))) || "";
  return base ? `${base}${path}` : path;
}
