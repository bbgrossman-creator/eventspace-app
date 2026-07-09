"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PAGE GUARD — the second half of "don't just hide sidebar items."
// Typing a URL directly now hits this instead of the page.
//
// ⚠️ Still not database security: the data is reachable via the browser's
// anon key regardless. This prevents accidental and casual access, not a
// determined one. RLS is the real fix and is its own version.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSession, Session, Permission, can } from "@/lib/permissions";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";

export default function PageGuard({ perm, cap, children }: {
  perm?: Permission;
  cap?: keyof Capabilities;
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadSession(), loadCapabilities()])
      .then(([s, c]) => { setSession(s); setCaps(c.caps); })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <main className="max-w-3xl mx-auto px-6 py-10"><p className="text-sm text-slate-400">Loading…</p></main>;

  const permOk = !perm || can(session, perm);
  const capOk = !cap || !!caps?.[cap];

  if (session?.unassigned) return <Denied title="No access yet" body="Your login isn't attached to a business yet. Ask an admin to add you under Configuration → Users." />;
  if (!capOk) return <Denied title="Not enabled" body="This module isn't part of your current operating model. An admin can enable it under Configuration → Business Model." />;
  if (!permOk) return <Denied title="Access denied" body="Your role doesn't have permission to view this page. If you think that's wrong, ask an admin." />;

  return <>{children}</>;
}

function Denied({ title, body }: { title: string; body: string }) {
  return (
    <main className="max-w-lg mx-auto px-6 py-20 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="font-display font-bold text-xl mb-2">{title}</h1>
      <p className="text-sm text-slate-500 mb-6">{body}</p>
      <Link href="/" className="btn-primary inline-block">Back to Daily Ops</Link>
    </main>
  );
}
