"use client";
import { useState } from "react";
import { performEventAction, type AvailableAction, type EventActions } from "@/lib/execution/spine";

/** v279 routed-action surface. Renders authoritative actions from the availability
 *  projection (event_workspace.actions) grouped by operational context, and dispatches
 *  each through perform_event_action by its stable action_key. It encodes NO stage or
 *  staffing law — visibility, authorization, and blockers all come from the projection;
 *  the dispatcher (and the domain ceremony behind it) remain authoritative. */
const GROUP_LABEL: Record<string, string> = { lifecycle: "Lifecycle", evidence: "Evidence", staffing: "Staffing", event: "Event" };

// payload a given action needs from this compact panel (lifecycle transitions need none)
function payloadFor(a: AvailableAction): Record<string, unknown> | null {
  if (a.action_key === "release_event") return { signoff_ref: "operator-signoff", clearance_ref: "deposit-clearance" };
  if (a.required_fields.length === 0) return {};
  return null; // actions needing operator input (assign/correct/record) are driven by their own inspector surfaces
}

export default function ActionPanel({
  actions, actor, onDispatched,
}: {
  actions: EventActions | undefined; actor: string;
  onDispatched: (msg: string, ok: boolean) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  if (!actions) return null;

  // event-level actions only in this panel; requirement/assignment actions live in StaffingSection
  const list = [...actions.event].sort((x, y) => x.sort_order - y.sort_order);
  const groups = Array.from(new Set(list.map((a) => a.group_key)));

  const dispatch = async (a: AvailableAction) => {
    const payload = payloadFor(a);
    if (payload === null) { setNote({ text: `${a.label} needs details — use its inspector.`, ok: false }); return; }
    setBusy(a.action_key); setNote(null);
    try {
      // idempotency key ties a single user gesture to one authoritative execution
      const env = await performEventAction(a.action_key, a.target_id, payload, `ui-${a.action_key}-${a.target_id}`);
      const ok = env.ok && (env.outcome === "success" || env.outcome === "duplicate");
      setNote({ text: ok ? `${a.label}: done.` : `${a.label} refused: ${env.message}`, ok });
      await onDispatched(env.message, ok);
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e), ok: false });
    } finally { setBusy(null); }
  };

  return (
    <section className="rounded-lg border border-neutral-200 p-4" data-action-panel>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Actions</div>
      {note && (
        <div className={`mb-2 rounded px-3 py-2 text-xs ${note.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} data-action-note>
          {note.text}
        </div>
      )}
      <div className="space-y-3">
        {groups.map((g) => {
          // surface only workspace-visible actions the actor may act on; hide unauthorized,
          // not-applicable, stale, and already-completed — the projection decides all of this
          const items = list.filter((a) => a.group_key === g && a.workspace_visible
            && a.reason_code !== "unauthorized" && a.reason_code !== "not_applicable"
            && a.reason_code !== "stale_target" && a.reason_code !== "already_completed");
          if (items.length === 0) return null;
          return (
            <div key={g} data-action-group={g}>
              <div className="mb-1 text-[11px] font-medium text-neutral-500">{GROUP_LABEL[g] ?? g}</div>
              <div className="flex flex-wrap gap-2">
                {items.map((a) => (
                  <div key={a.action_key} className="flex flex-col" data-action={a.action_key} data-action-available={String(a.available)}>
                    <button
                      disabled={!a.available || busy === a.action_key}
                      onClick={() => dispatch(a)}
                      data-action-invoke={a.action_key}
                      className={`rounded px-3 py-1.5 text-xs font-medium ${a.available ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"} disabled:cursor-not-allowed`}
                    >
                      {a.label}
                    </button>
                    {!a.available && a.reason_detail && (
                      <span className="mt-0.5 text-[11px] text-amber-700" data-action-blocker={a.action_key}>{a.reason_detail}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
