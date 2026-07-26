"use client";
import { useParams, useSearchParams } from "next/navigation";
import DepartmentQueue from "@/components/departments/DepartmentQueue";

/** v290 · /operations/departments/[department] — the department queue route.
 *
 *  The department is a ROUTE PARAMETER, which means it is user-controlled and
 *  arrives unvalidated. This page deliberately does NOT check it against the
 *  department vocabulary: `validate_projection_filter()` owns that vocabulary
 *  (v287a), and a client that pre-screens the value would be developing an
 *  opinion about what is constitutionally legal. The value is passed through
 *  and an unknown department surfaces as the genuine SQL refusal
 *  PROJECTION_FILTER_INVALID.
 *
 *  `group_by` is likewise passed through unvalidated to
 *  validate_projection_group_by(). Grouping is computed in SQL, never here.
 */
export default function DepartmentQueuePage() {
  const params = useParams<{ department: string }>();
  const search = useSearchParams();
  const department = Array.isArray(params?.department)
    ? params.department[0]
    : (params?.department ?? "");
  return (
    <DepartmentQueue
      department={decodeURIComponent(department)}
      groupBy={search.get("group_by") ?? undefined}
      pack={search.get("pack") ?? undefined}
    />
  );
}
