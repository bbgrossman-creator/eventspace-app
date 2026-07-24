import OperationsToday from "@/components/today/OperationsToday";

/** v288 · /today — the minimum frame required to certify projection
 *  consumption. Deliberately no shell: no ceremony tray, no omnibox, no
 *  command rail, no search, no department navigation. Those are later shell
 *  slices; mounting them here would imply write paths this slice forbids. */
export default function TodayPage() {
  return <OperationsToday />;
}
