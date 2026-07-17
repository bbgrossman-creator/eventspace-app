// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURE FACET (SPEC-002 UI slice · Pre-work II made real)
//
// The rules this component exists to keep:
//   · Landed is legitimate — renders complete from seeded defaults, zero
//     required interaction; every row is a closed sentence that opens.
//   · Menu is a DOORWAY to the canvas, never a second items editor.
//   · Schemes STAGE (diff shown, nothing committed until confirm) — and every
//     scheme-set value releases its grip on first operator edit.
//   · Numbers show their work; overrides are never silently revised.
//   · Requires WHISPERS (count ticks; suppression strikes through, restorable).
//   · Notes are a different material (left-ruled block, per layer).
//   · Divergence chip → business-language diff; reset_all is a ceremony that
//     lists what it will undo.
//   · Every edit is a MoveProposal through submitBatch — the facet owns no
//     write path of its own.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import { useMemo, useState } from "react";
import {
  ConfigState, submitBatch, divergenceOf, compileBatch, PersistAdapter,
} from "@/lib/configure";
import { MoveProposal } from "@/lib/moves/types";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7" } as const;

export interface ConfigureFacetProps {
  state: ConfigState;
  onState: (s: ConfigState) => void;
  persist: PersistAdapter;
  itemCount: number;
  onOpenCanvas?: () => void;
  canEdit: boolean;
}

