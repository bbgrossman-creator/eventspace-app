"use client";
import { useParams } from "next/navigation";
import OperationalBasisCard from "@/components/OperationalBasisCard";

/** v284 — Proposal Component Inspector route. Mounts the real basis card for
 *  a proposal component instance by id. */
export default function ComponentBasisPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-lg font-semibold text-slate-100 mb-4">Proposal Component Inspector</h1>
      <OperationalBasisCard eventComponentId={id} />
    </div>
  );
}
