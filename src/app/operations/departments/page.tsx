"use client";
import { useSearchParams } from "next/navigation";
import DepartmentQueue from "@/components/departments/DepartmentQueue";

/** v291 · /operations/departments — the Departments surface.
 *
 *  This is NOT an index route that exists only to link elsewhere. It is the same
 *  DepartmentQueue component with no department chosen: it renders the closed
 *  vocabulary as a selector and makes NO projection request until a department
 *  is picked. One rail entry, five departments selectable inside the surface.
 */
export default function DepartmentsPage() {
  const search = useSearchParams();
  return (
    <DepartmentQueue
      department=""
      groupBy={search.get("group_by") ?? undefined}
      pack={search.get("pack") ?? undefined}
    />
  );
}
