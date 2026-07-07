"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [recovering, setRecovering] = useState(false); // arrived via reset link
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // When the user clicks the email reset link, Supabase fires this event with
      // a temporary session. Show the "set new password" screen instead of the app.
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setSignedIn(false);
        return;
      }
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

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setNotice("");
    if (!email) { setErr("Enter your email first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (error) { setErr(error.message); return; }
    setNotice("Check your email for a password reset link.");
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setNotice("");
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setErr(error.message); return; }
    setNotice("Password updated. You're all set.");
    setRecovering(false);
    setSignedIn(true); // the recovery session is valid — go straight into the app
  }

  if (!ready) return null;

  // Set-new-password screen (arrived via reset email)
  if (recovering) {
    return (
      <Shell>
        <form onSubmit={setNewPassword}>
          <Brand />
          <p className="text-sm text-slate-500 mb-4">Choose a new password for your account.</p>
          <label className="label">New password</label>
          <input className="field mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoFocus />
          {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
          {notice && <p className="text-sm text-emerald-600 mb-3">{notice}</p>}
          <button type="submit" className="btn-primary w-full">Update password</button>
        </form>
      </Shell>
    );
  }

  if (signedIn) return <>{children}</>;

  // Forgot-password screen
  if (mode === "forgot") {
    return (
      <Shell>
        <form onSubmit={sendReset}>
          <Brand />
          <p className="text-sm text-slate-500 mb-4">Enter your email and we&apos;ll send you a reset link.</p>
          <label className="label">Email</label>
          <input className="field mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
          {notice && <p className="text-sm text-emerald-600 mb-3">{notice}</p>}
          <button type="submit" className="btn-primary w-full mb-3">Send reset link</button>
          <button type="button" className="text-sm text-slate-500 hover:text-navy w-full text-center"
            onClick={() => { setMode("signin"); setErr(""); setNotice(""); }}>
            &larr; Back to sign in
          </button>
        </form>
      </Shell>
    );
  }

  // Sign-in screen
  return (
    <Shell>
      <form onSubmit={signIn}>
        <Brand />
        <label className="label">Email</label>
        <input className="field mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Password</label>
        <input className="field mb-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="text-xs text-slate-500 hover:text-navy mb-4 block"
          onClick={() => { setMode("forgot"); setErr(""); setNotice(""); }}>
          Forgot password?
        </button>
        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
        <button type="submit" className="btn-primary w-full">Sign in</button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ink">
      <div className="card p-8 w-full max-w-sm">{children}</div>
    </div>
  );
}

function Brand() {
  return (
    <>
      <img src={BRAND.logoLight} alt={BRAND.name}
        className="h-14 w-auto object-contain mx-auto mb-2"
        onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.style.display = "none"; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = "block"; }} />
      <div className="font-display text-xl font-bold text-center" style={{ display: "none" }}>{BRAND.name}</div>
      <div className="text-[11px] tracking-[0.14em] font-semibold text-center text-slate-400 mb-6">{BRAND.tagline}</div>
    </>
  );
}
