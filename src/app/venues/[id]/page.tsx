"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getVenueFindings, type KnowledgeFinding } from "@/lib/binding";
import {
  getVenue, listSpaces, listWalkthroughs, getVenueProfile,
  addVenueSpace, recordWalkthrough, declareCoverage, recordObservation, recordEvidence, supersedeObservation,
  type Venue, type VenueSpace, type Walkthrough, type ProfileEntry, type SourceClass,
} from "@/lib/venues";

/** v280 venue detail — the smallest surface that exercises the whole foundation:
 *  space tree, walkthrough + coverage, structured observations, evidence with
 *  fingerprint, and the DERIVED profile rendered exactly as SQL answers it —
 *  three-valued, with provenance and contradiction findings. No precedence or
 *  coverage law lives in this file. */
const SPACE_KINDS = ["building","room","ballroom","ceremony_space","kitchen","prep_area","plating_area","refrigeration_area","storage","staging","loading_zone","dock","elevator","corridor","stair","outdoor_area","tent_site"];
const SOURCE_CLASSES: SourceClass[] = ["measurement","direct_observation","venue_document","venue_rep_statement","prior_knowledge"];
const STATUS_BADGE: Record<string, string> = {
  observed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  observed_absent: "bg-slate-100 text-slate-600 border-slate-300",
  unobserved: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [spaces, setSpaces] = useState<VenueSpace[]>([]);
  const [walks, setWalks] = useState<Walkthrough[]>([]);
  const [profile, setProfile] = useState<ProfileEntry[]>([]);
  const [findings, setFindings] = useState<KnowledgeFinding[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sp, setSp] = useState({ kind: "room", name: "" });
  const [ob, setOb] = useState({ attribute: "", kind: "quantity", amount: "", unit: "", boolVal: "true", scope: "", source: "measurement" as SourceClass, absent: false });
  const [ev, setEv] = useState({ kind: "photograph", label: "" });
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [supersedeFor, setSupersedeFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [v, s, w, p, kf] = await Promise.all([getVenue(id), listSpaces(id), listWalkthroughs(id), getVenueProfile(id), getVenueFindings(id)]);
      setVenue(v); setSpaces(s); setWalks(w); setProfile(p); setFindings(kf);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
  };

  const spaceName = (sid: string | null) => sid ? (spaces.find((s) => s.id === sid)?.name ?? sid.slice(0, 8)) : "venue";
  const roots = spaces.filter((s) => !s.parent_space_id);
  const kids = (pid: string) => spaces.filter((s) => s.parent_space_id === pid);

  if (!venue) return <div className="p-6 text-sm text-slate-400" data-venue-loading>Loading venue…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6" data-venue-detail>
      <header>
        <h1 className="text-xl font-semibold text-slate-800" data-venue-title>{venue.name}</h1>
        <p className="text-sm text-slate-500">{venue.venue_type.replace("_", " ")}{venue.address ? ` · ${venue.address}` : ""}</p>
      </header>
      {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-venue-error>{err}</div>}

      {/* spaces */}
      <section className="rounded-lg border border-slate-200 p-4" data-space-section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Spaces</div>
        <ul className="space-y-1" data-space-tree>
          {roots.map((r) => (
            <li key={r.id} data-space={r.name}>
              <span className="text-sm text-slate-700">{r.contended ? "⛔ " : ""}{r.name} <span className="text-xs text-slate-400">· {r.kind}</span></span>
              {kids(r.id).length > 0 && (
                <ul className="ml-5 mt-0.5 space-y-0.5">
                  {kids(r.id).map((c) => <li key={c.id} data-space={c.name} className="text-sm text-slate-600">{c.contended ? "⛔ " : ""}{c.name} <span className="text-xs text-slate-400">· {c.kind}</span></li>)}
                </ul>
              )}
            </li>
          ))}
          {spaces.length === 0 && <li className="text-sm text-slate-400">No spaces recorded.</li>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <select value={sp.kind} onChange={(e) => setSp({ ...sp, kind: e.target.value })} data-space-kind className="rounded border border-slate-300 px-2 py-1 text-xs">
            {SPACE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={sp.name} onChange={(e) => setSp({ ...sp, name: e.target.value })} placeholder="Space name" data-space-name className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <button disabled={!sp.name.trim()} data-space-add className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            onClick={() => run(async () => { await addVenueSpace({ venue: id, kind: sp.kind, name: sp.name }); setSp({ kind: "room", name: "" }); })}>Add space</button>
        </div>
      </section>

      {/* walkthroughs */}
      <section className="rounded-lg border border-slate-200 p-4" data-walkthrough-section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Walkthroughs</div>
          <button data-walkthrough-add className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
            onClick={() => run(() => recordWalkthrough({ venue: id, purpose: "general", conductedAt: new Date().toISOString() }))}>Record walkthrough</button>
        </div>
        <ul className="space-y-1" data-walkthrough-list>
          {walks.map((w) => (
            <li key={w.id} className="flex items-center justify-between text-sm text-slate-600" data-walkthrough={w.id}>
              <span>{new Date(w.conducted_at).toLocaleDateString()} · {w.purpose.replace("_", " ")} · rep: {w.rep_involvement}</span>
              <span className="flex gap-2">
                <button data-coverage-visited className="text-xs text-emerald-700"
                  onClick={() => run(() => declareCoverage({ walkthrough: w.id, status: "visited", space: spaces[0]?.id }))}>+ visited</button>
                <button data-coverage-inaccessible className="text-xs text-amber-700"
                  onClick={() => run(() => declareCoverage({ walkthrough: w.id, status: "inaccessible", space: spaces[0]?.id, note: "locked" }))}>+ inaccessible</button>
              </span>
            </li>
          ))}
          {walks.length === 0 && <li className="text-sm text-slate-400">No walkthroughs recorded.</li>}
        </ul>
      </section>

      {/* record observation */}
      <section className="rounded-lg border border-slate-200 p-4" data-observation-section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Record observation</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={ob.attribute} onChange={(e) => setOb({ ...ob, attribute: e.target.value })} placeholder="attribute_key"
            data-ob-attribute className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <select value={ob.scope} onChange={(e) => setOb({ ...ob, scope: e.target.value })} data-ob-scope className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="">venue-level</option>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={ob.source} onChange={(e) => setOb({ ...ob, source: e.target.value as SourceClass })} data-ob-source className="rounded border border-slate-300 px-2 py-1 text-xs">
            {SOURCE_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={ob.absent} onChange={(e) => setOb({ ...ob, absent: e.target.checked })} data-ob-absent /> observed absent
          </label>
          {!ob.absent && (
            <>
              <select value={ob.kind} onChange={(e) => setOb({ ...ob, kind: e.target.value })} data-ob-kind className="rounded border border-slate-300 px-2 py-1 text-xs">
                <option value="quantity">quantity</option><option value="boolean">boolean</option><option value="text">text</option>
              </select>
              {ob.kind === "quantity" && (
                <>
                  <input value={ob.amount} onChange={(e) => setOb({ ...ob, amount: e.target.value })} placeholder="amount" data-ob-amount className="w-20 rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input value={ob.unit} onChange={(e) => setOb({ ...ob, unit: e.target.value })} placeholder="unit" data-ob-unit className="w-16 rounded border border-slate-300 px-2 py-1 text-xs" />
                </>
              )}
              {ob.kind === "boolean" && (
                <select value={ob.boolVal} onChange={(e) => setOb({ ...ob, boolVal: e.target.value })} data-ob-bool className="rounded border border-slate-300 px-2 py-1 text-xs">
                  <option value="true">true</option><option value="false">false</option>
                </select>
              )}
              {ob.kind === "text" && (
                <input value={ob.amount} onChange={(e) => setOb({ ...ob, amount: e.target.value })} placeholder="value" data-ob-text className="rounded border border-slate-300 px-2 py-1 text-xs" />
              )}
            </>
          )}
          <button data-ob-submit disabled={!ob.attribute.trim() || (!ob.absent && ob.kind === "quantity" && !ob.amount)}
            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-50"
            onClick={() => run(async () => {
              const value = ob.absent ? { present: false }
                : ob.kind === "quantity" ? { amount: Number(ob.amount), unit: ob.unit || null }
                : ob.kind === "boolean" ? { value: ob.boolVal === "true" }
                : { value: ob.amount };
              await recordObservation({
                venue: id, attribute: ob.attribute, valueKind: ob.absent ? "absent" : ob.kind, value,
                sourceClass: ob.source, observedAt: new Date().toISOString(),
                scopeSpace: ob.scope || undefined, walkthrough: walks[0]?.id,
              });
              setOb({ ...ob, attribute: "", amount: "", unit: "" });
            })}>Record</button>
        </div>
      </section>

      {/* evidence */}
      <section className="rounded-lg border border-slate-200 p-4" data-evidence-section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Attach evidence</div>
        <div className="flex items-center gap-2">
          <select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })} data-ev-kind className="rounded border border-slate-300 px-2 py-1 text-xs">
            {["photograph","measurement_record","floor_plan","rulebook","permit","other"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={ev.label} onChange={(e) => setEv({ ...ev, label: e.target.value })} placeholder="label" data-ev-label className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <button data-ev-submit disabled={!ev.label.trim()} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            onClick={() => run(async () => {
              const hash = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
              const r = await recordEvidence({ venue: id, kind: ev.kind, label: ev.label, walkthrough: walks[0]?.id, hash });
              setLastHash(r.contentHash); setEv({ ...ev, label: "" });
            })}>Attach</button>
          {lastHash && <span className="text-[11px] text-slate-400" data-ev-hash>fingerprint {lastHash.slice(0, 12)}…</span>}
        </div>
      </section>

      {/* derived profile */}
      <section className="rounded-lg border border-slate-200 p-4" data-profile-section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Current profile (derived)</div>
        <ul className="space-y-1.5" data-profile-list>
          {profile.map((p) => (
            <li key={`${p.scope_space ?? "v"}-${p.attribute}`} className="text-sm" data-profile-entry={p.attribute} data-profile-status={p.status}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[11px] ${STATUS_BADGE[p.status]}`}>{p.status.replace("_", " ")}</span>
                <span className="font-medium text-slate-800">{p.attribute}</span>
                <span className="text-xs text-slate-400">@ {spaceName(p.scope_space)}</span>
                {p.status === "observed" && <span className="text-slate-700" data-profile-value>{JSON.stringify(p.value)}</span>}
                {p.source_class && <span className="text-[11px] text-slate-400" data-profile-provenance>{p.source_class.replace(/_/g, " ")} · {p.observer} · {p.observed_at ? new Date(p.observed_at).toLocaleDateString() : ""}</span>}
                {p.observation_id && (
                  <button className="text-[11px] text-rose-600" data-profile-supersede
                    onClick={() => { setSupersedeFor(p.observation_id!); setReason(""); }}>supersede</button>
                )}
              </div>
              {p.contradiction && (
                <div className="ml-2 mt-0.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800" data-profile-contradiction>
                  ⚠ disputed by a newer {p.contradiction.source_class.replace(/_/g, " ")} ({JSON.stringify(p.contradiction.value)}, {p.contradiction.observer}) — governing value unchanged; re-verify.
                </div>
              )}
              {supersedeFor === p.observation_id && (
                <div className="ml-2 mt-1 flex items-center gap-2" data-supersede-form>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)"
                    data-supersede-reason className="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <button disabled={!reason.trim()} data-supersede-confirm className="rounded bg-rose-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                    onClick={() => run(async () => { await supersedeObservation(supersedeFor!, reason); setSupersedeFor(null); })}>Supersede</button>
                </div>
              )}
            </li>
          ))}
          {profile.length === 0 && <li className="text-sm text-slate-400" data-profile-empty>Nothing observed yet — everything is unobserved.</li>}
        </ul>
      </section>

      {/* v282 — derived knowledge findings (staleness, expiry, renovation, contradictions) */}
      <section className="rounded-lg border border-slate-200 p-4" data-findings-section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Knowledge findings (derived)</div>
        <ul className="space-y-1" data-findings-list>
          {findings.map((fd, i) => (
            <li key={i} className={`rounded border px-2 py-1 text-[12px] ${fd.severity === "critical" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
              data-finding={fd.kind} data-finding-severity={fd.severity}>
              <span className="font-medium">{fd.kind.replace(/_/g, " ")}</span> · {fd.reason}
            </li>
          ))}
          {findings.length === 0 && <li className="text-sm text-emerald-700" data-findings-none>✓ No findings — venue knowledge is current.</li>}
        </ul>
      </section>
    </div>
  );
}
