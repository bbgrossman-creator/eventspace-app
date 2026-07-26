import { createRoot } from "react-dom/client";
import OccurrencePrep from "@/components/occurrence/OccurrencePrep";
const p = new URLSearchParams(window.location.search);
const el = document.getElementById("root");
if (el) createRoot(el).render(
  <OccurrencePrep occurrence={p.get("id") ?? ""} pack={p.get("pack") ?? undefined} />);
