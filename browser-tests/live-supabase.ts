/** v288 TEST SEAM — a supabase shim that talks to LIVE POSTGRES.
 *
 *  This is NOT a mock of the projection. Every `.rpc()` here is proxied to the
 *  acceptance runner, which executes the real SQL function against a real
 *  database. The component, `feed.ts`, `client.ts`, `state.ts` and `labels.ts`
 *  are all the real modules; only the transport is substituted, because a
 *  browser cannot open a Postgres socket.
 *
 *  That substitution is what allows UI-1 to be an honest claim: the mounted
 *  surface renders from the real `projection_operations_today` executing in
 *  Postgres, not from a fixture.
 */
type RpcResult = { data: unknown; error: { message: string } | null };

async function post(path: string, body: unknown): Promise<RpcResult> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // transport failure — deliberately distinct from a SQL refusal
    throw new Error(`transport ${res.status}`);
  }
  return (await res.json()) as RpcResult;
}

export const supabase = {
  async rpc(name: string, params: Record<string, unknown>): Promise<RpcResult> {
    return post("/rpc", { name, params });
  },
  auth: {
    async getUser(): Promise<{ data: { user: { id: string; email: string | null } | null }; error: null }> {
      const r = await post("/auth", {});
      return r.data as { data: { user: { id: string; email: string | null } | null }; error: null };
    },
    async getSession(): Promise<{ data: { session: unknown } }> {
      return { data: { session: null } };
    },
  },
  from(table: string) {
    const builder = {
      _filters: [] as Array<[string, unknown]>,
      select() { return builder; },
      eq(col: string, val: unknown) { builder._filters.push([col, val]); return builder; },
      limit() { return builder; },
      async maybeSingle(): Promise<{ data: unknown; error: unknown }> {
        const r = await post("/from", { table, filters: builder._filters });
        return r as unknown as { data: unknown; error: unknown };
      },
    };
    return builder;
  },
};

export async function logActivity(): Promise<void> {
  throw new Error("PROJECTION_WRITE_REFUSED: the v288 surface performs no writes");
}
