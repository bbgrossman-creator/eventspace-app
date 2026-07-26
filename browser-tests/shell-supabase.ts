/** v290 SHELL TEST SEAM — a supabase shim for the Sidebar harness.
 *
 *  The Sidebar's two loaders use different transport shapes: loadCapabilities
 *  awaits the query builder directly (`from(...).select(...)`), while
 *  loadSession chains through `.eq().limit().maybeSingle()`. This builder is
 *  therefore BOTH thenable and terminal-method capable. `capabilities.ts`,
 *  `permissions.ts` and `Sidebar.tsx` are all the real modules.
 */
type Res = { data: unknown; error: { message: string } | null };

async function post(path: string, body: unknown): Promise<Res> {
  const res = await fetch(path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`transport ${res.status}`);
  return (await res.json()) as Res;
}

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  const b = {
    select() { return b; },
    eq(c: string, v: unknown) { filters.push([c, v]); return b; },
    limit() { return b; },
    order() { return b; },
    maybeSingle(): Promise<Res> { return post("/from", { table, filters, single: true }); },
    single(): Promise<Res> { return post("/from", { table, filters, single: true }); },
    then<T>(ok: (r: Res) => T, bad?: (e: unknown) => T) {
      return post("/from", { table, filters, single: false }).then(ok, bad);
    },
  };
  return b;
}

export const supabase = {
  from(table: string) { return builder(table); },
  auth: {
    async getUser() {
      const r = await post("/auth", {});
      return (r as unknown as { data: unknown }).data as {
        data: { user: { id: string; email: string | null } | null }; error: null;
      };
    },
    async getSession() { return { data: { session: null } }; },
    async signOut() { return { error: null }; },
  },
  rpc: async (): Promise<Res> => { throw new Error("SHELL_RPC_REFUSED: the shell reads no projection"); },
};
export async function logActivity(): Promise<void> { /* no writes in the shell */ }
