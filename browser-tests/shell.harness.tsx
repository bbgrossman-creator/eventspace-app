// v290 harness — mounts the REAL production Sidebar. Substituted: the supabase
// transport, next/link and next/navigation. Sidebar.tsx, capabilities.ts,
// permissions.ts and the projection label pack are all real.
import { createRoot } from "react-dom/client";
import Sidebar from "@/components/Sidebar";

const el = document.getElementById("root");
if (el) createRoot(el).render(<Sidebar />);
