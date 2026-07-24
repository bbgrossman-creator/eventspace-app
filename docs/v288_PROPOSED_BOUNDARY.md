# EventCore v288 — Proposed Boundary
## The first real consumer of `feed.ts`

**Status.** Proposal for ruling. No implementation begun. Constitution,
Product Architecture 1.0, Application Shell 1.0 and the Projection Architecture
all frozen and not reopened.

**The constraint that shapes everything below:** v287c certified a client with
**zero consumers**. Until a real surface consumes it against live SQL, the
projection layer is proven in isolation but unproven in practice. v288's job is
to close that gap once — on the narrowest surface that can prove it — not to
migrate the application.

---

## 1 · Sequencing rulings, applied

| Ruling | How v288 honours it |
|---|---|
| First Responsibility UI must be the first real consumer of `feed.ts` | v288 builds **one** surface, sourced **exclusively** from `feed.ts`. It may not import `execution/spine.ts`. |
| Keep `event_workspace` until `projection_event_command` equivalence is certified | v288 does not touch `event_workspace`, `spine.ts`, or any `execution/` component. Equivalence is v289. |
| Do not mechanically migrate components before semantic equivalence | Zero existing components are modified in v288. |
| Migrate/retire legacy consumers incrementally after the first surface is certified | Migration begins at v289, one consumer at a time, each with its own equivalence proof. |

---

## 2 · Which surface — and why not Event Command

**Proposed: Operations Today, read-only.**

The instinct is to build Event Command first, because it maps onto the surface
that already exists. That is exactly why it is the wrong first consumer:
building it invites comparison with `EventWorkspace`, tempts a premature
`spine.ts` migration, and entangles the first consumer with the equivalence
question v289 exists to answer.

Operations Today is the better first consumer on four counts:

1. **It has no incumbent.** No existing screen answers "what is happening
   today across all events." Nothing to compare against, nothing to migrate,
   no equivalence obligation.
2. **It is the widest exercise of the client.** One surface touches bands,
   counts, risk decorations, ownerless completeness, label packs, glyph
   language, grouping and the envelope — more of `feed.ts` than any other
   single screen.
3. **It is the product's declared default landing** (Application Shell §3), so
   the first real surface is also the most valuable one.
4. **Its constitutional risk is the one most worth proving early**: the
   ownerless band. If a production surface can silently shrink the debt list,
   everything downstream inherits that. Better to prove it on the first screen
   than the tenth.

**Deliberately excluded from v288:** Event Command, department queues, day
sheet, mobile, search, ceremony tray, omnibox, any write path.

---

## 3 · The boundary

### In scope
- One route rendering **Operations Today, read-only**, sourced solely from
  `projection_operations_today` via `feed.ts`.
- The five bands as **projection bands**, not client filters: My work,
  Nobody's, At risk, Changed, Events today.
- State glyphs, tones and labels through `state.ts` / `labels.ts`.
- Risk decorations from the envelope's own `risk` array, with event-level
  findings kept visually distinct from row findings.
- Counts rendered from `envelope.counts` — never recounted client-side.
- Honest empty states ("Nothing is ownerless. That's the goal.").
- Shell chrome only insofar as the page needs a frame; **not** the full shell.

### Explicitly out of scope
- **Every write.** No ceremonies, no claim button, no evidence capture, no
  ownership transfer. v288 is a read-only surface; making it writable is v290+.
  A read-only first consumer keeps the certification question narrow: *does the
  projection layer render truthfully?*
- Any change to `spine.ts`, `event_workspace`, or the eight `execution/`
  components.
- Any change to `OpsWorkspace` / `TodoPanel` (BOUNDARY-1 stands: they must not
  become storage or completion surfaces for projected responsibilities).
- Any SQL change. If v288 exposes a genuine projection defect, it stops and
  reports rather than patching v287a/v287b.

---

## 4 · Certification obligations

Existing floors carried forward: SQL 421/0, browser 246/0 across 25 certified
runners, four tsc configs plus `deploycheck` clean, residue zero,
`accept-regression` quarantine unchanged.

New, and this is the part that matters — **v288 must prove end to end what
v287c could only prove in fixtures**:

| Claim | Proves |
|---|---|
| **UI-1 · Live end-to-end** | The mounted surface renders from the **real** `projection_operations_today` against real SQL, not fixtures. This is the gap v287c explicitly left open. |
| **UI-2 · Ownerless completeness on a production surface** | Rows rendered in the Nobody's band ≡ `feed({"unowned":true})` for the same `as_of`. The debt list cannot shrink between SQL and screen. |
| **UI-3 · No client-side state** | Every state rendered equals the state in the envelope; no derivation anywhere in the component tree. |
| **UI-4 · No membership re-filtering** | Rendered membership ≡ `envelope.data.responsibilities`; presentation controls change order and grouping only. |
| **UI-5 · Counts ≡ contents on screen** | Rendered headline numbers equal `envelope.counts` and equal what is displayed. |
| **UI-6 · Read-only** | Zero ceremony calls and zero writes originate from the surface (evidence-ledger fingerprint unchanged across a full interaction sweep). |
| **UI-7 · Label pack** | Swapping the pack changes every word and nothing else — order, membership and states identical. |
| **UI-8 · Refusal rendering** | A projection refusal renders honestly as a refusal; the surface never falls back to a stale or invented view. |

UI-2 is the one I would gate the slice on. It is the constitutional promise
most easily broken by ordinary UI work, and the first production surface is
where that promise either becomes real or quietly stops being true.

---

## 5 · Then what

- **v289 · Equivalence.** Certify `projection_event_command` against
  `event_workspace` — same event, same clock, semantically equivalent
  membership and state — then migrate `EventWorkspace.tsx` and resolve
  **DEBT-1** (evidence kind from the projected available action or ceremony
  contract, not from `c.state`) and **DEBT-2** (v275 vocabulary out of the
  client) as part of that migration, not after it.
- **v290+ · Incremental retirement.** One legacy consumer at a time, each with
  its own equivalence proof. `event_workspace` retires only when its last
  consumer is certified on the new shape.
- **Later.** Writes and ceremonies on the surface; department queues; day
  sheet; mobile; search.

---

## 6 · Open questions for ruling before implementation

1. **Route placement.** A new `/today` route, or Operations Today mounted
   behind an existing route? A new route keeps v288 isolated from the current
   navigation and avoids touching the Sidebar; I recommend it.
2. **Viewer identity.** `projection_operations_today` takes `p_viewer` as
   context. Does v288 read it from the session, or accept it as a parameter
   until an identity story exists? I recommend a parameter, so v288 does not
   quietly acquire an auth dependency.
3. **`since` for the Changed band.** No `since` means the band is empty. Does
   v288 persist a last-viewed marker (a small write, contradicting §3), or
   accept `since` as a parameter and leave persistence to v290+? I recommend
   the latter — it keeps the surface strictly read-only.
4. **Shell scope.** How much of the frozen Application Shell chrome should
   v288 render? I recommend the minimum that makes the page legible, with the
   full shell (rail, omnibox, ceremony tray) as its own later slice — the
   ceremony tray in particular implies writes.

---

**No implementation has begun.** Awaiting the ruling on scope, the four
questions in §6, and confirmation that Operations Today — not Event Command —
is the correct first consumer.
