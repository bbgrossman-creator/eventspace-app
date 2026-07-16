// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT GALLERY — the first identity-backed media consumer (v192b)
//
// NOT the Media Graph. This is the degenerate, single-relation case of it:
// every photo "depicts" (implicitly — the only relation that exists) the
// component instance it's attached to, and the instance now carries
// definition_id (v192), so grouping by identity is a plain join over two
// tables that were already independently RLS-verified by v189. No new
// column, no new table, no new policy.
//
//   photos.component_id -> event_components.id -> event_components.definition_id
//
// When the real Media Graph is built (typed multi-target edges, region
// tagging), this module's query becomes one relation among several — but the
// relation itself, and the tenant isolation it rides on, don't change.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export interface GalleryPhoto {
  photoId: string;
  componentId: string;
  componentTitle: string;   // this instance's title — may differ from siblings'
  bookingId: string;
  eventName: string;        // contact_name (+ event_type) — same convention as Rolodex
  eventDate: string | null;
  isCover: boolean;
  caption: string | null;
  /** Signed URL, or null if the file record or storage object is missing/
   *  unreadable. Callers must render a placeholder for null, never throw. */
  url: string | null;
}

export interface GalleryResult {
  photos: GalleryPhoto[];
  /** Distinct component instance titles this identity has appeared under —
   *  the visible proof that differently named copies still group together. */
  titleVariants: string[];
  eventCount: number;
}

const EMPTY: GalleryResult = { photos: [], titleVariants: [], eventCount: 0 };

export async function loadComponentGallery(identityId: string): Promise<GalleryResult> {
  if (!identityId) return EMPTY;

  // 1. Every instance of this identity, across every event. RLS confines
  //    this to the caller's tenant automatically — definition_id itself is
  //    tenant-scoped (v192's unique index is per-tenant), so no explicit
  //    tenant filter is needed here, same as every other query in the app.
  const { data: comps } = await supabase.from("event_components")
    .select("id,booking_id,title").eq("definition_id", identityId);
  const compRows = (comps ?? []) as { id: string; booking_id: string; title: string }[];
  if (!compRows.length) return EMPTY;

  const compById: Record<string, { booking_id: string; title: string }> = {};
  for (const c of compRows) compById[c.id] = c;
  const compIds = compRows.map((c) => c.id);
  const bookingIds = Array.from(new Set(compRows.map((c) => c.booking_id)));

  // 2. Photos attached to any of those instances, and the events they came
  //    from — fetched in parallel, joined in memory (both already scoped by
  //    the component/booking ids above, so no cross-tenant risk here either).
  const [{ data: ph }, { data: bks }] = await Promise.all([
    supabase.from("photos")
      .select("id,file_id,component_id,caption,is_cover").in("component_id", compIds),
    supabase.from("bookings")
      .select("id,contact_name,event_type,event_date").in("id", bookingIds),
  ]);
  const photoRows = (ph ?? []) as { id: string; file_id: string; component_id: string; caption: string | null; is_cover: boolean }[];
  if (!photoRows.length) {
    // Identity is real and has instances, just none photographed yet —
    // a genuinely different empty state from "identity not found."
    return { photos: [], titleVariants: Array.from(new Set(compRows.map((c) => c.title))), eventCount: bookingIds.length };
  }
  const bookingById: Record<string, { contact_name: string; event_type: string | null; event_date: string | null }> = {};
  for (const b of (bks ?? []) as { id: string; contact_name: string; event_type: string | null; event_date: string | null }[]) {
    bookingById[b.id] = b;
  }

  // 3. Resolve file paths, then sign URLs. A missing booking_files row or a
  //    failed signing call marks that ONE photo broken — it must never
  //    fail the whole gallery.
  const { data: frs } = await supabase.from("booking_files")
    .select("id,path").in("id", photoRows.map((p) => p.file_id));
  const pathByFile: Record<string, string> = {};
  for (const fr of (frs ?? []) as { id: string; path: string }[]) pathByFile[fr.id] = fr.path;

  const photos: GalleryPhoto[] = await Promise.all(photoRows.map(async (p) => {
    const comp = compById[p.component_id];
    const booking = comp ? bookingById[comp.booking_id] : undefined;
    let url: string | null = null;
    const path = pathByFile[p.file_id];
    if (path) {
      try {
        const { data: sg, error } = await supabase.storage
          .from("booking-files").createSignedUrl(path, 3600);
        if (!error && sg?.signedUrl) url = sg.signedUrl;
      } catch {
        url = null;   // storage hiccup — this photo renders as broken, gallery continues
      }
    }
    return {
      photoId: p.id,
      componentId: p.component_id,
      componentTitle: comp?.title ?? "(untitled)",
      bookingId: comp?.booking_id ?? "",
      eventName: booking ? booking.contact_name + (booking.event_type ? ` · ${booking.event_type}` : "") : "Unknown event",
      eventDate: booking?.event_date ?? null,
      isCover: p.is_cover,
      caption: p.caption,
      url,
    };
  }));

  // Most recent event first; within an event, cover photo first.
  photos.sort((a, b) => {
    const ad = a.eventDate ?? "", bd = b.eventDate ?? "";
    if (ad !== bd) return bd.localeCompare(ad);
    return (b.isCover ? 1 : 0) - (a.isCover ? 1 : 0);
  });

  return {
    photos,
    titleVariants: Array.from(new Set(compRows.map((c) => c.title))),
    eventCount: bookingIds.length,
  };
}
