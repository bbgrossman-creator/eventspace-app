"use client";
/** v312 · Event Workspace route — one Event across the company.
 *
 *  THE CANONICAL IDENTITY IS THE PRODUCT EVENT. `[id]` is a public.bookings id,
 *  the engagement root, because that is the only object that spans the Event's
 *  Functions. It is deliberately NOT a public.event id: since v292a1 (I-31′)
 *  a public.event row is one Function's execution record and cannot address the
 *  whole affair. There is no /events/<technical-event-id> semantic.
 *
 *  FUNCTION CONTEXT IS SUBORDINATE AND ADDRESSABLE. It lives in `?function=`,
 *  so it can be linked and returned to, and it never becomes a route of its own —
 *  a Function has no Product Event page. `replace` rather than `push` keeps
 *  narrowing out of the back-button history; the address still carries it.
 *
 *  NO REMEMBERED DEFAULT. The context is read from the address on every render
 *  and from nowhere else. No storage API is touched here.
 */
import { useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import EventWorkspaceShell from "@/components/events/EventWorkspaceShell";
import { ALL_FUNCTIONS, type FunctionContext } from "@/lib/events/productEvent";

export default function EventWorkspacePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "");
  const requested = search?.get("function") ?? null;

  const onFunctionContextChange = useCallback((next: FunctionContext) => {
    const url = next === ALL_FUNCTIONS
      ? `/events/${encodeURIComponent(id)}`
      : `/events/${encodeURIComponent(id)}?function=${encodeURIComponent(next)}`;
    router.replace(url);
  }, [id, router]);

  if (!id) return <div className="p-4 text-sm text-neutral-500">No Event.</div>;

  return (
    <main className="p-4">
      <EventWorkspaceShell
        productEventId={id}
        functionContext={requested}
        onFunctionContextChange={onFunctionContextChange}
      />
    </main>
  );
}
