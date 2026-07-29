/** v292e · Day Sheet route.
 *
 *  Follows the v292c route convention exactly
 *  (src/app/operations/occurrences/[id]/prepare/page.tsx). The shell registry
 *  was never supplied for inspection, so registering this route in navigation
 *  is a separate one-line integration step and is deliberately not attempted
 *  here — guessing a registration contract would be inventing one.
 */
import DaySheet from "@/components/day/DaySheet";

export default function DaySheetPage() {
  return <DaySheet />;
}
