"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, deriveGuests, fmtDate, parseLocalDate, stageFor } from "@/lib/workflow";
import { bookingFinancials } from "@/lib/finance";

/** Digits-only, last 10 — so (732) 555-0182 matches 7325550182. */
function normPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
}
function normEmail(e: string | null | undefined): string | null {
  const v = (e ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}
function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

interface ChargeRow { booking_id: string; unit_price: number; quantity: number; taxable: boolean; description: string; }
interface PayRow { booking_id: string; amount_applied: number; }

const REAL = ["cancelled", "lead", "lead_lost", "hold_expired"]; // excluded from "events" count

/** Three-second relationship read: who is this customer to us?
 *  Matches the household by phone/email across all bookings; expands into the
 *  full event history. The 8-things-before-hello card — nothing more. */
export default function CustomerSnapshot({ b }: { b: Booking }) {
  const [all, setAll] = useState<Booking[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [rooms, setRooms] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("bookings").select("*");
    if (error) { setErr(`Snapshot couldn't load: ${error.message}`); return; }
    const rows = (data ?? []) as Booking[];
    const ph = normPhone(b.phone) ?? normPhone(b.contact2_phone);
    const em = normEmail(b.email) ?? normEmail(b.contact2_email);
    const mine = rows.filter((x) => {
      if (x.id === b.id) return true;
      const xp = [normPhone(x.phone), normPhone((x as { contact2_phone?: string }).contact2_phone)].filter(Boolean);
      const xe = [normEmail(x.email), normEmail((x as { contact2_email?: string }).contact2_email)].filter(Boolean);
      return (ph != null && xp.includes(ph)) || (em != null && xe.includes(em));
    });
    setAll(mine);
    const ids = mine.map((x) => x.id);
    if (ids.length) {
      const [c, p] = await Promise.all([
        supabase.from("charges").select("booking_id,unit_price,quantity,taxable,description").in("booking_id", ids),
        supabase.from("payments").select("booking_id,amount_applied").in("booking_id", ids),
      ]);
      setCharges((c.data ?? []) as ChargeRow[]);
      setPays((p.data ?? []) as PayRow[]);
    }
    supabase.from("rooms").select("id,name").then(({ data: r }) =>
      setRooms(new Map(((r ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]))));
  }, [b.id, b.phone, b.email, b.contact2_phone, b.contact2_email]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (all.length <= 1) return null; // first booking — no relationship yet
    const chargesBy = new Map<string, ChargeRow[]>();
    for (const c of charges) {
      if (!chargesBy.has(c.booking_id)) chargesBy.set(c.booking_id, []);
      chargesBy.get(c.booking_id)!.push(c);
    }
    const paidBy = new Map<string, number>();
    for (const p of pays) paidBy.set(p.booking_id, (paidBy.get(p.booking_id) ?? 0) + Number(p.amount_applied));

    const real = all.filter((x) => !REAL.includes(x.status));
    const completed = real.filter((x) => x.status === "completed");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const active = real.filter((x) => x.status !== "completed");
    const upcoming = active.filter((x) => x.event_date && parseLocalDate(x.event_date) >= today);

    let lifetime = 0;
    for (const x of completed) lifetime += bookingFinancials(x, chargesBy.get(x.id) ?? []).total;
    let outstanding = 0;
    for (const x of real) {
      const fin = bookingFinancials(x, chargesBy.get(x.id) ?? []);
      outstanding += Math.max(0, fin.total - (paidBy.get(x.id) ?? 0));
    }

    const heads = (x: Booking) => {
      const g = deriveGuests(x);
      return (g.gendered ? g.men + g.women : g.adults) + g.children;
    };
    const withHeads = completed.filter((x) => heads(x) > 0);
    const avgGuests = withHeads.length
      ? Math.round(withHeads.reduce((s, x) => s + heads(x), 0) / withHeads.length) : null;

    const mode = (vals: (string | null | undefined)[]): string | null => {
      const m = new Map<string, number>();
      for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
      let best: string | null = null, n = 0;
      m.forEach((c, k) => { if (c > n) { n = c; best = k; } });
      return best;
    };
    const favRoomId = mode(real.map((x) => x.room_id));
    const favRoom = favRoomId && rooms.size > 1 ? rooms.get(favRoomId) ?? null : null;
    const favMenu = mode(real.map((x) => x.menu_type).filter((m) => m && m !== "Not Sure Yet"));

    const firstDate = all
      .map((x) => (x as { created_at?: string }).created_at ?? x.event_date)
      .filter(Boolean).sort()[0] ?? null;
    const lastEvent = completed.map((x) => x.event_date).filter(Boolean).sort().slice(-1)[0] ?? null;

    const tier =
      lifetime >= 100000 ? "★★★★★ Platinum" :
      lifetime >= 50000 ? "★★★★ VIP" :
      lifetime >= 20000 ? "★★★ Gold" :
      real.length >= 2 ? "★★ Returning" : null;

    return {
      since: firstDate ? new Date(firstDate).getFullYear() : null,
      events: real.length, lifetime, outstanding,
      upcoming: upcoming.length, avgGuests, favRoom, favMenu, lastEvent, tier,
      history: all
        .slice()
        .sort((a, z) => (z.event_date ?? "9999").localeCompare(a.event_date ?? "9999")),
    };
  }, [all, charges, pays, rooms]);

  if (err) return <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-5">⚠️ {err}</p>;
  if (!stats) return null;

  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[9px] font-bold tracking-wider text-white/40 uppercase">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-ink text-white p-5 mb-5 shadow-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display font-bold text-base">{b.contact_name}</div>
          <div className="text-[11px] text-white/50">
            Customer since {stats.since ?? "—"}{stats.tier ? <span className="text-gold font-semibold"> · {stats.tier}</span> : ""}
          </div>
        </div>
        <button className="text-[11px] font-semibold text-white/60 hover:text-white underline underline-offset-2"
          onClick={() => setOpen((o) => !o)}>
          {open ? "▴ Hide history" : `▾ Full history (${stats.events} events)`}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-3">
        {cell("Events", String(stats.events))}
        {cell("Lifetime revenue", fmtMoney(stats.lifetime))}
        {cell("Outstanding", stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "None")}
        {cell("Upcoming", String(stats.upcoming))}
        {stats.avgGuests != null && cell("Avg event", `${stats.avgGuests} guests`)}
        {stats.lastEvent && cell("Last event", fmtDate(stats.lastEvent))}
        {stats.favRoom && cell("Favorite room", stats.favRoom)}
        {stats.favMenu && cell("Favorite menu", stats.favMenu)}
      </div>

      {open && (
        <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 reveal">
          {stats.history.map((x) => {
            const st = stageFor(x.status);
            const gone = REAL.includes(x.status);
            return (
              <Link key={x.id} href={`/bookings/${x.id}`}
                className={`flex items-baseline justify-between gap-3 text-sm rounded-lg px-2 py-1 hover:bg-white/5 transition-colors ${gone ? "opacity-40" : ""} ${x.id === b.id ? "ring-1 ring-gold/40" : ""}`}>
                <span className="truncate">
                  <span className="text-white/40 text-xs mr-2">{x.event_date ? x.event_date.slice(0, 4) : "—"}</span>
                  {x.event_name || x.event_type || "Event"}
                  {x.id === b.id && <span className="text-gold text-[10px] font-bold ml-2">CURRENT</span>}
                </span>
                <span className="text-[11px] whitespace-nowrap" style={{ color: gone ? undefined : st.textColor === "#1F2937" ? "#CBD5E1" : undefined }}>
                  <span className="text-white/50">{st.icon} {x.status === "completed" ? "Completed" : st.label.split(" — ")[0]}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
