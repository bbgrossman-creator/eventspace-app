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
  tagline: "One System. Every Event.",
  logo: "/brand/eventcore-logo.png",
  icon: "/brand/eventcore-icon.png",
  colors: {
    navy: "#103A73",
    blue: "#63A9F8",
    white: "#FFFFFF",
  },
} as const;
