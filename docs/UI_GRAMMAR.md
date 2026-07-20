# UI GRAMMAR

*EventCore · v1.0 · February 2026 · frozen; changes by RFC amendment only · amended February 2026: governing rules expanded; Capabilities, Identity, Truth sections added; grammar table widened to the interaction matrix (per architecture review) · amended July 2026: §2a (the Lens contract) added; §2's lens sentence expanded, not replaced — per AMENDMENT-001, jointly with KNOWLEDGE_ARCHITECTURE §10 (Lenses)*

The interaction language of EventCore. Every surface obeys it; new features are evaluated against it before code is written. Where `KNOWLEDGE_ARCHITECTURE.md` says what things *are*, this document says how they *behave under the hand*.

---

## 1. The governing rules

Three rules, one temperament. Nearly every behavior in this document is a corollary of one of them.

**Show only what the person needs to decide next.**
The Stage withholds context the current decision doesn't need; a drag collapses the Canvas to the decision the drag is asking; the Inspector carries the selection's evidence and nothing else's.

**Complexity is earned.**
The interface reveals additional information only after the current decision requires it. Hidden handles, collapsed categories, lazy Inspector projections, the Library expanding only when summoned, ceremonies appearing only when a decision exists — one philosophy, many surfaces.

**The UI never surprises.**
Every visible change is either the direct consequence of the user's current action or a deliberate response that helps complete it. Focus mode, the anchor correction, edge scrolling, the landing pulse, the Library pane — each is a response to the user's current intention, never the system acting on its own.

## 2. Stage · Inspector · Outline

- **The Stage** shows the design as the current lens presents it. Context — prices' history, costs, margins, configuration — does not sit on the Stage. A salesperson screen-shares the Stage; the field rule protects them.
- **The Inspector** answers "is this right?" for the current selection: price memory (the last three sales — evidence, not opinion), the Confirm ceremony, role-gated cost and margin, lazy projections of requirements/media/usage.
- **The Outline** is the map. It mirrors structure, never duplicates editing.
- **Lenses** (Design, Customer, Production, …) change presentation, never truth. The grammar below is identical in every lens that permits editing. *What a Lens is: `KNOWLEDGE_ARCHITECTURE.md` §10. How every Lens behaves: §2a.*

## 2a. The Lens contract

*Every Lens defined by `KNOWLEDGE_ARCHITECTURE.md` §10 obeys this contract. Expands §2's lens sentence; grounded in VISION ("The design is an object graph"; "Every layer is equally real"; "Features discover objects; they do not own them") and ENGINEERING_PRINCIPLES (derived state; no duplicated truth; grammar grows by declaration). This section defines how any lens behaves; it designs none. Added by AMENDMENT-001.*

**A Lens turns the graph for one kind of work.** Design, Customer, Kitchen, Warehouse, Staffing, Photography, Finance — each presents the same objects for a different job, often to the same person at different moments of the same day. A lens owns its presentation entirely; it owns no objects, no storage, and no truth. Kitchen, Warehouse, and Finance looking at one event are not looking at three records kept in agreement — they are looking at the same record, turned. There is nothing to keep in sync, because there is only one thing.

1. **Projection, never truth.** A lens changes selection, emphasis, organization, computation, and presentation. It never changes what is true, and it never holds a private variant of it. A lens that persists its own version of canonical state — a kitchen quantity that can disagree with the design's quantity — is a duplicated source of truth and is refused at review, whatever it is called.

2. **Withhold, never falsify.** A lens shows only what its work needs (§1); withholding the rest is its job, not a defect — the Customer lens hiding cost *is* the field rule. But a lens may never contradict canonical state, render an edited value as original, present derived content as recorded fact, or redefine a term privately. The line: omission serves the reader; misstatement deceives them.

3. **Computation is free; independent truth is not.** A lens may deterministically derive — totals, rollups, schedules, per-cover breakdowns, timelines — from the canonical objects its registration declares and the person's current subject selects. A derived value never becomes an independent source of truth: it is recomputed from canonical inputs, or, where performance, audit, or historical stillness requires persistence, stored only as a disposable projection or a provenance-bearing snapshot whose derivation and authority are explicit — the frozen baseline is the precedent: a snapshot with named provenance, never a pointer to anything mutable. Properly derived state cannot drift from its inputs; it can still be wrong, which is why derivations show their work (§5). Wherever a lens states a claim about knowledge, the constrained vocabulary (`KNOWLEDGE_ARCHITECTURE.md` §9) applies unchanged.

