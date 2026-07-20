# STUDIO COMPOSITION — One Living Document
**Status: ADOPTED (v217 built it; v218 gave it craft; v219 added §14). This
document decides how the Studio is composed; it amends no constitutional
text and reopens no settled decision (see §9 on the Live Lens's continuity).
§13's open questions were resolved in the building: (1) the Second Sheet
defaults to Customer; (2) selection travel between sheets stays reserved
with diff ink; (3) both ⌘G and hover open the ghost; (4) the Dial keeps
"Design" as a named lens, and v218's `xrayMode` made x-ray a registry fact —
the modifier renders only where it changes something.**

---

## 0. The Law

**The Paper is the only permanent citizen. Everything else serves it, and
everything that serves it can be dismissed.**

Stated as invariants, because a law that can't be checked is a mood:

1. At rest — no selection, no summons — the screen contains exactly four
   things: the Line, the Paper, the Meter, and the margin ghosts. Nothing
   else renders.
2. Every non-Paper surface has a summon gesture and a dismissal, and `Esc`
   always dismisses the topmost summoned surface. One key retreats.
3. No surface may permanently reduce the Paper's stage. Summoned surfaces
   overlay the stage's margins or descend over it; they never reflow it into
   columns.
4. Turning the dial changes what the Paper **is**. It never opens a second
   surface, never previews, never synchronizes — the Paper itself turns.
5. Parallel attention exists only by request (the Second Sheet, §8), and a
   request produces two whole Papers — never a paper and a sidecar.

The cognitive claim these invariants render: *EventCore is one living event,
read differently by different people. Proposal. Kitchen. Warehouse.
Staffing. Photography. Finance. The same event, turned.*

---

## 1. The composition at rest

```
┌──────────────────────────────────────────────────────────────────────┐
│ ‹  Goldberg Wedding · Aug 22 · 180 · v3 ●Draft   [ Ask anything ⌘K ] │  ← THE LINE
│                       Send ▸   View as: Proposal ▾  ▣X-ray  ⧉  ⋯    │
├──────────────────────────────────────────────────────────────────────┤
│      ·                                                               │
│      ·      ┌────────────────────────────────────┐          per person│
│      ·      │                                    │             $100  │  ← THE METER
│      ·      │           THE  PAPER               │          Goldberg  │     (floating)
│      ·      │        (reading measure,           │           $18,000  │
│   ghost     │         centered, paper-           │        3 to confirm│
│   ticks     │         shadowed, dominant)        │                    │
│      ·      │                                    │                    │
│      ·      └────────────────────────────────────┘                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

One artifact, centered on a quiet stage. A single line of chrome above it.
Two numbers and a debt line floating at the stage's edge. Faint ticks in the
left margin. That is the whole resting state, in every lens.

---

## 2. The Line

One bar. The current two-bar chrome (StudioShell + the header row) merges
into it; the second bar dies.

**Left — identity.** `‹` back · the identity chip: *title · client · date ·
guest count* with the **version picker** and **flow chip** folded in as its
tail (`v3 ●Draft`), and the lock glyph when read-only. One chip states what
you are holding; it never repeats below (the Paper's own head carries the
customer-facing title, which is a different fact).

**Center — the Ask line.** The v196 Library line, promoted: type to summon
(§7), `⌘K` for the full Shade. Placeholder teaches the verb: *"Ask for
anything — a station, a past event, a blueprint."*

**Right — action and the Dial.**
- **Send ▸** — the one outward action, visually distinct (it is the only
  button on the Line that leaves the building).
- **View as: ▾** — the Dial (§5). Its options are `visibleLenses`, exactly
  as today: the registry decides what may be offered, capability × permission
  gate it, the Line renders whatever comes back and knows the name of no
  lens.
- **▣ X-ray** — the modifier, beside the Dial, per the One-Stage doctrine:
  X-ray is a modifier on every lens, not a lens.
- **⧉** — summon the Second Sheet (§8).
- **⋯ the Desk menu** — the housekeeping that used to be header buttons and
  tabs: *Save as Blueprint · New Version · Notes · Files*. Notes and Files
  open as drawers (§6 family); they were never lenses and stop dressing like
  tabs. The Compare tab dies as a tab and is reborn inside the Second Sheet
  (§8), where comparison actually lives.
- The **obligations chip** (when obligations exist) sits at the Line's far
  right — it is provenance, and provenance belongs in chrome, not in the
  work.

---

## 3. The Paper

The center of gravity. Reading measure (~800px), centered, paper-shadowed,
generous margins, on a stage that breathes. Every lens renders the **whole
Paper** — content, head, and ending composed as a document, not as a feed in
a viewport.

**The Design edition.** The maker's lens is not a workbench beside a
document — it *is* the document, x-ray edition: the same paper the client
receives, with the internals visible. Chapters as moment heads. Components
as the paper's own paragraphs and cards. Inline editing, grips, drop bands,
the landing pulse — the entire v196b/v197 grammar survives verbatim; only
its dress changes from panel-furniture to typography. Hidden items, amber
prices, and drop zones are x-ray ink on the page, never chrome around it.

**Sheet editions.** Kitchen, Warehouse, Staffing, Photography, Finance turn
the whole Paper into their sheet — ProductionSheet already renders this way
and becomes the model: full width of the Paper, structurally read-only,
composed like something you could hand to the person it serves. (SPEC-003
§7 stands: print is a renderer over the same model.)

**The Paper is the navigation.** Moment heads are sticky within the scroll;
every chapter and component is an anchor; the current moment's head carries
a hairline indicating position. Books have navigated hundreds of pages for
centuries on typography alone; the Paper earns the same treatment. Debt is
marked **in the paper** — a gold tick in the margin beside the unconfirmed
thing, where the work actually is — not exiled to a rail.

---

## 4. The margin ghosts (the Outline, subordinated)

The left stage margin carries faint ticks — one per chapter, gold where debt
rolls up. They are the book's thumb index: visible enough to orient, quiet
enough to ignore.

Hovering the margin, or `⌘G`, expands the ghost into a floating outline —
chapters ▸ components, debt dots, click to travel — anchored to the margin,
overlaying the stage, dismissed by `Esc`, click-away, or travel. It is the
same lens-owned projection it always was (a Layout lens will still project
rooms ▸ zones ▸ stations); it has simply lost its column. **Subordinate and
summonable, never co-equal.** The permanent 280px Outline dies.

---

## 5. The Dial

The primary interaction of the Studio. *View as: Proposal ▾* — rotate, and
the same paper becomes the Kitchen. Rotate. Warehouse. Nothing moves,
nothing synchronizes, nothing previews; the Paper turns.

Mechanically it is today's lens bar wearing its true clothes: options from
`visibleLenses`, resolution by the provenance ladder on arrival, empty
lenses rendering their honest emptiness with the blocking reason. The turn
itself is composed — a brief settle (the mockup's easing), the new edition
arriving as a page turned, not a panel swapped. The turn is render state;
the lens preference persists exactly as it does today (rung 6), and nothing
else does.

---

## 6. The Inspector Drawer

Selection is interrogation, and interrogation summons the drawer: click an
object on the Design paper and the Inspector slides over the **right stage
margin** — ~400px, overlaying the margin, the Paper unmoved beneath it.
Everything the Inspector owns today it owns tomorrow: the selection's truth,
price with its memory and evidence, the Configure facet, promotion
back-references, the confirm act.

Dismissal: `Esc`, click-away onto the Paper, or deselect — returning to
composition *is* the dismissal, because closed-drawer-with-selection is not
a state; the drawer and the selection live and die together. No pinning:
parallel attention is by request (§8), and the request for the selection's
truth is the click itself, which costs nothing to repeat.

Notes and Files (from the Desk menu) are siblings in the same drawer family:
same edge, same physics, same `Esc`.

---

## 7. Knowledge, summoned

Knowledge returns to what its own header never stopped claiming: **browsed
on demand, never resident.** The docked strip dies. Two states replace it:

**The Summon row.** Type into the Ask line and results appear **inline,
directly beneath the Line** — the registry's rails, compressed to their best
hits, with the Paper fully visible beneath. This is the drag surface: card →
paper, the shade of chrome at its thinnest exactly when the gesture needs
the destination visible. `↵` picks the first hit; arrows walk the flattened
rails; every registration's pick/drag/secondary contract (v215/v216) applies
unchanged. *This row is UI_GRAMMAR §12's Ctrl+K citizen — expands in place,
the Canvas stays visible, Esc closes, the workspace never mutated — honored
more literally than the strip ever managed.*

**The Shade.** `⌘K` (or the row's "open the Library") descends the full
Library over the stage: rails in full, room to read, previews, the click
paths. The Shade is for *browsing* — a reference book opened, then closed.
It closes on pick, on `Esc`, never mid-gesture; a drag begun from the Shade
collapses it to the Summon row so the Paper is visible for the drop (closes
into the gesture, never against it).

The Landing Decision, the chapter-ask, Promotion, and the Definition view
remain exactly the ceremonies they are — summoned by an act, committing
nothing until chosen, dismissed when done. They already obey the Law.

---

## 8. The Second Sheet — simultaneity by request

`⧉` splits the stage into **two complete Papers**, side by side, each with
its own small dial. Both are projections of the one graph; nothing
synchronizes them because there is nothing to synchronize — the v213 proof,
now told at full dignity instead of in a gutter.

Two axes, one surface:
- **Lens axis** — this version, turned differently: Design beside Proposal
  (the maker watching what the client receives — the Live Lens's job,
  promoted to a whole paper), Design beside Kitchen, anything beside
  anything the registry offers.
- **Version axis** — another version through the same lens: v2 beside v3.
  The Compare tab folds in here and dies as a tab; comparison was always a
  two-paper act. (Diff ink on the papers — what changed, marked in x-ray
  style — is reserved as the surface's natural deepening, not part of this
  composition's first statement.)

The split is render state, never persisted. `⧉` again, or `Esc` with
nothing else summoned, returns to one Paper. Below a sane width the Second
Sheet declines to split and says so — two cramped papers would be the
sidecar again with extra steps.

---

## 9. The Live Lens's continuity (a settled decision, kept)

*"Preview is replaced by the Live Lens"* stands. Nothing here resurrects the
Preview link, and the live projection — a second, continuously true reading
of the same graph — survives intact. What changes is **residency**: the
permanent right-side panel, which was the scaffold that proved the pipeline,
retires with honors, and its machinery — the registry-driven switcher, the
region's structural read-only claims, the projection mounts — becomes the
Second Sheet's frame. The scaffold's engineering is preserved; the
scaffold's residency ends. This is a composition change under the standing
decision, not a reversal of it.

---

## 10. The Meter

Fixed, floating at the right stage edge, aligned to the stage: *per person ·
total · N to confirm* (the debt line in gold when nonzero; clicking it
travels to the first unresolved thing — navigation through the Paper, as
always). Derived from the canonical totals; the meter never lies, because it
cannot — it stores nothing. At narrow widths it docks statically beneath the
Line. It replaces the totals-and-debt duties the shell and the old right
region carried, in two lines of floating type instead of a panel.

---

## 11. Disposition of every current organ

| Today | Tomorrow |
|---|---|
| StudioShell two-bar chrome | **The Line** — one bar (§2) |
| Lens bar | **The Dial** on the Line (§5) — same registry, same gates |
| X-ray toggle | Modifier beside the Dial — unchanged doctrine |
| Docked Knowledge strip | **Dies.** Summon row + Shade (§7) |
| Outline column (280px) | **Dies.** Margin ghosts + summoned outline (§4) |
| Canvas / DesignStage | **The Paper**, Design edition (§3) — grammar verbatim, dress recomposed |
| Right region (Inspector dock) | **Inspector Drawer**, summoned by selection (§6) |
| Right region (Live Lens panel + switcher) | **Second Sheet** (§8) — machinery survives, residency ends |
| Customer-lens Inspector column | Drawer, same as Design (§6) |
| ProductionSheet in the Stage | The Paper, Kitchen edition — already the model citizen |
| Header tabs: build | The resting state — no tab needed |
| Header tab: compare | **Second Sheet**, version axis (§8) |
| Header tabs: notes · files | Drawers via the Desk menu (§2, §6) |
| Save as Blueprint · New Version | The Desk menu (§2) |
| Totals / debt count in chrome | **The Meter** (§10) |
| Obligations chip | The Line, far right (§2) |
| Landing Decision · Promotion · Definition · chapter-ask | Unchanged ceremonies, restyled to the paper's language |
| Toast / errors | Toast, bottom-center, with Undo where a move permits |

**Reserved, deliberately not in this composition's first statement:** the
Shelf ("parked, not placed" — the bottom edge is kept clear for it; it needs
its own small design for what parking *is* in the model); diff ink on the
Second Sheet; the Stein suggestion card and the score/timeline view (already
reserved); whispers as proactive surfaces.

---

## 12. The attention model, stated once

Sequential by default: one Paper, fully attended, turned when another view
is needed. Parallel by request: the Second Sheet, two whole papers, one
keystroke to enter and one to leave. Interrogation on demand: the drawer
lives exactly as long as the question. Knowledge on demand: summoned, used,
gone. Nothing resident that isn't the work.

That is the product identity, rendered: **not software for editing
proposals — one living event, read differently by different people. The
same event. Turned.**

---

## 13. Open questions before adoption

1. **The Second Sheet's default.** When `⧉` is pressed from Design with no
   prior choice: Proposal beside it (the Live Lens instinct), or ask? I lean
   Proposal — the maker-watching-the-artifact pairing is the one that
   earned the feature — with the small dial right there to change it.
2. **Selection travel between sheets.** In the Second Sheet, does clicking
   the second paper's rendering select the underlying object on the first
   (Outline/Stage identity discipline says it could)? I lean *yes, later* —
   reserved with diff ink.
3. **`⌘G` vs margin-hover only** for the outline ghost — both, or is the
   hover enough? I lean both; keyboards deserve the same door.
4. **The Design edition's name on the Dial.** "Design" (today's registry
   label) or the mockup's instinct where the maker's view is simply the
   Proposal with X-ray on? The registry says they are two lenses (they gate
   differently); the Dial should keep saying so. Confirm.

---

## 14. The Advertising Rule (v219)

**Creation mirrors the hierarchy: every node advertises what children it can
create, and every object advertises how it can be removed.**

The rule exists because its absence teaches a lie. When the only creation
affordance on the paper was "+ component", the UI taught *everything is a
component* — and the first real user immediately created "Dinner" as a
station because the truth (Dinner is a MOMENT) had no door. A missing
affordance is not a smaller UI; it is a false statement about the model.

The rungs, each advertised at its own level, each hidden when read-only:

| Node | Advertises |
|---|---|
| The Proposal (the paper) | **＋ moment** — after the last moment, and in the empty state |
| A moment (its head, on hover) | **⋯** → move earlier · move later · **remove** (populated moments confirm, and say what the removal takes with them) |
| A moment | **＋ component** (pre-existing) |
| A component / category | **＋ item** (pre-existing) |
| Any selected object (its Drawer) | **Remove…** — in its context surface, through its constitutional path (component removal deletes from this version; item removal is SPEC-002 §1.3's recorded deselect) |

Corollaries: the ceremony belongs to the HOST (the Stage and the Drawer
advertise and report; confirms and cascade-honesty live with the data);
already-present moment types are absent from the picker, not disabled — an
offer the version already holds is a duplicate-in-waiting; and new moment
types may be coined at the point of need, because the vocabulary belongs to
the caterer, not the seed data.
