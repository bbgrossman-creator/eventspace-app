"use client";
import { useParams, useSearchParams } from "next/navigation";
import OccurrencePrep from "@/components/occurrence/OccurrencePrep";

/** v292c · /operations/occurrences/[id]/prepare — promise capture.
 *
 *  Deliberately NOT part of Day Sheet: Day Sheet is read-mostly comprehension,
 *  and turning it into an editing surface would collapse two different jobs
 *  into one screen. This is the preparation console; Day Sheet will link to it.
 */
export default function PreparePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "");
  return <OccurrencePrep occurrence={decodeURIComponent(id)} pack={search.get("pack") ?? undefined} />;
}
