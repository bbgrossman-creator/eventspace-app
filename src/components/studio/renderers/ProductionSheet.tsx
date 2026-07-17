// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION SHEET (v212) — the first `sheet`-anatomy renderer (SPEC-003 §7).
// Pure over its model, NO queries — a fact this component wants and doesn't
// have is a projection defect, never a fetch (SPEC-003 §2 rule 2). The shell
// owns chrome and selection; this file owns only the sheet's interior.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import { ProductionModel, ProductionComponent } from "@/lib/productionLens";

const T = { ink: "#1F2A37", gold: "#C9A34E", rule: "#EEF2F7", soft: "#5B6673" } as const;

function ComponentBlock({ c }: { c: ProductionComponent }) {
  return (
    <section data-prod-component={c.id} className="mb-6">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[14px] font-semibold" style={{ color: T.ink }}>{c.title}</h2>
        {c.provenanceLabel && (
          <span data-prod-provenance className="text-[9.5px] text-slate-400">{c.provenanceLabel}</span>
        )}
      </div>

      {c.quantities.length > 0 && (
        <div className="mt-1">
          {c.quantities.map((q) => (
            <div key={q.key} data-prod-quantity={q.key} className="py-0.5 text-[12px]">
              <span className="font-medium">{q.key}</span>{" "}
              <span data-prod-value className="tabular-nums">{q.value}</span>
              {q.overridden && <span className="ml-1 text-[10px]" style={{ color: T.gold }}>overridden</span>}
              {q.why
                ? <div data-prod-why className="text-[10.5px] text-slate-400">{q.why}</div>
                : <div data-prod-why className="text-[10.5px] text-slate-400">no derivation recorded</div>}
            </div>
          ))}
        </div>
      )}

      {c.requirements.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requires</div>
          {c.requirements.map((r, i) => (
            <div key={i} data-prod-req={r.name} data-suppressed={r.suppressed ? "true" : "false"}
                 className="py-0.5 text-[12px]"
                 style={r.suppressed ? { textDecoration: "line-through", color: "#9AA4AF" } : undefined}>
              {r.name}
              {r.category && <span className="ml-1 text-[10px] text-slate-400">· {r.category}</span>}
              {r.why && <span data-prod-req-why className="ml-1 text-[10px] text-slate-400">— {r.why}</span>}
              {r.suppressed && <span className="ml-1 text-[10px]">(suppressed — considered and declined)</span>}
            </div>
          ))}
        </div>
      )}

      {c.sections.map((s) => (
        <div key={s.id} data-prod-section={s.id} className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.title}</div>
          {s.rows.map((r, i) => (
            <div key={i} className="py-0.5 text-[12px]">
              {r.label} <span className="tabular-nums">{r.value}</span>
              {r.why && <span data-prod-row-why className="ml-1 text-[10px] text-slate-400">— {r.why}</span>}
            </div>
          ))}
          {s.note && (
            <div data-prod-note className="mt-1 pl-2 border-l-2 italic text-[11px] text-slate-500"
                 style={{ borderColor: T.gold }}>{s.note}</div>
          )}
          {s.missing && s.rows.length === 0 && !s.note && (
            <div data-prod-missing className="text-[10.5px] text-slate-400 italic">{s.missing}</div>
          )}
        </div>
      ))}

      {c.missingLayer && (
        <div data-prod-missing-layer className="mt-2 text-[10.5px] text-slate-400 italic">
          {c.missingLayer}
        </div>
      )}

      {c.annotation && (
        <div data-prod-annotation className="mt-2 pl-2 border-l-2 italic text-[11px] text-slate-500"
             style={{ borderColor: T.gold }}>
          {c.annotation}
        </div>
      )}
    </section>
  );
}

export default function ProductionSheet({ model }: { model: ProductionModel }) {
  return (
    <div data-production-sheet className="max-w-[720px] mx-auto px-6 py-5">
      {/* identity — canonical fields only; nothing simulated (SPEC-003 §4) */}
      <header className="mb-1">
        <h1 className="text-[17px] font-semibold" style={{ color: T.ink }}>
          {model.event.title} — Production
        </h1>
        <div data-prod-identity className="text-[11px]" style={{ color: T.soft }}>
          {[model.event.date, model.event.guests !== null ? `${model.event.guests} guests` : null]
            .filter(Boolean).join(" · ") || "date and guest count not set"}
        </div>
      </header>

      {/* honesty band */}
      {model.honesty.readOnly && (
        <div data-prod-honesty className="mb-3 rounded border px-2 py-1 text-[10.5px] text-slate-500"
             style={{ borderColor: T.rule }}>
          {model.honesty.reason ?? "Read-only."}
        </div>
      )}

      {model.components.length === 0 && (
        <p data-prod-empty className="text-[12px] text-slate-400 py-8 text-center">
          Nothing to produce yet — the design has no components. Production
          fills in as the design does.
        </p>
      )}
      {model.components.map((c) => <ComponentBlock key={c.id} c={c} />)}
    </div>
  );
}
