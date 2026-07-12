"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE ROLODEX (Knowledge Architecture step 6) — institutional memory.
//
// "Pull up Goldberg — and anything like Goldberg." Search across components,
// items, and debrief wisdom; results are photo-led and grouped by event.
//
// Two modes, same data, different intent:
//   EXPLORE — "show me ideas."  Browse, remember visually, follow links.
//   COPY    — "I want this."    Pick a destination booking, check components,
//                               import (with provenance) in one motion.
//
// Honest v1: plain SQL (ilike) over structured tables. Semantic search is a
// later layer on the same data. Gated on caps.rolodex.
//
// A SERVICE, NOT A PAGE: this panel is the whole Rolodex — the /rolodex page
// is a thin wrapper around it, and Proposal Studio (step 7) will embed the
// exact same panel with a fixedDest so copies flow straight into the proposal
// being built. Props:
//   embedded  — compact chrome (no headline/tagline), for side-pane use
//   fixedDest — locks Copy destination (hides the picker); the Studio case
//   initialMode — open in "copy" when embedded next to a proposal
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import { copyComponentsTo } from "@/lib/copyComponents";

interface CompRow { id: string; booking_id: string; domain: string; kind: string | null; title: string; copied_from: string | null; }
interface DebriefHit { booking_id: string; author: string | null; text: string; field: "worked" | "didnt_work" | "would_repeat"; }
interface ChargeRow extends ChargeLike { booking_id: string; }

const DOMAIN_ICON: Record<string, string> = {
  food: "🍽", decor: "🎀", flowers: "💐", lighting: "💡", music: "🎵", layout: "🪑",
  timeline: "🕰", kids: "🧒", photo: "📸", transport: "🚚", kitchen: "👨‍🍳",
  logistics: "📦", staffing: "👥", custom: "•",
};
const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString();
const clean = (q: string) => q.replace(/[,()%]/g, " ").trim();

export interface RolodexDest { id: string; invoice_num: string; contact_name: string; }

