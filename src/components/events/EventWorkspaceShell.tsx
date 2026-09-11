"use client";
// ═══════════════════════════════════════════════════════════════════════════
// v312 · EVENT WORKSPACE — one Event across the company.
//
// The Product Event is the stable whole. A Function is contextual narrowing
// WITHIN it — never a sub-Event, never a second workspace, and never its own
// Product Event page.
//
// HOW THIS DIFFERS FROM THE V04 PROTOTYPE, AND WHY THAT IS LAWFUL.
// The prototype filtered work inside one shared technical event. Production has
// one execution record per Function (v292a1 · I-31′), so selecting a Function
// switches the operational CONTENT SOURCE to that Function's own public.event
// while the Product Event Workspace around it stays put. Obligations are never
// pretended to be shared across Functions, because they are not.
//
// WHAT THIS SURFACE REFUSES TO INVENT. No aggregate Event readiness, no Event
// progress figure, no combined lifecycle, no cross-Function comparison. Each
// Function's operational truth is rendered by the existing certified surface,
// under its own name, and stays separate. Composition, never merge.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import EventWorkspace from "@/components/execution/EventWorkspace";
import { occurrenceBrief } from "@/lib/projection/feed";
import type { OccurrenceBriefEnvelope } from "@/lib/projection/types";
import {
  ALL_FUNCTIONS, functionLabel, functionLensApplies, loadFunctions, loadProductEvent,
  resolveFunctionContext, selectedFunction,
  type FunctionContext, type ProductEventIdentity, type ProductFunction,
} from "@/lib/events/productEvent";

export default function EventWorkspaceShell({
  productEventId, functionContext, onFunctionContextChange, actor = "ops",
}: {
  productEventId: string;
  /** The requested context from the address. Never a remembered preference. */
  functionContext: string | null;
  onFunctionContextChange: (next: FunctionContext) => void;
  actor?: string;
}) {
  const [event, setEvent] = useState<ProductEventIdentity | null>(null);
  const [functions, setFunctions] = useState<ProductFunction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [e, fns] = await Promise.all([
          loadProductEvent(productEventId), loadFunctions(productEventId),
        ]);
        if (!live) return;
        setEvent(e); setFunctions(fns);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { live = false; };
  }, [productEventId]);

  if (error) {
    return <div className="rounded bg-rose-50 p-3 font-mono text-xs text-rose-800"
      data-event-error>{error}</div>;
  }
  if (!event || !functions) {
    return <div className="p-4 text-sm text-neutral-500" data-event-loading>Loading Event…</div>;
  }

  // The address is the only source of context. An unknown or foreign Function
  // resolves to All Functions rather than to an error.
  const context = resolveFunctionContext(functions, functionContext);
  const lens = functionLensApplies(functions);
  const chosen = selectedFunction(functions, context);

  return (
    <div className="space-y-5" data-event-workspace-shell data-product-event={event.product_event_id}>
      <EventHeader event={event} functionCount={functions.length} />

      {lens ? (
        <FunctionBar functions={functions} context={context} onPick={onFunctionContextChange} />
      ) : null}

      {/* One Function is not a lens, but its facts are still facts. */}
      {!lens && functions.length === 1 ? <FunctionContextCard fn={functions[0]} solo /> : null}
      {chosen ? <FunctionContextCard fn={chosen} /> : null}

      {context === ALL_FUNCTIONS
        ? <AllFunctions functions={functions} actor={actor} />
        : chosen
          ? <FunctionOperations fn={chosen} actor={actor} />
          : null}
    </div>
  );
}

/* ── Event identity ────────────────────────────────────────────────────────
   Operational information leads; commercial information is subordinate and
   quiet. Fields with no production truth — an account owner, a single
   Event-level commitment revision across Functions, a resolved Event date span
   — are OMITTED rather than fabricated. */
function EventHeader({ event, functionCount }: {
  event: ProductEventIdentity; functionCount: number;
}) {
  return (
    <header className="rounded-lg border border-neutral-200 bg-neutral-50 p-4" data-event-header>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-neutral-500">
        Event · Operations
      </div>
      <h1 className="mt-1 text-2xl font-semibold leading-tight text-neutral-900" data-event-name>
        {event.name?.trim() || "Unnamed Event"}
        <span className="ml-2 align-middle text-[11px] font-normal tracking-wide text-neutral-400 tabular-nums"
          data-event-reference>{event.reference}</span>
      </h1>
      <div className="mt-1 text-xs text-neutral-500" data-event-meta>
        {event.client ? <span data-event-client>{event.client}</span> : null}
        {event.event_date ? <span> · {event.event_date}</span> : null}
        {functionCount > 0 ? (
          <span data-event-function-count>
            {" · "}{functionCount} {functionCount === 1 ? "Function" : "Functions"}
          </span>
        ) : null}
      </div>
      {event.commercial_status ? (
        <div className="mt-2 border-t border-neutral-200 pt-2 text-[11px] text-neutral-500"
          data-event-commercial>
          Commercial state <b className="font-semibold text-neutral-700">{event.commercial_status}</b>
        </div>
      ) : null}
    </header>
  );
}

