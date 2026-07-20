// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY KINDS (v215 · Library slice 1) — the registrations for the kinds
// that exist today: components, past events (blueprints live in
// blueprintLibrary.ts since v256). Recipes wait for
// SPEC-006; media stays evidence-side until SPEC-005 (the agreed narrowing
// of KA §11's slice-1 entry). The projections here are v196's searchLibrary
// queries, lifted verbatim into the registration contract — one search
// doctrine, now behind one door.
//
// Registered here rather than in the registry file BY DESIGN: the registry
// is machinery, kinds are content, and the whole point of the contract is
// that a future kind's registration lands in ITS OWN module with zero
// Library diffs. These three share a module only because they share a
// birthday.
//
// ─── WHY IDENTITIES, NOT COMPONENTS (v196, carried forward) ───────────────
// Searching `event_components` returns "Sushi Station" seventeen times —
// once per event that ever used it. That is a search over INSTANCES. We
// search `component_definitions` (the NOUN) and count the instances behind
// it: one row, "used 17×" — the composability keystone paying rent.
//
// ─── WHAT IS DELIBERATELY NOT HERE (v196, still true) ─────────────────────
// • "This Client" — ⛔ blocked by audit A11: no Client object exists; a
//   contact-name match would return "the Bergers" for three unrelated
//   families. An honest gap beats a wrong answer.
// • Venues, people, collections — no Library objects yet.
// • Semantic search — ilike, as the header always said; a later layer over
//   the same data, and never promised before it exists (KA §5).
//
// ─── ENVELOPE HONESTY ─────────────────────────────────────────────────────
// layer_badges: [] — a badge lights when its layer slice ships a Library
// projection (KA §11), never before. cover: null until §8. facets: {} until
// Explore. tenant: "tenant" — RLS scopes every read here; recorded on the
// envelope so a future index can enforce it AGAIN (§5).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { templateProof, proofLine, ProofRow } from "./proof";
import { PortablePresentation, PresentationProvenance } from "./portable";
import { ThemeDelta } from "./publication";
import { PhotoPins } from "./photos";
import {
  registerLibraryKind, rankPrefix, LibraryEntry, RankedEntry,
} from "./libraryRegistry";
import { bootBlueprintShelfKind } from "./blueprintLibraryKind";

