// ═══════════════════════════════════════════════════════════════════════════
// PERMISSIONS — who is logged in, which tenant, what role, what they may see.
//
// ⚠️ THIS IS A UI/PAGE ACCESS LAYER, NOT DATABASE SECURITY. RLS is still off:
// a signed-in user with the browser console can reach any table regardless of
// role. Enforcing this at the data layer is a separate, dedicated version.
// Treat these checks as "don't show people things they shouldn't use," not as
// "prevent a determined user from reading data."
//
// Two independent dimensions gate every surface:
//   TENANT CAPABILITY (capabilities.ts) — does this business have the module?
//   USER PERMISSION   (this file)       — may this person see it?
// A nav item or page requires BOTH. Never a one-off showX boolean.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export type Role = "admin" | "manager" | "staff" | "bookkeeper" | "readonly";

export const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "admin", label: "Admin", help: "Everything, including users and configuration." },
  { value: "manager", label: "Manager", help: "Bookings, ops, calendar, staff, reports, content." },
  { value: "staff", label: "Staff", help: "Bookings, tasks, calendar, inquiries — day-to-day work." },
  { value: "bookkeeper", label: "Bookkeeper", help: "Invoices, payments, dashboard — no ops or config." },
  { value: "readonly", label: "Read Only", help: "View bookings and calendar. No edits." },
];

/** Permission keys. Coarse on purpose: modules, not buttons. Finer-grained
 *  department permissions (kitchen.*, driver.*) arrive with those modules. */
export type Permission =
  | "bookings.view" | "bookings.edit"
  | "inquiries.create"
  | "calendar.view"
  | "dashboard.view"
  | "ops.view"
  | "finance.view"
  | "communications.view"
  | "knowledge.view"      // Rolodex & friends (still also needs caps.rolodex)
  | "content.manage"      // menu templates, package guides
  | "config.manage"       // policies, locations, vendors, sop, business model
  | "staff.manage"
  | "users.manage";

const ALL: Permission[] = [
  "bookings.view", "bookings.edit", "inquiries.create", "calendar.view",
  "dashboard.view", "ops.view", "finance.view", "communications.view",
  "knowledge.view", "content.manage", "config.manage", "staff.manage", "users.manage",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  manager: [
    "bookings.view", "bookings.edit", "inquiries.create", "calendar.view",
    "dashboard.view", "ops.view", "finance.view", "communications.view",
    "knowledge.view", "content.manage", "staff.manage",
  ],
  staff: [
    "bookings.view", "bookings.edit", "inquiries.create", "calendar.view",
    "ops.view", "communications.view", "knowledge.view",
  ],
  bookkeeper: [
    "bookings.view", "dashboard.view", "finance.view",
  ],
  readonly: [
    "bookings.view", "calendar.view",
  ],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.readonly;
}

export interface Session {
  userId: string;
  email: string | null;
  tenantId: string | null;
  tenantName: string | null;
  role: Role;
  perms: Permission[];
  /** No tenant_users row — either the migration hasn't run or the user was
   *  deactivated. Callers should treat this as "no access." */
  unassigned: boolean;
}

/** Signed-out → null. Signed-in but no active tenant row → unassigned. */
export async function loadSession(): Promise<Session | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id,role,active,tenants(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  // Table missing (migration not run) → fail OPEN as admin, so a half-migrated
  // deploy can't lock the owner out of the app. Fail-closed once RLS lands.
  if (error) {
    return { userId: user.id, email: user.email ?? null, tenantId: null, tenantName: null,
      role: "admin", perms: ALL, unassigned: false };
  }
  if (!data) {
    return { userId: user.id, email: user.email ?? null, tenantId: null, tenantName: null,
      role: "readonly", perms: [], unassigned: true };
  }
  const row = data as unknown as { tenant_id: string; role: string; tenants: { name: string } | null };
  const role = (ROLES.some((r) => r.value === row.role) ? row.role : "readonly") as Role;
  return {
    userId: user.id, email: user.email ?? null,
    tenantId: row.tenant_id, tenantName: row.tenants?.name ?? null,
    role, perms: permissionsFor(role), unassigned: false,
  };
}

export function can(session: Session | null, perm: Permission): boolean {
  return !!session && session.perms.indexOf(perm) >= 0;
}