export default function RolodexPanel({ embedded = false, fixedDest = null, initialMode = "explore" }: {
  embedded?: boolean; fixedDest?: RolodexDest | null; initialMode?: "explore" | "copy";
}) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"explore" | "copy">(initialMode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Result model
  const [events, setEvents] = useState<Booking[]>([]);
  const [compsByEvent, setCompsByEvent] = useState<Record<string, CompRow[]>>({});
  const [matchedComp, setMatchedComp] = useState<Set<string>>(new Set());
  const [debriefHits, setDebriefHits] = useState<DebriefHit[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});     // component_id → signed URL
  const [reuse, setReuse] = useState<Record<string, number>>({});       // booking_id → times its components were copied
  const [inspired, setInspired] = useState<Record<string, number>>({}); // booking_id → bookings citing it as source
  const [revenue, setRevenue] = useState<Record<string, number>>({});   // booking_id → contracted total

  // Copy mode
  const [dest, setDest] = useState<RolodexDest | null>(fixedDest);
  const [destQuery, setDestQuery] = useState("");
  const [destOptions, setDestOptions] = useState<{ id: string; invoice_num: string; contact_name: string; event_date: string | null }[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  // Browse landing — the "true knowledge base" face of the Rolodex.
  const [popular, setPopular] = useState<{ title: string; count: number }[]>([]);
  const [lessons, setLessons] = useState<{ text: string; field: "worked" | "didnt_work" | "would_repeat"; author: string | null; booking_id: string; who: string }[]>([]);

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);

  const search = useCallback(async (raw: string) => {
    setBusy(true); setErr(""); setChecked({});
    const term = clean(raw);
    const like = `%${term}%`;

    // 1. Which components match (title/kind, item names)? Empty query → all.
    let compIds = new Set<string>();
    let bookingIds = new Set<string>();
    const dHits: DebriefHit[] = [];
    if (term) {
      const [byComp, byItem, byDebrief] = await Promise.all([
        supabase.from("event_components").select("id,booking_id").is("proposal_version_id", null).or(`title.ilike.${like},kind.ilike.${like}`),
        supabase.from("component_items").select("component_id").ilike("name", like),
        supabase.from("event_debriefs").select("booking_id,author,worked,didnt_work,would_repeat")
          .or(`worked.ilike.${like},didnt_work.ilike.${like},would_repeat.ilike.${like}`),
      ]);
      if (byComp.error) { setErr(byComp.error.message); setBusy(false); return; }
      for (const c of (byComp.data ?? []) as { id: string; booking_id: string }[]) { compIds.add(c.id); bookingIds.add(c.booking_id); }
      const itemCompIds = ((byItem.data ?? []) as { component_id: string }[]).map((x) => x.component_id);
      if (itemCompIds.length) {
        const { data: cs } = await supabase.from("event_components").select("id,booking_id").is("proposal_version_id", null).in("id", itemCompIds);
        for (const c of (cs ?? []) as { id: string; booking_id: string }[]) { compIds.add(c.id); bookingIds.add(c.booking_id); }
      }
      const t = term.toLowerCase();
      for (const d of (byDebrief.data ?? []) as { booking_id: string; author: string | null; worked: string | null; didnt_work: string | null; would_repeat: string | null }[]) {
        bookingIds.add(d.booking_id);
        for (const f of ["worked", "didnt_work", "would_repeat"] as const) {
          const v = d[f];
          if (v && v.toLowerCase().includes(t)) dHits.push({ booking_id: d.booking_id, author: d.author, text: v, field: f });
        }
      }
    } else {
      const { data: cs, error } = await supabase.from("event_components").select("id,booking_id").is("proposal_version_id", null);
      if (error) { setErr(`${error.message} — run v164 SQL.`); setBusy(false); return; }
      for (const c of (cs ?? []) as { id: string; booking_id: string }[]) { compIds.add(c.id); bookingIds.add(c.booking_id); }
    }
    setDebriefHits(dHits);
    setMatchedComp(term ? compIds : new Set());

    if (bookingIds.size === 0) {
      setEvents([]); setCompsByEvent({}); setThumbs({}); setBusy(false); return;
    }

    // 2. The events, newest first, capped.
    const idList = Array.from(bookingIds);
    const { data: evs } = await supabase.from("bookings").select("*").in("id", idList)
      .neq("status", "cancelled").order("event_date", { ascending: false }).limit(24);
    const eventRows = (evs ?? []) as Booking[];
    setEvents(eventRows);
    const shownIds = eventRows.map((e) => e.id);

    // 3. All components of shown events (context around the matches).
    const { data: allComps } = await supabase.from("event_components")
      .select("id,booking_id,domain,kind,title,copied_from").is("proposal_version_id", null)
      .in("booking_id", shownIds).order("position");
    const byEvent: Record<string, CompRow[]> = {};
    const shownCompIds: string[] = [];
    for (const c of (allComps ?? []) as CompRow[]) {
      (byEvent[c.booking_id] ??= []).push(c);
      shownCompIds.push(c.id);
    }
    setCompsByEvent(byEvent);

    // 4. Photo-led: cover photos for shown components (signed URLs).
    if (shownCompIds.length) {
      const { data: ph } = await supabase.from("photos")
        .select("id,file_id,component_id,is_cover").in("component_id", shownCompIds).eq("is_cover", true);
      const phRows = (ph ?? []) as { id: string; file_id: string; component_id: string | null }[];
      if (phRows.length) {
        const { data: frs } = await supabase.from("booking_files").select("id,path").in("id", phRows.map((p) => p.file_id));
        const pathByFile: Record<string, string> = {};
        for (const fr of (frs ?? []) as { id: string; path: string }[]) pathByFile[fr.id] = fr.path;
        const t: Record<string, string> = {};
        await Promise.all(phRows.map(async (p) => {
          const path = pathByFile[p.file_id];
          if (!path || !p.component_id) return;
          const { data: s } = await supabase.storage.from("booking-files").createSignedUrl(path, 3600);
          if (s?.signedUrl) t[p.component_id] = s.signedUrl;
        }));
        setThumbs(t);
      } else setThumbs({});
    } else setThumbs({});

    // 5. Confidence signals — all computed, no new capture.
    //    Reuse: components elsewhere whose copied_from is one of this event's.
    const [{ data: copies }, { data: kids }, { data: chgs }] = await Promise.all([
      shownCompIds.length
        ? supabase.from("event_components").select("copied_from").is("proposal_version_id", null).in("copied_from", shownCompIds)
        : Promise.resolve({ data: [] }),
      supabase.from("bookings").select("source_booking_id").in("source_booking_id", shownIds),
      supabase.from("charges").select("booking_id,description,quantity,unit_price,taxable").in("booking_id", shownIds),
    ]);
    const compOwner: Record<string, string> = {};
    for (const c of (allComps ?? []) as CompRow[]) compOwner[c.id] = c.booking_id;
    const ru: Record<string, number> = {};
    for (const r of (copies ?? []) as { copied_from: string }[]) {
      const owner = compOwner[r.copied_from];
      if (owner) ru[owner] = (ru[owner] ?? 0) + 1;
    }
    setReuse(ru);
    const ins: Record<string, number> = {};
    for (const r of (kids ?? []) as { source_booking_id: string }[]) ins[r.source_booking_id] = (ins[r.source_booking_id] ?? 0) + 1;
    setInspired(ins);
    const chargesBy: Record<string, ChargeRow[]> = {};
    for (const c of (chgs ?? []) as ChargeRow[]) (chargesBy[c.booking_id] ??= []).push(c);
    const rev: Record<string, number> = {};
    for (const e of eventRows) rev[e.id] = bookingFinancials(e, chargesBy[e.id] ?? []).total;
    setRevenue(rev);

    setBusy(false);
  }, []);

  useEffect(() => { if (caps?.rolodex) search(""); }, [caps, search]);

  // Landing data: what the company reaches for most, and what it learned last.
  useEffect(() => {
    if (!caps?.rolodex) return;
    (async () => {
      const { data: titles } = await supabase.from("event_components").select("title").is("proposal_version_id", null);
      const counts: Record<string, number> = {};
      for (const t of (titles ?? []) as { title: string }[]) {
        const key = t.title.trim();
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      }
      setPopular(Object.keys(counts).map((title) => ({ title, count: counts[title] }))
        .sort((a, z) => z.count - a.count).slice(0, 8));

      const { data: dbs } = await supabase.from("event_debriefs")
        .select("booking_id,author,worked,didnt_work,would_repeat,created_at")
        .order("created_at", { ascending: false }).limit(8);
      const rows = (dbs ?? []) as { booking_id: string; author: string | null; worked: string | null; didnt_work: string | null; would_repeat: string | null }[];
      const names: Record<string, string> = {};
      if (rows.length) {
        const { data: bs } = await supabase.from("bookings").select("id,contact_name,event_type")
          .in("id", rows.map((r) => r.booking_id));
        for (const bk of (bs ?? []) as { id: string; contact_name: string; event_type: string | null }[]) {
          names[bk.id] = `${bk.contact_name}${bk.event_type ? ` ${bk.event_type}` : ""}`;
        }
      }
      const out: typeof lessons = [];
      for (const r of rows) {
        for (const f of ["didnt_work", "would_repeat", "worked"] as const) {
          const v = r[f];
          if (v && out.length < 5) out.push({ text: v, field: f, author: r.author, booking_id: r.booking_id, who: names[r.booking_id] ?? "" });
        }
      }
      setLessons(out);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps]);

  // Copy-mode destination options (active bookings), loaded lazily.
  useEffect(() => {
    if (mode !== "copy" || fixedDest || destOptions.length) return;
    supabase.from("bookings").select("id,invoice_num,contact_name,event_date")
      .not("status", "in", '("completed","cancelled")').order("event_date")
      .then(({ data }) => setDestOptions((data ?? []) as typeof destOptions));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) { const t = e.event_type || "Other"; m[t] = (m[t] ?? 0) + 1; }
    return Object.keys(m).map((t) => `${m[t]} ${t}${m[t] === 1 ? "" : "s"}`).join(" · ");
  }, [events]);

  async function runImport() {
    if (!dest) return;
    const ids = Object.keys(checked).filter((id) => checked[id]);
    if (!ids.length) return;
    setImporting(true); setCopyMsg("");
    const r = await copyComponentsTo(dest, ids,
      { quantities: true, pricing: false, notes: true, requirements: true },
      "Rolodex search");
    setImporting(false);
    setCopyMsg(r.ok ? `✓ Copied ${r.copied} to #${dest.invoice_num} (${dest.contact_name}) — unpriced; price fresh on the booking.` : `⚠️ ${r.detail}`);
    if (r.ok) setChecked({});
  }

  if (caps && !caps.rolodex) {
    if (embedded) return null;
    return (
      <div>
        <p className="text-sm text-slate-500 mt-4">The Rolodex is part of the proposal-driven toolset. Enable it under Configuration → Business Model.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3">
        {!embedded && (
          <p className="text-sm text-slate-500 max-w-2xl">
            Your company&apos;s memory. Every event ever produced — its components, dishes, and
            lessons — searchable in one place, so 3,000 events from now nobody has to remember
            any of it themselves.
          </p>
        )}
        <div className="flex rounded-full ring-1 ring-[#E7EDF5] bg-white p-0.5 ml-auto">
          {(["explore", "copy"] as const).map((m) => (
            <button key={m}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${mode === m ? "text-white" : "text-slate-500 hover:text-slate-700"}`}
              style={mode === m ? { backgroundColor: "var(--ec-blue)" } : undefined}
              onClick={() => setMode(m)}>
              {m === "explore" ? "🔭 Explore" : "↺ Copy"}
            </button>
          ))}
        </div>
      </div>
      <input className="field w-full max-w-xl !py-2.5 mt-3" autoFocus={!embedded}
        placeholder='Search — "cocktail hour", "carving", "outdoor wind"…'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") search(q); }} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1.5 mb-4">
        <span>Press Enter · searches:</span>
        <span className="text-slate-500">✓ Components</span>
        <span className="text-slate-500">✓ Menu items</span>
        <span className="text-slate-500">✓ Debriefs (Worked / Didn&apos;t / Repeat)</span>
      </div>

      {mode === "copy" && (
        <div className="card p-3 mb-5 sticky top-2 z-10">
          <div className="text-[11px] text-slate-500 mb-2">
            <b>How copying works:</b> ① pick the destination booking → ② check components in
            the results below → ③ Copy Selected. Items, quantities, notes &amp; requirements come
            along; <b>pricing does not</b> — price fresh on the booking.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Copy to</span>
          {dest ? (
            <>
              <span className="text-sm font-semibold">#{dest.invoice_num} {dest.contact_name}</span>
              {!fixedDest && <button className="text-[11px] text-slate-400 underline" onClick={() => setDest(null)}>change</button>}
            </>
          ) : (
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <input className="field !py-1.5 !text-xs w-full" placeholder="Which booking? Start typing…"
                value={destQuery} onChange={(e) => setDestQuery(e.target.value)} />
              {destQuery.trim().length >= 2 && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-white border border-[#E7EDF5] shadow-lg">
                  {destOptions.filter((o) => {
                    const t = destQuery.trim().toLowerCase();
                    return o.contact_name.toLowerCase().includes(t) || o.invoice_num.includes(t);
                  }).slice(0, 8).map((o) => (
                    <button key={o.id} type="button" className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F4F9FF]"
                      onClick={() => { setDest(o); setDestQuery(""); }}>
                      <b>{o.contact_name}</b><span className="text-slate-400"> · #{o.invoice_num}{o.event_date ? ` · ${o.event_date}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="btn-primary !py-1 !px-3 text-xs ml-auto" disabled={!dest || importing || !Object.values(checked).some(Boolean)}
            onClick={runImport}>
            {importing ? "Copying…" : `Copy ${Object.values(checked).filter(Boolean).length || ""} selected`}
          </button>
          {copyMsg && <span className="w-full text-xs text-slate-600">{copyMsg}</span>}
          </div>
        </div>
      )}

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-4">⚠️ {err}</p>}

      {!q.trim() && !busy && (popular.length > 0 || lessons.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {popular.length > 0 && (
            <div className="card p-4">
              <h2 className="font-display font-semibold text-[14px] mb-2">⭐ Popular Components</h2>
              <div className="flex flex-wrap gap-1.5">
                {popular.map((p) => (
                  <button key={p.title} type="button"
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 ring-[#E7EDF5] bg-[#F6F8FB] hover:bg-[#F4F9FF] hover:ring-[#4A9EFF] transition-colors"
                    onClick={() => { setQ(p.title); search(p.title); }}>
                    <span className="font-medium">{p.title}</span>
                    <span className="text-slate-400">({p.count})</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Times each has appeared across all events — click to see them.</p>
            </div>
          )}
          {lessons.length > 0 && (
            <div className="card p-4">
              <h2 className="font-display font-semibold text-[14px] mb-2">💡 Recent Lessons</h2>
              <div className="space-y-1.5">
                {lessons.map((l, i) => (
                  <p key={i} className="text-[12px] text-slate-600 border-l-2 pl-2"
                    style={{ borderColor: l.field === "didnt_work" ? "var(--ec-danger)" : l.field === "worked" ? "var(--ec-success)" : "var(--ec-blue)" }}>
                    {l.text}
                    <Link href={`/bookings/${l.booking_id}`} className="text-slate-400 hover:underline"> — {l.who}{l.author ? `, ${l.author}` : ""}</Link>
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">The latest debrief wisdom — searchable like everything else.</p>
            </div>
          )}
        </div>
      )}

      {busy && <p className="text-sm text-slate-400">Searching…</p>}
      {!busy && events.length === 0 && !err && (
        <p className="text-sm text-slate-400">Nothing found{q ? ` for “${q}”` : ""} — components appear here once events have them (run the Tier-1 backfill under Business Model).</p>
      )}
      {!busy && events.length > 0 && (
        <p className="text-[12px] text-slate-400 mb-4">{events.length >= 24 ? "24+" : events.length} event{events.length === 1 ? "" : "s"}{typeCounts ? ` — ${typeCounts}` : ""}</p>
      )}

      <div className="space-y-4">
        {events.map((e) => {
          const cs = compsByEvent[e.id] ?? [];
          const hits = debriefHits.filter((d) => d.booking_id === e.id);
          const shown = q ? cs.filter((c) => matchedComp.has(c.id)) : cs;
          const hidden = cs.length - shown.length;
          return (
            <div key={e.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Link href={`/bookings/${e.id}`} className="font-display font-bold text-[15px] hover:underline">
                    {e.contact_name}{e.event_type ? ` · ${e.event_type}` : ""}
                  </Link>
                  <div className="text-[11px] text-slate-400">
                    {e.event_date ? fmtDate(e.event_date) : "No date"} · #{e.invoice_num}
                    {e.est_guests ? ` · ${e.est_guests} guests` : ""}
                  </div>
                </div>
                <div className="flex gap-3 text-right shrink-0">
                  {revenue[e.id] > 0 && <Signal value={fmtMoney(revenue[e.id])} label="Contracted" />}
                  {(reuse[e.id] ?? 0) > 0 && <Signal value={`×${reuse[e.id]}`} label="Reused" />}
                  {(inspired[e.id] ?? 0) > 0 && <Signal value={String(inspired[e.id])} label="Inspired" />}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {shown.map((c) => (
                  <span key={c.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg ring-1 px-1.5 py-1 text-[12px] ${matchedComp.has(c.id) ? "ring-[#4A9EFF] bg-[#F4F9FF]" : "ring-[#E7EDF5] bg-[#F6F8FB]"}`}>
                    {mode === "copy" && (
                      <input type="checkbox" className="accent-[#4A9EFF]" checked={!!checked[c.id]}
                        onChange={(ev) => setChecked((p) => ({ ...p, [c.id]: ev.target.checked }))} />
                    )}
                    {thumbs[c.id]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={thumbs[c.id]} alt="" className="w-8 h-8 rounded object-cover" />
                      : <span>{DOMAIN_ICON[c.domain] ?? "•"}</span>}
                    <span className="font-medium">{c.title}</span>
                    {c.copied_from && <span title="Itself a reuse" className="text-[#2F80ED] text-[10px]">↺</span>}
                  </span>
                ))}
                {hidden > 0 && <span className="text-[11px] text-slate-400 self-center">+{hidden} more on the event</span>}
              </div>

              {hits.length > 0 && (
                <div className="mt-2 space-y-1">
                  {hits.slice(0, 3).map((h, i) => (
                    <p key={i} className="text-[12px] text-slate-600 border-l-2 pl-2"
                      style={{ borderColor: h.field === "didnt_work" ? "var(--ec-danger)" : h.field === "worked" ? "var(--ec-success)" : "var(--ec-blue)" }}>
                      <span className="font-semibold">{h.field === "worked" ? "Worked" : h.field === "didnt_work" ? "Didn't" : "Repeat"}:</span>{" "}
                      {h.text}{h.author ? <span className="text-slate-400"> — {h.author}</span> : null}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Signal({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-none">
      <div className="font-display font-bold text-sm">{value}</div>
      <div className="text-[9px] font-semibold tracking-wide text-slate-400 uppercase mt-0.5">{label}</div>
    </div>
  );
}
