"use client";
// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION → USERS (v173)
// Manage who can log in, which tenant they belong to, and what role they hold.
// Guarded by users.manage — admins only.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PageGuard from "@/components/PageGuard";
import { ROLES, Role, loadSession, Session } from "@/lib/permissions";

interface TenantRow { id: string; name: string; slug: string; active: boolean; }
interface StaffRow { id: string; name: string; user_id: string | null; }
interface UserRow {
  id: string; tenant_id: string; user_id: string; role: string;
  staff_id: string | null; active: boolean;
}

export default function UsersPage() {
  return (
    <PageGuard perm="users.manage">
      <UsersInner />
    </PageGuard>
  );
}

function UsersInner() {
  const [me, setMe] = useState<Session | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invTenant, setInvTenant] = useState("");
  const [invRole, setInvRole] = useState<Role>("staff");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    const [{ data: t }, { data: s }, { data: tu }] = await Promise.all([
      supabase.from("tenants").select("id,name,slug,active").order("name"),
      supabase.from("staff").select("id,name,user_id").order("sort_order"),
      supabase.from("tenant_users").select("id,tenant_id,user_id,role,staff_id,active"),
    ]);
    const tt = (t ?? []) as TenantRow[];
    setTenants(tt);
    if (tt.length && !invTenant) setInvTenant(tt[0].id);
    setStaff((s ?? []) as StaffRow[]);
    setRows((tu ?? []) as UserRow[]);
    // Emails: we can't read auth.users from the browser. Show the linked staff
    // name where possible; otherwise a shortened user id. Full email display
    // needs a server route — deferred.
    const map: Record<string, string> = {};
    for (const st of (s ?? []) as StaffRow[]) if (st.user_id) map[st.user_id] = st.name;
    setEmails(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadSession().then(setMe); load(); }, [load]);

  async function invite() {
    if (!invEmail.trim() || !invTenant) return;
    setInviting(true); setMsg(null);
    // Browser clients can't create auth users (that needs the service-role key
    // on a server route). Honest flow: the person signs up / is created in
    // Supabase Auth, then an admin attaches them here by email → user id.
    const { error } = await supabase.auth.signInWithOtp({
      email: invEmail.trim(),
      options: { shouldCreateUser: true },
    });
    setInviting(false);
    if (error) { setMsg({ ok: false, text: `Couldn't send invite: ${error.message}` }); return; }
    setMsg({ ok: true, text: `Magic link sent to ${invEmail.trim()}. Once they sign in, they'll appear below as unassigned — set their role there.` });
    setInvEmail("");
  }

  async function setRole(r: UserRow, role: string) {
    const { error } = await supabase.from("tenant_users").update({ role }).eq("id", r.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Role updated." }); load();
  }
  async function setTenant(r: UserRow, tenant_id: string) {
    const { error } = await supabase.from("tenant_users").update({ tenant_id }).eq("id", r.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    load();
  }
  async function linkStaff(r: UserRow, staff_id: string) {
    const sid = staff_id || null;
    const { error } = await supabase.from("tenant_users").update({ staff_id: sid }).eq("id", r.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    // Keep the staff row's user_id in sync — one person, one identity.
    if (sid) await supabase.from("staff").update({ user_id: r.user_id }).eq("id", sid);
    load();
  }
  async function toggleActive(r: UserRow) {
    if (r.user_id === me?.userId && r.active) {
      setMsg({ ok: false, text: "You can't deactivate your own login." });
      return;
    }
    const { error } = await supabase.from("tenant_users").update({ active: !r.active }).eq("id", r.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    load();
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="page-title">Users</h1>
      <div className="gold-rule mb-4" />

      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 mb-6">
        <b>⚠️ This controls what people see, not what the database allows.</b> Row-level
        security isn&apos;t enabled yet, so a signed-in user could still reach data directly.
        Only give logins to people you trust with the whole business until RLS ships.
      </div>

      {msg && <div className={`rounded-lg px-4 py-3 mb-5 text-sm font-semibold border ${msg.ok ? "status-success" : "status-conflict"}`}>{msg.text}</div>}

      <div className="card p-5 mb-6">
        <h2 className="font-display font-semibold text-[15px] mb-1">Invite someone</h2>
        <p className="text-xs text-slate-400 mb-3">Sends a magic sign-in link. After they sign in once, assign their tenant and role below.</p>
        <div className="flex gap-2 flex-wrap items-end">
          <input className="field flex-1 min-w-[200px]" type="email" placeholder="name@business.com"
            value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
          <select className="field w-44" value={invTenant} onChange={(e) => setInvTenant(e.target.value)}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="field w-40" value={invRole} onChange={(e) => setInvRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn-primary" onClick={invite} disabled={inviting || !invEmail.trim()}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display font-semibold text-[15px] mb-3">People ({rows.length})</h2>
        {rows.length === 0 && <p className="text-sm text-slate-400">No one yet — run the v173 SQL, then invite someone above.</p>}
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-lg ring-1 ring-[#E7EDF5] p-3 flex flex-wrap items-center gap-2 ${r.active ? "" : "opacity-50"}`}>
              <div className="min-w-[150px] flex-1">
                <div className="text-sm font-semibold">
                  {emails[r.user_id] ?? `User ${r.user_id.slice(0, 8)}…`}
                  {r.user_id === me?.userId && <span className="ml-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#F4F9FF] text-[#2F80ED]">you</span>}
                </div>
                <div className="text-[11px] text-slate-400">{r.active ? "Active" : "Deactivated"}</div>
              </div>
              <select className="field !py-1 !text-xs w-36" value={r.tenant_id} onChange={(e) => setTenant(r, e.target.value)}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className="field !py-1 !text-xs w-32" value={r.role} onChange={(e) => setRole(r, e.target.value)}>
                {ROLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              <select className="field !py-1 !text-xs w-36" value={r.staff_id ?? ""} onChange={(e) => linkStaff(r, e.target.value)}>
                <option value="">— no staff link —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="text-[11px] text-slate-400 hover:text-red-500 underline" onClick={() => toggleActive(r)}>
                {r.active ? "deactivate" : "reactivate"}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400"><b>Roles:</b> {ROLES.map((r) => `${r.label} — ${r.help}`).join("  ·  ")}</p>
        </div>
      </div>
    </main>
  );
}
