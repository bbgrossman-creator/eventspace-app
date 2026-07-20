// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT LIBRARY KIND — registration (v256 · BP-6). The projection and
// its reads; the LAW (visibility, proof wording) lives supabase-free in
// blueprintLibrary.ts. Together these are the kind's "own module" of the
// v215 doctrine: zero Library-machinery diffs.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import {
  registerLibraryKind, rankPrefix, LibraryEntry, RankedEntry,
} from "./libraryRegistry";
import { shelfEntryVisible, blueprintProofLine } from "./blueprintLibrary";

let booted = false;

export function bootBlueprintShelfKind(): void {
  if (booted) return;
  booted = true;

  registerLibraryKind({
    kind: "blueprint", label: "Blueprints", icon: "📘",
    async search({ q, like }) {
      const { data } = await supabase
        .from("blueprint_identities")
        .select("id,name,taxonomy,status,published_revision_id")
        .ilike("name", like)
        .limit(8);
      const idents = ((data ?? []) as {
        id: string; name: string; taxonomy: string | null;
        status: string; published_revision_id: string | null;
      }[]).filter(shelfEntryVisible);
      if (idents.length === 0) return [];

      const revIds = idents.map((i) => i.published_revision_id!) ;
      const [revs, cites] = await Promise.all([
        supabase.from("blueprint_revisions").select("id,revision_number").in("id", revIds),
        supabase.from("blueprint_instantiations").select("blueprint_id").in("blueprint_id", idents.map((i) => i.id)),
      ]);
      const revNum = new Map(((revs.data ?? []) as { id: string; revision_number: number }[])
        .map((r) => [r.id, r.revision_number]));
      const counts = new Map<string, number>();
      for (const c of (cites.data ?? []) as { blueprint_id: string }[]) {
        counts.set(c.blueprint_id, (counts.get(c.blueprint_id) ?? 0) + 1);
      }

      return idents.map((i): RankedEntry => {
        const entry: LibraryEntry = {
          id: i.id, kind: "blueprint", title: i.name,
          subtitle: blueprintProofLine(i.taxonomy, revNum.get(i.published_revision_id!) ?? null, counts.get(i.id) ?? 0),
          cover: null, tenant: "tenant", tags: [], facets: {}, text: i.taxonomy,
          layer_badges: [], provenance: null,
          pointer: { href: "/blueprint-shelf" },
        };
        // The weight is the query’s business alone — provenance informs,
        // never orders (KA §5; PUBLICATION_BLUEPRINTS: nothing ranks).
        return { entry, weight: rankPrefix(i.name, q) };
      });
    },
    pick: (e) => (e.pointer.href ? { type: "navigate", href: e.pointer.href } : { type: "none" }),
    // Click-only, by design: the Library points, the shelf performs.
  });
}