/* ── Function context control ──────────────────────────────────────────────
   Rendered only where a choice exists. "All Functions" is the default and is
   not itself a Function. */
function FunctionBar({ functions, context, onPick }: {
  functions: ProductFunction[]; context: FunctionContext;
  onPick: (next: FunctionContext) => void;
}) {
  const btn = (active: boolean) =>
    `rounded border px-2.5 py-1 text-xs ${active
      ? "border-neutral-900 bg-neutral-900 text-white"
      : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"}`;
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-3"
      data-function-bar>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-neutral-500"
        id="function-lens-label">Function</span>
      <span role="group" aria-labelledby="function-lens-label" className="flex flex-wrap gap-1.5">
        <button className={btn(context === ALL_FUNCTIONS)} aria-pressed={context === ALL_FUNCTIONS}
          data-function-choice="ALL" onClick={() => onPick(ALL_FUNCTIONS)}>All Functions</button>
        {functions.map((f) => (
          <button key={f.function_id} className={btn(context === f.function_id)}
            aria-pressed={context === f.function_id} data-function-choice={f.function_id}
            onClick={() => onPick(f.function_id)}>{functionLabel(f)}</button>
        ))}
      </span>
      <span className="text-[11px] text-neutral-500" data-function-note>
        {context === ALL_FUNCTIONS
          ? "Every Function of this Event. Each Function keeps its own operational record."
          : "Narrowed to one Function. Event identity above is unchanged."}
      </span>
    </section>
  );
}

/* ── Function context card ─────────────────────────────────────────────────
   Context, not a dashboard: the facts this Event records for the Function, and
   no status, progress or clock of its own. Every value comes from the existing
   projection_occurrence_brief read. */
function FunctionContextCard({ fn, solo = false }: { fn: ProductFunction; solo?: boolean }) {
  const [brief, setBrief] = useState<OccurrenceBriefEnvelope | null>(null);
  useEffect(() => {
    let live = true;
    occurrenceBrief(fn.function_id)
      .then((b) => { if (live) setBrief(b); })
      .catch(() => { if (live) setBrief(null); });
    return () => { live = false; };
  }, [fn.function_id]);

  const d = brief?.data;
  const bits: string[] = [];
  if (d?.schedule?.operating_date) bits.push(d.schedule.operating_date);
  const first = d?.schedule?.milestones?.[0];
  if (first) bits.push(`${first.label} ${first.at}`);
  if (d?.venue?.name) bits.push(d.venue.name);
  const head = d?.attendance?.current;
  if (head) bits.push(`${head.head_count} guests (${head.basis})`);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3" data-function-context
      data-function-id={fn.function_id}>
      <div className="text-sm font-semibold text-neutral-800" data-function-name>
        {functionLabel(fn)}
      </div>
      {bits.length ? (
        <div className="mt-0.5 text-xs text-neutral-600" data-function-facts>{bits.join(" · ")}</div>
      ) : null}
      <div className="mt-1 text-[11px] text-neutral-400">
        {solo ? "The only Function of this Event" : "One Event · narrowed to this Function"}
      </div>
    </section>
  );
}

/* ── All Functions ─────────────────────────────────────────────────────────
   A COMPOSITION. Sibling Functions are rendered under one Event header, each
   attributed by name, each keeping its own operational record. Nothing is
   merged, totalled, compared or ranked across Functions. */
function AllFunctions({ functions, actor }: { functions: ProductFunction[]; actor: string }) {
  if (functions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500"
        data-no-functions>
        This Event records no separate Functions.
      </section>
    );
  }
  return (
    <div className="space-y-4" data-all-functions>
      {functions.map((f) => (
        <section key={f.function_id} className="rounded-lg border border-neutral-200 p-3"
          data-function-section={f.function_id}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500"
            data-function-section-name>{functionLabel(f)}</div>
          <FunctionOperations fn={f} actor={actor} />
        </section>
      ))}
    </div>
  );
}

/* ── One Function's operational truth ──────────────────────────────────────
   Released: the existing certified Event Operations surface, keyed by this
   Function's own public.event id, consumed unchanged.
   Unreleased: the honest state, grounded in the absence of an execution record.
   No readiness, no empty operational cards implying completion, no invented
   obligations. */
function FunctionOperations({ fn, actor }: { fn: ProductFunction; actor: string }) {
  if (!fn.operational_event_ref) {
    return (
      <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-3"
        data-function-unreleased={fn.function_id}>
        <div className="text-sm text-neutral-700">Not yet operationally released</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          This Function exists and can carry schedule, venue and attendance facts. Operational
          work begins when it is released; none is recorded yet.
        </div>
      </div>
    );
  }
  return (
    <div data-function-operations={fn.function_id}
      data-operational-event={fn.operational_event_ref}>
      <EventWorkspace eventId={fn.operational_event_ref} actor={actor} />
    </div>
  );
}
