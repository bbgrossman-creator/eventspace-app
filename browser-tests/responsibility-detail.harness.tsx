// v291 harness — mounts the REAL production ResponsibilityDetail surface. Only
// the supabase transport is substituted; the component and the whole projection
// client are real.
import { createRoot } from "react-dom/client";
import ResponsibilityDetailSurface from "@/components/responsibilities/ResponsibilityDetail";

const params = new URLSearchParams(window.location.search);
const id = params.get("id") ?? "";
const pack = params.get("pack") ?? undefined;
const el = document.getElementById("root");
if (el) createRoot(el).render(<ResponsibilityDetailSurface responsibility={id} pack={pack} />);