export default function ConfigureFacet(p: ConfigureFacetProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [staged, setStaged] = useState<{ schemeId: string; lines: string[] } | null>(null);
  const [resetStage, setResetStage] = useState<string[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const div = useMemo(() => divergenceOf(p.state), [p.state]);
  const reqs = p.state.requirements;
  const reqLive = reqs.filter((r) => r.suppressedAt === null);
  const byLayer = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reqLive) m[r.layerKey] = (m[r.layerKey] ?? 0) + 1;
    return m;
  }, [reqLive]);

  async function submit(proposals: MoveProposal[]) {
    setErr(null);
    const prevCount = reqLive.length;
    const res = await submitBatch(p.state, proposals, p.persist);
    if (!res.ok) { setErr(res.error); return false; }
    p.onState(res.next);
    const nowCount = res.next.requirements.filter((r) => r.suppressedAt === null).length;
    if (nowCount !== prevCount) {
      setFlash(`${nowCount > prevCount ? "+" : ""}${nowCount - prevCount}`);
      window.setTimeout(() => setFlash(null), 1600);
    }
    return true;
  }

  const P = (kind: string, payload: unknown, origin: MoveProposal["origin"] = "facet"): MoveProposal =>
    ({ kind, instanceId: p.state.componentId, payload, origin });

  const Row = ({ id, label, summary, children }: {
    id: string; label: string; summary: React.ReactNode; children?: React.ReactNode;
  }) => (
    <div className="border-t" style={{ borderColor: T.rule }} data-facet-row={id}>
      <button className="w-full flex items-baseline gap-2 px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} data-facet-toggle={id}>
        <span className="text-[9px] text-slate-400">{open[id] ? "▾" : "▸"}</span>
        <span className="text-[12px] font-semibold" style={{ color: T.ink }}>{label}</span>
        <span className="text-[11px] text-slate-500 truncate" data-facet-summary={id}>{summary}</span>
      </button>
      {open[id] && children && <div className="px-4 pb-3">{children}</div>}
    </div>
  );

  const scheme = p.state.config.schemeId;
  const schemes = p.state.seed.schemes;
  const scalars = p.state.config.scalars;
  const choices = p.state.config.choices;

  return (
    <div data-configure-facet className="text-[12px]">
      {/* ── header: definition + divergence chip ── */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configure</span>
        <button data-divergence-chip
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: div.length ? "#FBF6EA" : "#F1F5F9", color: div.length ? T.gold : "#94A3B8" }}
          onClick={() => setOpen((o) => ({ ...o, diff: !o.diff }))}>
          {div.length === 0 ? "no changes" : `${div.length} change${div.length > 1 ? "s" : ""} from definition`}
        </button>
      </div>
      {open.diff && (
        <div className="mx-3 mb-2 rounded border px-3 py-2" style={{ borderColor: T.rule }} data-divergence-list>
          {div.length === 0 && <div className="text-slate-400">Exactly the definition's seed.</div>}
          {div.map((l) => <div key={l.dimension} className="py-0.5" data-diff-line={l.dimension}>{l.text}</div>)}
          {div.length > 0 && p.canEdit && (
            <button data-reset-all className="mt-2 text-[11px] underline text-slate-500"
              onClick={() => setResetStage(div.map((l) => l.text))}>Reset to definition…</button>
          )}
        </div>
      )}

      {/* ── reset ceremony: the confirmation IS the diff ── */}
      {resetStage && (
        <div className="mx-3 mb-2 rounded border-2 px-3 py-2" style={{ borderColor: T.gold }} data-reset-ceremony>
          <div className="font-semibold mb-1" style={{ color: T.ink }}>Reset will undo all of this:</div>
          {resetStage.map((t, i) => <div key={i} className="py-0.5">· {t}</div>)}
          <div className="mt-2 flex gap-2">
            <button data-reset-confirm className="rounded px-2 py-1 text-white text-[11px]" style={{ background: T.navy }}
              onClick={async () => {
                if (await submit([P("reset_all", {})])) setResetStage(null);
              }}>Reset everything</button>
            <button className="text-[11px] underline text-slate-500" onClick={() => setResetStage(null)}>Keep my changes</button>
          </div>
        </div>
      )}

      {err && <div className="mx-3 mb-1 text-[11px] text-red-600" data-facet-error>{err}</div>}

      {/* ── Look: schemes stage, then release their grip ── */}
      <Row id="look" label="Look"
        summary={scheme
          ? <>{schemes[scheme]?.label ?? scheme}{p.state.config.customized.length > 0 && <> · {p.state.config.customized.length} customized</>}</>
          : "house default"}>
        <div className="flex flex-wrap gap-2">
          {Object.values(schemes).map((s) => (
            <button key={s.id} data-scheme-card={s.id}
              className="rounded border px-2 py-1 text-[11px] hover:border-slate-400"
              style={{ borderColor: scheme === s.id ? T.gold : T.rule, fontWeight: scheme === s.id ? 600 : 400 }}
              onClick={() => {
                try {
                  const { planned } = compileBatch(p.state,
                    [P("apply_scheme", { schemeId: s.id }, "scheme")]);
                  setStaged({ schemeId: s.id, lines: planned.descriptions });
                } catch (e) { setErr((e as Error).message); }
              }}>{s.label}</button>
          ))}
        </div>
        {staged && (
          <div className="mt-2 rounded border px-3 py-2" style={{ borderColor: T.gold }} data-scheme-staging>
            <div className="font-semibold mb-1" style={{ color: T.ink }}>
              {schemes[staged.schemeId]?.label} would make these changes:
            </div>
            {staged.lines.map((l, i) => <div key={i} className="py-0.5" data-staged-line>{l}</div>)}
            <div className="mt-2 flex gap-2">
              <button data-scheme-confirm className="rounded px-2 py-1 text-white text-[11px]" style={{ background: T.navy }}
                onClick={async () => {
                  if (await submit([P("apply_scheme", { schemeId: staged.schemeId }, "scheme")])) setStaged(null);
                }}>Apply</button>
              <button className="text-[11px] underline text-slate-500" onClick={() => setStaged(null)}>Not now</button>
            </div>
          </div>
        )}
      </Row>

      {/* ── Menu: a doorway, never a second editor ── */}
      <Row id="menu" label="Menu" summary={<>{p.itemCount} item{p.itemCount === 1 ? "" : "s"} · on the canvas</>}>
        <button data-menu-doorway className="text-[11px] underline text-slate-500" onClick={p.onOpenCanvas}>
          Selections live on the canvas — edit them there.
        </button>
      </Row>

      {/* ── Size: numbers show their work ── */}
      <Row id="size" label="Size"
        summary={Object.entries(scalars).map(([k, s]) =>
          `${s.value} ${k}${s.overridden ? " (you set)" : s.derivation ? " (suggested)" : ""}`).join(" · ") || "—"}>
        {Object.entries(scalars).map(([k, s]) => (
          <div key={k} className="py-1" data-scalar={k}>
            <div className="flex items-center gap-2">
              <span className="w-24 text-slate-500">{k}</span>
              {p.canEdit ? (
                <input data-scalar-input={k} type="number" defaultValue={s.value} key={`${k}:${s.value}`}
                  className="w-24 rounded border px-2 py-0.5" style={{ borderColor: T.rule }}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (isFinite(v) && v !== s.value) void submit([P("set_scalar", { key: k, value: v })]);
                  }} />
              ) : <span className="font-semibold">{s.value}</span>}
              {s.overridden && (
                <button data-use-suggestion={k} className="text-[10px] underline text-slate-400"
                  onClick={() => void submit([P("clear_override", { key: k })])}>use suggestion</button>
              )}
            </div>
            {s.derivation && (
              <div className="pl-24 text-[10px] text-slate-400" data-scalar-derivation={k}>
                {s.overridden ? `you set ${s.value} · ` : ""}suggested {s.derivation.suggested} ({s.derivation.formula})
              </div>
            )}
          </div>
        ))}
      </Row>

      {/* ── Dimensions: rendered FROM THE SEED — the definition declares what
             is choosable; the facet never hardcodes an option list. Service
             keeps a fallback so config-less components remain editable. ── */}
      {Object.entries(
        Object.keys(p.state.seed.dimensions ?? {}).length > 0
          ? p.state.seed.dimensions!
          : { service: { label: "Service", options: ["attended", "live_chef", "self_serve"] } }
      ).map(([dim, def]) => (
        <Row key={dim} id={dim === "service" ? "service" : `dim-${dim}`} label={def.label}
             summary={(choices[dim] ?? "—").replace(/_/g, " ")}>
          <div className="flex flex-wrap gap-2">
            {def.options.map((v) => (
              <button key={v}
                {...(dim === "service" ? { "data-service-choice": v } : { "data-dim-choice": `${dim}:${v}` })}
                disabled={!p.canEdit}
                className="rounded border px-2 py-1 text-[11px]"
                style={{ borderColor: choices[dim] === v ? T.gold : T.rule, fontWeight: choices[dim] === v ? 600 : 400 }}
                onClick={() => void submit([P("set_choice", { key: dim, value: v })])}>
                {v.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </Row>
      ))}

      {/* ── Requires: whisper, strike-through, restore ── */}
      <Row id="requires" label="Requires"
        summary={<>
          {reqLive.length}{Object.keys(byLayer).length > 0 && <> · {Object.entries(byLayer).map(([l, n]) => `${l} ${n}`).join(", ")}</>}
          {flash && <span data-requires-flash className="ml-1 font-semibold" style={{ color: T.gold }}>{flash}</span>}
        </>}>
        {reqs.length === 0 && <div className="text-slate-400">Nothing yet — requirements arrive as choices are made.</div>}
        {reqs.map((r) => (
          <div key={`${r.layerKey}:${r.logicalKey ?? r.name}`} className="flex items-center gap-2 py-0.5"
               data-requirement={r.logicalKey ?? r.name}>
            <span className="text-[10px] w-16 text-slate-400">{r.layerKey}</span>
            <span style={{ textDecoration: r.suppressedAt ? "line-through" : "none",
                           color: r.suppressedAt ? "#94A3B8" : T.ink }}>
              {r.name}{r.derived ? "" : " (added)"}
            </span>
            {p.canEdit && r.logicalKey && (r.suppressedAt
              ? <button data-restore-req={r.logicalKey} className="text-[10px] underline text-slate-400"
                  onClick={() => void submit([P("restore_requirement", { layerKey: r.layerKey, logicalKey: r.logicalKey! })])}>restore</button>
              : <button data-suppress-req={r.logicalKey} className="text-[10px] underline text-slate-400"
                  onClick={() => void submit([P("suppress_requirement", { layerKey: r.layerKey, logicalKey: r.logicalKey! })])}>strike</button>)}
          </div>
        ))}
      </Row>

      {/* ── Notes: a different material ── */}
      <Row id="notes" label="Notes"
        summary={Object.keys(p.state.annotations).length ? `${Object.keys(p.state.annotations).length} layer note(s)` : "none"}>
        {["kitchen", "operations"].map((layer) => (
          <div key={layer} className="my-1 border-l-4 pl-2 py-1" style={{ borderColor: "#E7DFC9", background: "#FDFBF5" }}
               data-note-block={layer}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{layer}</div>
            {p.canEdit ? (
              <textarea data-note-input={layer} defaultValue={p.state.annotations[layer] ?? ""}
                className="w-full bg-transparent text-[11px] outline-none resize-none" rows={2}
                placeholder="The thing the model didn't anticipate…"
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== (p.state.annotations[layer] ?? ""))
                    void submit([P("annotate", { layerKey: layer, text: t })]);
                }} />
            ) : <div className="text-[11px]">{p.state.annotations[layer] ?? "—"}</div>}
          </div>
        ))}
      </Row>
    </div>
  );
}
