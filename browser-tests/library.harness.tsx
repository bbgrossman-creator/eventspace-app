// harness/library.harness.tsx — mounts the REAL LibraryBrowser (v215,
// registry-driven) over FIXTURE kind registrations: the browser under test
// is the shipped one; the projections are fixtures, exactly as
// production.harness.tsx does for the production pipeline. No real kind is
// booted — the registry contains only what this file registers, which is
// itself part of the claim: the browser renders kinds it has never named.
//
// Modes: (default) overlay | ?mode=docked | ?mode=host (an onInstantiate
// host is present, so the instantiate kind's ↵ means "add to event")
import React from "react";
import { createRoot } from "react-dom/client";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import { registerLibraryKind, rankPrefix, LibraryEntry } from "@/lib/libraryRegistry";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "overlay";

const env = (kind: string, id: string, title: string, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id, kind, title, subtitle: null, cover: null, tenant: "tenant", tags: [],
  facets: {}, text: null, layer_badges: [], provenance: null,
  pointer: { href: null }, ...over,
});

// A fixture "station" kind — instantiable, draggable, with a secondary
// affordance: the component contract's shape, under a name the browser has
// never seen.
registerLibraryKind({
  kind: "fx-station", label: "Stations", icon: "◆",
  search: async ({ q }) => [
    { entry: env("fx-station", "s1", "Sushi Station", { subtitle: "Used in 17 events" }),
      weight: rankPrefix("Sushi Station", q, 17) },
    { entry: env("fx-station", "s2", "Couscous Salad Bar", { subtitle: "Used in 2 events" }),
      weight: rankPrefix("Couscous Salad Bar", q, 2) },
  ].filter((r) => r.entry.title.toLowerCase().includes(q)),
  pick: (e) => ({ type: "instantiate", instantiateId: e.id, name: e.title }),
  drag: (e) => ({ mime: "text/eventcore-identity",
    payload: JSON.stringify({ identityId: e.id, name: e.title }) }),
  secondary: (e) => ({ label: "definition", id: e.id, title: e.title }),
});

// A fixture "gala" kind — navigate-only, no drag: evidence's shape.
registerLibraryKind({
  kind: "fx-gala", label: "Past galas", icon: "◈",
  search: async ({ q }) => [
    { entry: env("fx-gala", "g1", "Sussman Bar Mitzvah",
        { subtitle: "Jun 2026 · #560018", pointer: { href: "#opened-g1" } }),
      weight: rankPrefix("Sussman Bar Mitzvah", q) },
  ].filter((r) => r.entry.title.toLowerCase().includes(q)),
  pick: (e) => e.pointer.href ? { type: "navigate", href: e.pointer.href } : { type: "none" },
});

const picks: string[] = [];
(window as unknown as { __picks: string[] }).__picks = picks;

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh" }} className="bg-[#F6F8FB]">
    <LibraryBrowser
      open={true}
      docked={mode === "docked"}
      onClose={() => { picks.push("closed"); }}
      onInstantiate={mode === "host"
        ? (id, name) => { picks.push(`instantiate:${id}:${name}`); }
        : undefined}
      onViewDefinition={(id, name) => { picks.push(`definition:${id}:${name}`); }}
    />
  </div>);
