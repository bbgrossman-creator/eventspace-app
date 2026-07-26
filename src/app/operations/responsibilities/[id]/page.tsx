"use client";
import { useParams, useSearchParams } from "next/navigation";
import ResponsibilityDetailSurface from "@/components/responsibilities/ResponsibilityDetail";

/** v291 · /operations/responsibilities/[id] — the detail surface.
 *
 *  The id is user-controlled. It is passed through unvalidated:
 *  responsibility_detail() returns SQL NULL for anything the tenant cannot see,
 *  which the surface renders as an honest not-found. A client-side existence
 *  check would be an opinion about what the tenant owns.
 */
export default function ResponsibilityPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "");
  return (
    <ResponsibilityDetailSurface
      responsibility={decodeURIComponent(id)}
      pack={search.get("pack") ?? undefined}
    />
  );
}