4. **Lenses read; domain actions write through their authoritative paths.** A lens owns no persistence command and gains no privileged route to storage. A user action initiated from any lens invokes the canonical command or writing path designated by the specification that owns the affected domain — today, the move grammar with its one applier and the one revision-authoring path; future domains supply their own authoritative paths by the same rule. A lens may expose an authorized verb; it may not define a parallel implementation of that verb, call storage directly, or grow a lens-specific service that bypasses the owning domain's invariants — any of these is review-blocking. Which verbs an editing lens speaks is declared by its registration; the grammar of §6–§11 governs them identically in every lens that permits editing (§2, unchanged).

5. **Read-only is visible.** §6's rule, extended to every lens: a lens over an executed event, an unpermissioned object, or a locked version says so on its face. Evidence rendered in an operational lens is readable and visibly non-writable — a silently read-only surface is indistinguishable from a broken one.

6. **Availability is an intersection; rendering is honest.** A lens is available exactly when it is registered, the organization's capabilities allow it (absent, not disabled — §3), and the person's permissions admit them; no term reasons about the others, and enforcement is layered as ever — the UI renders the intersection, the API enforces capability and permission again, because a hidden lens is not a security boundary. Within an available lens, the objects' *actual state* determines what renders: missing content is an explicit, honest empty state — never simulated (`KNOWLEDGE_ARCHITECTURE.md` §4, `layer_badges` truthfulness) — and absence never hides the lens whose job may be precisely to report the absence.

7. **Lenses grow by registration, never by exception.** A lens declares itself — what it projects, which capability gates it, which verbs (if any) it speaks — in the same declarative idiom the platform's other registrations use. Adding a lens must not require editing other lenses, central switch statements, or the surfaces that host lenses. If it does, the abstraction has failed and the failure is fixed first.

8. **Anatomy is per-lens.** Stage · Inspector · Outline (§2) is the anatomy of an *editing* lens — the authoring workspace — not a mandate for every lens. A kitchen sheet, a warehouse schedule, and a finance view organize themselves for their work. What is prescribed for all lenses is this contract; what is prescribed for editing lenses is additionally the grammar.

9. **One graph; no departmental stores.** Kitchen does not own recipes; Warehouse does not own inventory; Photography does not own photos; Finance does not own invoices (VISION: features discover objects, they do not own them). A lens is how a department *sees*; it is never where a department's data *lives*. Historical lenses obey identically: a lens over evidence is a projection of the evidence, not an archive beside it.

10. **A lens presents the current subject; it does not propose additions to it.** Nothing in this section authorizes a lens to retrieve external examples, identify analogues, recommend content, or propose work that is not already part of the person's selected subject or the lens's declared projection. This does **not** prohibit deterministic surfacing of recorded state intrinsic to that subject: unmet requirements, conflicts, deadlines, validation results, suppressed-but-considered items, and obligations are the subject, and rendering them is a lens doing its job. Proactive retrieval from other events or evidence — if it ever exists — is a separate concern requiring its own deliberate act, bound by `KNOWLEDGE_ARCHITECTURE.md` §9 and §11's standing deferrals, which this section leaves exactly where they are.

**Reserved — named, not answered.** Two questions are explicitly reserved and nothing in this section decides them:

- **Tenant-defined lenses.** Whether organizations may define their own lenses is a product and business-model decision of the same category as the cross-tenant library (SPEC-004 non-goal) — reserved for its own deliberate act. Registration is the *mechanism* (clause 7); who may register remains undecided.
- **Lens composition.** Defined narrowly, so the reservation cannot be stretched: composition means coordinating two or more *independently registered lens projections, as projections* — an evening's kitchen, trucks, and floor read against the moments they serve — and **not** merely reading several canonical object or layer types inside one lens. A kitchen lens showing components, recipes, staffing, timing, and equipment is projection, not composition. The constraint any future answer must satisfy: legitimate composition derives from the registered projections and creates no second truth, no private reconciliation, and no bypass of the registrations it composes — anything else is a departmental store wearing a timeline's clothes. Whether composition is a lens capability, a distinct kind, or a feature of specific surfaces is undecided, and no composed lens ships before it is.

