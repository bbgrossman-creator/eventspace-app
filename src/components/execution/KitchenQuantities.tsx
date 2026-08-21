"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getKitchenPanel, adjustKitchenQuantity, approveKitchenQuantity,
  type KitchenPanel, type KitchenLine,
} from "@/lib/kitchen/quantities";

/** v311 · Kitchen Quantities panel.
 *
 *  The Quantities stage of the Kitchen spine, mounted on a released Event. It
 *  shows, per committed culinary line, what the system recommends, what a lead
 *  adjusted it to, and what was approved — three distinct facts that the ledger
 *  insists are not interchangeable ("Recommended ≠ adjusted ≠ approved").
 *
 *  Nothing here is calculated. Every figure, the guest count it stands on, the
 *  review flag and both authority answers come from kitchen_event_panel. The
 *  component renders truth and invokes ceremonies; a quantity computed in the
 *  browser could disagree with the approved one, and a Kitchen lead would be the
 *  person who found out.
 *
 *  Controls appear from explicit Authority Grants (may_adjust / may_approve),
 *  never from a role name. Hiding a control the actor lacks authority for is a
 *  courtesy; the database refuses regardless, and its refusal is shown verbatim.
 */

const money = "tabular-nums";

function Figure({ label, value, tone = "neutral", hint }: {
  label: string; value: string | null; tone?: "neutral" | "adjusted" | "approved"; hint?: string | null;
}) {
  const toneClass =
    tone === "approved" ? "text-emerald-700"
    : tone === "adjusted" ? "text-sky-700"
    : "text-neutral-800";
  return (
    <div className="min-w-24">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-lg font-semibold ${money} ${toneClass}`}>{value ?? "—"}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-neutral-500">{hint}</div> : null}
    </div>
  );
}

function LineRow({ line, actor, onDone }: {
  line: KitchenLine; actor: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [open, setOpen] = useState<"adjust" | "approve" | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setRefusal(null);
    try { await fn(); setOpen(null); setQty(""); setReason(""); onDone(); }
    catch (e) { setRefusal(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, [onDone]);

  return (
    <div className="rounded border border-neutral-200 p-3" data-kitchen-line={line.requirement_line}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-48 flex-1">
          <div className="text-sm font-semibold text-neutral-900" data-kitchen-item>
            {line.item ?? "Culinary line"}
          </div>
          <div className="mt-0.5 text-xs text-neutral-600" data-kitchen-requirement>
            {line.requirement}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <Figure
            label="Recommended"
            value={line.recommendation_resolved ? line.recommended_quantity : null}
            hint={line.recommendation_resolved ? line.derivation : null}
          />
          {line.adjusted_quantity ? (
            <Figure label="Adjusted" value={line.adjusted_quantity} tone="adjusted"
                    hint={line.adjusted_reason} />
          ) : null}
          {line.approved_quantity ? (
            <Figure label="Approved" value={line.approved_quantity} tone="approved"
                    hint={line.approved_by ? `by ${line.approved_by}` : null} />
          ) : null}
        </div>
      </div>

      {/* The guest count this line stands on, stated rather than implied. */}
      {line.recommendation_resolved && line.guest_count ? (
        <div className="mt-2 text-[11px] text-neutral-500" data-kitchen-basis>
          {line.guest_count_basis === "per_person"
            ? `${line.guest_count} guests × ${line.design_quantity} per guest`
            : `flat quantity — the guest count does not scale this line`}
        </div>
      ) : null}

      {/* An unresolved line is a real Requirement with a stated reason, never a
          blank. Kitchen still owes the work; the quantity is what is missing. */}
      {!line.recommendation_resolved ? (
        <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800"
             data-kitchen-unresolved>
          No quantity could be derived — {line.unresolved_reason}
        </div>
      ) : null}

      {line.review_required ? (
        <div className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800"
             data-kitchen-review>
          Review required — {line.review_reason}
        </div>
      ) : null}

      {!line.approved_quantity ? (
        <div className="mt-2 text-[11px] text-neutral-500" data-kitchen-not-fulfillable>
          Not yet fulfillable — only an approved quantity drives Kitchen demand.
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {line.may_adjust ? (
          <button type="button" data-kitchen-adjust
                  className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  onClick={() => setOpen(open === "adjust" ? null : "adjust")}>
            Adjust quantity
          </button>
        ) : null}
        {line.may_approve ? (
          <button type="button" data-kitchen-approve
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                  onClick={() => setOpen(open === "approve" ? null : "approve")}>
            {line.approved_quantity ? "Approve revised quantity" : "Approve quantity"}
          </button>
        ) : null}
        {!line.may_adjust && !line.may_approve ? (
          <span className="text-[11px] text-neutral-500" data-kitchen-no-authority>
            You do not hold an Authority Grant for Kitchen quantity on this line.
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-2 rounded bg-neutral-50 p-2" data-kitchen-form={open}>
          {open === "adjust" ? (
            <input inputMode="decimal" data-kitchen-input="quantity"
                   className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm"
                   placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
          ) : null}
          <input data-kitchen-input="reason"
                 className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                 placeholder={open === "approve"
                   ? "Why this quantity is approved (required)"
                   : "Why the quantity is being changed (required)"}
                 value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex items-center gap-2">
            <button type="button" data-kitchen-submit={open} disabled={busy !== null}
                    className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                    onClick={() => run(open, () => open === "adjust"
                      ? adjustKitchenQuantity(line.requirement_line, Number(qty), reason)
                      : approveKitchenQuantity(line.requirement_line, reason))}>
              {busy ? "Working…" : open === "approve" ? "Approve" : "Record adjustment"}
            </button>
            <button type="button" className="text-xs text-neutral-600"
                    onClick={() => setOpen(null)}>Cancel</button>
          </div>
          {open === "approve" ? (
            <div className="text-[11px] text-neutral-500">
              Approving creates a new revision of this Requirement. The current one
              is kept and remains inspectable.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The database's refusal, verbatim. It is the rule speaking. */}
      {refusal ? (
        <div className="mt-2 rounded bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-800"
             data-kitchen-refusal>{refusal}</div>
      ) : null}
    </div>
  );
}

export default function KitchenQuantities({ eventId, actor = "ops" }: {
  eventId: string; actor?: string;
}) {
  const [panel, setPanel] = useState<KitchenPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPanel(await getKitchenPanel(eventId)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading && !panel) {
    return <div className="p-3 text-sm text-neutral-500" data-kitchen-loading>Loading Kitchen quantities…</div>;
  }
  if (error) {
    return <div className="rounded bg-rose-50 p-3 font-mono text-xs text-rose-800" data-kitchen-error>{error}</div>;
  }
  if (!panel) return null;

  return (
    <section className="space-y-3" data-kitchen-panel data-kitchen-stage={panel.stage}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800">Kitchen · Quantities</h3>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          {/* ENACTED, not PREVIEW: these Requirements exist and are operative. */}
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-emerald-800"
                data-kitchen-operative>Enacted</span>
          <span data-kitchen-guests>
            {panel.guest_count ? `${panel.guest_count} guests` : "no operative guest count"}
          </span>
        </div>
      </div>

      {panel.lines.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 p-3 text-xs text-neutral-500"
             data-kitchen-empty>
          The committed design records no culinary line for this event.
        </div>
      ) : (
        <div className="space-y-2">
          {panel.lines.map((l) => (
            <LineRow key={l.requirement_line} line={l} actor={actor} onDone={() => void refresh()} />
          ))}
        </div>
      )}
    </section>
  );
}
