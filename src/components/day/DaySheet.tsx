/** v292e · DAY SHEET — one day workspace, two lenses.
 *
 *  CONSTITUTIONAL SHAPE. The Promise lens and the Work lens are separate
 *  projections over the same operational reality. This component composes two
 *  surfaces; it does not compose two truths. There is no merged row model here
 *  and there must never be one: an occurrence and a responsibility are
 *  different kinds of thing, and flattening them into a common object would
 *  make the client the author of a semantics neither projection owns.
 *
 *  THE HANDOFF. Only SQL can resolve an operational day. The Promise lens is
 *  called with no day and no clock; SQL resolves both and reports them back as
 *  `scope.day` and `as_of`. Those two scalars are then handed to the Work lens.
 *  That is why the reads are SEQUENCED rather than parallel — not a performance
 *  oversight, a correctness requirement. Computing the day with JavaScript
 *  Date, or letting each read take its own clock, is precisely the drift this
 *  handoff prevents.
 *
 *  READ COUNT. Exactly two projection reads per render: one per lens. Not one —
 *  there are two lenses. Not N — nothing is read per row.
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import {
  occurrencesForOperationalDay, daySheet,
} from "@/lib/projection/feed";
import {
  type OccurrencesForOperationalDayEnvelope, type DaySheetEnvelope,
  ProjectionRefusal,
} from "@/lib/projection/types";
import { surfaceLabel } from "@/lib/projection/labels";
import PromiseLens from "./PromiseLens";
import WorkLens from "./WorkLens";

type Outcome = "loading" | "ready" | "refusal" | "transport";

interface State {
  outcome: Outcome;
  promise: OccurrencesForOperationalDayEnvelope | null;
  work: DaySheetEnvelope | null;
  refusalCode: string | null;
  refusalMessage: string | null;
}

const INITIAL: State = {
  outcome: "loading", promise: null, work: null,
  refusalCode: null, refusalMessage: null,
};

export default function DaySheet() {
  const [s, setS] = useState<State>(INITIAL);

  const load = useCallback(async () => {
    setS(INITIAL);
    try {
      // 1 · Promise lens. No day, no clock — SQL owns both.
      const promise = await occurrencesForOperationalDay();

      // 2 · Work lens, using the day and the moment SQL just reported.
      //     Nothing here is computed; both values are carried.
      const work = await daySheet(
        promise.scope.day,
        "department",
        promise.as_of,
      );

      setS({
        outcome: "ready", promise, work,
        refusalCode: null, refusalMessage: null,
      });
    } catch (e) {
      if (e instanceof ProjectionRefusal) {
        setS({
          outcome: "refusal", promise: null, work: null,
          refusalCode: e.code, refusalMessage: e.message,
        });
      } else {
        setS({
          outcome: "transport", promise: null, work: null,
          refusalCode: null,
          refusalMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const day = s.promise?.scope.day ?? "";

  return (
    <main
      data-day-sheet
      data-outcome={s.outcome}
      data-day={day}
      data-timezone={s.promise?.scope.timezone ?? ""}
      data-day-start-hour={
        s.promise ? String(s.promise.scope.day_start_hour) : ""
      }
      data-promise-projection={s.promise?.projection ?? ""}
      data-promise-version={s.promise ? String(s.promise.version) : ""}
      data-work-projection={s.work?.projection ?? ""}
      data-work-version={s.work ? String(s.work.version) : ""}
      data-work-day={s.work?.data.day ?? ""}
      data-as-of={s.promise?.as_of ?? ""}
      data-work-as-of={s.work?.as_of ?? ""}
      data-refusal-code={s.refusalCode ?? ""}
      className="mx-auto max-w-6xl px-6 py-8"
    >
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {surfaceLabel("day_sheet")}
        </h1>
        {s.outcome === "ready" && (
          // The day, the zone and the day-start hour are DISPLAYED as SQL
          // reported them. The client resolves none of the three.
          <p className="mt-1 text-sm text-neutral-500">
            <span data-day-label>{day}</span>
            <span className="mx-2 text-neutral-300">·</span>
            <span data-timezone-label>{s.promise!.scope.timezone}</span>
            {s.promise!.scope.day_start_hour !== 0 && (
              <>
                <span className="mx-2 text-neutral-300">·</span>
                <span data-day-start-label>
                  operational day starts {s.promise!.scope.day_start_hour}:00
                </span>
              </>
            )}
          </p>
        )}
      </header>

      {s.outcome === "loading" && (
        <p className="text-sm text-neutral-500">Reading…</p>
      )}

      {s.outcome === "refusal" && (
        <div data-refusal className="rounded border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">
            {s.refusalCode}
          </p>
          <p className="mt-1 text-sm text-rose-700">{s.refusalMessage}</p>
        </div>
      )}

      {s.outcome === "transport" && (
        <div data-transport className="rounded border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-700">
            Could not reach the projection layer.
          </p>
          <button
            onClick={() => void load()}
            className="mt-2 text-sm font-medium text-neutral-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {s.outcome === "ready" && (
        // Two separately rooted regions. No element is an ancestor of rows from
        // both lenses; nothing correlates an occurrence with a responsibility.
        <div className="space-y-10">
          <PromiseLens env={s.promise!} />
          <WorkLens env={s.work!} />
        </div>
      )}
    </main>
  );
}
