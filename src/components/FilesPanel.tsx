"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";

interface FileRow {
  id: string; booking_id: string; name: string; path: string;
  category: string; size_bytes: number | null; created_at: string;
}

const CATEGORIES = ["Contract", "Menu", "Invoice", "Floorplan", "Photo", "Insurance", "Vendor", "Other"];
const CAT_ICON: Record<string, string> = {
  Contract: "📝", Menu: "🍽️", Invoice: "🧾", Floorplan: "📐",
  Photo: "📷", Insurance: "🛡️", Vendor: "🤝", Other: "📎",
};

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Everything attached to the event — contracts, menus, floorplans, photos,
 *  insurance, vendor docs — in one place. Private bucket, signed downloads. */
export default function FilesPanel({ b }: { b: Booking }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [cat, setCat] = useState("Contract");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("booking_files")
      .select("*").eq("booking_id", b.id).order("created_at", { ascending: false });
    if (error) { setErr(`Files couldn't load: ${error.message} — run v117_files_referral.sql.`); return; }
    setErr("");
    setFiles((data ?? []) as FileRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);

  async function upload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true); setErr("");
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${b.id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("booking-files").upload(path, file);
    if (upErr) { setErr(`Upload failed: ${upErr.message}`); setBusy(false); return; }
    const { error: rowErr } = await supabase.from("booking_files").insert({
      booking_id: b.id, name: file.name, path, category: cat, size_bytes: file.size,
    });
    if (rowErr) { setErr(`Upload saved but couldn't be recorded: ${rowErr.message}`); setBusy(false); return; }
    await logActivity(b.id, b.invoice_num, "File Uploaded", `${CAT_ICON[cat]} ${cat}: ${file.name}`);
    if (inputRef.current) inputRef.current.value = "";
    setBusy(false); load();
  }

  async function download(fr: FileRow) {
    const { data, error } = await supabase.storage.from("booking-files").createSignedUrl(fr.path, 3600);
    if (error || !data?.signedUrl) { setErr(`Couldn't open ${fr.name}: ${error?.message ?? "no URL"}`); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(fr: FileRow) {
    if (!confirm(`Delete ${fr.name}? This can't be undone.`)) return;
    await supabase.storage.from("booking-files").remove([fr.path]);
    const { error } = await supabase.from("booking_files").delete().eq("id", fr.id);
    if (error) { setErr(`Couldn't delete: ${error.message}`); return; }
    await logActivity(b.id, b.invoice_num, "File Deleted", fr.name);
    load();
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="font-display font-bold text-sm">📎 Files{files.length > 0 ? ` (${files.length})` : ""}</h2>
        <div className="flex items-center gap-2">
          <select className="field !py-1 !text-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className={`inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            {busy ? "Uploading…" : "＋ Upload"}
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => upload(e.target.files)} />
          </label>
        </div>
      </div>

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-2">⚠️ {err}</p>}
      {files.length === 0 && !err && (
        <p className="text-sm text-slate-400">No files yet — contracts, floorplans, insurance, photos all live here.</p>
      )}

      <div className="space-y-1">
        {files.map((fr) => (
          <div key={fr.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm group">
            <span className="shrink-0">{CAT_ICON[fr.category] ?? "📎"}</span>
            <button className="flex-1 min-w-0 text-left hover:text-navy" onClick={() => download(fr)} title="Open (signed link)">
              <span className="font-medium truncate block">{fr.name}</span>
              <span className="text-[11px] text-slate-400">
                {fr.category} · {fmtSize(fr.size_bytes)} · {new Date(fr.created_at).toLocaleDateString()}
              </span>
            </button>
            <button className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete" onClick={() => remove(fr)}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}
