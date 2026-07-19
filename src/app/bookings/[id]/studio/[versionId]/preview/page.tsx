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
import { supabase } from "@/lib/supabase";
import { ResolvedTheme, ThemeDelta, RegionTexts, resolveTheme, resolveThemeKey } from "@/lib/publication";
import { getPublicationSettings, listPublicationThemes } from "@/lib/publicationData";
import { ResolvedFact, projectIdentity } from "@/lib/identity";
import { getCompanyIdentity } from "@/lib/identityData";
import { PhotoPins } from "@/lib/photos";

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const [model, setModel] = useState<PresentationModel | null>(null);
  const [pubTheme, setPubTheme] = useState<ResolvedTheme | null>(null);
  const [pubWords, setPubWords] = useState<RegionTexts>({ footer: null, signature: null, terms: null });
  const [pubCompany, setPubCompany] = useState<ResolvedFact[]>([]);
  const [pubPins, setPubPins] = useState<PhotoPins | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // v225 THE SNAPSHOT RULE (PUBLICATION §3): for a SENT or APPROVED
    // version this route serves the STAMPED presentation — the artifact the
    // customer actually received — and the live resolve only for drafts.
    // The share page inherits this by construction (same renderer, same
    // rule), which is print/parity by construction too.
    const loadTheme = async () => {
      const { data } = await supabase.from("proposal_versions")
        .select("status,theme_key,theme_override,presentation_snapshot,photo_pins")
        .eq("id", params.versionId).maybeSingle();
      const v = data as { status: string; theme_key: string | null; theme_override: unknown; presentation_snapshot: unknown; photo_pins: unknown } | null;
      if (!v) return;
      if ((v.status === "sent" || v.status === "approved") && v.presentation_snapshot) {
        // v231 — a stamped document is WHOLE: its words froze with its dress.
        const snap = v.presentation_snapshot as ResolvedTheme & { regionTexts?: RegionTexts; companyFacts?: ResolvedFact[]; photoPins?: PhotoPins | null };
        setPubTheme(snap);
        if (snap.regionTexts) setPubWords(snap.regionTexts);
        setPubCompany(snap.companyFacts ?? []);   // frozen — never re-resolved
        setPubPins(snap.photoPins ?? null);
      } else {
        const [settings, tenantThemes] = await Promise.all([getPublicationSettings(), listPublicationThemes()]);
        setPubWords(settings.regionTexts);
        getCompanyIdentity().then((co) => setPubCompany(projectIdentity(co.identity, co.policy))).catch(() => {});
        setPubPins((v.photo_pins as PhotoPins | null) ?? null);
        setPubTheme(resolveTheme(settings.brand, resolveThemeKey(v.theme_key, tenantThemes),
          (v.theme_override as ThemeDelta | null) ?? null).theme);
      }
    };
    Promise.all([buildPresentationModel(params.versionId).then(setModel), loadTheme()])
      .finally(() => setLoading(false));
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
            <ProposalRenderer model={model} theme={pubTheme ?? undefined} regions={pubWords} company={pubCompany} photos={pubPins} />
          </div>
        </>
      )}
    </main>
  );
}
