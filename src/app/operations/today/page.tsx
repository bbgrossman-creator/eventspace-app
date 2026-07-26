import OperationsToday from "@/components/today/OperationsToday";

/** v290 · /operations/today — the canonical home of the certified Operations
 *  Today surface.
 *
 *  The component is UNCHANGED from v288a. v290 moves where it is mounted and
 *  makes it reachable from the shell; it does not alter what it renders. The
 *  old /today route remains as a server redirect so any bookmark, printed
 *  sheet or muscle-memory URL still lands here.
 */
export default function OperationsTodayPage() {
  return <OperationsToday />;
}
