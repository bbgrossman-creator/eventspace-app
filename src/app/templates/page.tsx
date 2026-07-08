"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, logActivity } from "@/lib/supabase";
import { MenuTemplate } from "@/lib/menuEngine";

interface TemplateRow { id: string; slug: string; name: string; active: boolean; category: string | null; sort_order: number | null; config: MenuTemplate; updated_at: string; }

export default function Templates() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("menu_templates").select("*").order("sort_order", { ascending: true }).order("name");
    setRows((data ?? []) as TemplateRow[]);
  }
  useEffect(() => { load(); }, []);

  function open(r: TemplateRow) {
    setSelected(r);
    setDraft(JSON.stringify(r.config, null, 2));
    setMsg(null);
  }

  async function save() {
    if (!selected) return;
    setMsg(null);
    let parsed: MenuTemplate;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setMsg({ ok: false, text: `Invalid JSON — nothing saved. ${(e as Error).message}` });
      return;
    }
    // light structural validation before letting it near the database
    if (!parsed.slug || !parsed.name || !parsed.base || !Array.isArray(parsed.sections)) {
      setMsg({ ok: false, text: "Template must have slug, name, base, and a sections array — nothing saved." });
      return;
    }
    const dupes = parsed.sections.map((s) => s.key).filter((k, i, a) => a.indexOf(k) !== i);
    if (dupes.length) {
      setMsg({ ok: false, text: `Duplicate section keys: ${Array.from(new Set(dupes)).join(", ")} — keys must be unique. Nothing saved.` });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("menu_templates")
      .update({ config: parsed, name: parsed.name, updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await logActivity(null, "—", "Menu Template Updated", `${selected.slug}: ${parsed.sections.length} sections`);
    setMsg({ ok: true, text: `Saved ✓ — new bookings and re-opened menu forms use this version immediately.` });
    load();
  }

  return (
    <div>
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Menu Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            The menus are data — build and edit them here. Changes apply to menu forms immediately.
          </p>
          <div className="gold-rule mt-3" />
        </div>
        <Link href="/templates/builder/new" className="btn-primary">＋ New Template</Link>
      </header>

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Template list */}
        <div className="space-y-2.5">
          {Array.from(new Set(rows.map((r) => r.category ?? "General"))).map((cat) => (
            <div key={cat}>
              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase px-1 mb-1.5 mt-2">{cat}</div>
              <div className="space-y-2.5">
                {rows.filter((r) => (r.category ?? "General") === cat).map((r) => (
                  <div key={r.id}
                    className={`card w-full px-4 py-3 hover:shadow-lg transition-shadow ${selected?.id === r.id ? "ring-2 ring-navy" : ""}`}>
                    <Link href={`/templates/builder/${r.id}`} className="block">
                      <div className="font-display font-bold text-sm hover:text-navy">{r.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {r.slug} · {r.config.sections?.length ?? 0} sections{r.config.base?.adult_pp ? ` · $${r.config.base.adult_pp}/pp` : ""}
                      </div>
                    </Link>
                    <div className="flex gap-3 mt-1.5 text-[11px]">
                      <Link href={`/templates/builder/${r.id}`} className="text-navy font-semibold hover:underline">🛠️ Builder</Link>
                      <button onClick={() => open(r)} className="text-slate-400 hover:text-navy hover:underline">JSON (advanced)</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-slate-400">No templates — run supabase/menu_templates.sql.</p>}

          <div className="card px-4 py-3 text-xs text-slate-500 leading-relaxed">
            <b className="text-ink">Quick reference</b><br />
            Price models: <code>per_person</code>, <code>per_side_person</code>, <code>flat</code>, <code>per_tray</code>, <code>per_person_qty</code>.<br />
            Section types: <code>choose</code>, <code>multi</code>, <code>toggle</code>, <code>qty</code>, <code>text</code>, <code>info</code>.<br />
            A station setup is just an option with a <code>flat</code> or <code>per_person</code> price.
          </div>
        </div>

        {/* Editor */}
        {selected ? (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-display font-bold">{selected.name}</h2>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" onClick={() => open(selected)}>↩️ Discard Changes</button>
                <button className="btn-primary !py-1.5" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "💾 Save Template"}
                </button>
              </div>
            </div>
            {msg && (
              <div className={`rounded-lg px-4 py-2.5 mb-3 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                {msg.text}
              </div>
            )}
            <textarea
              className="w-full h-[600px] rounded-lg border border-slate-300 p-4 font-mono text-xs leading-relaxed focus:border-navy focus:ring-2 focus:ring-navy/20 focus:outline-none"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-2">
              Invalid JSON or duplicate keys are rejected before saving — you can&apos;t break a template with a typo.
              Already-saved customer selections are never modified by template edits.
            </p>
          </div>
        ) : (
          <div className="card p-10 text-center text-slate-400">Select a template to edit.</div>
        )}
      </div>
    </div>
  );
}