const fmt = (d: string | null) => {
  if (!d) return null;
  // Date-only column: local noon, never raw new Date() (v194 P0.7).
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const envelope = (
  e: Pick<LibraryEntry, "id" | "kind" | "title" | "subtitle"> & Partial<LibraryEntry>,
): LibraryEntry => ({
  cover: null, tenant: "tenant", tags: [], facets: {}, text: null,
  layer_badges: [], provenance: null, pointer: { href: null }, ...e,
});

let booted = false;

/** Idempotent, the bootMoves idiom: every surface that consumes the Library
 *  calls this on its way up; the first call wins. */
export function bootLibraryKinds(): void {
  bootPresentationKinds();
  bootBlueprintShelfKind();
  if (booted) return;
  booted = true;

  // ── Components: the NOUN, not its instances ──────────────────────────────
  registerLibraryKind({
    kind: "component", label: "Components", icon: "◆",
    async search({ q, like }) {
      const { data } = await supabase
        .from("component_definitions").select("id,name").ilike("name", like).limit(8);
      const rows = (data ?? []) as { id: string; name: string }[];
      if (!rows.length) return [];
      // Usage counts: one query for all identities found, counted in memory.
      // "Used 17×" is the number the Rolodex could never say.
      const usage: Record<string, number> = {};
      const { data: insts } = await supabase.from("event_components")
        .select("definition_id").in("definition_id", rows.map((r) => r.id));
      for (const row of (insts ?? []) as { definition_id: string }[]) {
        usage[row.definition_id] = (usage[row.definition_id] ?? 0) + 1;
      }
      return rows.map((r): RankedEntry => {
        const n = usage[r.id] ?? 0;
        return {
          entry: envelope({
            id: r.id, kind: "component", title: r.name,
            subtitle: n === 0 ? "Not yet used" : `Used in ${n} event${n === 1 ? "" : "s"}`,
          }),
          // Usage breaks ties, capped so a popular item can't bury an exact
          // match.
          weight: rankPrefix(r.name, q, Math.min(n, 20)),
        };
      });
    },
    // Instantiate is the component's verb (Library → Canvas). The host
    // supplies the event context; without one the browser has an honest
    // nothing, because an identity has no detail route yet.
    pick: (e) => ({ type: "instantiate", instantiateId: e.id, name: e.title }),
    // v216: legality declared (KA §6). The mime is registration-level so the
    // Canvas computes acceptance from declarations (canvasDragMimes).
    legalDestinations: ["canvas"],
    dragMime: "text/eventcore-identity",
    drag: (e) => ({
      mime: "text/eventcore-identity",
      payload: JSON.stringify({ identityId: e.id, name: e.title }),
    }),
    secondary: (e) => ({
      label: "definition", id: e.id, title: e.title,
    }),
  });

  // ── Past events: evidence — found by search, never edited ────────────────
  registerLibraryKind({
    kind: "event", label: "Past events", icon: "◈",
    async search({ q, like }) {
      const { data } = await supabase.from("bookings")
        .select("id,contact_name,event_type,event_date,invoice_num")
        .or(`contact_name.ilike.${like},event_type.ilike.${like},invoice_num.ilike.${like}`)
        .order("event_date", { ascending: false }).limit(8);
      return ((data ?? []) as {
        id: string; contact_name: string; event_type: string | null;
        event_date: string | null; invoice_num: string | null;
      }[]).map((b): RankedEntry => ({
        entry: envelope({
          id: b.id, kind: "event",
          title: b.contact_name || "(no name)",
          subtitle: [b.event_type, fmt(b.event_date), b.invoice_num ? `#${b.invoice_num}` : null]
            .filter(Boolean).join(" · ") || null,
          pointer: { href: `/bookings/${b.id}` },
        }),
        weight: rankPrefix(b.contact_name ?? "", q),
      }));
    },
    pick: (e) => e.pointer.href
      ? { type: "navigate", href: e.pointer.href }
      : { type: "none" },
  });

  // ── Blueprints: curated — the company's standard ─────────────────────────
  // v256 · BP-6: the v216 legacy blueprint registration (which read the
  // retired v182 pointer table with a land verb) is superseded by the
  // constitutional shelf kind — registered in ITS OWN module
  // (blueprintLibrary.ts), booted below. One word, one meaning.
}

/** ═══ v243 — PRESENTATION KNOWLEDGE (PA-5 · §5): the Library's four
 *  publishing-asset kinds. Registration only — the browser knows no kind
 *  by name. Template subtitles carry PROOF, computed at search time from
 *  provenance rows; a theme_key coincidence is never evidence. ═══ */
export function bootPresentationKinds(): void {
  const moneyFmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  registerLibraryKind({
    kind: "template", label: "Templates", icon: "▦",
    async search({ q, like }) {
      const [{ data: tpls }, { data: vers }] = await Promise.all([
        supabase.from("publication_themes").select("*")
          .eq("active", true).eq("asset_kind", "template").ilike("name", like).limit(8),
        supabase.from("proposal_versions")
          .select("status,presentation_provenance,theme_key,theme_override,photo_pins")
          .not("presentation_provenance", "is", null).limit(500),
      ]);
      const rows: ProofRow[] = ((vers ?? []) as {
        status: string; presentation_provenance: PresentationProvenance;
        theme_key: string | null; theme_override: ThemeDelta | null; photo_pins: PhotoPins | null;
      }[]).map((v) => ({ status: v.status, provenance: v.presentation_provenance,
        themeKey: v.theme_key, override: v.theme_override, pins: v.photo_pins }));
      return ((tpls ?? []) as { id: string; name: string; portable: PortablePresentation | null }[])
        .filter((t) => !!t.portable)
        .map((t) => ({
          weight: rankPrefix(t.name, q),
          entry: {
            id: t.id, kind: "template", title: t.name,
            subtitle: proofLine(templateProof({ id: t.id, portable: t.portable! }, rows), moneyFmt),
            cover: null, tenant: "tenant" as const, tags: [], facets: {}, text: null,
            layer_badges: [], provenance: null, pointer: { href: null },
          },
        }));
    },
    pick: () => ({ type: "none" }),
  });

  registerLibraryKind({
    kind: "theme", label: "Themes", icon: "◐",
    async search({ q, like }) {
      const { data } = await supabase.from("publication_themes").select("*")
        .eq("active", true).ilike("name", like).limit(8);
      return ((data ?? []) as { id: string; name: string; asset_kind?: string }[])
        .filter((t) => (t.asset_kind ?? "theme") === "theme")
        .map((t) => ({ weight: rankPrefix(t.name, q), entry: {
          id: t.id, kind: "theme", title: t.name, subtitle: "Design vocabulary — named in Brand Studio",
          cover: null, tenant: "tenant" as const, tags: [], facets: {}, text: null,
          layer_badges: [], provenance: null, pointer: { href: "/brand" } } }));
    },
    pick: (e) => (e.pointer.href ? { type: "navigate", href: e.pointer.href } : { type: "none" }),
  });

  registerLibraryKind({
    kind: "photo", label: "Photography", icon: "▣",
    async search({ q, like }) {
      const { data } = await supabase.from("photo_library").select("id,label,tags").ilike("label", like).limit(8);
      return ((data ?? []) as { id: string; label: string; tags: string[] | null }[])
        .filter((ph) => !((ph.tags ?? []).indexOf("brand") >= 0))
        .map((ph) => ({ weight: rankPrefix(ph.label, q), entry: {
          id: ph.id, kind: "photo", title: ph.label, subtitle: (ph.tags ?? []).join(" · ") || null,
          cover: null, tenant: "tenant" as const, tags: ph.tags ?? [], facets: {}, text: null,
          layer_badges: [], provenance: null, pointer: { href: null } } }));
    },
    pick: () => ({ type: "none" }),
  });

  registerLibraryKind({
    kind: "brandasset", label: "Brand assets", icon: "◉",
    async search({ q, like }) {
      const { data } = await supabase.from("photo_library").select("id,label,tags")
        .contains("tags", ["brand"]).ilike("label", like).limit(8);
      return ((data ?? []) as { id: string; label: string; tags: string[] | null }[])
        .map((ph) => ({ weight: rankPrefix(ph.label, q), entry: {
          id: ph.id, kind: "brandasset", title: ph.label, subtitle: "Brand asset — managed in Brand Studio",
          cover: null, tenant: "tenant" as const, tags: ph.tags ?? [], facets: {}, text: null,
          layer_badges: [], provenance: null, pointer: { href: "/brand" } } }));
    },
    pick: (e) => (e.pointer.href ? { type: "navigate", href: e.pointer.href } : { type: "none" }),
  });
}
