"use client";
import { TIMELINE_MILESTONES } from "@/lib/workflow";

/** The signature element: a horizontal pipeline showing exactly where a booking
 *  sits in the workflow. Used full-size on the detail page, compact on cards. */
export default function StatusPipeline({
  currentStage,
  compact = false,
}: {
  currentStage: number;
  compact?: boolean;
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

  return (
    <div className="flex gap-1.5">
      {TIMELINE_MILESTONES.map((m, i) => (
        <span
          key={m}
          className={`pipeline-stage ${
            i < currentStage ? "pipeline-done" : i === currentStage ? "pipeline-current" : "pipeline-pending"
          }`}
        >
          {m}
        </span>
      ))}
    </div>
  );
}
