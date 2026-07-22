"use client";
import { useCallback, useEffect, useState } from "react";
import { loadEventForEngagement, type EventRecord } from "@/lib/execution/spine";
import ReleaseAction from "@/components/execution/ReleaseAction";
import EventWorkspace from "@/components/execution/EventWorkspace";

/** Event Operations — the mounted Execution OS surface on a booking. Before an
 *  operational event exists, it offers Operational Release; once the engagement is
 *  released, it shows the first-class Event Operations Workspace (v277): header,
 *  lifecycle rail, readiness, workboard, blockers, next actions, and recent
 *  activity, all from one authoritative projection. */
export default function EventOperations({ bookingId, actor = "ops" }: { bookingId: string; actor?: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setEvent(await loadEventForEngagement(bookingId)); }
    finally { setLoading(false); }
  }, [bookingId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <div className="p-4 text-sm text-neutral-500" data-event-ops-loading>Loading event operations…</div>;

  return (
    <div className="space-y-4" data-event-ops>
      {!event ? (
        <div data-event-ops-release>
          <div className="mb-2 text-sm font-semibold text-neutral-800">Event Operations</div>
          <ReleaseAction bookingId={bookingId} actor={actor} onReleased={() => void refresh()} />
        </div>
      ) : (
        <div data-event-ops-live>
          <EventWorkspace eventId={event.id} actor={actor} />
        </div>
      )}
    </div>
  );
}
