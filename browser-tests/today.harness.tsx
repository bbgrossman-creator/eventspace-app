// v288 harness — mounts the REAL production OperationsToday surface. The only
// substitution is the supabase transport (live-supabase.ts), which proxies to
// real Postgres; the component and the whole projection client are real.
import { createRoot } from "react-dom/client";
import OperationsToday from "@/components/today/OperationsToday";

const params = new URLSearchParams(window.location.search);
const pack = params.get("pack") ?? undefined;
const el = document.getElementById("root");
if (el) createRoot(el).render(<OperationsToday pack={pack} />);