## 3. Capabilities

The UI never reasons about subscription tiers. Every surface asks what capabilities are available and renders accordingly; tiers are merely predefined capability sets (`KNOWLEDGE_ARCHITECTURE.md` §10 is canonical).

A hidden capability **removes the feature from the interface** rather than presenting a disabled affordance — a grid of greyed-out buttons is an advertisement, not a workspace. The exception is deliberate discoverability: where showing a capability's existence is intentionally desired (an upgrade surface), it is designed as such, explicitly, never as an accidental disabled control. Layer visibility follows the same rule: a surface renders the intersection of what the object carries and what the tenant's capabilities allow.

## 4. Objects retain identity

Menus, Components, Recipes, Venues, Photos, Blueprints, Collections, and Events are first-class objects. The interface presents them according to their identity rather than flattening them into generic cards: a menu looks like a menu, a photo like a photograph, a recipe like a recipe card, a venue like a place. Identity is legible before a single word is read — it is carried by each kind's registered renderer, not by a theme the Library applies.

## 5. The UI reflects truth

*Evidence: a fact produced by the operation itself* — the word means the same thing on every surface (`VISION.md`, `KNOWLEDGE_ARCHITECTURE.md` §2).

The interface visualizes the underlying model. Presentation never invents relationships, certainty, or importance that the data does not support: no fake popularity, no fabricated confidence, no inferred rankings, no hidden assumptions rendered as fact. All copy about knowledge follows the constrained vocabulary (`KNOWLEDGE_ARCHITECTURE.md` §9): computed facts, past tense, visible numbers; "Verified" only as the record of a human Promote. Buttons name verbs (Use, Preview, Promote, Confirm). Bands name destinations ("Drop item into Sauces"). The badge names the operation. Nothing on any surface claims more certainty than the system has — and anything the system shows can answer *Why?* with inspectable evidence (`KNOWLEDGE_ARCHITECTURE.md` §9).

## 6. Selection and editing

- **Clicking a row selects it.** Selection is the unit of Inspector attention.
- **Inline fields edit normally.** Text fields and selects are never hijacked by drag machinery: pressing and sweeping inside an input selects text, always. (Guaranteed structurally — drag sources never contain inputs.)
- **Read-only is visible.** A locked or unpermissioned version says so; a silently read-only Stage is indistinguishable from a broken one.

## 7. Drag: the physical rules

- **Drag by handle, only.** The ⠿ handle is the sole drag source. It marks exactly the pixels that work — the honest affordance. Rows are not draggable; images are not draggable; cards drag by their handle.
- **Handles are quiet until wanted.** Hidden at rest; revealed by row hover, keyboard focus within the row, or selection. Reveal is immediate (75ms fade). The icon is small; the pointer target is ~24×row px.
- **Categories never show a handle.** Only movable things advertise movement.
- **No edit rights ⇒ no handles.** Not disabled handles — none.
- **Session start is deferred.** The drag session begins one tick after the browser has started the native drag. (Hard-won: a synchronous state change during `dragstart` re-renders the DOM under the source and Chromium cancels the drag. This is the constraint that made every drag work; do not "simplify" it away.)
- **Every drag has a click path.** Anything achievable by dragging is achievable by clicking.

## 8. Drag: what the Canvas does

