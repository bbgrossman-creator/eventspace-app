// v290 harness — mounts the REAL production DepartmentQueue surface. The only
// substitution is the supabase transport (live-supabase.ts), which proxies to
// real Postgres; the component and the whole projection client are real.
import { createRoot } from "react-dom/client";
import DepartmentQueue from "@/components/departments/DepartmentQueue";

const params = new URLSearchParams(window.location.search);
const department = params.get("department") ?? "culinary";
const groupBy = params.get("group_by") ?? undefined;
const pack = params.get("pack") ?? undefined;
const el = document.getElementById("root");
if (el) createRoot(el).render(
  <DepartmentQueue department={department} groupBy={groupBy} pack={pack} />
);
