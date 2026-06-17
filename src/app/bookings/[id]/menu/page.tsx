"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking, fmtDate, fmtMoney } from "@/lib/workflow";
import { PRICING } from "@/lib/pricing";
import {
  MenuTemplate, MenuSelections, MenuSection,
  computeMenuCharges, menuBaseTotal, isVisible, requiredCount,
} from "@/lib/menuEngine";
import { regenerateMenuCharges, templateSlugFor } from "@/lib/menuCharges";

export default function MenuForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [template, setTemplate] = useState<MenuTemplate | null>(null);
  const [guests, setGuests] = useState({ men: 0, women: 0, children: 0 });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [overrideMin, setOverrideMin] = useState(false);
  const [eventName, setEventName] = useState("");
  const [allTemplates, setAllTemplates] = useState<{ slug: string; name: string; category: string | null }[]>([]);
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const [notFound, setNotFound] = useState("");

  const load = useCallback(async () => {
    const { data: bk } = await supabase.from("bookings").select("*").eq("id", id).single();
    if (!bk) { setNotFound("Booking not found."); return; }
    const booking = bk as Booking;
    setB(booking);

    setEventName(booking.event_name ?? "");

    // Determine the template: explicit menu_type, or a previously chosen slug in menu jsonb.
    const existing = (booking.menu ?? {}) as Partial<MenuSelections> & { template?: string };
    const slug = existing.template ?? templateSlugFor(booking.menu_type);

    // Always load the template list (for the chooser / switcher)
    const { data: list } = await supabase.from("menu_templates")
      .select("slug, name, category").eq("active", true)
      .order("sort_order", { ascending: true });
    setAllTemplates((list ?? []) as { slug: string; name: string; category: string | null }[]);

    if (!slug) {
      // No template yet — show the chooser (template stays null until picked)
      if (existing.answers) setAnswers(existing.answers);
      if (existing.guests) setGuests(existing.guests as { men: number; women: number; children: number });
      return;
    }
    setChosenSlug(slug);
    const { data: tpl } = await supabase.from("menu_templates")
      .select("config").eq("slug", slug).single();
    if (!tpl) { setNotFound(`Template "${slug}" not found — run the menu templates SQL.`); return; }
    setTemplate(tpl.config as MenuTemplate);

    if (existing.answers) setAnswers(existing.answers);
    if (existing.guests) setGuests(existing.guests as { men: number; women: number; children: number });
    else if (booking.est_guests) setGuests({ men: Math.ceil(booking.est_guests / 2), women: Math.floor(booking.est_guests / 2), children: 0 });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function chooseTemplate(slug: string) {
    const { data: tpl } = await supabase.from("menu_templates").select("config").eq("slug", slug).single();
    if (!tpl) { setMsg({ ok: false, text: "Could not load that template." }); return; }
    setChosenSlug(slug);
    setTemplate(tpl.config as MenuTemplate);
  }

  const sel: MenuSelections | null = useMemo(
    () => template ? { template: chosenSlug ?? template.slug, guests, answers } : null,
    [template, chosenSlug, guests, answers]
  );

  const totals = useMemo(() => {
    if (!template || !sel) return null;
    const base = menuBaseTotal(template, sel);
    const lines = computeMenuCharges(template, sel);
    const addons = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const subtotal = base + addons;
    const tax = Math.round(subtotal * PRICING.TAX_RATE * 100) / 100;
    return { base, lines, addons, subtotal, total: Math.round((subtotal + tax) * 100) / 100, tax };
  }, [template, sel]);

  // ─── validation: every visible required/counted section satisfied ───
  const problems = useMemo(() => {
    if (!template) return [];
    const g = { men: guests.men, women: guests.women, total: guests.men + guests.women + guests.children };
    const out: string[] = [];
    for (const s of template.sections) {
      if (!isVisible(s, answers)) continue;
      const v = answers[s.key];
      if (s.type === "choose" && s.required && !v) out.push(`${s.title}: selection required`);
      if (s.type === "multi" && s.count) {
        const n = Array.isArray(v) ? v.length : 0;
        const { min, max } = requiredCount(s, answers, g);
        if (s.optional_group && n === 0) continue;
        if (n < min) out.push(`${s.title}: choose ${min === max ? min : `at least ${min}`} (currently ${n})`);
        if (n > max) out.push(`${s.title}: choose at most ${max} (currently ${n})`);
      }
    }
    return out;
  }, [template, answers, guests]);

  const partyTotal = guests.men + guests.women + guests.children;
  const minGuests = template?.base.min_guests ?? 0;
  const belowMin = minGuests > 0 && partyTotal > 0 && partyTotal < minGuests;

  async function save(markComplete: boolean) {
    if (!b || !template || !sel) return;
    if (markComplete && problems.length > 0) {
      setMsg({ ok: false, text: "Resolve the items listed above before marking the menu complete." });
      return;
    }
    if (markComplete && belowMin && !overrideMin) {
      setMsg({ ok: false, text: `Party of ${partyTotal} is below the ${minGuests}-guest minimum. Check the override box below to proceed anyway.` });
      return;
    }
    setBusy(true);
    // Map the chosen template back to the booking's menu_type for pricing/badges
    const menuTypeFromSlug =
      template.slug === "full_service" ? "Full Service" :
      template.slug === "single_buffet" ? "Single Buffet" :
      template.slug === "double_buffet" ? "Double Buffet" : b.menu_type;
    const { error } = await supabase.from("bookings").update({
      menu: sel,
      event_name: eventName.trim() || b.event_name,
      menu_type: menuTypeFromSlug,
      ...(markComplete ? { menu_completed: true, menu_discussion_status: "Completed", status: "send_est_invoice" } : {}),
    }).eq("id", b.id);
    if (error) { setMsg({ ok: false, text: error.message }); setBusy(false); return; }

    const regen = await regenerateMenuCharges(b.id, template, sel);
    if (regen.error) { setMsg({ ok: false, text: `Saved, but charge generation failed: ${regen.error}` }); setBusy(false); return; }

    await logActivity(b.id, b.invoice_num, markComplete ? "Menu Completed" : "Menu Saved",
      `${template.name} — ${regen.lineCount} priced add-on line(s)`);
    if (markComplete && belowMin && overrideMin) {
      await logActivity(b.id, b.invoice_num, "Guest Minimum Overridden",
        `Completed with ${partyTotal} guests (minimum ${minGuests})`, "WARNING");
    }
    setBusy(false);
    if (markComplete) router.push(`/bookings/${b.id}`);
    else setMsg({ ok: true, text: `Saved ✓ — ${regen.lineCount} priced line(s) written to the invoice` });
  }

  if (notFound) return <p className="text-red-600">{notFound}</p>;
  if (!b) return <p className="text-slate-500">Loading…</p>;

  // Template chooser — shown until a menu type/template is selected
  if (!template) {
    const cats = Array.from(new Set(allTemplates.map((t) => t.category ?? "General")));
    return (
      <div className="max-w-2xl">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push(`/bookings/${b.id}`)}>← Back to #{b.invoice_num}</button>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Build the Menu</h1>
        <p className="text-sm text-slate-500 mt-1">{b.contact_name} · {fmtDate(b.event_date)}</p>
        <div className="gold-rule mt-3 mb-6" />
        <div className="card p-6">
          <label className="label">Event name</label>
          <input className="field mb-5" value={eventName} onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g. Shaya's Bar Mitzvah" />
          <h2 className="font-display font-bold text-sm mb-3">Which menu are you building?</h2>
          {cats.map((cat) => (
            <div key={cat} className="mb-4">
              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase mb-1.5">{cat}</div>
              <div className="space-y-2">
                {allTemplates.filter((t) => (t.category ?? "General") === cat).map((t) => (
                  <button key={t.slug} onClick={() => chooseTemplate(t.slug)}
                    className="card w-full text-left px-4 py-3 hover:shadow-lg hover:ring-2 hover:ring-navy transition-all">
                    <div className="font-display font-bold text-sm">{t.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {allTemplates.length === 0 && <p className="text-sm text-slate-400">No menu templates found — run the menu templates SQL.</p>}
        </div>
      </div>
    );
  }
  if (!totals) return <p className="text-slate-500">Loading…</p>;

  const g = { men: guests.men, women: guests.women, total: guests.men + guests.women + guests.children };

  return (
    <div className="max-w-3xl pb-32">
      <header className="mb-6">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push(`/bookings/${b.id}`)}>← Back to #{b.invoice_num}</button>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">{template.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {b.contact_name} · {b.event_name || b.event_type} · {fmtDate(b.event_date)}
        </p>
        {template.base.notes && <p className="text-xs text-slate-500 mt-2 max-w-xl">{template.base.notes}</p>}
        <div className="gold-rule mt-3" />
      </header>

      <div className="card p-5 mb-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Event name</label>
          <input className="field" value={eventName} onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g. Shaya's Bar Mitzvah" />
        </div>
        <div>
          <label className="label">Menu type</label>
          <select className="field" value={chosenSlug ?? template.slug}
            onChange={(e) => { if (confirm("Switch menu type? Your current selections will be cleared.")) { setAnswers({}); chooseTemplate(e.target.value); } }}>
            {allTemplates.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Guest counts drive tiers and per-person pricing */}
      <div className="card p-5 mb-5">
        <h2 className="font-display font-bold text-sm mb-3">👥 Guest count</h2>
        <div className="grid grid-cols-3 gap-3">
          {(["men", "women", "children"] as const).map((k) => (
            <div key={k}>
              <label className="label capitalize">{k}</label>
              <input className="field" type="number" min="0" value={guests[k] || ""}
                onChange={(e) => setGuests((p) => ({ ...p, [k]: parseInt(e.target.value) || 0 }))} />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Adults ${template.base.adult_pp}/pp · Children ${template.base.child_pp}/pp
          {template.base.min_guests ? ` · ${template.base.min_guests} guest minimum` : ""}
        </p>
      </div>

      {/* Sections */}
      {template.sections.map((s) => isVisible(s, answers) && (
        <Section key={s.key} s={s} answers={answers} guests={g}
          onChange={(v) => setAnswers((p) => ({ ...p, [s.key]: v }))}
          onQtyChange={(label, qty) => setAnswers((p) => {
            const cur = { ...((p[s.key] ?? {}) as Record<string, number>) };
            cur[label] = qty;
            return { ...p, [s.key]: cur };
          })} />
      ))}

      {msg && (
        <div className={`rounded-lg px-4 py-3 my-4 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {msg.text}
        </div>
      )}
      {belowMin && (
        <div className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 my-4 text-sm text-red-800">
          <b>⚠️ Below minimum:</b> {partyTotal} guests entered; this menu requires {minGuests}.
          <label className="flex items-center gap-2 mt-2 font-medium cursor-pointer">
            <input type="checkbox" checked={overrideMin} onChange={(e) => setOverrideMin(e.target.checked)} />
            Override the minimum for this booking (logged to the activity record)
          </label>
        </div>
      )}
      {problems.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 my-4 text-sm text-amber-800">
          <b>Still needed before completion:</b>
          {problems.slice(0, 6).map((p) => <div key={p}>• {p}</div>)}
          {problems.length > 6 && <div>…and {problems.length - 6} more</div>}
        </div>
      )}

      {/* Sticky pricing footer */}
      <div className="fixed bottom-0 left-60 right-0 bg-ink text-white px-8 py-4 shadow-2xl z-10">
        <div className="max-w-3xl flex items-center justify-between gap-6">
          <div className="text-sm">
            <span className="opacity-70">Base {fmtMoney(totals.base)}</span>
            <span className="opacity-70"> + Add-ons {fmtMoney(totals.addons)}</span>
            <span className="opacity-70"> + Tax {fmtMoney(totals.tax)}</span>
            <span className="font-display font-bold text-xl ml-3 text-gold">{fmtMoney(totals.total)}</span>
          </div>
          <div className="flex gap-2.5 shrink-0">
            <button className="btn-ghost !bg-white/10 !text-white !border-white/20" disabled={busy} onClick={() => save(false)}>
              💾 Save Draft
            </button>
            <button className="btn-success" disabled={busy} onClick={() => save(true)}>
              {busy ? "Saving…" : "✅ Save & Mark Menu Complete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section renderer ───
function Section({ s, answers, guests, onChange, onQtyChange }: {
  s: MenuSection;
  answers: Record<string, unknown>;
  guests: { men: number; women: number; total: number };
  onChange: (v: unknown) => void;
  onQtyChange: (label: string, qty: number) => void;
}) {
  const v = answers[s.key];
  const { min, max } = requiredCount(s, answers, guests);

  if (s.type === "info") {
    return (
      <div className="rounded-xl bg-goldsoft border border-gold/30 px-5 py-4 mb-4">
        <div className="font-display font-bold text-sm">{s.title}</div>
        {s.help && <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{s.help}</p>}
      </div>
    );
  }

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-display font-bold text-sm">
          {s.title} {s.required && <span className="text-red-500">*</span>}
        </h3>
        {s.type === "multi" && s.count && (
          <CountBadge n={Array.isArray(v) ? v.length : 0} min={min} max={max} optional={!!s.optional_group} />
        )}
      </div>
      {s.help && <p className="text-xs text-slate-500 mt-1 mb-1 whitespace-pre-line">{s.help}</p>}

      <div className="mt-3 space-y-1.5">
        {s.type === "text" && (
          <textarea className="field" rows={2} value={(v as string) ?? ""}
            onChange={(e) => onChange(e.target.value)} />
        )}

        {(s.type === "choose") && (s.options ?? []).map((o) => (
          <label key={o.label} className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <input type="radio" className="mt-0.5" checked={v === o.label}
              onChange={() => onChange(v === o.label && !s.required ? "" : o.label)} />
            <span>{o.label}{priceTag(o.price)}</span>
          </label>
        ))}

        {(s.type === "multi") && (s.options ?? []).map((o) => {
          const arr = Array.isArray(v) ? (v as string[]) : [];
          const checked = arr.includes(o.label);
          return (
            <label key={o.label} className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={checked}
                onChange={() => onChange(checked ? arr.filter((x) => x !== o.label) : [...arr, o.label])} />
              <span>{o.label}{priceTag(o.price)}</span>
            </label>
          );
        })}

        {(s.type === "toggle") && (s.options ?? []).map((o) => (
          <label key={o.label} className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5" checked={v === o.label}
              onChange={(e) => onChange(e.target.checked ? o.label : "")} />
            <span>{o.label}{priceTag(o.price)}</span>
          </label>
        ))}

        {(s.type === "qty") && (s.options ?? []).map((o) => {
          const q = ((v ?? {}) as Record<string, number>)[o.label] ?? 0;
          return (
            <div key={o.label} className="flex items-center gap-3 text-sm">
              <input className="field !w-20" type="number" min="0" value={q || ""}
                onChange={(e) => onQtyChange(o.label, parseInt(e.target.value) || 0)} />
              <span>{o.label}{priceTag(o.price)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function priceTag(p?: { model: string; amount: number; unit?: string }) {
  if (!p) return null;
  const suffix = p.unit ? `/${p.unit}` :
    p.model === "per_person" ? "/pp" :
    p.model === "per_adult" ? "/adult" :
    p.model === "per_side_person" ? "/pp (this side)" :
    p.model === "per_tray" ? "/tray" :
    p.model === "per_person_qty" ? "/person" : "";
  return <span className="text-navy font-semibold"> (+${p.amount}{suffix})</span>;
}

function CountBadge({ n, min, max, optional }: { n: number; min: number; max: number; optional: boolean }) {
  const ok = (optional && n === 0) || (n >= min && n <= max);
  return (
    <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
      {n} of {min === max ? min : `${min}–${max}`} selected{optional && n === 0 ? " (optional)" : ""}
    </span>
  );
}
