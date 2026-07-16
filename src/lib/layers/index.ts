// Layer registrations boot here. Adding a layer = one registration file plus
// one line below. If it takes more than that, see SPEC-001 §1.6 invariant 2.
import { registerKitchenLayer } from "./kitchen";

let booted = false;
export function bootLayers(): void {
  if (booted) return;
  booted = true;
  registerKitchenLayer();
}

export * from "./registry";
