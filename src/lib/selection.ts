// ═══════════════════════════════════════════════════════════════════════════
// THE SELECTION LANGUAGE (v238 · Inspector Unification). ONE token — the
// selected object and its inspector wear the SAME accent, so the pair
// reads as one thought. The object gains a left accent bar (inset shadow:
// no layout shift) and a warm wash; the wing's seam and subject tick
// inherit the identical color. Nothing else in the Studio may use these
// values for anything but selection.
// ═══════════════════════════════════════════════════════════════════════════
export const SELECTION = {
  accent: "#4A90E2",          // the shared accent — bar, seam, tick
  wash: "#ECF3FD",            // the warm wash behind the active thing (v244: +8% presence)
  transition: "background-color 150ms ease, box-shadow 150ms ease",
} as const;

/** The selected object's dress. Inset bar = zero layout shift. */
export const selectedStyle = (on: boolean): React.CSSProperties =>
  on ? { boxShadow: `inset 3px 0 0 ${SELECTION.accent}`, background: SELECTION.wash, transition: SELECTION.transition }
     : { transition: SELECTION.transition };
import type React from "react";
