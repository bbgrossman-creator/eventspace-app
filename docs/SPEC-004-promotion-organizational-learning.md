# SPEC-004 — Promotion & Organizational Learning
**Status: Rev B accepted · v207 shipped the one writing path (`author_definition_revision`, INV-1), the act ledger + artifact junction + citations (READINESS F-1 shape), and the Executive Curation ceremony (Definition view: sectioned, staged-never-silent, note-required, capability-gated). Server proof A-1..A-7 + browser C-1..C-5. v208 shipped the Promotion ceremony: evidence loader (read-only by construction, §0a item rules), kind registries (F-4), composeRevision/checkCoherence/aggregateEvidence (22 unit), the PromotionReview surface (P-1..P-7), both entries (facet "Promote…" + Definition view "Review divergence across events"), and the server proof B-1..B-3 — including B-2, THE GOLDBERG STILLNESS, on real Postgres. No new SQL in v208. v209 shipped layers-through-the-one-path (p_layers activates in the SAME signature; per-layer supersession races; layer-only acts with p_data null — READINESS F-2 proven by L-2b; artifacts kind='layer_revision'), the framing question (defaults vs named scheme — S-1: same lines, different documents, never both), deliberate option-formalization in-act (S-2), and review sessions as provenance annotations (S-1 server: one key, three acts, zero transactions). Proofs L-1..L-3/S-1 on Postgres; P-1..P-7 + S-1..S-3 in Chromium; layer stillness proven. v210 shipped the back-reference (IMPLEMENTATION-004's final slice): the instance-side context line rendered in the divergence panel — current divergence keys matched against `promotion_citations` newer than the frozen baseline, pure client derivation (`backReference.ts`), read-only by construction (no write path exists for this feature anywhere). Proof R-1a..R-1d in real Chromium: the line appears only for promoted keys newer than the baseline, links to the act's note, disappears when the change is reverted (the diff wins over history, per SPEC-002 §1.5), and its absence changes nothing — diff lines byte-identical and zero writes with or without acts. **SPEC-004 is complete: all IMPLEMENTATION-004 slices (v207–v210) shipped.****

**Rev B changes:** promotion and instantiation are cousins, not inverses (§2); the model now names TWO acts that change organizational knowledge — evidence-backed Promotion and policy-backed Executive Curation (§2a) — correcting Rev A's over-fit to the bottom-up flow; one-promotion-one-definition adopted as a constitutional boundary, with review sessions as a grouping, not a transaction (§6a); "curation never invents a new place to put knowledge" elevated to a first-class operating principle, generalized to both acts (§10); new §9a on when divergence becomes organizational learning — the philosophy, not the mechanics.

---

## 0. The question this document answers

How does an organization deliberately turn instance knowledge into reusable
organizational knowledge — without ever losing history, and without ever
confusing evidence with curation?

Everything below is a walk through one concrete story, then the rules the
story reveals.

---

## 1. The story: Sushi Station, Definition v18, and the Goldberg Wedding

The company's Sushi Station definition is at revision v18. Its defaults:
attended service, black slate presentation, ginger on every board, standard
staffing of one attendant.

Over several months a caterer builds Sushi Stations for real events. Each
instantiation stamps v18 as its frozen baseline (SPEC-002 Rev E). Each event
diverges a little: one goes acrylic, one goes live chef, most leave it alone.

Then the **Goldberg Wedding**. The operator:

- adds **Dragon Roll** to the menu;
- switches presentation to **Acrylic Display**;
- **removes Ginger** ("nobody eats it, it wilts under the lights");
- changes staffing from one attendant to **one chef + one runner**, noting in
  the kitchen annotation: *"runner keeps the boats moving; chef never leaves
  the board."*

The wedding happens. It goes brilliantly. The event completes and becomes
evidence: its configuration, its moves, its baseline (v18), and its
divergence are frozen facts about August 2026.

Six months later, reviewing the season, the owner realizes: *the Goldberg
setup is how we build Sushi Stations now.* Three other events independently
drifted toward acrylic. Dragon Roll outsold everything. Nobody has served
the ginger since.

That realization is not yet knowledge. It is a private observation living in
one person's head and scattered across nine events' divergence records.
**Promotion is the ceremony that turns it into knowledge.**

---

## 2. What "Promote" actually means

**Promotion is the deliberate, attributed act of declaring that specific
knowledge learned inside operational work now represents how the
organization builds this component going forward.**

Unpacking each word:

- **Deliberate** — a human decides, line by line. Nothing promotes itself.
  Frequency across events is *evidence shown to the human*, never a vote
  that acts on its own.
- **Attributed** — the promotion records who declared it, when, and from
  which events' evidence. It is signed work, like every other act in the
  system.
- **Specific knowledge** — individual divergence lines, not "the Goldberg
  configuration" wholesale. The operator promotes *acrylic display* and
  *remove ginger*; they do not promote *the Goldbergs' 250 guests*.
- **Going forward** — promotion changes only the future. Every existing
  event keeps its frozen baseline, its divergence, and its truth. The
  Goldberg Wedding reads identically the day before and the day after the
  promotion that it inspired.

Promotion is the return edge of the Knowledge Cycle (VISION §Knowledge
Cycle): work produces knowledge, knowledge seeds work.

Rev A called promotion "the inverse ceremony of instantiation." Review
rejected the phrase, and the rejection is correct — the two acts cross the
same boundary in opposite directions, but they are **different kinds of
act**:

- **Instantiation copies.** It is deterministic: same definition revision in,
  same seeded instance out, every time, no judgment anywhere in the path.
  That determinism is why a stamp is meaningful.
- **Promotion judges.** It is editorial: a person reads evidence, selects,
  translates, and signs. Two curators facing the same nine events may author
  different revisions, and both are legitimate.

They are **cousins, not inverses** — one is a copy ceremony, the other an
editorial ceremony, and the boundary between definition and instance is
never blurred by either. The asymmetry is itself constitutional: knowledge
flows *down* mechanically and *up* deliberately, which is exactly the
difference between seeding work and learning from it.

## 2a. The second act: Executive Curation

Rev A modeled only one way organizational knowledge changes — upward from
evidence. Review named the case that breaks it: the owner sits down before
the season and decides, *"We're no longer serving ginger."* No event, no
divergence, no evidence. A policy.

Requiring an event to exist first would be absurd — and the system has
already committed to the other answer: the Sushi Station curation seed
(v205) IS this act. An owner-authored revision, `created-by: authored`,
citing no instance. Rev A's model failed to name an act the product had
already performed.

So the model is two acts, not one:

```
   OPERATIONAL LEARNING                 EXECUTIVE CURATION
   (evidence-backed)                    (policy-backed)

   Event(s)                             Owner / curator
      │  divergence, read as evidence      │  decision, stated as policy
      ▼                                    ▼
   PROMOTION ──────────▶ new revision ◀────────── CURATION
      cites: events, lines,                cites: the decision, the note,
      frequencies, baselines               the author — and nothing else
```

**What the two acts share** — everything constitutional: both are deliberate,
signed, staged-never-silent; both author complete revision documents; both
supersede rather than edit; both change only the future; neither touches an
event, a baseline, or a divergence. The ceremony surface is even mostly the
same — executive curation is the same authoring flow with the evidence panel
empty, because there is no evidence to show.

**What distinguishes them is the citation.** A promotion's provenance points
at instances: these lines, from these events, with these baselines. An
executive curation's provenance points at a decision: this person, this
date, this stated reason. The revision record carries which kind of act
produced it, so the chain in §8 always answers "why does v19 say acrylic?"
with either *"the Goldberg Wedding taught us"* or *"ownership decided"* —
and never with silence.

**Mixed reality, handled honestly:** most real decisions are neither pure.
The owner who kills ginger has *seen* the wilting boards, even if no
divergence line says so. The distinction the system records is not "was the
curator influenced by reality" (always yes, hopefully) but "does this
revision formally cite instance evidence." If the curator opens the review,
reads the Goldberg lines, and selects them — that is promotion. If they
author the change directly and write the why in the note — that is
curation. Both notes can mention anything; only citations are structural.

---

## 3. What is promoted

Everything promotable is something the definition already owns a home for.
Promotion never invents a new place to put knowledge; it revises the places
that exist.

| Instance knowledge | Where it lands in the definition | Goldberg example |
|---|---|---|
| **Choices** (dimension values) | `instanceDefaults.choices` | presentation → acrylic becomes the new default |
| **Scalars & derivations** | `instanceDefaults.scalars` — as *derivations*, rarely as raw values | "8 pieces per person held at every event" may revise the house standard; "the Goldbergs wanted 250 guests" never does |
| **Menu items** (selections) | `defaultItems` | Dragon Roll added; Ginger removed |
| **Schemes** | `schemes` — new scheme, or revision of one | the Goldberg combination could *instead* be promoted as a new "Modern Display" scheme rather than as the default — the ceremony offers both framings |
| **Layer content** (staffing, kitchen prep, warehouse pack) | the corresponding **definition layer**, as a new layer revision | chef + runner staffing becomes the kitchen/staffing layer's new content |
| **Dimensions & option sets** | `dimensions` | if the operator invented an ad-hoc substitution repeatedly, the ceremony can propose formalizing it as an option |
| **Annotations** | **only by human rewriting** into definition content (e.g., layer prep notes) | *"runner keeps the boats moving"* is shown to the curator, who may author it into the staffing layer's notes — it is never copied automatically, because annotations are written in an event's voice about an event's circumstances |

## 4. What is never promoted

- **Event facts.** Guest counts, dates, client names, venue constraints,
  agreed prices. The Goldbergs' 250 guests is knowledge about the Goldbergs.
- **Circumstantial overrides.** A scalar override whose derivation still
  stands ("suggested 240, they wanted 300") is an exception, not a lesson.
  The ceremony shows overrides with their derivations so the curator can
  tell a new standard from an old exception.
- **Situational suppressions.** "Handwash struck — venue had one" is about
  the venue. A suppression is promotable only as a *rule change* (see §10,
  deferred), never as a default-off requirement.
- **The moves log.** Moves are evidence of how an event was shaped. They are
  read during review; they are never replayed into a definition (§9).
- **Baselines and provenance.** These belong to instances forever. A
  promotion cites them; it cannot consume, move, or edit them.
- **Anything from the instance that the definition has no home for.**
  If promotion would require inventing a definition field, that is a spec
  change, not a promotion.
- **Pricing policy.** Default item prices ride along inside `defaultItems`
  (they are part of what the item *is* on a fresh event), but pricing rules,
  confirmations, and client agreements belong to the pricing system and
  never travel through promotion.

---

## 5. The operator's workflow: the ceremony

The ceremony is the divergence chip grown up. Everything the operator needs
was already built for daily work; promotion is a new *reading* of it.

**Step 1 — Open the review.** From a component (the Goldberg Sushi Station)
or from the definition itself ("review divergence across events"), the
operator opens the promotion review. The definition-side entry matters: six
months later, nobody remembers which event had the good idea. The
definition's review lists every live-and-completed instance, its baseline
revision, and its divergence summary.

**Step 2 — Read the evidence.** Each divergence line renders exactly as the
chip renders it — business language, versus the *frozen baseline*, with
provenance labels (SPEC-002 Rev E). Beside each line, the cross-event
frequency: *"presentation → acrylic — 7 of 9 events since March."*
*"Dragon Roll added — 4 of 9, all since Goldberg."* *"Guests 180 → 250 —
1 of 9."* Annotations appear as context cards in their different material.
Completed events appear here as readable evidence — **reading evidence is
the entire point of keeping it; writing to it remains forbidden.**

**Step 3 — Select, line by line.** Every line is opt-in. Nothing is
pre-checked. The operator checks acrylic, Dragon Roll, remove-Ginger, and
the staffing layer change; leaves the guest count and the venue-specific
suppression unchecked. For each checked line the ceremony shows *where it
will land* (§3's table, made visible): "this becomes the default
presentation," "this adds to default items," "this revises the staffing
layer."

**Step 4 — Coherence check.** Before staging, the ceremony validates the
*combination*: a scheme that references a removed item, a default choice
outside its dimension's options, a derivation referencing a deleted scalar.
Incoherent selections are named, not silently repaired.

**Step 5 — Stage the new revision.** The ceremony presents the complete
would-be revision — the full document, not a diff — side by side with v18,
differences highlighted. This mirrors scheme staging: **staged, never
silent**; the confirmation *is* the review.

**Step 6 — Confirm, with attribution.** One confirmation creates definition
revision v19 (and the staffing layer's new revision), superseding their
predecessors. The promotion record — who, when, which lines, from which
events — is written as part of the same act. A note field invites the why:
*"Season review: the Goldberg pattern is our standard now."*

**Step 7 — Nothing else happens.** No event changes. No baseline moves. No
divergence recomputes. The Goldberg Wedding still reads: baseline v18, four
changes. That stillness is the feature.

---

## 6. Conflicts: when events diverged differently

Two events chose acrylic; one chose wood. The Goldberg staffing says chef +
runner; the Stein bar-mitzvah says two attendants.

**Promotion has no merge algorithm, because promotion is not a merge.** It
is an authoring act informed by evidence. The ceremony's job in a conflict
is to make the disagreement *visible* — same semantic key, different values,
each with its event, date, and frequency — and then accept the human's
choice. The unselected alternatives are not lost or overruled: they remain
those events' divergence, forever, and can inform a *different* promotion
later (perhaps wood becomes a "Rustic" scheme).

Two promotions racing on the same definition resolve by the supersession
chain that already governs revisions: the ceremony stages against a specific
live revision; if that revision was superseded while staging, the
confirmation is refused and the ceremony re-opens against the new live
revision. Deliberate, like everything else.

## 6a. One promotion, one definition — a constitutional boundary

The Goldberg Wedding teaches more than sushi: it also taught Cocktail Hour
pacing, a staffing pattern, and a display-equipment lesson. Four
definitions. One promotion producing four revisions, or four promotions?

**Position: one promotion authors revisions for exactly one definition.**
The multi-definition season review is a **session** — a reading of evidence
that spawns several promotions, each staged and confirmed on its own.

The defense rests on precedent and on failure modes:

1. **An act has one subject.** SPEC-002 already establishes the pattern: a
   move batch is scoped to one component; its atomicity, its conflict check,
   and its story are all coherent because the subject is single. A promotion
   is the curation-side act, and it inherits the shape: one definition, one
   supersession check, one staged document, one confirm.
2. **Conflict semantics stay decidable.** Staging races on live revisions
   (§6) resolve per-definition. A four-definition act where two staging
   targets were superseded mid-review has no honest atomic answer: refuse
   all four (punishing unrelated work) or land two (a "partial act," which
   is a contradiction in terms). One-per keeps every confirm total.
3. **Review cognition.** The side-by-side staging (§5 step 5) is readable
   because it is one document against its predecessor. Four side-by-sides
   in one confirm is a place where mistakes hide.

What the session *may* be: a lightweight grouping — the four promotion
records carry a shared review-session annotation ("Season review, Feb
2027"), so the story "one afternoon of reading produced four revisions"
survives in provenance. What the session is *not*: a transaction. Nothing
rolls back across definitions; each promotion stands or is refused alone.

---

## 7. What becomes a new definition revision

**A complete document, not a diff.** Revision v19 is the whole
configuration — dimensions, defaults, schemes, default items — exactly as
v18 was, with the selected changes incorporated. Layer promotions produce
complete new layer revisions the same way. Reasons:

- *One source of truth.* A revision you must reconstruct by folding diffs is
  a synchronization problem wearing a costume (VISION: "there is only one
  thing").
- *Readability.* Definitions participate in the Knowledge Cycle through
  Search; a document is searchable, a patch chain is archaeology.
- *Stamping.* Instantiation copies and stamps one revision. That contract
  stays trivial only if a revision is self-contained.

The *promotion record* is what carries the delta semantics — which lines,
from which events — as provenance attached to the act, not as the revision's
storage format.

---

## 8. The provenance chain, end to end

Every arrow below is a recorded fact; none is inferred:

```
Definition v18 ──(instantiation stamp)──▶ Goldberg instance baseline (frozen copy of v18)
Goldberg baseline ──(operator's moves)──▶ Goldberg configuration (divergence = state vs baseline)
Goldberg divergence + 8 other events ──(promotion: selected lines, actor, date, note)──▶ Promotion record
Promotion record ──(authoring)──▶ Definition v19 (supersedes v18; created-by: promoted; cites promotion)
Definition v19 ──(future instantiation stamps)──▶ every new Sushi Station's baseline
```

Walking it backward answers every audit question the constitution demands:
a February 2027 Sushi Station's acrylic default traces to v19, to the
promotion, to the Goldberg Wedding's divergence, to a move on a Tuesday in
August 2026, made by a named person, against a baseline of v18. **"Used in
42 events" — never "our model thinks so"** (KA §9) now has a curation-side
twin: *"promoted from the Goldberg Wedding" — never "it changed at some
point."*

And forward from the past: the Goldberg instance still stamps v18. Its
divergence chip still shows four changes. If an operator opens it after the
promotion, an informational line may note *"3 of these changes were promoted
into v19"* — context, drawn from the promotion record, changing nothing.

---

## 9. The architectural question: copy, or something else?

**The question:** is promotion fundamentally "copy selected changes into a
new definition revision," or should it be modeled differently?

**The decision: promotion is a first-class recorded act that *authors* a
complete new revision, citing instance evidence.** Mechanically the revision
contains copies of the selected values; architecturally the model is
**author-with-citation**, not copy, and the distinction has consequences.

**The rejected alternative — replay:** the symmetric-looking model says
definitions should accept the move grammar too: promotion selects instance
moves and replays them onto the definition. Rejected, on constitutional
grounds:

1. **It confuses evidence with curation.** Moves are operational evidence —
   instance-scoped, timestamped, carrying instance ids and event context.
   Replaying them onto organizational knowledge makes evidence *executable
   against* curation, precisely the confusion this system is built to
   prevent.
2. **It couples the definition's validity to instance history.** A
   definition reconstructed by replay is only as legible as the move chain
   is replayable — schema drift in the operational vocabulary would silently
   hold organizational knowledge hostage.
3. **Wrong granularity.** The curator's unit of judgment is the divergence
   line ("presentation is acrylic"), a *state* difference; moves are the
   *journey* (chosen, reverted, chosen again). Promotion selects
   destinations, not journeys.

**Why plain "copy" is also the wrong name:** copy implies the instance value
travels unexamined. But §3's table is a *translation*: an instance choice
becomes a default; an instance selection becomes a default item; an
annotation becomes nothing unless a human rewrites it. Some knowledge
changes kind as it crosses the boundary (an ad-hoc substitution may become a
dimension option; a one-event combination may become a scheme). Authoring
names that correctly; the promotion record preserves what copy would have
lost — the *why* and the *from-where*.

**What keeps the two worlds honest:** the definition side needs no move log
because it already has the stronger instrument for its cadence — complete
revisions with supersession, plus promotion records. Instances change many
times a day and need a grammar; definitions change a few times a season and
need a ledger of deliberate acts. Same principles — append-only, attributed,
staged-never-silent — different mechanics, each fitted to its cadence.

## 9a. When does divergence become organizational learning?

Everything above says *how* the conversion happens. Review asked the harder
question: *why should it?* Not thresholds — philosophy.

**The criterion is not frequency, profit, feedback, or pain. Those are
reasons to look. The conversion happens when someone is willing to sign
their name to a different claim** — and the claim changes shape at the
moment of signing:

- A divergence says: *"this was right for that event."*
- A promotion says: *"this will be right for events that do not exist yet,
  for clients we have not met, executed by staff who were not there when we
  learned it — and I am accountable for that."*

Signals point a curator at candidates. Frequency says *look here* (acrylic,
7 of 9). Profit says *look here* (Dragon Roll outsold everything). Pain says
*look here* (the ginger wilts every single time). But none of them can make
the judgment, because the judgment is a causal claim the data cannot state:
**did this work for reasons that transfer?** The Goldbergs loved the acrylic
— was that the acrylic, or the Goldbergs? Ginger wilting under lights
transfers to every event with lights; a couple's taste transfers to nothing.
Distinguishing those is reading, memory, and craft — the things the curator
is *for*.

Three questions a curator is implicitly answering at the confirm, and the
ceremony's note field exists to hold the answers:

1. **Causal:** it worked *because of* something general, not despite it, and
   not because of something particular.
2. **Durable:** it will still be true next season — a lesson, not a trend.
3. **Teachable:** the organization is prepared to make this the thing new
   staff learn as *normal*, and to own the consequences when a client
   wanted the old way.

And the inverse deserves stating, because a naive reading of this spec
optimizes for promotion volume: **divergence that stays divergence is
healthy.** Most exceptions are exceptions; they are the system serving one
client well. A company whose every divergence converges into defaults has
stopped listening to individual events — it has confused learning with
homogenizing. The divergence chip is not a to-do list. The steady state of
a healthy tenant is: many small divergences, few signed promotions, each
one load-bearing.

This section is culture encoded as design, which is why it refuses to be a
threshold. The ceremony makes the signature heavy on purpose: the weight is
the philosophy, enforced by ergonomics.

---

## 10. Operating principles

1. **Promotion changes only the future.** No baseline moves, no divergence
   recomputes, no event is touched. Stillness of history is the acceptance
   test, not a side effect.
2. **Evidence is read, never written.** Completed events are promotion's
   richest source and are opened read-only, always.
3. **Line-by-line, opt-in, nothing pre-checked.** Frequency informs; humans
   decide.
4. **Staged, never silent.** The complete would-be revision is shown before
   it exists; the confirmation is the review.
5. **Every promotion is signed and cited.** Who, when, which lines, from
   which events, and ideally why.
6. **Translation, not transfer.** Knowledge may change kind at the boundary;
   the ceremony shows where each line will land.
7. **Revisions are complete documents.** Deltas live in promotion records,
   not in storage formats.
8. **Conflicts are displayed, not resolved.** The system has no opinion; it
   has evidence.
9. **Curation never invents a new place to put knowledge.** *(Elevated from
   §3 by review; generalized to both acts.)* Promotion and executive
   curation alike may only revise homes the definition already has. A change
   with no home is a spec change — the ceremony refuses gracefully rather
   than invent storage. This is the anti-drift principle: the day a ceremony
   quietly grows a new field is the day truth starts forking.
10. **Two acts, one ledger.** Evidence-backed promotion and policy-backed
   executive curation are distinct acts with distinct citations, producing
   revisions in one supersession chain. Neither impersonates the other:
   a promotion cannot cite nothing; a curation cannot pretend to cite
   events.

## 11. Explicit non-goals

- **No automatic promotion** — no threshold ("promoted after 5 uses"), no
  background job, no suggestion that acts on its own.
- **No merge algorithm** across conflicting divergences.
- **No promotion of consequence rules.** Rules are code, owned by layers
  (SPEC-002 Rev D). A declarative, promotable rules model is a possible
  future spec; pretending rules are data today would fork their truth.
- **No cross-tenant promotion.** Knowledge is tenant knowledge. (A future
  "EventCore library" is a product decision, not this spec.)
- **No editing of past promotions.** A wrong promotion is corrected by a new
  revision — supersession, as always — never by rewriting the record.
- **No demotion ceremony in this spec.** Reverting to v18's behavior is just
  a promotion whose content restores it; the chain records both acts.
- **No AI-suggested promotions in this spec.** The review surface is
  designed so a future intent layer could *draft* a selection, but authority
  and the confirm remain human — and that layer waits, like intent itself.

## 12. Risks

- **Promotion noise.** If promoting is too easy, definitions churn and
  stamped baselines fragment across many revisions — every event comparing
  against a different v-number. Mitigations: the ceremony's weight is a
  feature (it is a season-review instrument, not a daily button); frequency
  display discourages promoting one-offs; the review lists how many live
  events would begin diverging from the new default the moment it lands.
- **Coherence gaps the check misses.** The §5 step-4 validation covers
  structural coherence; *semantic* incoherence (a kids scheme defaulting to
  live chef) is a human problem. Risk accepted; the side-by-side staging is
  the defense.
- **Partial promotion confusion.** Promoting 3 of Goldberg's 4 changes means
  Goldberg still shows divergence afterward — correct, but explainable only
  if the UI says why (the "promoted into v19" context line).
- **The definition-side review's cost.** Cross-event divergence aggregation
  is a real query surface with real performance and real privacy shape
  (staff names in annotations). Flagged for the implementation spec.
- **Provenance chains outliving people.** The chain is only as good as the
  note field people fill in. Cultural risk; the ceremony makes the note
  prominent but cannot make it thoughtful.

## 12a. Implementation invariants — recorded ahead of implementation

This document contains no implementation. One invariant is nevertheless
recorded now, by review order, so it is binding on whichever session
implements SPEC-004:

**INV-1 — One revision-writing path.** Promotion and Executive Curation MUST
share a single revision-authoring path — one function, one validation, one
staging, one supersession check, one coherence check:

```
author_definition_revision(origin = promotion | executive_curation, …)
```

never `promote_revision()` beside `curate_revision()`. **The provenance
differs; the writing path does not.** Origin is a *discriminator validated
per-kind* — `promotion` requires at least one cited divergence line;
`executive_curation` carries no structural citations — but everything
constitutional the two acts share (§2a) is shared *because it is the same
code*, not because two implementations currently agree.

Rationale: two paths that "do the same thing" diverge — silently, one bug
fix and one convenience parameter at a time — until the document's claim
that the acts share constitutional behavior is a claim about the past. The
discriminator makes divergence structurally impossible rather than
procedurally discouraged.

Precedent: this is the curation-side twin of SPEC-002's one-applier rule,
where facet, canvas, and scheme origins all pass through a single
`apply_move_batch` and origin is data. The system already knows this shape;
INV-1 keeps it symmetric across the boundary.

---

## 13. Review questions

1. Should the ceremony support promoting **from multiple events in one
   act** (the season review composes acrylic-from-Goldberg and
   boats-from-Stein into one v19)? Draft position: yes — multi-*source*
   with per-line citations is fine within one definition; it is
   multi-*definition* acts that Rev B forbids (§6a). Note the asymmetry
   is deliberate: many events, one subject.
2. Is "promote as new **scheme**" vs "promote as new **default**" the right
   *first* question the ceremony asks the operator? It changes everything
   about where lines land.
3. Should a promotion be able to **retire** a scheme or dimension option, or
   is removal a separate curation act outside this ceremony?
4. The informational back-reference ("3 of these were promoted") requires
   matching instance divergence lines to promotion records by semantic key
   across time. Is that linkage worth its complexity in v1, or is it a
   follow-up?
5. Layer promotion produces revisions of layers whose *instances* were
   deep-copied and possibly hand-edited. Is layer divergence (instance layer
   vs its `copied_from`) in scope for the same review surface, or a
   second ceremony?
6. Does promotion require a **role/capability** distinct from
   `proposal.configure` — i.e., is curating organizational knowledge a
   different permission than shaping an event? (Draft position: yes — and
   Rev B sharpens it: promotion and executive curation plausibly share one
   capability, since both author organizational knowledge.)
7. *(New, Rev B)* Should executive curation and promotion share one ceremony
   surface (same authoring flow, evidence panel present or empty), or does
   giving curation its own leaner entry point better match the owner's
   "before the season" moment? Draft position: one surface, two entries.
8. *(New, Rev B)* Is the review-session grouping annotation (§6a) worth
   having in v1, or is it premature structure for a story provenance notes
   can already tell?

---

*Constitutional anchors: VISION (Knowledge Cycle; one source of truth;
features discover objects), KNOWLEDGE_ARCHITECTURE §7 (Time), §9
(Explainability), SPEC-001 (definitions permanent, layers revisioned,
instantiation is the only copy path), SPEC-002 Rev B–E (moves are evidence;
baselines are frozen snapshots with named provenance; staged-never-silent).*
