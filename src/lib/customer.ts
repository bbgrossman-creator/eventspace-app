import { Booking, deriveGuests, parseLocalDate } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";

/* ── Household identity: phone/email matching (pre-customer-entity) ── */

export function normPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
}
export function normEmail(e: string | null | undefined): string | null {
  const v = (e ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}

/** All bookings belonging to the same household as `seed` — matched on
 *  normalized phone/email across BOTH primary and secondary contacts. */
export function matchHousehold(all: Booking[], seed: Booking): Booking[] {
  const ph = [normPhone(seed.phone), normPhone((seed as { contact2_phone?: string }).contact2_phone)].filter(Boolean);
  const em = [normEmail(seed.email), normEmail((seed as { contact2_email?: string }).contact2_email)].filter(Boolean);
  return all.filter((x) => {
    if (x.id === seed.id) return true;
    const xp = [normPhone(x.phone), normPhone((x as { contact2_phone?: string }).contact2_phone)].filter(Boolean);
    const xe = [normEmail(x.email), normEmail((x as { contact2_email?: string }).contact2_email)].filter(Boolean);
    return ph.some((p) => xp.includes(p)) || em.some((e) => xe.includes(e));
  });
}

/* ── Relationship stats ── */

export const NON_REAL = ["cancelled", "lead", "lead_lost", "hold_expired"];

export interface CustomerChargeRow extends ChargeLike { booking_id: string; }
export interface CustomerPayRow { booking_id: string; amount_applied: number; }

export interface CustomerStats {
  since: number | null;
  events: number;
  lifetime: number;
  outstanding: number;
  upcoming: number;
  avgGuests: number | null;
  favRoom: string | null;
  favMenu: string | null;
  lastMenu: string | null;        // menu on the most recent completed event
  favAddons: string[];            // top add-ons by job count (max 3)
  lastEvent: string | null;
  tier: string | null;
  byYear: { year: string; revenue: number; count: number }[];
  history: Booking[];
}

export function headsOf(x: Booking): number {
  const g = deriveGuests(x);
  return (g.gendered ? g.men + g.women : g.adults) + g.children;
}

export function computeCustomerStats(
  matched: Booking[],
  charges: CustomerChargeRow[],
  pays: CustomerPayRow[],
  rooms: Map<string, string>,
): CustomerStats | null {
  if (matched.length <= 1) return null;

  const chargesBy = new Map<string, ChargeLike[]>();
  for (const c of charges) {
    if (!chargesBy.has(c.booking_id)) chargesBy.set(c.booking_id, []);
    chargesBy.get(c.booking_id)!.push(c);
  }
  const paidBy = new Map<string, number>();
  for (const p of pays) paidBy.set(p.booking_id, (paidBy.get(p.booking_id) ?? 0) + Number(p.amount_applied));

  const real = matched.filter((x) => !NON_REAL.includes(x.status));
  const completed = real.filter((x) => x.status === "completed");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = real.filter((x) =>
    x.status !== "completed" && x.event_date && parseLocalDate(x.event_date) >= today);

  let lifetime = 0;
  const yearMap = new Map<string, { revenue: number; count: number }>();
  for (const x of completed) {
    const total = bookingFinancials(x, chargesBy.get(x.id) ?? []).total;
    lifetime += total;
    const y = x.event_date ? x.event_date.slice(0, 4) : "—";
    const e = yearMap.get(y) ?? { revenue: 0, count: 0 };
    e.revenue += total; e.count++;
    yearMap.set(y, e);
  }
  let outstanding = 0;
  for (const x of real) {
    const fin = bookingFinancials(x, chargesBy.get(x.id) ?? []);
    outstanding += Math.max(0, fin.total - (paidBy.get(x.id) ?? 0));
  }

  const withHeads = completed.filter((x) => headsOf(x) > 0);
  const avgGuests = withHeads.length
    ? Math.round(withHeads.reduce((s, x) => s + headsOf(x), 0) / withHeads.length) : null;

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

  // Last menu: most recent completed event's menu.
  const lastCompleted = completed
    .filter((x) => x.event_date)
    .sort((a, z) => (z.event_date ?? "").localeCompare(a.event_date ?? ""))[0] ?? null;
  const lastMenu = lastCompleted?.menu_type && lastCompleted.menu_type !== "Not Sure Yet"
    ? lastCompleted.menu_type : null;

  // Favorite add-ons: charge names by number of JOBS they appear on (same
  // name-dedup as the dashboard: strip trailing ×N quantity suffixes).
  const addonJobs = new Map<string, Set<string>>();
  for (const c of charges) {
    const name = (c.description || "").replace(/\s*[×x]\s*\d+\s*$/, "").trim();
    if (!name) continue;
    if (!addonJobs.has(name)) addonJobs.set(name, new Set());
    addonJobs.get(name)!.add(c.booking_id);
  }
  const favAddons = Array.from(addonJobs.entries())
    .filter(([, jobs]) => jobs.size >= 2)   // "favorite" = ordered more than once
    .sort((a, z) => z[1].size - a[1].size)
    .slice(0, 3)
    .map(([name]) => name);

  const firstDate = matched
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
    upcoming: upcoming.length, avgGuests, favRoom, favMenu, lastMenu, favAddons, lastEvent, tier,
    byYear: Array.from(yearMap.entries())
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, z) => z.year.localeCompare(a.year)),
    history: matched.slice().sort((a, z) => (z.event_date ?? "9999").localeCompare(a.event_date ?? "9999")),
  };
}
