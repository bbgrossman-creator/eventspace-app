"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import { runActionAutomation } from "@/lib/automation";
import { loadPolicies } from "@/lib/policies";
import { Booking, findConflicts, fmtTime, HOLD_HOURS } from "@/lib/workflow";
import { PRICING } from "@/lib/pricing";
import { sendEmail } from "@/lib/sendEmail";
import { FULL_SERVICE_MENU, BUFFET_MENU, BUSINESS_PHONE } from "@/lib/automation";

interface PackageGuide {
  key: string; name: string; price_label: string | null;
  includes: string | null; best_for: string | null;
  talk_track: string | null; upsells: string | null;
}

const EVENT_TYPES = ["Bar Mitzvah", "Bat Mitzvah", "Wedding", "Engagement", "Sheva Brochos", "Birthday Party", "Corporate Event", "Other"];
const TIMES = Array.from({ length: 13 }, (_, i) => `${(11 + i).toString().padStart(2, "0")}:00`);

export default function NewInquiry() {
  const router = useRouter();
  const [all, setAll] = useState<Booking[]>([]);
  const [f, setF] = useState({
    contact_name: "", phone: "", email: "",
    event_type: "", event_date: "", event_time: "19:00", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [guides, setGuides] = useState<PackageGuide[]>([]);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [showEmailMenus, setShowEmailMenus] = useState(false);

  useEffect(() => {
    supabase.from("bookings").select("*").then(({ data }) => setAll((data ?? []) as Booking[]));
    supabase.from("package_guides").select("*").order("sort_order")
      .then(({ data }) => setGuides((data ?? []) as PackageGuide[]));
  }, []);

  const conflicts =
    f.event_date && f.event_time ? findConflicts(all, f.event_date, f.event_time) : [];

  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function createBooking() {
    setErr("");
    if (!f.contact_name.trim()) { setErr("Customer name is required."); return; }
    if (!f.phone.trim() && !f.email.trim()) { setErr("Enter a phone number or email."); return; }
    setSaving(true);

    const { data: invData, error: invErr } = await supabase.rpc("next_invoice_num");
    if (invErr) { setErr(invErr.message); setSaving(false); return; }
    const invoice_num = invData as string;

    const hasConflict = conflicts.length > 0;
    const holdExpires = new Date();
    holdExpires.setHours(holdExpires.getHours() + HOLD_HOURS);

    // How conflicts are handled depends on the owner's policy.
    const pol = await loadPolicies();
    const holder = hasConflict ? conflicts[0] : null; // first-right-of-refusal holder
    const useRefusal = hasConflict && pol.conflict_mode === "first_refusal";

    let newStatus: string = "on_hold";
    let newHoldExpires: string | null = holdExpires.toISOString();
    if (hasConflict) {
      newStatus = useRefusal ? "waitlisted" : "conflict";
      newHoldExpires = null;
    }

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        invoice_num,
        contact_name: f.contact_name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        event_type: f.event_type || null,
        event_date: f.event_date || null,
        event_time: f.event_time || null,
        menu_type: "Not Sure Yet",
        notes: f.notes.trim() || null,
        status: newStatus,
        hold_expires: newHoldExpires,
        waitlisted_for: useRefusal && holder ? holder.id : null,
      })
      .select()
      .single();

    if (error) { setErr(error.message); setSaving(false); return; }

    // Under first-right-of-refusal, start the holder's decision clock.
    if (useRefusal && holder) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + pol.refusal_deadline_hours);
      await supabase.from("bookings").update({
        refusal_deadline: deadline.toISOString(),
        refusal_challenger: data.id,
      }).eq("id", holder.id);
      await logActivity(holder.id, holder.invoice_num, "First Right of Refusal Started",
        `${f.contact_name.trim()} wants this date. Holder has until ${deadline.toLocaleString()} to commit.`, "WARNING");
    }

    await logActivity(
      data.id, invoice_num,
      hasConflict ? (useRefusal ? "Waitlisted (Date Held)" : "Conflict Detected") : "Booking Created",
      hasConflict
        ? (useRefusal
            ? `Date held by ${holder?.contact_name ?? "another party"} — waitlisted pending their decision`
            : `Conflicts with ${conflicts.length} event(s) — needs review`)
        : `Hold created, expires ${holdExpires.toLocaleString()}`,
      hasConflict ? "WARNING" : "SUCCESS"
    );
    if (!hasConflict) {
      await runActionAutomation("hold_confirmation", data);
    }
    await runActionAutomation("internal_new_booking", data);
    // Under first-right-of-refusal, take the rep to the HOLDER's page to act.
    if (useRefusal && holder) { router.push(`/bookings/${holder.id}`); return; }
    router.push(`/bookings/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">New Inquiry</h1>
        <p className="text-sm text-slate-500 mt-1">Creates a 24-hour hold and assigns the next invoice number.</p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="card p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Customer name *</label>
            <input className="field" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
          <div><label className="label">Phone</label>
            <input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" /></div>
          <div><label className="label">Email</label>
            <input className="field" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label className="label">Event type</label>
            <select className="field" value={f.event_type} onChange={(e) => set("event_type", e.target.value)}>
              <option value="">— Select —</option>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><label className="label">Event date</label>
            <input className="field" type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} /></div>
          <div><label className="label">Start time</label>
            <select className="field" value={f.event_time} onChange={(e) => set("event_time", e.target.value)}>
              {TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className="label">Notes</label>
            <textarea className="field" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>

        {f.event_date && (
          conflicts.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 font-medium">
              ✅ Available — no events within 4 hours of this time
            </div>
          ) : (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <p className="font-bold mb-1">⚠️ Time conflict — will be saved for review</p>
              {conflicts.map((c) => (
                <p key={c.id}>• #{c.invoice_num} {c.contact_name} at {fmtTime(c.event_time)}</p>
              ))}
              <p className="mt-1 text-xs">Events must be 4+ hours apart (start to start).</p>
            </div>
          )
        )}

        {err && <p className="text-sm text-red-600 font-medium">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={createBooking} disabled={saving} className="btn-primary flex-1">
            {saving ? "Creating…" : conflicts.length > 0 ? "Create as Conflict (review)" : "Create Hold (24h)"}
          </button>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display font-bold text-sm">Quick pricing reference</h2>
          <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setShowEmailMenus((s) => !s)}>
            📧 Email menus to customer
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">Tap a package for how to present it to the customer.</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            { key: "full_service", icon: "🍽️", label: "Full Service Plated", price: PRICING.FULL_SERVICE_PP },
            { key: "single_buffet", icon: "🥘", label: "Single Buffet", price: PRICING.BUFFET_SINGLE_PP },
            { key: "double_buffet", icon: "🥘🥘", label: "Double Buffet", price: PRICING.BUFFET_DOUBLE_PP },
          ].map((p) => {
            const guide = guides.find((g) => g.key === p.key);
            const isOpen = openGuide === p.key;
            return (
              <div key={p.key} className="rounded-lg bg-goldsoft overflow-hidden">
                <button className="w-full text-left p-3 hover:bg-gold/10 transition-colors"
                  onClick={() => setOpenGuide(isOpen ? null : p.key)}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.icon} {p.label}</span>
                    <span className="text-[11px] text-navy font-semibold">{isOpen ? "Hide ▲" : "How to sell ▼"}</span>
                  </div>
                  <div className="text-navy font-display font-bold text-lg">${p.price}<span className="text-xs text-slate-500 font-body">/person</span></div>
                </button>
                {isOpen && guide && (
                  <div className="px-3 pb-3 pt-1 space-y-2 text-xs border-t border-gold/30">
                    {guide.price_label && <p className="text-slate-500">{guide.price_label}</p>}
                    {guide.includes && <div><b className="text-ink">Includes:</b> <span className="text-slate-600">{guide.includes}</span></div>}
                    {guide.best_for && <div><b className="text-ink">Best for:</b> <span className="text-slate-600">{guide.best_for}</span></div>}
                    {guide.talk_track && <div><b className="text-ink">How to present:</b> <span className="text-slate-600">{guide.talk_track}</span></div>}
                    {guide.upsells && <div><b className="text-ink">Upsells:</b> <span className="text-slate-600">{guide.upsells}</span></div>}
                  </div>
                )}
                {isOpen && !guide && (
                  <div className="px-3 pb-3 text-xs text-slate-400">No guide yet — add one in Back Office → Package Guides.</div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg bg-goldsoft p-3">
            <div className="font-semibold">Key extras</div>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
              Children ${PRICING.BUFFET_CHILDREN_PP} · Dessert station ${PRICING.BUFFET_DESSERT_STATION_PP}/pp · Deposit ${PRICING.DEPOSIT_AMOUNT}
            </div>
          </div>
        </div>

        {showEmailMenus && <EmailMenusPanel defaultEmail={f.email} contactName={f.contact_name} />}

        <p className="text-[11px] text-slate-400 mt-3">Prices subject to 6.625% NJ sales tax. Credit card payments add a 3% processing fee.</p>
      </div>
    </div>
  );

}

// ─── Pre-hold "email menus" panel (works without a booking) ───
function EmailMenusPanel({ defaultEmail, contactName }: { defaultEmail: string; contactName: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [which, setWhich] = useState<"both" | "full_service" | "buffet">("both");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (defaultEmail) setEmail(defaultEmail); }, [defaultEmail]);

  async function send() {
    setResult(null);
    if (!email.trim()) { setResult({ ok: false, text: "Enter an email address." }); return; }
    setBusy(true);
    const links: string[] = [];
    if (which === "both" || which === "full_service") links.push(`📄 Full Service Menu: ${FULL_SERVICE_MENU}`);
    if (which === "both" || which === "buffet") links.push(`📄 Buffet Menu: ${BUFFET_MENU}`);
    const text =
      `Dear ${contactName || "there"},\n\n` +
      `Thank you for your interest in Event Space by Burger Bar! ` +
      `As requested, here ${links.length > 1 ? "are our menus" : "is our menu"}:\n\n` +
      links.join("\n") + `\n\n` +
      `Our packages start at $60 per person (40 guest minimum). When you're ready to ` +
      `reserve your date, a $500 deposit secures it.\n\n` +
      `Questions? Call us at ${BUSINESS_PHONE} — we're happy to help.\n\n` +
      `We hope to celebrate with you!\n\nEvent Space by Burger Bar`;
    const res = await sendEmail({
      to: email.trim(),
      subject: "Our menus — Event Space by Burger Bar",
      text,
      action: "Pre-Hold Menus Emailed",
    });
    setBusy(false);
    setResult(res.ok ? { ok: true, text: `Sent ✓ ${res.detail}` } : { ok: false, text: res.detail });
  }

  return (
    <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4">
      <h3 className="font-display font-bold text-sm mb-1">📧 Email menus before a hold</h3>
      <p className="text-xs text-slate-500 mb-3">For an interested customer who wants to see the menus first. No booking needed.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Send to</label>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </div>
        <div>
          <label className="label">Which menu(s)?</label>
          <select className="field" value={which} onChange={(e) => setWhich(e.target.value as "both" | "full_service" | "buffet")}>
            <option value="both">Both menus</option>
            <option value="full_service">Full Service only</option>
            <option value="buffet">Buffet only</option>
          </select>
        </div>
      </div>
      {result && <p className={`text-sm mt-2 font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.text}</p>}
      <button onClick={send} disabled={busy} className="btn-primary mt-3 w-full">{busy ? "Sending…" : "Send Menus"}</button>
    </div>
  );
}