"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Daily Ops", icon: "📋" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/bookings", label: "Bookings", icon: "🗂️" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/bookings/new", label: "New Inquiry", icon: "📞" },
];

// Back office, grouped into collapsible categories to reduce clutter.
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
      { href: "/sop", label: "SOP / Playbook", icon: "📋" },
      { href: "/staff", label: "Staff & Approvals", icon: "🔑" },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  // A group starts open if it contains the active route.
  const initialOpen = () => {
    const o: Record<string, boolean> = {};
    for (const g of BACKOFFICE_GROUPS) o[g.title] = g.items.some((i) => path.startsWith(i.href));
    return o;
  };
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  return (
    <aside className="w-60 shrink-0 bg-ink text-white flex flex-col sticky top-0 h-screen overflow-y-auto">
      <div className="px-6 pt-8 pb-6">
        <div className="font-display text-lg font-bold leading-tight tracking-tight">EVENT SPACE</div>
        <div className="text-[11px] tracking-[0.25em] text-gold font-semibold mt-0.5">BY BURGER BAR</div>
        <div className="gold-rule mt-4" />
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href) && (n.href !== "/bookings" || path === "/bookings" || path.match(/^\/bookings\/(?!new)/));
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}>
              <span>{n.icon}</span>
              {n.label}
            </Link>
          );
        })}

        <div className="pt-5 pb-1 px-4 text-[10px] font-bold tracking-[0.2em] text-slate-500">BACK OFFICE</div>
        {BACKOFFICE_GROUPS.map((g) => {
          const isOpen = open[g.title];
          const hasActive = g.items.some((i) => path.startsWith(i.href));
          return (
            <div key={g.title}>
              <button
                onClick={() => setOpen((p) => ({ ...p, [g.title]: !p[g.title] }))}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  hasActive ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}>
                <span className="flex items-center gap-3"><span>{g.icon}</span>{g.title}</span>
                <span className="text-[10px] text-slate-500">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="ml-3 border-l border-white/10 pl-2 space-y-1 mb-1">
                  {g.items.map((n) => {
                    const active = path.startsWith(n.href);
                    return (
                      <Link key={n.href} href={n.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? "bg-white/10 text-white font-medium" : "text-slate-400 hover:bg-white/5 hover:text-white"
                        }`}>
                        <span className="text-xs">{n.icon}</span>
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="px-6 py-5 text-[11px] text-slate-400 border-t border-white/10 flex items-center justify-between">
        <span>Jackson, NJ · (848) 299-9079</span>
        <button onClick={() => supabase.auth.signOut()} className="text-slate-400 hover:text-white underline">
          Sign out
        </button>
      </div>
    </aside>
  );
}
