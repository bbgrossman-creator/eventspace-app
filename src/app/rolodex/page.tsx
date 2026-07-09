"use client";
// ═══════════════════════════════════════════════════════════════════════════
// /rolodex — the standalone browsing/learning face of the Rolodex.
// A thin wrapper: the entire engine + UI lives in <RolodexPanel />, which is
// deliberately a reusable service — Proposal Studio (step 7) will embed the
// same panel with a fixed destination so copies flow straight into the
// proposal being built without ever leaving it.
// ═══════════════════════════════════════════════════════════════════════════
import RolodexPanel from "@/components/RolodexPanel";
import PageGuard from "@/components/PageGuard";

function RolodexPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="page-title">Rolodex</h1>
      <div className="gold-rule mb-4" />
      <RolodexPanel />
    </main>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="knowledge.view" cap="rolodex">
      <RolodexPage />
    </PageGuard>
  );
}
