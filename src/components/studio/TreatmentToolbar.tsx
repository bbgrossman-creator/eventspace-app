"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE CONTEXTUAL TOOLBAR (v229 · PUBLICATION §6.3) — belongs to the SELECTED
// identity. Two identities so far: a SECTION (heading · divider · spacing ·
// background) and THE DOCUMENT itself (title · measure · spacing · divider —
// the publication's own dress and defaults). Semantic options only, from
// the registries; the toolbar builds sparse ThemeDelta patches and knows
// nothing about persistence — render state until Save look (§6.4). NO
// structural actions, ever (§0.2).
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";
import {
  ResolvedTheme, ThemeDelta, SectionTreatment, DocumentTreatment, ComponentTreatment, ItemTreatment,
  TREATMENT_OPTIONS, DOCUMENT_TITLE_OPTIONS, MEASURE_OPTIONS, DOCUMENT_PHOTO_OPTIONS,
  COMPONENT_TREATMENT_OPTIONS, ITEM_TREATMENT_OPTIONS,
  effectiveSectionTreatment, effectiveComponentTreatment, effectiveItemTreatment,
} from "@/lib/publication";

export default function TreatmentToolbar(props: {
  selection: { kind: "document" } | { kind: "section"; id: string; name: string } | { kind: "component"; id: string; name: string } | { kind: "item"; id: string; name: string };
  resolved: ResolvedTheme;
  onPatch: (patch: ThemeDelta) => void;
  /** v233 — the identity's photo shelf: opens the Photography room ON this
   *  slot. The toolbar stays structural-action-free; choosing imagery is a
   *  presentation act. */
  onChoosePhoto?: () => void;
  onClose: () => void;
}) {
  const sel = props.selection;
  const doc = props.resolved.treatments.document;
  const eff: Required<SectionTreatment> = sel.kind === "section"
    ? effectiveSectionTreatment(props.resolved, sel.id) : doc;
  const ceff: Required<ComponentTreatment> | null = sel.kind === "component"
    ? effectiveComponentTreatment(props.resolved, sel.id) : null;
  const ieff: Required<ItemTreatment> | null = sel.kind === "item"
    ? effectiveItemTreatment(props.resolved, sel.id) : null;

  const secPatch = (t: SectionTreatment): ThemeDelta =>
    sel.kind === "section"
      ? { treatments: { sections: { [sel.id]: t } } }
      : { treatments: { document: t } };

  const Group = (g: { label: string; children: React.ReactNode }) => (
    <span className="flex items-center gap-1">
      <span className="text-[9.5px] text-slate-300 uppercase">{g.label}</span>
      {g.children}
    </span>
  );
  const Opt = (o: { id: string; active: boolean; label: string; onClick: () => void }) => (
    <button data-treat={o.id} onClick={o.onClick}
      className={`text-[10.5px] px-1.5 py-0.5 rounded ${o.active
        ? "bg-[#102F56] text-white" : "text-slate-500 hover:bg-slate-100"}`}>{o.label}</button>
  );

  return (
    <div data-treatment-toolbar data-treatment-kind={sel.kind}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-xl shadow-2xl ring-1 ring-[#E7EDF5] px-3 py-2 flex items-center gap-3 flex-wrap max-w-[92vw]">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 max-w-[120px] truncate">
        {sel.kind === "document" ? "Document" : sel.name}
      </span>

      {sel.kind === "document" && (
        <>
          <Group label="Title">
            {DOCUMENT_TITLE_OPTIONS.map((o) => (
              <Opt key={o.value} id={`title:${o.value}`} label={o.label}
                active={doc.title === o.value}
                onClick={() => props.onPatch({ treatments: { document: { title: o.value } as DocumentTreatment } })} />
            ))}
          </Group>
          <Group label="Photo">
            {DOCUMENT_PHOTO_OPTIONS.map((o) => (
              <Opt key={o.value} id={`photo:${o.value}`} label={o.label}
                active={doc.photo === o.value}
                onClick={() => props.onPatch({ treatments: { document: { photo: o.value } as DocumentTreatment } })} />
            ))}
            {props.onChoosePhoto && (
              <button data-treat-photo onClick={props.onChoosePhoto}
                className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50">Choose…</button>
            )}
          </Group>
          <Group label="Measure">
            {MEASURE_OPTIONS.map((o) => (
              <Opt key={o.value} id={`measure:${o.label.toLowerCase()}`} label={o.label}
                active={props.resolved.margins.measure === o.value}
                onClick={() => props.onPatch({ margins: { measure: o.value } })} />
            ))}
          </Group>
        </>
      )}

      {sel.kind === "component" && ceff && COMPONENT_TREATMENT_OPTIONS.map((g) => (
        <Group key={g.key} label={g.label}>
          {g.options.map((o) => (
            <Opt key={o.value} id={`${g.key}:${o.value}`} label={o.label}
              active={ceff[g.key] === o.value}
              onClick={() => props.onPatch({ treatments: { components: { [sel.id]: { [g.key]: o.value } as ComponentTreatment } } })} />
          ))}
        </Group>
      ))}

      {sel.kind === "item" && ieff && ITEM_TREATMENT_OPTIONS.map((g) => (
        <Group key={g.key} label={g.label}>
          {g.options.map((o) => (
            <Opt key={o.value} id={`${g.key}:${o.value}`} label={o.label}
              active={ieff[g.key] === o.value}
              onClick={() => props.onPatch({ treatments: { items: { [sel.id]: { [g.key]: o.value } as ItemTreatment } } })} />
          ))}
        </Group>
      ))}

      {sel.kind !== "component" && sel.kind !== "item" && TREATMENT_OPTIONS
        .filter((g) => sel.kind === "section" ? true : g.key !== "heading" && g.key !== "background" && g.key !== "photo")
        .map((g) => (
          <Group key={g.key} label={g.label}>
            {g.options.map((o) => (
              <Opt key={o.value} id={`${g.key}:${o.value}`} label={o.label}
                active={eff[g.key] === o.value}
                onClick={() => props.onPatch(secPatch({ [g.key]: o.value } as SectionTreatment))} />
            ))}
          </Group>
        ))}

      {(sel.kind === "section" || sel.kind === "component") && props.onChoosePhoto && (
        <button data-treat-photo onClick={props.onChoosePhoto}
          className="text-[10.5px] px-1.5 py-0.5 rounded ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50">Choose photo…</button>
      )}
      <button data-treat-close onClick={props.onClose} title="Done — back to the paper"
        className="text-slate-300 hover:text-slate-600 text-[12px] pl-1">✕</button>
    </div>
  );
}