- **Focus mode.** The Canvas collapses to the simplest representation the decision needs: component in flight → chapter destinations; item in flight → categories, source open, others compact. The collapse is a **render decision, never a stored one** — live state clears when the gesture ends, the user's own expansion was never touched, and there is nothing to restore. If restore logic ever seems necessary, the design has gone wrong.
- **Legality is shown by presence.** Legal gaps carry insertion guides; illegal destinations are refused — not rendered as a faint maybe. Items move within a category (rearrange) or across categories of one component (move, updates `category_key`); never across components. Components move between chapters. Empty chapters and empty categories are explicit, labeled destinations — a destination you can't see is a destination you can't use, including when emptiness comes from filtering.
- **Insertion guides, not boxes.** A band at rest is a 2px hairline at low opacity; on approach it thickens to 3px, turns gold, and surfaces its label as a pill (↳ Drop here). Empty-parent bands keep a faint label at rest — a bare line on an empty parent is undiscoverable.
- **Guide geometry is constant.** Arming changes color, never size. Fixed-height containers; the line is absolutely positioned. *Nothing may shift layout while a drag is in flight* — a drop target that moves when you approach it is a moving target. (Measured failures justify this invariant; treat it as load-bearing.)
- **Dwell to open: 700ms.** Hovering a legal collapsed category for ~700ms opens it. One timer per destination; only a genuine exit cancels it (crossing child elements does not).
- **The cursor labels the verb.** The drag badge names the operation and the object: ↕ Rearrange · Sweet Potato Roll. The person always knows what they're holding.
- **Landing pulse.** The destination acknowledges the drop briefly. Then all flight state is gone.

## 9. Drag: the viewport

- **The anchor.** Starting a drag must not move the user. The source row's screen position is captured before focus-mode collapse and the Canvas scroll is corrected in the same frame the collapse renders — the thing in your hand stays under your hand. During flight the Canvas carries one viewport of bottom slack so the correction always has room; it vanishes with the gesture.
- **Edge auto-scroll.** While a drag is live, 56px zones at the Canvas's top and bottom edges scroll it continuously, speed ramping toward the edge, until the pointer leaves the zone, the boundary is reached, or the drag ends. Only the center Canvas scrolls — never the window, Outline, or Inspector.

## 10. The interaction matrix

The canonical table. New kinds and surfaces add rows; they never add exceptions. Verbs are reachable by drag *and* by click path unless marked otherwise.

| Source | Target | Verb |
|---|---|---|
| Canvas object | Canvas, same parent | **Rearrange** |
| Canvas object | Canvas, new legal parent | **Move** |
| Menu / Blueprint | Canvas | **Instantiate** (whole design; landing decision — never a silent merge) |
| Template chapter | Canvas chapter gaps | **Instantiate** chapter |
| Template component | Canvas chapter gaps | **Instantiate** component |
| Recipe | Component | **Instantiate** into kitchen layer |
| Photo | Component / Item | **Attach** as reference (provenance kept) |
| Photo | Proposal cover | **Set cover** |
| Floor layout | Operations layer | **Apply** |
| Library card | Detail view | **Preview** (click; opening never mutates work) |
| Evidence / live work | Library | **Promote** (ceremony; the only evidence→curated bridge) |
| Collection | Canvas | **Illegal** — open it and use its members |

Invariants over the whole matrix:

- Dragging never edits. Dragging never copies a Canvas object. Instantiation never edits its source.
- **The Library is always additive.** Opening, searching, previewing, and dragging from the Library never mutates the current work until an explicit instantiation decision is completed.
- Legality is declared by the kind (`legalDestinations()`), enforced by the same DropBand machinery everywhere.
- The handle disambiguates: a card's handle drags the object; a thumbnail inside a card drags the photo.

## 11. Confirmation and ceremony

- **Confirm is a decision made with evidence in front of you** — the Inspector shows price memory; confirming is deliberate, not a keystroke side-effect.
- **Destructive or compounding actions get a real decision point**: replacing a draft, landing a full menu on populated work. The request (a drop, a click) opens the decision; nothing commits until chosen.
- **No ceremony without a decision.** An empty Canvas receiving a menu instantiates directly.

## 12. Keyboard and access

- `Ctrl+K` — Library search pane (expands in place; the Canvas stays visible; `Esc` closes; the workspace is never mutated by opening it).
- Focus within a row reveals its handle; drag operations remain reachable by click paths for keyboard-only use.
- Escape cancels an in-flight drag; all flight state clears identically to a drop.

## 13. Amendment

This grammar changes only deliberately: a proposed exception is first tested against §1 and §10. If a feature needs an exception, the default assumption is that the feature is mis-designed, not that the grammar is. When the grammar does change, the change is recorded in the header line with its reason. Proposals follow the RFC convention (`VISION.md`, "How these documents are used"): cite the section you implement or amend, or propose the amendment first.
