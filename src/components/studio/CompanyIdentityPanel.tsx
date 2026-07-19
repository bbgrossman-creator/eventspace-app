"use client";
// v239 — COMPANY IDENTITY: the Brand's grouped fact panels. Truth on the
// left of each row; publication POLICY on the right. Eligibility is the
// registry's law — the panel only lets policy move within it.
import React from "react";
import { COMPANY_FACTS, CompanyIdentity, PublicationPolicy, FactDef, FactGroup } from "@/lib/identity";

const GROUPS: { key: FactGroup; label: string; blurb: string }[] = [
  { key: "identity", label: "Identity", blurb: "Who the company is." },
  { key: "commerce", label: "Commerce", blurb: "Money facts. Policy decides what customers see." },
  { key: "legal",    label: "Legal",    blurb: "Terms, disclaimers, supervision." },
  { key: "socials",  label: "Socials",  blurb: "Handles, one per line." },
];

const ELIGIBILITY_BADGE: Record<FactDef["eligibility"], { label: string; cls: string }> = {
  customer:   { label: "customer-facing", cls: "bg-[#F0FDF4] text-[#166534]" },
  sensitive:  { label: "sensitive",       cls: "bg-[#FFFBEB] text-[#92400E]" },
  restricted: { label: "restricted",      cls: "bg-[#FEF2F2] text-[#991B1B]" },
};

/** Does policy currently let this fact onto customer documents? */
const published = (f: FactDef, policy: PublicationPolicy): boolean => {
  const p = policy[f.key];
  if (f.eligibility === "restricted" || f.eligibility === "sensitive") return p === "shown";
  if (!f.defaultVisible) return p === "shown";
  return p !== "hidden";
};

export default function CompanyIdentityPanel({ identity, policy, onFact, onPolicy }: {
  identity: CompanyIdentity;
  policy: PublicationPolicy;
  onFact: (key: string, value: string) => void;
  onPolicy: (key: string, value: "shown" | "hidden" | null) => void;
}) {
  return (
    <div data-identity-panel className="w-[420px] shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Company identity</p>
      <p className="text-[10.5px] text-slate-400 mb-3">
        The company&apos;s permanent publishing identity. Eligibility is law — restricted facts
        never reach a customer document unless you explicitly enable them here.
      </p>
      {GROUPS.map((g) => {
        const facts = COMPANY_FACTS.filter((f) => f.group === g.key);
        return (
          <div key={g.key} data-identity-group={g.key} className="mb-4 rounded-lg ring-1 ring-[#E7EDF5] bg-white p-3">
            <p className="text-[11px] font-semibold text-slate-600">{g.label}</p>
            <p className="text-[10px] text-slate-400 mb-2">{g.blurb}</p>
            {facts.map((f) => {
              const on = published(f, policy);
              return (
                <div key={f.key} data-identity-fact={f.key} className="mb-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <label className="text-[10.5px] font-semibold text-slate-500">{f.label}</label>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${ELIGIBILITY_BADGE[f.eligibility].cls}`}>
                      {ELIGIBILITY_BADGE[f.eligibility].label}
                    </span>
                    <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                      <input type="checkbox" data-identity-publish={f.key} checked={on}
                        onChange={(e) => {
                          const want = e.target.checked;
                          // policy speaks only when it differs from the default
                          if (f.eligibility === "restricted" || f.eligibility === "sensitive" || !f.defaultVisible)
                            onPolicy(f.key, want ? "shown" : null);
                          else onPolicy(f.key, want ? null : "hidden");
                        }} />
                      {f.eligibility === "restricted" ? "Explicitly enabled" : "On documents"}
                    </label>
                  </div>
                  {f.multiline ? (
                    <textarea rows={2} value={identity[f.key] ?? ""} onChange={(e) => onFact(f.key, e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-[11.5px]" />
                  ) : (
                    <input value={identity[f.key] ?? ""} onChange={(e) => onFact(f.key, e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-[11.5px]" />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
