"use client";
// ═══════════════════════════════════════════════════════════════════════════
// EVENT COMPONENTS — minimal editor (Knowledge Architecture step 2).
// Gated on caps.components_editor: renders NOTHING for template-driven
// businesses, so their screens stay pixel-identical. No drag-and-drop, no
// Rolodex, no proposals — those are later steps. Just: see, add, edit,
// delete the reusable components of THIS event.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";

interface ComponentRow {
  id: string; domain: string; kind: string | null; title: string;
  position: number; copied_from: string | null; notes: string | null;
}
interface ItemRow {
  id: string; component_id: string; name: string; description: string | null;
  quantity: number | null; quantity_basis: string | null; unit_price: number | null; position: number;
}
interface ReqRow { id: string; component_id: string; name: string; category: string | null; }
interface PhotoRow {
  id: string; file_id: string; booking_id: string; component_id: string | null;
  caption: string | null; is_cover: boolean;
}

const DOMAINS = ["food", "decor", "flowers", "lighting", "music", "layout", "timeline", "kids", "photo", "transport", "kitchen", "logistics", "staffing", "custom"];
const DOMAIN_ICON: Record<string, string> = {
  food: "🍽", decor: "🎀", flowers: "💐", lighting: "💡", music: "🎵", layout: "🪑",
  timeline: "🕰", kids: "🧒", photo: "📸", transport: "🚚", kitchen: "👨‍🍳",
  logistics: "📦", staffing: "👥", custom: "•",
};

