"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL PREVIEW (v188A) — authenticated internal preview of the customer
// view. Same PresentationModel + ProposalRenderer that the public share page
// will use in v188B; the only difference there is the resolver (share token
// instead of a direct version id) and that this route requires login.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { buildPresentationModel, PresentationModel } from "@/lib/presentation";
import ProposalRenderer from "@/components/ProposalRenderer";

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const [model, setModel] = useState<PresentationModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buildPresentationModel(params.versionId).then(setModel).finally(() => setLoading(false));
  }, [params.versionId]);

  return (
    <main className="min-h-screen bg-[#EEF2F7] py-8">
      <div className="max-w-3xl mx-auto mb-4 px-4 flex items-center justify-between">
        <Link href={`/bookings/${params.id}/studio/${params.versionId}`} className="text-sm text-slate-500 hover:text-slate-700">← Back to Studio</Link>
        <span className="text-[11px] text-slate-400">Customer preview · authenticated</span>
      </div>
      {loading && <p className="text-center text-sm text-slate-400 py-20">Rendering preview…</p>}
      {!loading && !model && <p className="text-center text-sm text-slate-400 py-20">Proposal not found.</p>}
      {model && (
        <>
          {model.hasUnconfirmedVisiblePrice && (
            <div className="max-w-3xl mx-auto mb-4 px-4">
              <div className="rounded-lg bg-amber-50 ring-1 ring-amber-300 text-amber-800 text-[12px] px-3 py-2">
                ⚠ Some visible prices are still carried/unconfirmed — the customer view shows &ldquo;Pricing pending&rdquo; for those. Confirm them in the Studio before sending.
              </div>
            </div>
          )}
          <div className="shadow-xl rounded-lg overflow-hidden mx-4 sm:mx-auto max-w-3xl">
            <ProposalRenderer model={model} />
          </div>
        </>
      )}
    </main>
  );
}
