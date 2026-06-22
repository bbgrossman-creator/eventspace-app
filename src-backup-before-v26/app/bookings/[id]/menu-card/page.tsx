"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";
import { MenuTemplate, MenuSection, isVisible } from "@/lib/menuEngine";
import { templateSlugFor } from "@/lib/menuCharges";

// Sections that are operational, not part of a customer-facing menu card.
const EXCLUDE_KEYS = new Set([
  "mechitzah", "centerpieces", "centerpiece_detail", "head_table", "setup_notes", "child_table",
  "decor_extras", "decor_detail", "dietary", "child_allergy", "child_allergy_details",
  "child_requests", "notes", "has_vendors", "vendor_photographer", "vendor_entertainment",
  "vendor_florist", "vendor_balloons", "vendor_decorations", "vendor_other", "vendors", "vendor_details",
  "smorg", "addl", "addons_divider",
]);

interface CourseLine { title: string; items: string[]; }

export default function MenuCard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [template, setTemplate] = useState<MenuTemplate | null>(null);

  const load = useCallback(async () => {
    const { data: bk } = await supabase.from("bookings").select("*").eq("id", id).single();
    if (!bk) return;
    setB(bk as Booking);
    const sel = (bk as Booking).menu as unknown as { template?: string };
    const slug = sel?.template ?? templateSlugFor((bk as Booking).menu_type);
    if (slug) {
      const { data: tpl } = await supabase.from("menu_templates").select("config").eq("slug", slug).single();
      if (tpl) setTemplate(tpl.config as MenuTemplate);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!b) return <p className="text-slate-500">Loading…</p>;

  const sel = b.menu as unknown as { answers?: Record<string, unknown> };
  const answers = sel?.answers ?? {};

  // Build the courses: visible, food-course sections with a chosen value.
  const courses: CourseLine[] = [];
  if (template) {
    for (const s of template.sections) {
      if (s.type === "info" || s.type === "text") continue;
      if (EXCLUDE_KEYS.has(s.key)) continue;
      if (s.key.startsWith("child")) continue; // children's items not on the main card
      if (!isVisible(s, { ...answers, __children: 1 })) continue;
      const v = answers[s.key];
      const items = toItems(v);
      if (items.length === 0) continue;
      courses.push({ title: cleanTitle(s), items });
    }
  }

  const hasMenu = courses.length > 0;

  return (
    <div className="max-w-2xl">
      <div className="no-print flex items-center justify-between mb-6">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push(`/bookings/${b.id}`)}>
          ← Back to #{b.invoice_num}
        </button>
        <button className="btn-primary" disabled={!hasMenu} onClick={() => window.print()}>🖨️ Print Menu Cards</button>
      </div>

      {!hasMenu ? (
        <div className="card p-10 text-center text-slate-400">
          No menu selections yet — complete the menu form first, then the card generates automatically.
        </div>
      ) : (
        <div className="card overflow-hidden print:shadow-none">
          {/* Decorative menu card */}
          <div className="px-10 py-12 text-center" style={{ background: "linear-gradient(180deg,#fdfcfa,#f7f3ec)" }}>
            <div className="text-[11px] tracking-[0.3em] text-gold font-semibold mb-1">EVENT SPACE BY BURGER BAR</div>
            <div className="w-16 h-px bg-gold mx-auto my-4" />
            <h1 className="font-display text-3xl font-bold text-ink">{b.event_name || b.event_type}</h1>
            <p className="text-sm text-slate-500 mt-1">{fmtDate(b.event_date)}</p>
            <div className="w-16 h-px bg-gold mx-auto my-4" />

            <div className="text-left max-w-md mx-auto mt-8 space-y-5">
              {courses.map((c) => (
                <div key={c.title} className="text-center">
                  <div className="text-[11px] tracking-[0.2em] text-gold uppercase font-semibold">{c.title}</div>
                  {c.items.map((it) => (
                    <div key={it} className="font-display text-lg text-ink mt-0.5">{it}</div>
                  ))}
                </div>
              ))}
            </div>

            <div className="w-16 h-px bg-gold mx-auto mt-10 mb-3" />
            <p className="text-[11px] text-slate-400 tracking-wider">Under the strict Hashgacha of the KCL</p>
          </div>
        </div>
      )}

      {hasMenu && (
        <p className="no-print text-[11px] text-slate-400 mt-3">
          Generated from the menu selections. Tip: print on cardstock; use your browser&apos;s print scaling to fit your card size.
        </p>
      )}
    </div>
  );
}

function cleanTitle(s: MenuSection): string {
  // "Choose Your Soup" → "Soup"; strip "Choose Your", parentheticals, pricing.
  return s.title
    .replace(/^choose\s+(your\s+)?/i, "")
    .replace(/^select\s+(your\s+|one\s+|a\s+)?/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*—.*$/, "")
    .trim();
}

function toItems(v: unknown): string[] {
  if (typeof v === "string" && v.trim() && !/^no$/i.test(v.trim())) return [v.trim()];
  if (Array.isArray(v)) return (v as string[]).filter(Boolean);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, number>)
      .filter(([, q]) => Number(q) > 0).map(([label]) => label);
  }
  return [];
}
