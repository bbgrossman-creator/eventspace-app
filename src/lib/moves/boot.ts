// One-time boot for the move grammar in the real app. Idempotent.
import { bootLayers } from "../layers";
import { registerCoreMoves } from "./core";
import { moveRegistry } from "./registry";

let booted = false;
export function bootMoves(): void {
  if (booted || moveRegistry.get("set_choice")) { booted = true; return; }
  booted = true;
  bootLayers();
  registerCoreMoves();
}
