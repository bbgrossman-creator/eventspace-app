/** v292e browser harness — mounts the REAL Day Sheet surface.
 *  Mirrors today.harness.tsx / prep.harness.tsx: the production component,
 *  with only the transport substituted.
 */
import { createRoot } from "react-dom/client";
import { setLabelPack } from "@/lib/projection/labels";
import DaySheet from "@/components/day/DaySheet";

const params = new URLSearchParams(window.location.search);
setLabelPack(params.get("pack") ?? "catering");

createRoot(document.getElementById("root")!).render(<DaySheet />);
