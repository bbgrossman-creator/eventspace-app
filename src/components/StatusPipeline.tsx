"use client";
import { TIMELINE_MILESTONES } from "@/lib/workflow";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The signature element: a horizontal pipeline showing exactly where a booking
 *  sits in the workflow. Used full-size on the detail page, compact on cards.
 *  Full-size reads as one connected journey — circular nodes on a single line,
 *  not a row of independent buttons. Logic (which stage → which status, click
 *  handling) is owned entirely by the caller; this component is presentational. */
export default function StatusPipeline({
  currentStage,
  compact = false,
  onStageClick,
}: {
  currentStage: number;
  compact?: boolean;
  onStageClick?: (stageIndex: number) => void;
}) {
  if (currentStage < 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1" title={TIMELINE_MILESTONES[currentStage]}>
        {TIMELINE_MILESTONES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < currentStage ? "w-1.5 bg-emerald-400"
              : i === currentStage ? "w-4 bg-gold"
              : "w-1.5 bg-slate-200"
            }`}
          />
        ))}
      </div>
    );
  }

  const last = TIMELINE_MILESTONES.length - 1;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start min-w-[600px]">
        {TIMELINE_MILESTONES.map((label, i) => {
          const state: "done" | "current" | "future" =
            i < currentStage ? "done" : i === currentStage ? "current" : "future";
          const clickable = !!onStageClick;

          const circle = (
            <div
              className={[
                "flex items-center justify-center w-10 h-10 rounded-full text-[13px] font-semibold shrink-0",
                "transition-all duration-150 ease-out",
                state === "done" && "bg-emerald-500 text-white",
                state === "current" && "bg-navy text-white shadow-md",
                state === "future" && "bg-white text-slate-300 border-2 border-slate-200",
                clickable && state === "future" && "hover:border-slate-400 hover:shadow-md hover:-translate-y-px",
                clickable && state === "current" && "hover:brightness-110",
                clickable && state === "done" && "hover:ring-2 hover:ring-emerald-200",
              ].filter(Boolean).join(" ")}
            >
              {state === "done" ? <CheckIcon /> : i + 1}
            </div>
          );

          return (
            <div key={label} className="flex items-start" style={{ flex: i < last ? "1 1 0%" : "0 0 auto" }}>
              <div className="flex flex-col items-center shrink-0 w-20">
                {clickable ? (
                  <button
                    type="button"
                    title={`Go to ${label}`}
                    onClick={() => onStageClick(i)}
                    className="rounded-full cursor-pointer"
                  >
                    {circle}
                  </button>
                ) : circle}
                <span
                  className={[
                    "mt-2 text-[11px] text-center leading-tight",
                    state === "current" ? "text-navy font-semibold"
                      : state === "done" ? "text-slate-600 font-medium" : "text-slate-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>

              {i < last && (
                i < currentStage ? (
                  <div className="flex-1 h-[2px] mt-5 rounded-full bg-emerald-400" />
                ) : i === currentStage ? (
                  <div className="flex-1 flex mt-5">
                    <div className="flex-1 h-[2px] rounded-full bg-navy" />
                    <div className="flex-1 h-[2px] rounded-full bg-slate-200" />
                  </div>
                ) : (
                  <div className="flex-1 h-[2px] mt-5 rounded-full bg-slate-200" />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
