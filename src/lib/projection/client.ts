/** v287c · PROJECTION CLIENT — the ONLY application interface for operational
 *  reads. One typed, version-aware, envelope-aware fetch seam.
 *
 *  Components never call `.rpc()`. They call the typed wrappers in feed.ts,
 *  which come through here. Following the established pure/data split, this
 *  file is the data half; state.ts and labels.ts are pure and DB-free.
 */
"use client";
import { supabase } from "@/lib/supabase";
import {
  type Envelope, type ProjectionFilter, ProjectionRefusal, SUPPORTED_VERSIONS,
  type ResponsibilityRow, isEnvelopeLike,
} from "./types";

/** Refusal codes the projection layer raises by name. Normalizing them here
 *  means a surface can branch on a code instead of matching message text. */
const KNOWN_REFUSALS = [
  "PROJECTION_FILTER_INVALID",
  "PROJECTION_GROUP_BY_INVALID",
  "RESP_NO_TRUTH_ANCHOR",
  "RESP_EDIT_REFUSED",
  "RESP_OWNER_LEDGER_APPEND_ONLY",
  "OWNERSHIP_CONFLICT",
  "RESP_ACTOR_REQUIRED",
  "RESP_NOT_FOUND",
  "AI_AUTHORITY_REFUSED",
  "PROJECTION_WRITE_REFUSED",
] as const;

/** Turn a Postgres error into a typed refusal without losing the original. */
export function normalizeRefusal(raw: string): ProjectionRefusal {
  const text = (raw ?? "").replace(/^Error:\s*/, "");
  const code = KNOWN_REFUSALS.find((c) => text.includes(c));
  if (code) {
    const after = text.split(code)[1] ?? "";
    const message = after.replace(/^[:\s]+/, "").trim() || text;
    return new ProjectionRefusal(code, message, text);
  }
  return new ProjectionRefusal("PROJECTION_ERROR", text, text);
}

/** Assert the envelope is the shape and version this client understands.
 *  Version awareness is deliberate: a surface pinned to v1 must fail loudly
 *  rather than silently render a shape it does not understand. */
export function assertEnvelope<T>(name: string, value: unknown): Envelope<T> {
  if (!isEnvelopeLike(value)) {
    throw new ProjectionRefusal(
      "PROJECTION_SHAPE_INVALID",
      `projection ${name} did not return an envelope`,
      JSON.stringify(value ?? null).slice(0, 200),
    );
  }
  const env = value as Envelope<T>;
  if (env.projection !== name) {
    throw new ProjectionRefusal(
      "PROJECTION_NAME_MISMATCH",
      `expected projection ${name}, received ${env.projection}`,
      env.projection,
    );
  }
  const expected = SUPPORTED_VERSIONS[name];
  if (expected !== undefined && env.version !== expected) {
    throw new ProjectionRefusal(
      "PROJECTION_VERSION_UNSUPPORTED",
      `projection ${name} is version ${env.version}; this client understands ${expected}`,
      String(env.version),
    );
  }
  return env;
}

/** The single rpc seam. Every operational read in the application goes here. */
export async function fetchProjection<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<Envelope<T>> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw normalizeRefusal(error.message);
  return assertEnvelope<T>(name.replace(/^projection_/, ""), data);
}

/** Set-returning projections (responsibility_feed) return rows, not envelopes. */
export async function fetchRows(
  name: string,
  params: Record<string, unknown>,
): Promise<ResponsibilityRow[]> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw normalizeRefusal(error.message);
  return (data ?? []) as ResponsibilityRow[];
}

/** Serialize a filter for transport. The grammar is closed server-side; this
 *  drops undefined keys so an unset option is never sent as `null` and
 *  mistaken for a value. */
export function toFilter(filter: ProjectionFilter = {}): ProjectionFilter {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ProjectionFilter;
}
