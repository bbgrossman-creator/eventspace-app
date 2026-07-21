import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/offer/[token] — the durable customer-visible endpoint (R1, I-19).
// An `observed` publication mints an offer_endpoints token pointing at the
// immutable Snapshot. This route serves offer_snapshots.artifact_bytes — the
// ARCHIVED artifact, by value — and NEVER renders from live proposal data.
// There is no code path here that reads event_components, component_items, or
// any living version graph: the offer the customer sees is frozen.
//
// Invalid, inactive, cross-tenant, or nonexistent tokens receive an identical
// non-disclosing 404 (no internal ids leak, no existence oracle). Future
// revocation flips offer_endpoints.active without touching the Snapshot.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/offer/[token] — v271 · the Acceptance ceremony (A.3).
// The token is the capability. This handler gathers ONLY the acknowledgment and
// the customer's selections, then calls the SQL ceremony public.accept_offer,
// which performs ALL constitutional enforcement (eligibility, fingerprint
// binding, selection validation against the frozen snapshot, atomic write of
// acceptance + selection set + ledger). The route decides nothing: it does not
// judge eligibility, author timestamps, mutate selections, or infer acceptance
// from status. It resolves token → endpoint → snapshot → version, calls the
// ceremony once, and renders the stable outcome or a stable failure code.
// ═══════════════════════════════════════════════════════════════════════════
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const notFound = () => new Response("Not found", { status: 404 });
  const fail = (code: string, status = 409) =>
    new Response(JSON.stringify({ outcome: "refused", code }), {
      status, headers: { "content-type": "application/json" } });
  if (!token || token.length < 32) return notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("Service unavailable", { status: 503 });
  const db = createClient(url, key);

  // token → active endpoint → snapshot → version. Inactive/absent = 404.
  const { data: ep } = await db.from("offer_endpoints")
    .select("snapshot_id, active, tenant_id").eq("token", token).maybeSingle();
  if (!ep || !(ep as { active: boolean }).active) return notFound();
  const { data: snap } = await db.from("offer_snapshots")
    .select("version_id, fingerprint")
    .eq("id", (ep as { snapshot_id: string }).snapshot_id).maybeSingle();
  if (!snap) return notFound();
  const sv = snap as { version_id: string; fingerprint: string };

  // gather ONLY acknowledgment + selections from the request body (no authority)
  let body: { selections?: unknown; principal?: unknown; acknowledgment?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }

  // one call; the ceremony is the sole enforcer. It authors the timestamp,
  // validates selections against the frozen model, and writes atomically.
  const { data, error } = await db.rpc("accept_offer", {
    p_version: sv.version_id,
    p_actor: "customer",
    p_fingerprint: sv.fingerprint,
    p_selections: body.selections ?? [],
    p_principal: body.principal ?? null,
    p_channel: "endpoint",
  });

  if (error) {
    // map the ceremony's stable exception text to a stable failure code; never
    // leak internals or cross-tenant existence.
    const m = String(error.message || "");
    const code =
      m.includes("ALREADY_ACCEPTED")     ? "already_accepted" :
      m.includes("OFFER_WITHDRAWN")       ? "offer_withdrawn" :
      m.includes("OFFER_SUPERSEDED")      ? "offer_superseded" :
      m.includes("NOT_PUBLISHED")         ? "offer_not_published" :
      m.includes("NOT_ELIGIBLE")          ? "offer_not_eligible" :
      m.includes("INVALID_SELECTION")     ? "invalid_selection" :
      m.includes("DUPLICATE_SELECTION")   ? "duplicate_selection" :
      m.includes("FINGERPRINT_MISMATCH")  ? "fingerprint_mismatch" :
      m.includes("CEREMONY_NOT_FOUND")    ? "not_found" : "refused";
    if (code === "not_found") return notFound();
    return fail(code);
  }

  return new Response(JSON.stringify({ outcome: "accepted", result: data }), {
    status: 200, headers: { "content-type": "application/json" } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!token || token.length < 32) return notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("Service unavailable", { status: 503 });
  const db = createClient(url, key);

  // resolve the token → active endpoint → its immutable Snapshot. One join,
  // no tenant guessing: the token itself is the capability (unguessable), and
  // an inactive endpoint is treated as absent.
  const { data: ep } = await db.from("offer_endpoints")
    .select("snapshot_id, active").eq("token", token).maybeSingle();
  if (!ep || !(ep as { active: boolean }).active) return notFound();

  const { data: snap } = await db.from("offer_snapshots")
    .select("artifact_bytes, artifact_hash, artifact_meta")
    .eq("id", (ep as { snapshot_id: string }).snapshot_id).maybeSingle();
  if (!snap) return notFound();

  const s = snap as { artifact_bytes: string; artifact_hash: string; artifact_meta: Record<string, unknown> };
  // artifact_bytes comes back as a bytea hex/base64 string via PostgREST; decode.
  const bytes = decodeBytea(s.artifact_bytes);
  if (!bytes) return notFound();

  const meta = s.artifact_meta ?? {};
  const contentType = (meta.contentType as string) ?? "application/pdf";
  const filename = (meta.filename as string) ?? "offer.pdf";

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${filename}"`,
      // the archive is immutable — cache hard, but keep it private to the holder
      "cache-control": "private, max-age=31536000, immutable",
      // the hash is the integrity witness a client may verify
      "x-artifact-sha256": s.artifact_hash,
    },
  });
}

/** Decode a PostgREST-returned bytea. Supabase returns bytea as a `\x`-prefixed
 *  hex string by default; handle both hex and base64 defensively. */
function decodeBytea(v: string | null): Uint8Array | null {
  if (!v) return null;
  try {
    if (v.startsWith("\\x")) {
      const hex = v.slice(2);
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
      return out;
    }
    return Uint8Array.from(Buffer.from(v, "base64"));
  } catch {
    return null;
  }
}
