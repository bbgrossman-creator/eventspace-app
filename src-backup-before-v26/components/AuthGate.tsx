"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
  }

  if (!ready) return null;
  if (signedIn) return <>{children}</>;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ink">
      <form onSubmit={signIn} className="card p-8 w-full max-w-sm">
        <div className="font-display text-xl font-bold">EVENT SPACE</div>
        <div className="text-[11px] tracking-[0.25em] text-gold font-semibold mb-6">BY BURGER BAR</div>
        <label className="label">Email</label>
        <input className="field mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Password</label>
        <input className="field mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
        <button type="submit" className="btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}
