/** v292c PREP TEST SEAM — transport only. The component, the projection client,
 *  and the ceremony client are all the real modules; only the wire is replaced.
 *  Supports rpc (reads AND ceremony writes) plus the venue catalogue read. */
type Res = { data: unknown; error: { message: string } | null };
async function post(path: string, body: unknown): Promise<Res> {
  const r = await fetch(path, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`transport ${r.status}`);
  return (await r.json()) as Res;
}
function builder(table: string) {
  const b = {
    select() { return b; },
    eq() { return b; }, limit() { return b; }, order() { return b; },
    maybeSingle(): Promise<Res> { return post("/from", { table, single: true }); },
    single(): Promise<Res> { return post("/from", { table, single: true }); },
    then<T>(ok: (r: Res) => T, bad?: (e: unknown) => T) {
      return post("/from", { table, single: false }).then(ok, bad);
    },
  };
  return b;
}
export const supabase = {
  from(table: string) { return builder(table); },
  auth: {
    async getUser() {
      const r = await post("/auth", {});
      return (r as unknown as { data: unknown }).data as
        { data: { user: { id: string; email: string | null } | null }; error: null };
    },
    async getSession() { return { data: { session: null } }; },
    async signOut() { return { error: null }; },
  },
  rpc: (name: string, params: Record<string, unknown>) => post("/rpc", { name, params }),
};
export async function logActivity(): Promise<void> {}
