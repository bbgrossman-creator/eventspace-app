"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, deriveGuests, menuBadge } from "@/lib/workflow";
import { MenuTemplate, MenuSection, isVisible } from "@/lib/menuEngine";
import { templateSlugFor } from "@/lib/menuCharges";

// Keys that belong to setup vs. service vs. kitchen, so the sheet reads
// in the order staff actually work.
const SETUP_KEYS = ["mechitzah", "centerpieces", "centerpiece_detail", "head_table", "setup_notes",
  "child_table", "decor_extras", "decor_detail"];
const ALERT_KEYS = ["dietary", "child_allergy", "child_allergy_details", "child_requests"];
const VENDOR_KEYS = ["has_vendors", "vendor_photographer", "vendor_entertainment", "vendor_florist",
  "vendor_balloons", "vendor_decorations", "vendor_other", "vendors", "vendor_details", "notes"];

export default function Worksheet() {
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

  const sel = b.menu as unknown as { guests?: { men: number; women: number; children: number }; answers?: Record<string, unknown> };
  const answers = sel?.answers ?? {};
  const g = deriveGuests(b);

  const rows = (keys: string[] | null, exclude?: string[]) => {
    if (!template) return [];
    return template.sections
      .filter((s) => s.type !== "info" && isVisible(s, answers))
      .filter((s) => keys ? keys.includes(s.key) : !(exclude ?? []).includes(s.key))
      .map((s) => ({ s, value: displayValue(answers[s.key]) }))
      .filter((r) => r.value);
  };

  const alerts = rows(ALERT_KEYS).filter((r) => !/^no$/i.test(r.value));
  const setup = rows(SETUP_KEYS);
  const vendors = rows(VENDOR_KEYS);
  const kitchen = rows(null, [...SETUP_KEYS, ...ALERT_KEYS, ...VENDOR_KEYS]);

  return (
    <div className="max-w-3xl">
      <div className="no-print flex items-center justify-between mb-6">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push(`/bookings/${b.id}`)}>
          ← Back to #{b.invoice_num}
        </button>
        <button className="btn-primary" onClick={() => window.print()}>🖨️ Print Worksheet</button>
      </div>

      <div className="card overflow-hidden print:shadow-none">
        {/* Header */}
        <div className="bg-ink text-white px-8 py-5 flex items-start justify-between">
          <div>
            <div className="text-[11px] tracking-[0.25em] text-gold font-semibold">STAFF WORKSHEET — DAY OF EVENT</div>
            <div className="font-display text-2xl font-bold mt-1">{b.event_name || b.event_type}</div>
            <div className="text-sm text-slate-300 mt-1">
              {fmtDate(b.event_date)} · Start {fmtTime(b.event_time)} · {menuBadge(b.menu_type)} · #{b.invoice_num}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{b.contact_name}</div>
            {b.phone && <div className="text-slate-300">{b.phone}</div>}
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Counts — big and unmissable */}
          <div className={`grid gap-3 text-center ${g.gendered ? "grid-cols-4" : "grid-cols-3"}`}>
            {[
              ...(g.gendered
                ? [["Men", g.men], ["Women", g.women]] as [string, number][]
                : [["Adults", g.adults]] as [string, number][]),
              ["Children", g.children],
              ["TOTAL", (g.gendered ? g.men + g.women : g.adults) + g.children],
            ].map(([label, n]) => (
              <div key={label as string} className={`rounded-xl py-3 ${label === "TOTAL" ? "bg-ink text-white" : "bg-goldsoft"}`}>
                <div className="font-display font-bold text-2xl">{n as number}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{label as string}</div>
              </div>
            ))}
          </div>
          {g.source !== "confirmed" && (
            <p className="text-xs text-amber-700 font-semibold -mt-3">
              ⚠️ Counts are NOT final-confirmed (source: {g.source}). Verify before prep.
            </p>
          )}

          {/* Allergies & dietary — red, first */}
          {alerts.length > 0 && (
            <Block title="⚠️ ALLERGIES & DIETARY — READ FIRST" tone="alert">
              {alerts.map((r) => <KV key={r.s.key} k={cleanTitle(r.s)} v={r.value} />)}
            </Block>
          )}

          {/* Room setup */}
          {setup.length > 0 && (
            <Block title="Room Setup">
              {setup.map((r) => <KV key={r.s.key} k={cleanTitle(r.s)} v={r.value} />)}
            </Block>
          )}

          {/* Kitchen & service */}
          {kitchen.length > 0 && (
            <Block title="Menu — Kitchen & Service">
              {kitchen.map((r) => <KV key={r.s.key} k={cleanTitle(r.s)} v={r.value} />)}
            </Block>
          )}
          {kitchen.length === 0 && (
            <p className="text-sm text-amber-700 font-semibold">No menu on file yet — complete the menu form before printing.</p>
          )}

          {/* Vendors & notes */}
          {vendors.length > 0 && (
            <Block title="Outside Vendors & Notes">
              {vendors.map((r) => <KV key={r.s.key} k={cleanTitle(r.s)} v={r.value} />)}
            </Block>
          )}
          {b.notes && (
            <Block title="Booking Notes">
              <p className="text-sm">{b.notes}</p>
            </Block>
          )}

          {/* Day-of checklist scratch area */}
          <Block title="Day-Of Checklist">
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {["Room set per layout", "Mechitzah placed (if required)", "Buffet/chafers staged", "Bread station ready",
                "Beverages stocked", "Children's table set (if required)", "Dessert prepped", "Final walkthrough with host"].map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-ink rounded-sm shrink-0" /> {c}
                </div>
              ))}
            </div>
          </Block>

          {/* Approval signatures */}
          <Block title="Approvals">
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 pt-2">
              {["Manager Approval", "Head Waiter Approval"].map((role) => (
                <div key={role}>
                  <div className="border-b-2 border-ink h-8" />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span className="font-semibold">{role}</span>
                    <span>Date: __________</span>
                  </div>
                </div>
              ))}
            </div>
          </Block>
        </div>
        <div className="h-2 bg-gold" />
      </div>
    </div>
  );
}

function cleanTitle(s: MenuSection) {
  return s.title.replace(/\s*\(.*?\)\s*$/, "").replace(/\s*—.*$/, "");
}

function displayValue(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v;
  if (Array.isArray(v) && v.length > 0) return (v as string[]).join(", ");
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, number>).filter(([, q]) => Number(q) > 0);
    if (entries.length) return entries.map(([l, q]) => `${l} × ${q}`).join(", ");
  }
  return "";
}

function Block({ title, tone, children }: { title: string; tone?: "alert"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-5 py-4 ${tone === "alert" ? "bg-red-50 border-red-300" : "border-slate-200"}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${tone === "alert" ? "text-red-700" : "text-gold"}`}>
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 text-sm border-b border-slate-100 last:border-0 py-1">
      <span className="text-slate-500 w-48 shrink-0">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
