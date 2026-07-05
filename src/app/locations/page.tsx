"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadPolicies, savePolicy, Policies } from "@/lib/policies";

interface Room { id: string; name: string; guest_capacity: number | null; active: boolean; sort_order: number; }

const CHIP = "inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors";

/** Back office: the caterer's physical footprint and production bandwidth —
 *  presented as a management console (resource rows, rule cards), not a
 *  settings form. */
export default function LocationsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [p, setP] = useState<Policies | null>(null);
  const [msg, setMsg] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fSeats, setFSeats] = useState("");
  const [roomsErr, setRoomsErr] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("rooms").select("*").order("sort_order");
    if (error) {
      setRoomsErr(`Rooms couldn't load: ${error.message} — run v101_locations.sql (or fix_rooms_rls.sql if Supabase re-enabled RLS).`);
      setRooms([]); return;
    }
    setRoomsErr("");
    setRooms((data ?? []) as Room[]);
  }, []);
  useEffect(() => { load(); loadPolicies().then(setP); }, [load]);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 1600); }

  async function set<K extends keyof Policies>(key: K, value: Policies[K]) {
    setP((prev) => prev ? { ...prev, [key]: value } : prev);
    await savePolicy(key, value as string | number);
    flash("Saved.");
  }

  function startAdd() { setEditing(null); setFName(""); setFSeats(""); setAddingRoom(true); }
  function startEdit(r: Room) { setAddingRoom(false); setEditing(r.id); setFName(r.name); setFSeats(r.guest_capacity?.toString() ?? ""); }

  async function saveRoom() {
    if (!fName.trim()) { setSaveErr("Enter a room name."); return; }
    setSaveErr("");
    const payload = { name: fName.trim(), guest_capacity: fSeats ? Number(fSeats) : null };
    const { error } = editing
      ? await supabase.from("rooms").update(payload).eq("id", editing)
      : await supabase.from("rooms").insert({ ...payload, sort_order: rooms.length });
    if (error) {
      setSaveErr(`Couldn't save: ${error.message}${error.message.toLowerCase().includes("security") ? " — RLS is blocking writes; run fix_rooms_rls.sql and don't accept Supabase's Enable-RLS prompt." : ""}`);
      return;
    }
    setAddingRoom(false); setEditing(null); flash("Saved."); load();
  }

  async function deleteRoom(r: Room) {
    const { count } = await supabase.from("bookings").select("*", { count: "exact", head: true }).eq("room_id", r.id);
    const n = count ?? 0;
    const warning = n > 0
      ? `${r.name} is on ${n} booking${n === 1 ? "" : "s"}. Deleting keeps their dates but removes the room label from them.\n\nDeactivating is usually better — it hides the room from new bookings while history stays labeled.\n\nDelete anyway?`
      : `Delete ${r.name}?`;
    if (!confirm(warning)) return;
    await supabase.from("rooms").delete().eq("id", r.id);
    flash("Room deleted."); load();
  }

  if (!p) return <div className="text-sm text-slate-400">Loading…</div>;

  const roomForm = (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4 mt-3">
      <div className="grid sm:grid-cols-[1fr_120px_auto] gap-3 items-end">
        <div><label className="label">Room name</label>
          <input className="field" value={fName} onChange={(e) => setFName(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveRoom(); }} placeholder="e.g. Ballroom B" /></div>
        <div><label className="label">Seats</label>
          <input className="field" type="number" min="0" value={fSeats} onChange={(e) => setFSeats(e.target.value)} placeholder="optional" /></div>
        <div className="flex gap-2">
          <button className="btn-primary !py-2 !px-4 text-sm" onClick={saveRoom}>{editing ? "Save" : "Add"}</button>
          <button className="btn-ghost !py-2 !px-3 text-sm" onClick={() => { setAddingRoom(false); setEditing(null); setSaveErr(""); }}>Cancel</button>
        </div>
      </div>
      {saveErr && <p className="text-red-600 text-xs mt-2 font-medium">{saveErr}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Locations & Capacity</h1>
        <p className="text-sm text-slate-500 mt-1">Your spaces, off-premise setting, and daily production bandwidth.</p>
        <div className="gold-rule mt-3" />
      </header>
      {msg && <p className="text-xs text-emerald-600 font-semibold mb-3">{msg}</p>}

      {/* ── Rooms: resource rows, not blank fields ── */}
      <section className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-bold text-sm">Rooms & Halls</h2>
          {!addingRoom && !editing && (
            <button className={CHIP} onClick={startAdd}>＋ Add Room</button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">Every bookable space. Double-booking is checked per room.</p>

        {roomsErr && (
          <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-2 font-medium">⚠️ {roomsErr}</p>
        )}
        {rooms.length === 0 && !roomsErr && <p className="text-sm text-slate-400 py-4">No rooms yet — add your first space.</p>}
        {rooms.map((r) => (
          editing === r.id ? <div key={r.id}>{roomForm}</div> : (
            <div key={r.id} className={`flex items-center gap-4 py-2.5 border-b border-slate-50 last:border-0 ${!r.active ? "opacity-45" : ""}`}>
              <span className="font-medium text-sm flex-1 truncate">🏛️ {r.name}</span>
              <span className="text-xs text-slate-500 w-24">Seats: <b className="text-slate-700">{r.guest_capacity ?? "—"}</b></span>
              <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {r.active ? "Active" : "Inactive"}
              </span>
              <span className="flex gap-2 text-sm">
                <button title="Edit" className="hover:scale-110 transition-transform" onClick={() => startEdit(r)}>✏️</button>
                <button title={r.active ? "Deactivate (hide from new bookings)" : "Reactivate"} className="hover:scale-110 transition-transform"
                  onClick={async () => { await supabase.from("rooms").update({ active: !r.active }).eq("id", r.id); flash(r.active ? "Deactivated." : "Reactivated."); load(); }}>
                  {r.active ? "🚫" : "♻️"}
                </button>
                <button title="Delete" className="hover:scale-110 transition-transform" onClick={() => deleteRoom(r)}>🗑️</button>
              </span>
            </div>
          )
        ))}
        {addingRoom && roomForm}
        <details className="mt-3">
          <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-navy">ⓘ Learn more</summary>
          <p className="text-[11px] text-slate-400 mt-1">
            Two events at the same time in different rooms don&apos;t conflict — the changeover and squeeze-in math runs within each room. With a single room, the inquiry form hides the room picker entirely. Deactivate a room to stop new bookings without losing history.
          </p>
        </details>
      </section>

      {/* ── Off-premise ── */}
      <section className="card p-6 mb-6">
        <h2 className="font-display font-bold text-sm mb-2">Off-Premise Events</h2>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="accent-navy" checked={p.offprem_enabled === 1}
            onChange={(e) => set("offprem_enabled", e.target.checked ? 1 : 0)} />
          Enable Off-Premise Events
        </label>
        <p className="text-[11px] text-slate-400 mt-1.5">Inquiry forms gain a job-address option automatically.</p>
        <details className="mt-2">
          <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-navy">ⓘ Learn more</summary>
          <p className="text-[11px] text-slate-400 mt-1">
            Off-prem jobs carry an address instead of a room, never conflict over a space, and count only against daily production capacity below.
          </p>
        </details>
      </section>

      {/* ── Production capacity: rule cards, not gray boxes ── */}
      <section className="card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="font-display font-bold text-sm">Daily Production Capacity</h2>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input type="checkbox" className="accent-navy" checked={p.capacity_enabled === 1}
              onChange={(e) => set("capacity_enabled", e.target.checked ? 1 : 0)} />
            Check capacity on new bookings
          </label>
        </div>

        <div className={p.capacity_enabled !== 1 ? "opacity-40 pointer-events-none" : ""}>
          {/* Headline number */}
          <div className="flex items-center justify-between rounded-xl bg-navy text-white px-5 py-4 mb-3">
            <div>
              <div className="font-display font-bold">Points available per day</div>
              <div className="text-[11px] text-white/60">Your kitchen &amp; crew bandwidth</div>
            </div>
            <input className="w-20 text-center text-2xl font-display font-bold bg-white/10 rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-gold"
              type="number" min={1} defaultValue={p.daily_capacity_points}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== p.daily_capacity_points) set("daily_capacity_points", v); }} />
          </div>

          {/* Rule cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl ring-1 ring-slate-200 p-4">
              <div className="font-display font-bold text-sm">Small Job</div>
              <div className="text-xs text-slate-500 mt-0.5">Guests ≤ {p.big_job_guests}</div>
              <div className="flex items-center gap-2 mt-3 text-sm">
                Worth
                <input className="field !py-1 !px-2 w-14 text-center" type="number" min={1} defaultValue={p.points_small}
                  onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== p.points_small) set("points_small", v); }} />
                point{p.points_small === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-xl ring-1 ring-slate-200 p-4">
              <div className="font-display font-bold text-sm">Big Job</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                Guests &gt;
                <input className="field !py-0.5 !px-1.5 w-20 text-center !text-xs" type="number" min={1} defaultValue={p.big_job_guests}
                  onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== p.big_job_guests) set("big_job_guests", v); }} />
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm">
                Worth
                <input className="field !py-1 !px-2 w-14 text-center" type="number" min={1} defaultValue={p.points_big}
                  onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== p.points_big) set("points_big", v); }} />
                point{p.points_big === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-3">
            {p.daily_capacity_points} points = {Math.floor(p.daily_capacity_points / p.points_small)} small jobs, or {Math.floor(p.daily_capacity_points / p.points_big)} big — mixed as the math allows.
          </p>
          <details className="mt-1">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-navy">ⓘ Learn more</summary>
            <p className="text-[11px] text-slate-400 mt-1">
              Every booked job on a day consumes points by its guest count. Going over warns the rep with an explicit override — it never silently blocks. A far-away or unusually heavy job can have its points overridden per booking.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
