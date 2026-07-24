# EventCore — Operational Lenses & Context Views · Constitutional Review

**Scope.** Architectural review only. No SQL, no implementation plans, no
milestones, no UI design. Accepted and not reopened: PL-1…PL-4, v263–v279, Booking
Constitutional Addendum (A–H, I-48…I-54), Work Architecture (Section J,
I-55…I-62), Organizational Workflows (Section K, I-63…I-69).

**Mandate honored.** The request explicitly asks that the proposal not be assumed
correct, and that over-modeling be named if found. This review finds both: the
proposal is **falsified as a constitutional layer** and **vindicated as a
requirement** — and it contains one genuine discovery that becomes the only
amendment.

**Grounding.** Verified in the repository during review: the v277 workspace is
keyed to `public.event` (it exists only post-release); existing provenance law
(J-2, K-5, I-66) mandates scope and cause references but *not* the engagement
reference; the external customer boundary is the sealed offer (v265), which never
exposes the work projection.

---

## 1 · The verdict, stated first

**Context is not a missing constitutional concept, and the constitutional model is
complete.** What the proposal calls Context is the *name of a filter dimension*,
and the constitution already contains the machinery that makes every proposed
context lawful: the one-projection law (K-4), the provenance law (K-5), and the
layering with its configuration plane (K-7). The capability the proposal demands —
the same work item appearing simultaneously in a kitchen view, a personal queue,
an engagement view, and an executive dashboard, without duplication or competing
truth — is not something a Context layer would *add*; it is something existing law
already *guarantees*.

