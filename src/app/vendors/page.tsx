"use client";
/**
 * Vendors (v146) — outside suppliers, managed in the backoffice.
 * A task can link to a vendor (see the task composer); this is where staff
 * create and maintain the vendor list. Purely additive to the app.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Vendor {
  id: string; name: string; category: string | null;
  contact_person: string | null; phone: string | null; email: string | null;
  notes: string | null; active: boolean; sort_order: number;
}

const BLANK = { name: "", category: "", contact_person: "", phone: "", email: "", notes: "" };

export default function VendorsAdmin() {
  const [rows, setRows] = useState<Vendor[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<string | null>(null);
  const [eForm, setEForm] = useState({ ...BLANK });
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("vendors").select("*")
      .order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (error) { setErr(`Couldn't load vendors: ${error.message} — run v146_vendors.sql.`); return; }
    setErr("");
    setRows((data ?? []) as Vendor[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.name.trim()) { setErr("A vendor needs a name."); return; }
    const { error } = await supabase.from("vendors").insert({
      name: form.name.trim(), category: form.category.trim() || null,
      contact_person: form.contact_person.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, notes: form.notes.trim() || null, active: true,
    });
    if (error) { setErr(`Couldn't add vendor: ${error.message}`); return; }
    setForm({ ...BLANK }); setAdding(false); load();
  }
  function startEdit(v: Vendor) {
    setEditing(v.id);
    setEForm({
      name: v.name, category: v.category ?? "", contact_person: v.contact_person ?? "",
      phone: v.phone ?? "", email: v.email ?? "", notes: v.notes ?? "",
    });
  }
  async function saveEdit(id: string) {
    if (!eForm.name.trim()) { setErr("A vendor needs a name."); return; }
    const { error } = await supabase.from("vendors").update({
      name: eForm.name.trim(), category: eForm.category.trim() || null,
      contact_person: eForm.contact_person.trim() || null, phone: eForm.phone.trim() || null,
      email: eForm.email.trim() || null, notes: eForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { setErr(`Couldn't save: ${error.message}`); return; }
    setEditing(null); load();
  }
  async function toggleActive(v: Vendor) {
    const { error } = await supabase.from("vendors")
      .update({ active: !v.active, updated_at: new Date().toISOString() }).eq("id", v.id);
    if (error) { setErr(`Couldn't update: ${error.message}`); return; }
    load();
  }

  const shown = showInactive ? rows : rows.filter((v) => v.active);

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-slate-500 mt-1">Outside suppliers a task can be assigned to.</p>
          <div className="gold-rule mt-3" />
        </div>
        <button className="btn-primary" onClick={() => { setAdding((v) => !v); setForm({ ...BLANK }); }}>＋ New Vendor</button>
      </header>

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-4">⚠️ {err}</p>}

      {adding && (
        <div className="card p-5 mb-5 space-y-3">
          <h2 className="font-display font-bold text-sm">New vendor</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Vendor name *</label>
              <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Blooms & Petals" /></div>
            <div><label className="label">Category / type</label>
              <input className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Florist, Rentals, Photography" /></div>
            <div><label className="label">Contact person</label>
              <input className="field" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><label className="label">Phone</label>
              <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label>
              <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><label className="label">Notes</label>
            <textarea className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2">
            <button className="btn-primary !py-2 !px-4 text-sm" onClick={add}>Save vendor</button>
            <button className="btn-ghost !py-2 !px-3 text-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400">{shown.length} vendor{shown.length === 1 ? "" : "s"}</p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3 opacity-50">🏷️</div>
          <p className="font-display font-semibold text-lg">No vendors yet.</p>
          <p className="text-sm text-slate-500 mt-1">Add florists, rental companies, photographers, and other suppliers you assign tasks to.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((v) => (
            <div key={v.id} className={`card p-4 ${!v.active ? "opacity-60" : ""}`}>
              {editing === v.id ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className="label">Vendor name *</label>
                      <input className="field" value={eForm.name} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} /></div>
                    <div><label className="label">Category / type</label>
                      <input className="field" value={eForm.category} onChange={(e) => setEForm({ ...eForm, category: e.target.value })} /></div>
                    <div><label className="label">Contact person</label>
                      <input className="field" value={eForm.contact_person} onChange={(e) => setEForm({ ...eForm, contact_person: e.target.value })} /></div>
                    <div><label className="label">Phone</label>
                      <input className="field" value={eForm.phone} onChange={(e) => setEForm({ ...eForm, phone: e.target.value })} /></div>
                    <div><label className="label">Email</label>
                      <input className="field" type="email" value={eForm.email} onChange={(e) => setEForm({ ...eForm, email: e.target.value })} /></div>
                  </div>
                  <div><label className="label">Notes</label>
                    <textarea className="field" rows={2} value={eForm.notes} onChange={(e) => setEForm({ ...eForm, notes: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <button className="btn-primary !py-2 !px-4 text-sm" onClick={() => saveEdit(v.id)}>Save</button>
                    <button className="btn-ghost !py-2 !px-3 text-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-[16px]">{v.name}</span>
                      {v.category && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-500">{v.category}</span>}
                      {!v.active && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">Inactive</span>}
                    </div>
                    <div className="text-[13px] text-slate-500 mt-1 space-y-0.5">
                      {v.contact_person && <div>👤 {v.contact_person}</div>}
                      {(v.phone || v.email) && <div>{[v.phone, v.email].filter(Boolean).join(" · ")}</div>}
                      {v.notes && <div className="text-slate-400">{v.notes}</div>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button className="text-xs text-navy hover:underline font-medium" onClick={() => startEdit(v)}>Edit</button>
                    <button className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={() => toggleActive(v)}>
                      {v.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
