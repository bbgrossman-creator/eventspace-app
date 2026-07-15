// ═══════════════════════════════════════════════════════════════════════════
// THE LIBRARY — search (v196 slice 3)
//
// The organisation's memory, made findable. Pixels say "Library"; the
// constitution says Knowledge (event-studio-design.md naming table).
//
// This is a PROJECTION under the renderer contract: it queries, it returns
// data, it renders nothing. LibraryBrowser consumes the result and never
// queries. Same seam as presentation.ts ↔ ProposalRenderer.
//
// ─── THE ROLODEX FOLDS IN HERE ────────────────────────────────────────────
// The Rolodex was the Library's prototype: search past events, find a
// component, copy it forward. Keeping both would be two names for one surface
// — the exact drift the naming table exists to prevent. So the Library
// searches what the Rolodex searched, plus more, from one input.
//
// ─── WHY IDENTITIES, NOT COMPONENTS ───────────────────────────────────────
// Searching `event_components` returns "Sushi Station" seventeen times — once
// per event that ever used it. That is a search over INSTANCES, and it is what
// made the Rolodex a list of past events rather than a library.
//
// v192 gave us the noun. We search `component_identities` and count the
// instances behind it: **one row, "used 17×"**. That is the composability
// keystone paying rent — the first surface where ComponentIdentity is the
// point rather than plumbing.
//
// ─── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
// • "This Client" — ⛔ blocked by audit A11. There is no Client object; the
//   customer is nine string columns on `bookings`. Faking it with a contact
//   name match would return "the Bergers" for three unrelated families and
//   teach the user to distrust the Library. An honest gap beats a wrong answer.
// • Recipes, media, venues, people — no Library objects yet (banked domains §1).
// • Semantic search — v1 is `ilike`. The Rolodex header already said so; the
//   upgrade is a later layer over the same data, not a redesign.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { SearchResultKind } from "./lenses";

export interface LibraryResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  /** WHY this result is here — the line that makes a hit legible rather than
   *  merely correct. "Used in 17 events" · "Bar Mitzvah · Jun 30 2026". */
  subtitle: string | null;
  /** Where it goes. Null = there is no page for it yet (an identity has no
   *  detail route until the Library gets one). */
  href: string | null;
  /** For components: the identity, so a caller can instantiate from it. */
  identityId?: string;
  /** Sort weight. Higher = more relevant. Deliberately crude: a prefix match
   *  beats a substring, usage breaks ties. No scorer, no "92% relevant". */
  weight: number;
}

export interface LibraryResults {
  components: LibraryResult[];
  events: LibraryResult[];
  blueprints: LibraryResult[];
  /** True when the query was too short to search — the empty state should say
   *  "type to search", not "no results", because those are different facts. */
  idle: boolean;
}

const EMPTY: LibraryResults = { components: [], events: [], blueprints: [], idle: true };

const fmt = (d: string | null) => {
  if (!d) return null;
  // Date-only column: local noon, never raw new Date() (v194 P0.7).
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** Prefix beats substring. That is the whole ranking model, and it is enough:
 *  someone typing "sus" wants "Sushi Station", not "Couscous Salad". */
const rank = (title: string, q: string, bonus = 0) =>
  (title.toLowerCase().startsWith(q) ? 100 : 50) + bonus;

/**
 * One query, every shelf. RLS scopes everything to the caller's tenant, so
 * there is no tenant argument — same as every other read in the app.
 */
export async function searchLibrary(query: string): Promise<LibraryResults> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return EMPTY;
  const like = `%${q}%`;

  const [ids, bks, bps] = await Promise.all([
    // ── Components: the NOUN, not its instances ──
    supabase.from("component_identities").select("id,name").ilike("name", like).limit(8),
    // ── Events ──
    supabase.from("bookings")
      .select("id,contact_name,event_type,event_date,invoice_num")
      .or(`contact_name.ilike.${like},event_type.ilike.${like},invoice_num.ilike.${like}`)
      .order("event_date", { ascending: false }).limit(8),
    // ── Blueprints ──
    supabase.from("blueprints").select("id,name,description").ilike("name", like).limit(5),
  ]);

  const idRows = (ids.data ?? []) as { id: string; name: string }[];

  // Usage counts: one query for all identities found, counted in memory.
  // "Used 17×" is the number the Rolodex could never say, because it had no
  // noun to count instances of.
  const usage: Record<string, number> = {};
  if (idRows.length) {
    const { data: insts } = await supabase.from("event_components")
      .select("identity_id").in("identity_id", idRows.map((r) => r.id));
    for (const row of (insts ?? []) as { identity_id: string }[]) {
      usage[row.identity_id] = (usage[row.identity_id] ?? 0) + 1;
    }
  }

  const components: LibraryResult[] = idRows.map((r) => {
    const n = usage[r.id] ?? 0;
    return {
      kind: "component" as const, id: r.id, title: r.name,
      subtitle: n === 0 ? "Not yet used" : `Used in ${n} event${n === 1 ? "" : "s"}`,
      href: null,          // no identity detail route yet — the browser offers actions instead
      identityId: r.id,
      weight: rank(r.name, q, Math.min(n, 20)),   // usage breaks ties, capped so
                                                   // a popular item can't bury an exact match
    };
  }).sort((a, b) => b.weight - a.weight);

  const events: LibraryResult[] = ((bks.data ?? []) as {
    id: string; contact_name: string; event_type: string | null;
    event_date: string | null; invoice_num: string | null;
  }[]).map((b) => ({
    kind: "event" as const, id: b.id,
    title: b.contact_name || "(no name)",
    subtitle: [b.event_type, fmt(b.event_date), b.invoice_num ? `#${b.invoice_num}` : null]
      .filter(Boolean).join(" · ") || null,
    href: `/bookings/${b.id}`,
    weight: rank(b.contact_name ?? "", q),
  })).sort((a, b) => b.weight - a.weight);

  const blueprints: LibraryResult[] = ((bps.data ?? []) as {
    id: string; name: string; description: string | null;
  }[]).map((bp) => ({
    kind: "blueprint" as const, id: bp.id, title: bp.name,
    subtitle: bp.description, href: `/blueprints`,
    weight: rank(bp.name, q),
  })).sort((a, b) => b.weight - a.weight);

  return { components, events, blueprints, idle: false };
}

export const resultCount = (r: LibraryResults) =>
  r.components.length + r.events.length + r.blueprints.length;
