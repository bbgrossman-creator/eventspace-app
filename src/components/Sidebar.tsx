"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";
import { usePathname } from "next/navigation";
import { loadCapabilities, Capabilities, CAPS_CHANGED_EVENT } from "@/lib/capabilities";
import { loadSession, Session, Permission, can } from "@/lib/permissions";

// Nav is DATA. Each item may declare:
//   cap  — a TENANT capability (does this business have the module?)
//   perm — a USER permission   (may this person see it?)
// An item renders only if BOTH pass. No `cap`/`perm` → always shown.
// Adding a future module is one line here + one flag — never a showX boolean.
type NavItem = { href: string; label: string; icon: string; cap?: keyof Capabilities; perm?: Permission };

const NAV: NavItem[] = [
  { href: "/", label: "Daily Ops", icon: "📋", perm: "ops.view" },
  { href: "/dashboard", label: "Dashboard", icon: "📊", perm: "dashboard.view" },
  { href: "/bookings", label: "Bookings", icon: "🗂️", perm: "bookings.view" },
  { href: "/calendar", label: "Calendar", icon: "📅", perm: "calendar.view" },
  { href: "/bookings/new", label: "New Inquiry", icon: "📞", perm: "inquiries.create" },
  { href: "/drafts", label: "Inquiry Drafts", icon: "📝", perm: "inquiries.create" },
  { href: "/rolodex", label: "Library", icon: "🔭", cap: "rolodex", perm: "knowledge.view" },
  // Future, already wired:
  // { href: "/proposals", label: "Proposal Studio", icon: "🎨", cap: "proposals", perm: "bookings.edit" }
  // { href: "/production", label: "Production", icon: "👨‍🍳", cap: "production", perm: "kitchen.view" }
];

// Back office groups — no section title; the divider tells the story.
const BACKOFFICE_GROUPS: { title: string; icon: string; items: NavItem[] }[] = [
  {
    title: "Content", icon: "🍽️",
    items: [
      { href: "/templates", label: "Menu Templates", icon: "🧩", perm: "content.manage" },
      { href: "/package-guides", label: "Package Guides", icon: "📣", perm: "content.manage" },
      { href: "/price-book", label: "Price Book", icon: "📖", cap: "proposals", perm: "content.manage" },
      { href: "/blueprints", label: "Blueprints", icon: "📐", cap: "proposals", perm: "content.manage" },
    ],
  },
  {
    title: "Communications", icon: "✉️",
    items: [
      { href: "/automations", label: "Email Automations", icon: "✉️", perm: "communications.view" },
    ],
  },
  {
    title: "Configuration", icon: "⚙️",
    items: [
      { href: "/business-model", label: "Business Model", icon: "🧭", perm: "config.manage" },
      { href: "/users", label: "Users", icon: "👤", perm: "users.manage" },
      { href: "/policies", label: "Policies", icon: "⚙️", perm: "config.manage" },
      { href: "/locations", label: "Locations & Capacity", icon: "🏛️", perm: "config.manage" },
      { href: "/vendors", label: "Vendors", icon: "🏷️", perm: "config.manage" },
      { href: "/sop", label: "SOP / Playbook", icon: "📋", perm: "config.manage" },
      { href: "/staff", label: "Staff & Approvals", icon: "🔑", perm: "staff.manage" },
    ],
  },
];

/** The left rail — a command center, not just navigation.
 *  Collapsible groups (180ms), gold-accent active pill, Figma-style
 *  icon-only collapse mode (persisted), search as a top utility. */
