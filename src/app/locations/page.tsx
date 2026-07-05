"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadPolicies, savePolicy, Policies } from "@/lib/policies";

interface Room { id: string; name: string; guest_capacity: number | null; active: boolean; sort_order: number; }

/** Back office: the caterer's physical footprint and production bandwidth.
 *  Rooms = flat list of bookable spaces (space conflicts run per room).
 *  Capacity = daily production points (4 small jobs, 2 big — configurable). */
export default function LocationsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [p, setP] = useState<Policies | null>(null);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("rooms").select("*").order("sort_order");
    setRooms((data ?? []) as Room[]);
  }, []);
  useEffect(() => { load(); loadPolicies().then(setP); }, [load]);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 1500); }

  async function set<K extends keyof Policies>(key: K, value: Policies[K]) {
    setP((prev) => prev ? { ...prev, [key]: value } : prev);
    await savePolicy(key, value as string | number);
    flash("Saved.");
  }

  async function addRoom() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("rooms").insert({
      name: newName.trim(),
      guest_capacity: newCap ? Number(newCap) : null,
      sort_order: rooms.length,
    });
    if (error) { flash(error.message); return; }
    setNewName(""); setNewCap(""); flash("Room added."); load();
  }

  async function updateRoom(id: string, patch: Partial<Room>) {
    await supabase.from("rooms").update(patch).eq("id", id);
    flash("Saved."); load();
  }

  if (!p) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Locations & Capacity</h1>
        <p className="text-sm text-slate-500 mt-1">Your spaces, off-premise setting, and daily production bandwidth.</p>
        <div className="gold-rule mt-3" />
      </header>
      {msg && <p className="text-xs text-emerald-600 font-semibold mb-3">{msg}</p>}

      {/* Rooms */}
      <section className="card p-6 mb-6">
        <h2 className="font-display font-bold text-sm mb-1">Rooms & Halls</h2>
        <p className="text-xs text-slate-500 mb-4">
          Every bookable space, one line each. Two events at the same time in <b>different</b> rooms don&apos;t conflict — the double-booking engine runs per room.
        </p>
        {rooms.map((r) => (
          <div key={r.id} className={`flex items-center gap-3 py-2 border-b border-slate-50 ${!r.active ? "opacity-50" : ""}`}>
            <input className="field !py-1.5 flex-1 text-sm" defaultValue={r.name}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.name) updateRoom(r.id, { name: e.target.value.trim() }); }} />
            <input className="field !py-1.5 w-28 text-sm" type="number" placeholder="seats"
              defaultValue={r.guest_capacity ?? ""} title="Guest capacity (optional)"
              onBlur={(e) => updateRoom(r.id, { guest_capacity: e.target.value ? Number(e.target.value) : null })} />
            <button className="text-xs text-slate-400 underline whitespace-nowrap"
              onClick={() => updateRoom(r.id, { active: !r.active })}>
              {r.active ? "deactivate" : "reactivate"}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-3">
          <input className="field !py-1.5 flex-1 text-sm" placeholder="New room name…"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addRoom(); }} />
          <input className="field !py-1.5 w-28 text-sm" type="number" placeholder="seats"
            value={newCap} onChange={(e) => setNewCap(e.target.value)} />
          <button className="btn-primary !py-1.5 !px-4 text-sm" onClick={addRoom}>Add</button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          With a single room, the inquiry form hides the room picker entirely — nothing changes until you add a second space.
        </p>
      </section>

      {/* Off-premise */}
      <section className="card p-6 mb-6">
        <h2 className="font-display font-bold text-sm mb-1">Off-Premise Catering</h2>
        <label className="flex items-center gap-2.5 text-sm mt-2 cursor-pointer">
          <input type="checkbox" className="accent-navy" checked={p.offprem_enabled === 1}
            onChange={(e) => set("offprem_enabled", e.target.checked ? 1 : 0)} />
          We cater off-premise (jobs get an address instead of a room)
        </label>
        <p className="text-[11px] text-slate-400 mt-2">
          Off-prem jobs never conflict over a room — they only count against daily production capacity below.
        </p>
      </section>

      {/* Capacity */}
      <section className="card p-6">
        <h2 className="font-display font-bold text-sm mb-1">Daily Production Capacity</h2>
        <p className="text-xs text-slate-500 mb-3">
          How much your kitchen and crews can produce in one day, in points. Example: capacity 4, small = 1, big = 2 → four small jobs, <i>or</i> two big, <i>or</i> two small + one big.
        </p>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer mb-4">
          <input type="checkbox" className="accent-navy" checked={p.capacity_enabled === 1}
            onChange={(e) => set("capacity_enabled", e.target.checked ? 1 : 0)} />
          Check capacity on new bookings (warns — an explicit override can always book anyway)
        </label>
        <div className={`grid sm:grid-cols-2 gap-x-8 gap-y-3 ${p.capacity_enabled !== 1 ? "opacity-40 pointer-events-none" : ""}`}>
          {([
            ["daily_capacity_points", "Points available per day"],
            ["big_job_guests", "A job is “big” above (guests)"],
            ["points_small", "Points per small job"],
            ["points_big", "Points per big job"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <span>{label}</span>
              <input className="field !py-1.5 w-24 text-right" type="number" min={1}
                defaultValue={p[key]}
                onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== p[key]) set(key, v); }} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          A far-away or unusually heavy job? Its points can be overridden per booking, so distance can be priced in manually until zone rules exist.
        </p>
      </section>
    </div>
  );
}
