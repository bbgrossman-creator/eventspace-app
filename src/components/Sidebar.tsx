"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Daily Ops", icon: "📋" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/bookings", label: "Bookings", icon: "🗂️" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/bookings/new", label: "New Inquiry", icon: "📞" },
];

// Back office groups — no section title; the divider tells the story.
const BACKOFFICE_GROUPS: { title: string; icon: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "Menus & Content", icon: "🍽️",
    items: [
      { href: "/templates", label: "Menu Templates", icon: "🧩" },
      { href: "/package-guides", label: "Package Guides", icon: "📣" },
    ],
  },
  {
    title: "Communications", icon: "✉️",
    items: [
      { href: "/automations", label: "Email Automations", icon: "✉️" },
    ],
  },
  {
    title: "Configuration", icon: "⚙️",
    items: [
      { href: "/policies", label: "Policies", icon: "⚙️" },
      { href: "/locations", label: "Locations & Capacity", icon: "🏛️" },
      { href: "/sop", label: "SOP / Playbook", icon: "📋" },
      { href: "/staff", label: "Staff & Approvals", icon: "🔑" },
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
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar_collapsed") === "1"); } catch {}
  }, []);
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
      {/* Logo (untouched by request) + collapse toggle */}
      <div className={`${collapsed ? "px-2" : "px-6"} pt-6 pb-4`}>
        <div className="flex items-start justify-between gap-1">
          {!collapsed && (
            <div>
              <div className="font-display text-lg font-bold leading-tight tracking-tight">EVENT SPACE</div>
              <div className="text-[11px] tracking-[0.25em] text-gold font-semibold mt-0.5">BY BURGER BAR</div>
            </div>
          )}
          <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`text-slate-500 hover:text-white transition-colors rounded-md px-1.5 py-0.5 hover:bg-white/5 ${collapsed ? "mx-auto text-base" : "text-xs mt-1"}`}>
            {collapsed ? "»" : "«"}
          </button>
        </div>
        {!collapsed && <div className="gold-rule mt-4" />}
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
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href) && (n.href !== "/bookings" || path === "/bookings" || path.match(/^\/bookings\/(?!new)/));
          return (
            <Link key={n.href} href={n.href} title={collapsed ? n.label : undefined}
              className={`${pillBase} ${pillPad} ${
                active
                  ? "bg-white/10 text-white shadow-[0_0_14px_rgba(255,255,255,0.07)]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white hover:translate-x-[1px]"
              }`}>
              {active && !collapsed && (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-gold" />
              )}
              <span className="w-5 text-center text-[15px] opacity-80 transition-transform duration-150 group-hover:translate-x-[2px]">{n.icon}</span>
              {!collapsed && n.label}
            </Link>
          );
        })}

        {/* Divider alone marks the back office — no label needed */}
        <div className="!my-4 border-t border-white/10" />

        {BACKOFFICE_GROUPS.map((g) => {
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
                          {active && <span className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-[3px] rounded-full bg-gold" />}
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