export default function ComponentsCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [comps, setComps] = useState<ComponentRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}); // photo.id → signed URL
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);  // component id mid-upload
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [nTitle, setNTitle] = useState("");
  const [nDomain, setNDomain] = useState("food");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [reqDrafts, setReqDrafts] = useState<Record<string, string>>({});

  // ── Copy from Past Event (Knowledge Architecture step 4) ──
  interface SrcEvent { id: string; invoice_num: string; contact_name: string; event_name: string | null; event_type: string | null; event_date: string | null; comp_count: number; }
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyQuery, setCopyQuery] = useState("");
  const [srcEvents, setSrcEvents] = useState<SrcEvent[]>([]);
  const [srcPicked, setSrcPicked] = useState<SrcEvent | null>(null);
  const [srcComps, setSrcComps] = useState<(ComponentRow & { itemCount: number; reqCount: number })[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [optQty, setOptQty] = useState(true);
  const [optPricing, setOptPricing] = useState(false);   // default OFF — price fresh
  const [optNotes, setOptNotes] = useState(true);
  const [optReqs, setOptReqs] = useState(true);           // the ops-checklist moment
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);

  const load = useCallback(async () => {
    const { data: cs, error } = await supabase.from("event_components")
      .select("id,domain,kind,title,position,copied_from,notes")
      .eq("booking_id", b.id).order("position");
    if (error) { setErr(`Components couldn't load: ${error.message} — run v164 SQL.`); return; }
    setErr("");
    const rows = (cs ?? []) as ComponentRow[];
    setComps(rows);
    const ids = rows.map((c) => c.id);
    if (!ids.length) { setItems([]); setReqs([]); setPhotos([]); return; }
    const [i, r, p] = await Promise.all([
      supabase.from("component_items").select("*").in("component_id", ids).order("position"),
      supabase.from("component_requirements").select("id,component_id,name,category").in("component_id", ids),
      supabase.from("photos").select("id,file_id,booking_id,component_id,caption,is_cover").in("component_id", ids),
    ]);
    setItems((i.data ?? []) as ItemRow[]);
    setReqs((r.data ?? []) as ReqRow[]);
    const ph = (p.data ?? []) as PhotoRow[];
    setPhotos(ph);
    // Signed thumbnail URLs (private bucket). Missing photos table → ignore
    // quietly; the strip just doesn't render until v166 SQL runs.
    if (ph.length) {
      const fileIds = ph.map((x) => x.file_id);
      const { data: frs } = await supabase.from("booking_files").select("id,path").in("id", fileIds);
      const pathByFile: Record<string, string> = {};
      for (const fr of (frs ?? []) as { id: string; path: string }[]) pathByFile[fr.id] = fr.path;
      const t: Record<string, string> = {};
      await Promise.all(ph.map(async (x) => {
        const path = pathByFile[x.file_id];
        if (!path) return;
        const { data: s } = await supabase.storage.from("booking-files").createSignedUrl(path, 3600);
        if (s?.signedUrl) t[x.id] = s.signedUrl;
      }));
      setThumbs(t);
    } else setThumbs({});
  }, [b.id]);
  useEffect(() => { if (caps?.components_editor) load(); }, [caps, load]);

  // The gate: template-driven renders NOTHING — not an empty card, nothing.
  if (!caps?.components_editor) return null;

  async function addComponent() {
    if (!nTitle.trim()) return;
    const { error } = await supabase.from("event_components").insert({
      booking_id: b.id, domain: caps!.multi_domain ? nDomain : "food",
      title: nTitle.trim(), position: comps.length,
    });
    if (error) { setErr(`Couldn't add: ${error.message}`); return; }
    setNTitle(""); setAdding(false); load();
  }
  async function removeComponent(c: ComponentRow) {
    if (!confirm(`Remove "${c.title}" and its items?`)) return;
    const { error } = await supabase.from("event_components").delete().eq("id", c.id);
    if (error) { setErr(`Couldn't remove: ${error.message}`); return; }
    load();
  }
  async function addItem(compId: string) {
    const name = (itemDrafts[compId] ?? "").trim();
    if (!name) return;
    const count = items.filter((i) => i.component_id === compId).length;
    const { error } = await supabase.from("component_items").insert({ component_id: compId, name, position: count });
    if (error) { setErr(`Couldn't add item: ${error.message}`); return; }
    setItemDrafts((p) => ({ ...p, [compId]: "" })); load();
  }
  async function removeItem(i: ItemRow) {
    await supabase.from("component_items").delete().eq("id", i.id); load();
  }
  async function addReq(compId: string) {
    const name = (reqDrafts[compId] ?? "").trim();
    if (!name) return;
    const { error } = await supabase.from("component_requirements").insert({ component_id: compId, name });
    if (error) { setErr(`Couldn't add requirement: ${error.message}`); return; }
    setReqDrafts((p) => ({ ...p, [compId]: "" })); load();
  }
  async function removeReq(r: ReqRow) {
    await supabase.from("component_requirements").delete().eq("id", r.id); load();
  }

  /** Lightest possible capture path: pick/drop an image on the component.
   *  Uploads to the SAME bucket + booking_files row as FilesPanel (category
   *  "Photo" — so it also shows in Files), then links it via the photos
   *  metadata table. First photo on a component becomes its cover. */
  async function attachPhoto(compId: string, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("That file isn't an image."); return; }
    setPhotoBusy(compId); setErr("");
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${b.id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("booking-files").upload(path, file);
    if (upErr) { setErr(`Upload failed: ${upErr.message}`); setPhotoBusy(null); return; }
    const { data: fr, error: rowErr } = await supabase.from("booking_files").insert({
      booking_id: b.id, name: file.name, path, category: "Photo", size_bytes: file.size,
    }).select("id").single();
    if (rowErr || !fr) { setErr(`Upload saved but couldn't be recorded: ${rowErr?.message ?? "unknown"}`); setPhotoBusy(null); return; }
    const hasCover = photos.some((p) => p.component_id === compId && p.is_cover);
    const { error: pErr } = await supabase.from("photos").insert({
      file_id: fr.id, booking_id: b.id, component_id: compId, is_cover: !hasCover,
    });
    if (pErr) { setErr(`Photo linked to Files but not the component: ${pErr.message} — run v166 SQL.`); setPhotoBusy(null); return; }
    setPhotoBusy(null); load();
  }
  async function makeCover(p: PhotoRow) {
    if (!p.component_id) return;
    await supabase.from("photos").update({ is_cover: false }).eq("component_id", p.component_id);
    await supabase.from("photos").update({ is_cover: true }).eq("id", p.id);
    load();
  }
  /** Detach from the component only — the file stays in Files. */
  async function detachPhoto(p: PhotoRow) {
    const { error } = await supabase.from("photos").delete().eq("id", p.id);
    if (error) { setErr(`Couldn't detach: ${error.message}`); return; }
    load();
  }

  // ── Copy from Past Event ──
  /** Only events that actually HAVE components are copy sources — which, via
   *  the backfill, includes every past completed template menu. */
  async function openCopy() {
    setCopyOpen(true); setSrcPicked(null); setChecked({}); setCopyQuery("");
    const { data: compRows, error } = await supabase.from("event_components").select("booking_id");
    if (error) { setErr(`Couldn't load sources: ${error.message}`); return; }
    const counts: Record<string, number> = {};
    for (const r of (compRows ?? []) as { booking_id: string }[]) counts[r.booking_id] = (counts[r.booking_id] ?? 0) + 1;
    const ids = Object.keys(counts).filter((id) => id !== b.id);
    if (!ids.length) { setSrcEvents([]); return; }
    const { data: evs } = await supabase.from("bookings")
      .select("id,invoice_num,contact_name,event_name,event_type,event_date").in("id", ids)
      .order("event_date", { ascending: false });
    setSrcEvents(((evs ?? []) as Omit<SrcEvent, "comp_count">[]).map((e) => ({ ...e, comp_count: counts[e.id] ?? 0 })));
  }
  async function pickSource(ev: SrcEvent) {
    setSrcPicked(ev); setChecked({});
    const { data: cs } = await supabase.from("event_components")
      .select("id,domain,kind,title,position,copied_from,notes").eq("booking_id", ev.id).order("position");
    const rows = (cs ?? []) as ComponentRow[];
    const ids = rows.map((c) => c.id);
    const [i, r] = ids.length ? await Promise.all([
      supabase.from("component_items").select("component_id").in("component_id", ids),
      supabase.from("component_requirements").select("component_id").in("component_id", ids),
    ]) : [{ data: [] }, { data: [] }];
    const ic: Record<string, number> = {}, rc: Record<string, number> = {};
    for (const x of (i.data ?? []) as { component_id: string }[]) ic[x.component_id] = (ic[x.component_id] ?? 0) + 1;
    for (const x of (r.data ?? []) as { component_id: string }[]) rc[x.component_id] = (rc[x.component_id] ?? 0) + 1;
    setSrcComps(rows.map((c) => ({ ...c, itemCount: ic[c.id] ?? 0, reqCount: rc[c.id] ?? 0 })));
  }
  async function runImport() {
    const pickedIds = srcComps.filter((c) => checked[c.id]).map((c) => c.id);
    if (!pickedIds.length || !srcPicked) return;
    setImporting(true); setErr("");
    const [srcItems, srcReqs] = await Promise.all([
      supabase.from("component_items").select("*").in("component_id", pickedIds).order("position"),
      optReqs ? supabase.from("component_requirements").select("component_id,name,category,notes").in("component_id", pickedIds) : Promise.resolve({ data: [] }),
    ]);
    let pos = comps.length, made = 0;
    for (const src of srcComps.filter((c) => checked[c.id])) {
      const { data: nc, error: cErr } = await supabase.from("event_components").insert({
        booking_id: b.id, domain: src.domain, kind: src.kind, title: src.title,
        position: pos++, copied_from: src.id,                       // ← provenance
        notes: optNotes ? src.notes : null,
      }).select("id").single();
      if (cErr || !nc) { setErr(`Import failed on "${src.title}": ${cErr?.message ?? "unknown"}`); setImporting(false); load(); return; }
      const its = ((srcItems.data ?? []) as ItemRow[]).filter((i) => i.component_id === src.id);
      if (its.length) {
        const { error: iErr } = await supabase.from("component_items").insert(its.map((i, idx) => ({
          component_id: nc.id, name: i.name,
          description: optNotes ? i.description : null,
          quantity: optQty ? i.quantity : null,
          quantity_basis: optQty ? i.quantity_basis : null,
          unit_price: optPricing ? i.unit_price : null,
          position: idx,
        })));
        if (iErr) { setErr(`Items failed on "${src.title}": ${iErr.message}`); setImporting(false); load(); return; }
      }
      const rqs = ((srcReqs.data ?? []) as { component_id: string; name: string; category: string | null; notes: string | null }[])
        .filter((r) => r.component_id === src.id);
      if (rqs.length) {
        await supabase.from("component_requirements").insert(rqs.map((r) => ({
          component_id: nc.id, name: r.name, category: r.category, notes: r.notes,
        })));
      }
      made++;
    }
    await logActivity(b.id, b.invoice_num, "Components Copied",
      `↺ ${made} component${made === 1 ? "" : "s"} from #${srcPicked.invoice_num} (${srcPicked.contact_name})${optPricing ? " incl. pricing" : ""}`);
    setImporting(false); setCopyOpen(false); load();
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display font-semibold text-[15px]">🧩 Event Components</h2>
        <div className="flex items-center gap-3">
          {caps.component_copy && (
            <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors"
              onClick={() => copyOpen ? setCopyOpen(false) : openCopy()}>↺ Copy from Past Event</button>
          )}
          <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors"
            onClick={() => setAdding((v) => !v)}>＋ Add Component</button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">The reusable pieces of this event. Every component becomes future proposal material.</p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      {copyOpen && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-3 mb-3 reveal">
          {!srcPicked ? (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Copy from which event?</div>
              <input className="field !py-1.5 !text-xs !bg-white w-full" autoFocus
                placeholder="Search past events — name, type…" value={copyQuery}
                onChange={(e) => setCopyQuery(e.target.value)} />
              <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {srcEvents
                  .filter((ev) => {
                    const q = copyQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (ev.contact_name ?? "").toLowerCase().includes(q)
                      || (ev.event_name ?? "").toLowerCase().includes(q)
                      || (ev.event_type ?? "").toLowerCase().includes(q)
                      || (ev.invoice_num ?? "").includes(q);
                  })
                  .slice(0, 12)
                  .map((ev) => (
                    <button key={ev.id} type="button" className="block w-full text-left px-2 py-1.5 text-sm hover:bg-white rounded"
                      onClick={() => pickSource(ev)}>
                      <span className="font-semibold">{ev.contact_name}</span>
                      <span className="text-slate-400"> · {ev.event_name || ev.event_type || "Event"}{ev.event_date ? ` · ${ev.event_date}` : ""} · #{ev.invoice_num}</span>
                      <span className="float-right text-[11px] text-[#2F80ED] font-semibold">{ev.comp_count} component{ev.comp_count === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                {srcEvents.length === 0 && (
                  <p className="text-xs text-slate-400 py-2">No past events have components yet — run the Tier-1 backfill (Configuration → Business Model) to convert completed menus.</p>
                )}
              </div>
              <button className="text-xs text-slate-400 underline mt-2" onClick={() => setCopyOpen(false)}>cancel</button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  From {srcPicked.contact_name}{srcPicked.event_type ? ` · ${srcPicked.event_type}` : ""} · #{srcPicked.invoice_num}
                </div>
                <button className="text-[11px] text-slate-400 underline" onClick={() => setSrcPicked(null)}>← different event</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                <label className="flex items-center gap-2 text-[11px] text-slate-500 cursor-pointer pb-1">
                  <input type="checkbox" className="accent-[#4A9EFF]"
                    checked={srcComps.length > 0 && srcComps.every((c) => checked[c.id])}
                    onChange={(e) => {
                      const all: Record<string, boolean> = {};
                      for (const c of srcComps) all[c.id] = e.target.checked;
                      setChecked(all);
                    }} />
                  Select all
                </label>
                {srcComps.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-white cursor-pointer">
                    <input type="checkbox" className="accent-[#4A9EFF]" checked={!!checked[c.id]}
                      onChange={(e) => setChecked((p) => ({ ...p, [c.id]: e.target.checked }))} />
                    <span>{DOMAIN_ICON[c.domain] ?? "•"}</span>
                    <span className="font-medium">{c.title}</span>
                    <span className="text-[11px] text-slate-400">{c.itemCount} item{c.itemCount === 1 ? "" : "s"}{c.reqCount ? ` · ${c.reqCount} req` : ""}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Import:</span>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#4A9EFF]" checked readOnly disabled /> Items</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#4A9EFF]" checked={optQty} onChange={(e) => setOptQty(e.target.checked)} /> Quantities</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#4A9EFF]" checked={optPricing} onChange={(e) => setOptPricing(e.target.checked)} /> Pricing</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#4A9EFF]" checked={optNotes} onChange={(e) => setOptNotes(e.target.checked)} /> Notes</label>
                {caps.requirements && (
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#4A9EFF]" checked={optReqs} onChange={(e) => setOptReqs(e.target.checked)} /> Requirements</label>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button className="btn-primary !py-1 !px-3 text-xs" disabled={importing || !srcComps.some((c) => checked[c.id])}
                  onClick={runImport}>
                  {importing ? "Importing…" : `Import ${srcComps.filter((c) => checked[c.id]).length || ""}`}
                </button>
                <button className="text-xs text-slate-400 underline" onClick={() => setCopyOpen(false)}>cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {adding && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-2.5 mb-3 flex gap-1.5 flex-wrap items-center reveal">
          {caps.multi_domain && (
            <select className="field !py-1 !text-xs !bg-white w-[8.5rem]" value={nDomain} onChange={(e) => setNDomain(e.target.value)}>
              {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_ICON[d]} {d}</option>)}
            </select>
          )}
          <input className="field !py-1 !text-xs !bg-white flex-1 min-w-[140px]" autoFocus
            placeholder='Component title — e.g. "Cocktail Hour"' value={nTitle}
            onChange={(e) => setNTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addComponent(); }} />
          <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={addComponent}>Add</button>
          <button className="text-xs text-slate-400 underline" onClick={() => setAdding(false)}>cancel</button>
        </div>
      )}

      {comps.length === 0 && !adding && (
        <p className="text-[13px] text-slate-400">No components yet. Add the first one — or they'll appear automatically when a menu is backfilled.</p>
      )}

      <div className="space-y-3">
        {comps.map((c) => {
          const its = items.filter((i) => i.component_id === c.id);
          const rs = reqs.filter((r) => r.component_id === c.id);
          return (
            <div key={c.id} className="rounded-lg ring-1 ring-[#E7EDF5] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px]">{DOMAIN_ICON[c.domain] ?? "•"}</span>
                  <span className="text-sm font-semibold truncate">{c.title}</span>
                  {c.copied_from && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#F4F9FF] text-[#2F80ED]" title="Copied from a past event">↺ reused</span>}
                </div>
                <button className="text-[10px] text-slate-300 hover:text-red-500 underline shrink-0" onClick={() => removeComponent(c)}>remove</button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {its.map((i) => (
                  <span key={i.id} className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-[#F6F8FB] ring-1 ring-[#E7EDF5]">
                    {i.name}{i.quantity ? <b className="text-slate-500">×{i.quantity}</b> : null}
                    <button className="text-slate-300 hover:text-red-500" title="Remove item" onClick={() => removeItem(i)}>✕</button>
                  </span>
                ))}
                <input className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-[#E7EDF5] outline-none focus:ring-[#4A9EFF] min-w-[110px]"
                  placeholder="+ item, Enter" value={itemDrafts[c.id] ?? ""}
                  onChange={(e) => setItemDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addItem(c.id); }} />
              </div>
              {caps.requirements && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Needs</span>
                  {rs.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-amber-50 ring-1 ring-amber-100 text-amber-800">
                      {r.name}
                      <button className="text-amber-300 hover:text-red-500" title="Remove" onClick={() => removeReq(r)}>✕</button>
                    </span>
                  ))}
                  <input className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-[#E7EDF5] outline-none focus:ring-[#4A9EFF] min-w-[110px]"
                    placeholder="+ requirement, Enter" value={reqDrafts[c.id] ?? ""}
                    onChange={(e) => setReqDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addReq(c.id); }} />
                </div>
              )}
              {caps.photos_retrieval && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  {photos.filter((p) => p.component_id === c.id).map((p) => (
                    <div key={p.id} className="relative group/ph w-14 h-14 rounded-lg overflow-hidden ring-1 ring-[#E7EDF5] bg-slate-100">
                      {thumbs[p.id]
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={thumbs[p.id]} alt={p.caption ?? "Photo"} className="w-full h-full object-cover" />
                        : <span className="grid place-items-center w-full h-full text-slate-300 text-lg">📷</span>}
                      <div className="absolute inset-0 hidden group-hover/ph:flex items-start justify-between p-0.5 bg-black/30">
                        <button title={p.is_cover ? "Cover photo" : "Make cover"} className="text-[11px]"
                          onClick={() => makeCover(p)}>{p.is_cover ? "⭐" : "☆"}</button>
                        <button title="Detach (stays in Files)" className="text-[11px]" onClick={() => detachPhoto(p)}>✕</button>
                      </div>
                      {p.is_cover && <span className="absolute bottom-0.5 left-0.5 text-[10px] group-hover/ph:hidden">⭐</span>}
                    </div>
                  ))}
                  <label className={`w-14 h-14 rounded-lg grid place-items-center text-slate-300 hover:text-[#2F80ED] ring-1 ring-dashed ring-[#E7EDF5] hover:ring-[#4A9EFF] cursor-pointer transition-colors ${photoBusy === c.id ? "opacity-50 pointer-events-none" : ""}`}
                    title="Add photo"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); attachPhoto(c.id, e.dataTransfer.files); }}>
                    <span className="text-lg leading-none">{photoBusy === c.id ? "…" : "＋"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => attachPhoto(c.id, e.target.files)} />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
