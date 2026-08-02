import OperationsToday from "@/components/today/OperationsToday";

/** v298 · /today — the canonical home of the certified Operations Today surface.
 *
 *  The component is UNCHANGED. v288a mounted it here, v290 moved it under
 *  Operations to give it a rail home, and v298 returns the canonical URL to the
 *  short path while KEEPING the rail home v290 won. Only the URL that owns the
 *  surface moves; nothing about what it renders changes.
 *
 *  /operations/today remains as a permanent server redirect, so any bookmark,
 *  printed sheet or muscle-memory URL still lands here.
 */
export default function TodayPage() {
  return <OperationsToday />;
}