export default function Sidebar() {
  const path = usePathname();
  const initialOpen = () => {
    const o: Record<string, boolean> = {};
    for (const g of BACKOFFICE_GROUPS) o[g.title] = g.items.some((i) => path.startsWith(i.href));
    return o;
  };
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);
  const [collapsed, setCollapsed] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar_collapsed") === "1"); } catch {}
    Promise.all([loadCapabilities(), loadSession()])
      .then(([c, s]) => { setCaps(c.caps); setSession(s); })
      .catch(() => {})
      .finally(() => setReady(true));
    // The sidebar lives in the persistent root layout: client-side navigation
    // never remounts it, so a one-shot load would hold a stale caps snapshot
    // after an admin changes the operating model. Re-derive on notification.
    const refresh = () => { loadCapabilities().then((c) => setCaps(c.caps)).catch(() => {}); };
    window.addEventListener(CAPS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CAPS_CHANGED_EVENT, refresh);
  }, []);

  // BOTH dimensions must pass: the tenant has the module AND the user may see it.
  // Before load, show nothing gated — a forbidden item must never flash in.
  const allowed = (item: NavItem) => {
    const capOk = !item.cap || (!!caps && !!caps[item.cap]);
    const permOk = !item.perm || (ready && can(session, item.perm));
    return capOk && permOk;
  };
  const navItems = NAV.filter(allowed);
  // Groups filter their items, then empty groups drop their header entirely.
  const groups = BACKOFFICE_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("sidebar_collapsed", c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  const pillBase =
    "group relative flex items-center gap-3 rounded-full text-sm font-medium transition-all duration-150";
  const pillPad = collapsed ? "justify-center px-0 py-2.5" : "px-4 py-2.5";

  return (
    <aside className={`${collapsed ? "w-16" : "w-56"} shrink-0 bg-ink text-white flex flex-col sticky top-0 h-screen overflow-y-auto overflow-x-hidden transition-[width] duration-200`}>
      {/* Brand — the logo is the focal point, centered and given room */}
      <div className={`relative ${collapsed ? "px-2" : "px-3"}`}
        style={{ minHeight: "108px", paddingTop: "28px", paddingBottom: "24px" }}>
        <div className="flex items-center justify-center h-full">
          {!collapsed ? (
            <>
              <img src={BRAND.horizontalDarkNoTagline} alt={BRAND.name}
                style={{ width: "244px", height: "auto", objectFit: "contain", maxWidth: "100%", opacity: 1, filter: "none", mixBlendMode: "normal" }}
                onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.style.display = "none"; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = "block"; }} />
              {/* Wordmark fallback if the asset is missing */}
              <div className="font-display text-lg font-bold tracking-tight" style={{ display: "none" }}>{BRAND.name}</div>
            </>
          ) : (
            <img src={BRAND.iconDark} alt={BRAND.name}
              className="h-7 w-7 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
        </div>
        {/* Collapse toggle — de-emphasized so it doesn't compete with the logo */}
        <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`absolute top-2 ${collapsed ? "left-1/2 -translate-x-1/2" : "right-2"} text-slate-600 hover:text-slate-300 transition-colors rounded-md w-6 h-6 flex items-center justify-center text-[11px] hover:bg-white/5`}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Search — a utility, not navigation */}
      <div className={`${collapsed ? "px-2" : "px-4"} mb-3`}>
        <Link href="/search" title="Search"
          className={`flex items-center gap-2.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10 transition-colors text-slate-300 hover:text-white ${collapsed ? "justify-center py-2" : "px-3.5 py-2 text-[13px]"}`}>
          <span className="text-sm opacity-80">🔍</span>
          {!collapsed && <span>Search</span>}
        </Link>
      </div>

      <nav className={`flex-1 ${collapsed ? "px-2" : "px-4"} space-y-1`}>
        {navItems.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href) && (n.href !== "/bookings" || path === "/bookings" || path.match(/^\/bookings\/(?!new)/));
          return (
            <Link key={n.href} href={n.href} title={collapsed ? n.label : undefined}
              className={`${pillBase} ${pillPad} ${
                active
                  ? "bg-white/10 text-white shadow-[0_0_14px_rgba(255,255,255,0.07)]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white hover:translate-x-[1px]"
              }`}>
              {active && !collapsed && (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-[#4A9EFF]" />
              )}
              <span className="w-5 text-center text-[15px] opacity-80 transition-transform duration-150 group-hover:translate-x-[2px]">{n.icon}</span>
              {!collapsed && n.label}
            </Link>
          );
        })}

        {/* Divider alone marks the back office — no label needed */}
        <div className="!my-4 border-t border-white/10" />

        {groups.map((g) => {
          const isOpen = !!open[g.title];
          const hasActive = g.items.some((i) => path.startsWith(i.href));
          if (collapsed) {
            return (
              <button key={g.title} title={g.title}
                onClick={() => { toggleCollapsed(); setOpen((p) => ({ ...p, [g.title]: true })); }}
                className={`${pillBase} ${pillPad} w-full ${hasActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                <span className="w-5 text-center text-[15px] opacity-80">{g.icon}</span>
              </button>
            );
          }
          return (
            <div key={g.title}>
              <button
                onClick={() => setOpen((p) => ({ ...p, [g.title]: !p[g.title] }))}
                className={`group w-full flex items-center justify-between gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
                  hasActive ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white hover:translate-x-[1px]"
                }`}>
                <span className="flex items-center gap-3">
                  <span className="w-5 text-center text-[15px] opacity-80 transition-transform duration-150 group-hover:translate-x-[2px]">{g.icon}</span>
                  {g.title}
                </span>
                <span className={`text-[10px] text-slate-500 transition-transform duration-[180ms] ${isOpen ? "rotate-90" : ""}`}>▸</span>
              </button>
              {/* 180ms grid-rows expand — smooth height + fade, no jump */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-[180ms] ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="ml-3 border-l border-white/10 pl-2 space-y-0.5 mb-1 pt-0.5">
                    {g.items.map((n) => {
                      const active = path.startsWith(n.href);
                      return (
                        <Link key={n.href} href={n.href}
                          className={`group relative flex items-center gap-2.5 rounded-full pl-8 pr-3 py-2 text-[13px] transition-all duration-150 ${
                            active ? "bg-white/10 text-white font-medium" : "text-slate-400 hover:bg-white/5 hover:text-white hover:translate-x-[1px]"
                          }`}>
                          {active && <span className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-[3px] rounded-full bg-[#4A9EFF]" />}
                          <span className="w-4 text-center text-xs opacity-70 transition-transform duration-150 group-hover:translate-x-[2px]">{n.icon}</span>
                          {n.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Profile card footer */}
      <div className={`${collapsed ? "px-2" : "px-4"} py-4 border-t border-white/10`}>
        {!collapsed ? (
          <div className="rounded-xl bg-white/[0.05] ring-1 ring-white/10 p-3">
            <div className="text-[13px] font-semibold">Burger Bar</div>
            <div className="text-[11px] text-slate-400">Jackson, NJ</div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online
            </div>
            <div className="border-t border-white/10 mt-2.5 pt-2">
              <button onClick={() => supabase.auth.signOut()} className="text-[11px] text-slate-400 hover:text-white transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => supabase.auth.signOut()} title="Sign Out"
            className="w-full flex justify-center text-slate-400 hover:text-white py-1">⏻</button>
        )}
      </div>
    </aside>
  );
}
