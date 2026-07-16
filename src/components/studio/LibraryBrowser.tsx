"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE LIBRARY BROWSER (v196 slice 3)
//
// Ctrl+K → the organisation's memory. Browsed on demand, never resident:
// the Library is GLOBAL and in the LEARNED tense, while everything below the
// divide is event-scoped and INTENDED. Different scope AND different tense ⇒
// different physical treatment. That is why it is a line and an overlay rather
// than a fourth column.
//
// A BROWSER, NOT A DRAWER. A drawer stores; a browser is how you interact with
// something too large to store. "Everything the organisation has learned, made
// instantiable" is the latter.
//
// UNDER THE RENDERER CONTRACT: this component NEVER queries. searchLibrary()
// is the projection; this is the rendering. If it wants a fact the results
// lack, the projection is wrong.
//
// CLOSES ON DROP / ON PICK — never mid-gesture. The fluid part of Ctrl+K is
// that it gets out of the way the instant it has served its purpose.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { searchLibrary, LibraryResults, LibraryResult, resultCount } from "@/lib/library";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#E7EDF5" } as const;

const KIND_LABEL: Record<string, string> = {
  component: "Components", event: "Past events", blueprint: "Blueprints",
};
const KIND_ICON: Record<string, string> = { component: "◆", event: "◈", blueprint: "▤" };

export interface LibraryBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Instantiate this identity into the current event. Absent = no event in
   *  context (the Library is browsable from anywhere), so the action hides. */
  onInstantiate?: (identityId: string, name: string) => void;
}

export default function LibraryBrowser({ open, onClose, onInstantiate }: LibraryBrowserProps) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<LibraryResults>({ components: [], events: [], blueprints: [], idle: true });
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search. The projection is async; the browser stays responsive.
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      setBusy(true);
      try { setRes(await searchLibrary(q)); } finally { setBusy(false); }
      setCursor(0);
    }, 160);
    return () => clearTimeout(h);
  }, [q, open]);

  useEffect(() => {
    if (open) { setQ(""); setRes({ components: [], events: [], blueprints: [], idle: true }); setCursor(0);
                setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  if (!open) return null;

  // Flatten for keyboard navigation — the visual grouping is presentation; the
  // keyboard walks one list, because that is what fingers expect.
  const flat: LibraryResult[] = [...res.components, ...res.events, ...res.blueprints];
  const active = flat[cursor];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && active) { e.preventDefault(); go(active); }
  };

  function go(r: LibraryResult) {
    if (r.kind === "component" && r.identityId && onInstantiate) {
      onInstantiate(r.identityId, r.title);
      onClose();                       // closes ON PICK — the gesture is complete
      return;
    }
    if (r.href) { window.location.href = r.href; onClose(); }
  }

  const Group = ({ kind, items, from }: { kind: string; items: LibraryResult[]; from: number }) => {
    if (!items.length) return null;
    return (
      <div className="mb-1">
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {KIND_LABEL[kind]}
        </div>
        {items.map((r, i) => {
          const idx = from + i;
          const on = idx === cursor;
          return (
            <button
              key={`${r.kind}-${r.id}`}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => go(r)}
              // Drag is the fast path; ↵ is the click path. Both instantiate.
              draggable={r.kind === "component" && !!r.identityId}
              onDragStart={(e) => {
                if (r.kind !== "component" || !r.identityId) return;
                e.dataTransfer.setData("text/eventcore-identity",
                  JSON.stringify({ identityId: r.identityId, name: r.title }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`w-full flex items-baseline gap-2 px-3 py-2 text-left ${on ? "bg-[#F4F9FF]" : ""}`}
            >
              <span style={{ color: T.gold }}>{KIND_ICON[r.kind]}</span>
              <span className="text-[13.5px] font-medium" style={{ color: T.ink }}>{r.title}</span>
              {/* The WHY — a hit is only useful if you can see why it's here. */}
              {r.subtitle && <span className="text-[12px] text-slate-400 truncate">{r.subtitle}</span>}
              <span className="flex-1" />
              {on && (
                <span className="text-[10px] text-slate-400">
                  {r.kind === "component" && onInstantiate ? "↵ add to event" : "↵ open"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl ring-1 overflow-hidden"
        style={{ borderColor: T.rule }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: T.rule }}>
          <span aria-hidden style={{ color: T.gold }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search the Library — components, past events, blueprints…"
            className="flex-1 text-[14px] outline-none placeholder:text-slate-300"
            style={{ color: T.ink }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {res.idle && (
            // "Type to search" and "no results" are DIFFERENT FACTS. Collapsing
            // them into one empty state tells the user the Library is empty.
            <p className="px-3 py-6 text-[13px] text-center text-slate-400">
              Search everything this business has done before.
            </p>
          )}
          {!res.idle && busy && <p className="px-3 py-6 text-[13px] text-center text-slate-400">Searching…</p>}
          {!res.idle && !busy && resultCount(res) === 0 && (
            <p className="px-3 py-6 text-[13px] text-center text-slate-400">
              Nothing found for “{q}”.
            </p>
          )}
          <Group kind="component" items={res.components} from={0} />
          <Group kind="event" items={res.events} from={res.components.length} />
          <Group kind="blueprint" items={res.blueprints} from={res.components.length + res.events.length} />
        </div>

        <div className="px-3 py-1.5 border-t text-[10px] text-slate-400 flex gap-3" style={{ borderColor: T.rule }}>
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
