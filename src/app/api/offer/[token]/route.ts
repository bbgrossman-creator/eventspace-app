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