The proposal does, however, contain one genuine discovery, visible only once the
layer is stripped away: **work-item provenance is incomplete.** J-2/K-5/I-66
require the originating scope and cause references — but not the *engagement*. The
engagement-centric view ("Goldberg Wedding — everything that still needs to
happen") is the one proposed context that current provenance cannot key directly.
That is the single amendment this review recommends. Everything else is
presentation vocabulary.

---

## 2 · Why Context fails the test for constitutional rank

Every constitutional concept adopted so far passes a **closure test**: it is a
closed, rank-stable set whose members are law. Four domains — closed. Two kinds of
Work Scope — closed. Three projection kinds — closed. Two kinds of work (derived
vs authored) — closed.

Now apply the test to Context. The proposal names four: Person, Scope, Event,
Organization. But the set does not close. "Show me everything happening
**Saturday**" is a date lens — as natural to a caterer as any of the four. "What
is on **truck two**" is a resource lens. "Everything for **the Goldberg family**
across their three engagements" is an account lens. A room lens, a week lens, a
supervisor's team lens — each exactly as legitimate, each organizing the identical
work projection, none creating truth. An open-ended set whose members are all
equally lawful is not a constitutional rank; it is **presentation vocabulary**. If
Context were adopted as a layer with four members, the constitution would need
amending every time an operator wanted to pivot the queue by a new dimension —
which is the definition of over-modeling: law where configuration belongs.

The proposal's own Observation 3 table proves the collapse. In every row, "Context"
is the *type of the filter key* and "Filter" is the *value*: (Scope, Kitchen),
(Person, Ben), (Event, Goldberg), (Organization, ∅). Two columns, one concept —
a **dimension–value pair**. K-4 already describes the three shipped views in
exactly these terms ("standard filters: scope; responsibility;
all-grouped-by-scope"). The fourth is a filter too, once its dimension is carried
(§4).

---

## 3 · Where a Context layer would do damage

The request asked for contradictions if the concept over-reaches. There are four,
and they are the reasons to keep lenses out of the derivation stack:

**3.1 · Lens-aware derivation.** Observation 7 inserts "Presentation Context"
*between* the projections and presentation. A layer positioned there invites each
context to derive differently — a Goldberg workspace computing "its own" work, a
kitchen view with kitchen-specific work logic. That is precisely the
parallel-derivation failure K-4 forbids ("if three teams ever build three work
derivations, the model has failed"). Lenses must sit *inside* presentation,
reading the one projection, never beside derivation shaping it.

**3.2 · The wrong key.** The proposed "Event context" is keyed to the wrong
object. The Engagement, not the Event, is the root (A-1) — and the difference is
not naming. Commercial work ("revise the proposal," "collect the deposit") exists
for months before any `event` row exists, because the event is created only by
Operational Release. A lens keyed to the Event would show the Goldberg wedding's
work only after release — silently amputating the entire commercial and
pre-release financial workload that Observation 4 itself lists. The lawful lens is
the **Engagement lens**. (The v277 Event Workspace remains exactly what it is: the
*operational-state* composition for one released event — the engagement lens's
post-release operational pane, not its replacement.)

**3.3 · The customer is not a lens.** Observation 4 includes "Customer: Proposal"
among the participants viewing the engagement. That participant must be excluded
from this model entirely. External parties observe **sealed commercial artifacts**
under the offer/publish boundary (v265, PL law) — never the work projection, never
capability, never internal state. Admitting "Customer" as a context lens over work
would smuggle an external party inside the tenant's operational surface, breaching
the hardest boundary in the system. The customer's view is governed by commercial
presentation law and stops there.

**3.4 · Ossified presentation.** Covered by the closure test (§2): a constitutional
Context set freezes exactly the thing that should stay fluid. The constitution's
job is to guarantee that *any* lens is safe; enumerating lenses is configuration's
job.

---

## 4 · What actually makes every lens lawful: provenance

Strip the layer away and ask what a lens mechanically requires: the work item must
**carry the dimension being pivoted on**, or the dimension must be **applied by
configuration at read time**. That is the whole theory of lenses, and the
constitution nearly has it already:

- **Scope lens** — the item carries its originating Work Scope (K-5). ✔
- **Person lens** — responsibility mapping applied at read (J-7, K-4). ✔
- **Organization lens** — no filter, grouped by carried scope (K-4, K-6). ✔
- **Engagement lens** — requires the item to carry its engagement reference. ✖
  Today this is only *indirectly* derivable by chasing cause references back to
  facts that attach to the engagement — a derivation-time join that provenance law
  should make explicit instead.
- **Date / resource / account lenses** — derivable from cause references and
  carried facts as needed; lawful under the same rule.

Hence the one amendment: **the engagement reference joins mandatory work-item
provenance** (where one exists — internal, engagement-less work such as the
deferred v284 internal projects still carries scope and surfaces through scope and
executive lenses). With that single addition, every context the proposal names —
and every context it did not think to name — is a filter over carried provenance
or applied configuration. The proposal's deepest observation turns out to be:
*provenance is the context system.* One work item, complete provenance, any lens.

---

## 5 · Answers to the ten questions

1. **Event as a first-class Context Lens?** As a *lens*, yes — but keyed to the
   **Engagement**, not the Event (§3.2), and "lens" is presentation vocabulary,
   not a constitutional object. The constitutional change it requires is the
   provenance amendment, nothing more.
2. **Person as a first-class Context Lens?** It already exists as the
   responsibility filter (K-4/J-7). Nothing new is created by renaming it.
3. **Executive as a first-class Context Lens?** Already exists (K-4/K-6). No.
4. **Context formally distinguished from Work Scope?** The *distinction* is real
   and worth one sentence of law: **Scope is where work originates and belongs;
   a lens is the dimension by which work is viewed.** Kitchen is a scope and also
   a lens dimension; Goldberg and Ben are lens values and not scopes. But the
   distinction lives in presentation law, not as a new rank.
5. **Scope = origin, Context = viewing?** Yes — and the mechanism that makes
   viewing possible is provenance. A lens can only pivot on what the item carries
   or what configuration applies.
6. **One work item in multiple contexts simultaneously?** Already lawful and
   already guaranteed: one derivation (K-4), deterministic identity (I-56), so the
   "same item" in four views *is* the same item — no duplication, no reconciliation
   problem, no competing work. A lens creates nothing.
7. **Presentation described as Projection / Context / Filter / Rendering?**
   Over-modeling as constitutional structure. Context and Filter collapse into a
   dimension–value pair (§2). The lawful description is one sentence: *a
   presentation is a lens — one or more dimension–value selections, a grouping,
   and a template — over the derived projections.* It belongs in the configuration
   plane (K-7) beside templates and thresholds.
8. **Constitutional or purely implementation?** Between, and precisely: "lens"
   enters the constitutional *vocabulary* with a short law guaranteeing lens
   safety (§6) — but there is no Context layer, no closed context set, and no new
   rank. The lenses themselves are configuration.
9. **Does recognizing Context complete the scalability model?** The scalability
   model was already complete at I-69 — no constitutional object can express a
   size difference. What lenses add is the *entry-point story*: each person's
   default landing (the one-person caterer's personal queue, the warehouse
   manager's warehouse view, the coordinator's Goldberg view) is a **configured
   default lens** — one more entry in the configuration plane, zero change to the
   engine. Observation 5 is thus fully satisfied without any constitutional
   addition beyond the provenance amendment.
10. **Contradictions introduced?** If adopted as proposed (a constitutional layer
    between derivation and presentation, with a closed four-member set): four —
    lens-aware derivation forking the one projection; the Event-keyed lens
    amputating pre-release work; the customer lens breaching the external
    boundary; and ossified presentation via the open-set problem. Adopted as
    resolved here (vocabulary + provenance amendment + lens law): none.

---

## 6 · Proposed additions — Section L · Lenses (presentation law)

Deliberately short, because the finding is that little is missing:

- **L-1.** A **lens** is a presentation configuration over the derived
  projections: one or more dimension–value selections, a grouping, and a template.
  Lenses live in the configuration plane, are open-ended, and are never
  constitutional objects.
- **L-2.** A lens may pivot only on dimensions carried by work-item provenance or
  applied by configuration at read time. No lens has its own derivation; every
  lens reads the one work projection (K-4) and the state/capability projections
  unchanged. Lens-specific derivation is forbidden.
- **L-3.** *(Amends K-5 / I-66.)* Work-item provenance is: originating Work
  Scope, cause references, and the **engagement reference** where one exists.
  Engagement-less work carries scope and surfaces through scope and executive
  lenses.
- **L-4.** The **engagement lens** is keyed to the Engagement and spans all
  domains, including pre-release commercial, scheduling, and financial work. The
  Event Workspace (v277) is its operational-state counterpart for a released
  event, unchanged.
- **L-5.** Each person's default landing is a configured default lens. This
  extends K-8 and is edition/presentation law.
- **L-6.** External parties are never lens observers. Customer-facing views are
  governed exclusively by commercial presentation law (sealed offers); the work,
  capability, and internal state projections are never exposed across the tenant
  boundary.

Invariants: **I-70** — lenses are presentation-only, open-ended, and derivation-
free; the one-projection law survives every lens. **I-71** — work-item provenance
includes the engagement reference where one exists; provenance is the sole basis
for lens pivoting, and no lens may require stored per-lens state.

Vocabulary law: the concept is the **lens**; "context" may be used informally as
its synonym; the engagement lens is named for the Engagement, never the Event.

---

## 7 · Verdict

The request asked whether Context is the final missing constitutional concept or
whether the model is already complete. **The model is complete.** Context fails
the closure test that every adopted concept passes, and adopting it as a layer
would introduce four avoidable contradictions — most sharply, lens-aware
derivation and the mis-keyed Event lens. What survives falsification is better
than the proposal: the recognition that *provenance is the context system*, one
two-line amendment (the engagement reference joins provenance), a six-line
presentation law that makes every current and future lens safe, and the
entry-point story that finishes the scalability narrative purely in
configuration. The constitution now has nothing left to say about how work is
viewed — which is exactly the condition it should terminate in: facts
authoritative, three projections derived, one work projection, open-ended lenses,
and a configuration plane absorbing every organizational difference from the
one-person caterer to the enterprise.
