"use client";
import { useCallback, useEffect, useState } from "react";
import { loadEventForEngagement, type EventRecord } from "@/lib/execution/spine";
import ReleaseAction from "@/components/execution/ReleaseAction";
import EventLifecycle from "@/components/execution/EventLifecycle";
import DailyOpsEvent from "@/components/execution/DailyOpsEvent";

/** Event Operations — the mounted Execution OS surface on a booking. Before an
 *  operational event exists, it offers Operational Release; once the engagement is
 *  released, it shows the derived lifecycle rail and the event-scope DailyOps.
 *  This is the single parent that composes the v275/v276 execution components into
 *  the deployed booking page. */
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
      <div className="text-sm font-semibold text-neutral-800">Event Operations</div>
      {!event ? (
        <div data-event-ops-release>
          <ReleaseAction bookingId={bookingId} actor={actor} onReleased={() => void refresh()} />
        </div>
      ) : (
        <div className="space-y-4" data-event-ops-live>
          <EventLifecycle eventId={event.id} actor={actor} />
          <DailyOpsEvent eventId={event.id} actor={actor} />
        </div>
      )}
    </div>
  );
}
