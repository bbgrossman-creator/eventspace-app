// One-time boot for the move grammar in the real app. Idempotent.
import { bootLayers, layerRegistry } from "../layers";
import { registerCoreMoves } from "./core";
import { moveRegistry, registerConsequenceRule, ConsequenceRule } from "./registry";

let booted = false;
export function bootMoves(): void {
  if (booted || moveRegistry.get("set_choice")) { booted = true; return; }
  booted = true;
  bootLayers();
  registerCoreMoves();
  // Layer-declared consequence rules, bound to their declaring layer — the
  // binding is what lets recompute refuse foreign emissions.
  for (const reg of layerRegistry.all()) {
    for (const rule of (reg.consequenceRules ?? []) as ConsequenceRule[]) {
      registerConsequenceRule(reg.key, rule);
    }
  }
}
