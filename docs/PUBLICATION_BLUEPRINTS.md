# PUBLICATION BLUEPRINTS — constitutional specification (FROZEN)

Ratified with Ben's four amendments adopted in full: (1) the governing
question corrected — a blueprint captures reusable DESIGN knowledge,
never commercial offerings; (2) the one-coherent-snapshot law added to
instantiation; (3) publication requires explicit INTENT, not merely
authority; (4) the negative law adopted verbatim — INSTANTIATION SEVERS
ANCESTRY WHILE PRESERVING MEMORY. All six ratification questions
resolved (§16). The slice map BP-1–BP-6 (+ staged extensions BP-7–BP-8)
is LOCKED (§18); no reordering without a constitutional contradiction.
Implementation begins at v251, canon §6.25.

The closed architectural review record (PROPOSAL_WORKSPACE_REVIEW.md,
COMMERCIAL_CONTRACT_REVIEW.md + addenda) is recognized as settled
downstream law. This constitution PREPARES for it and implements none
of it: no Workspace, no Agreement, no envelope, no Operations, no
Execution object is defined or built here. Where a ruling below exists
because the commercial era expects it (the Terms-Blueprint twin, the
approved-snapshot derivation), the expectation is cited and the
boundary held.

Mission sentence: A BLUEPRINT TURNS CURATED AUTHORSHIP INTO
INDEPENDENT EVENT DESIGNS, AND IT NEVER REACHES BACK.

The negative law (every constitution gets one; this is the
Blueprint's): ◆ A BLUEPRINT IS NEVER A LIVE ANCESTOR OF AN EVENT
DESIGN. INSTANTIATION SEVERS ANCESTRY WHILE PRESERVING MEMORY. One
sentence carrying the whole architecture: independence (severed),
provenance (memory), divergence (measured against memory, never
against a living parent), and the impossibility of inheritance (no
ancestor remains alive to inherit from).

---

## 0. Preflight and boundary

**Baseline.** v250, restored and verified at drafting: all 36
inventoried unit suites green; es5 production gate empty; strict gate
empty; tsc baseline 145 lines, all in the allowed noise family. The
renderer is PHASE COMPLETE and UNCHANGED by this constitution — not
one line of src/lib/render/ is touched by anything below. The web
paper keeps its scroll; the print paper keeps its pages; both will
project designs that happen to have been instantiated from blueprints
and neither will know it.

**Known non-canonical artifacts (recorded, not touched).** Three
artifacts travel in the v250 tree outside the canon, inspected and
proven inert at drafting time:

1. `src/lib/__tests__/v194.test.ts` — legacy pre-inventory regression
   suite; dies on a missing supabase env var; absent from the §6
   inventory; zero importers (grep-proven at drafting).
2. `src/lib/__tests__/v248.print.test.ts` — the pre-reconciliation
   draft suite from the v248 incident; asserts the superseded
   provenance mechanism (Keywords + bare-fingerprint Subject) that
   the shipped backend, and the inventoried green v248.pdf suite,
   both contradict; zero importers (grep-proven at drafting).
3. `docs/PUBLICATION.md` — a duplicated amendment block: §6.22–§6.24
   appear twice; the first §6.22 is the stale draft-pass entry
   (cites v248.print, Keywords provenance); the second is the
   reconciled shipped law (v248.pdf · P-36, JSON provenance,
   matching the code). §6.23/§6.24 duplicate identically.

None is modified during constitution drafting. **Their removal is the
FIRST HOUSEKEEPING ACT of v251 implementation**, gated behind an
explicit in-session proof that (a) neither test file appears in the §6
inventory, (b) neither is imported by any file in src/,
browser-tests/, or docs/, and (c) the canon block retained is the one
the shipped code and the green inventoried suite agree with. The proof
runs before the deletion; the deletion lands before any Blueprints
code.

**What this constitution owns.** The governing question:

◆ HOW DOES REUSABLE AUTHORED STRUCTURE BECOME AN INDEPENDENT EVENT
DESIGN WITHOUT DUPLICATING TRUTH, MANUFACTURING CURATION, OR CREATING
A PERMANENT LIVE DEPENDENCY?

Every ruling below exists to answer that question. Duplicating truth
is defeated by the reference-versus-copy matrix (§6). Manufactured
curation is defeated by the promotion ceremony and the barred-content
list (§5, §8) — nothing event-specific becomes organizational
knowledge by existing. Permanent live dependency is defeated by the
instantiation law (§4): independence with provenance, never
inheritance.

**Placement under the governing-question test.** The review record's
closing entry rules that domains own lifecycle questions and
infrastructure serves all. A blueprint answers no question in any
event's lifecycle — not "what will we do?" (the Event Design's), not
"what are we bound to?" (the Agreement's). It answers a COMPANY-level
question — and, by ratified amendment, precisely this one:

◆ HOW DO WE REPEATEDLY DESIGN THIS CLASS OF EVENT?

Not "what do we know how to offer" — that is a catalog's question,
and blurring the two would collapse four distinct kinds of knowledge
into one shelf. The separations, stated so they cannot drift: a
COMPONENT DEFINITION knows how one component is built; a PRODUCT /
COMMERCIAL CATALOG (future, unbuilt, unowned here) would know what
the company sells and for what; an AGREEMENT knows what the company
is bound to; a BLUEPRINT knows how those things COMPOSE into a
reusable design — the authored arrangement, not the inventory of
parts and not the price list. BLUEPRINTS CAPTURE REUSABLE DESIGN
KNOWLEDGE, NOT COMMERCIAL OFFERINGS. A company may know how to offer
sushi, carving, and dessert stations; the blueprint is the authored
composition of those into "how we design a wedding reception."
Therefore:

◆ A BLUEPRINT IS ORGANIZATIONAL KNOWLEDGE, NOT AN EVENT OBJECT. It
lives on the company shelf beside component definitions (SPEC-001/002),
presentation templates (v241), themes, and brand assets. It is the
Event Design domain's servant the way the renderer is publication's
servant. Confusing a blueprint with a design is the same category
error the closing entry names — and this document exists partly to
make that error impossible to commit silently.

**Out of scope, stated exhaustively:** the Workspace constitution and
everything it will own (envelope/interior, states, send ceremony,
delivery records); Agreements, Terms Blueprints (expected twin — §2's
pattern is drafted to be twinnable, per commercial review §6/§19 —
but not built), signatures, invoices; Operations, Execution,
Knowledge-domain evidence surfaces beyond the provenance-only proof
already shipped (v243). Component-grain promotion remains SPEC-004's,
shipped and untouched. The renderer, untouched. The continuous paper,
untouched.

---

## 1. Vocabulary and object ruling

The objects, each named once and used consistently:

- **BLUEPRINT** — a stable, company-scoped identity: the reusable
  authored answer to a class of events ("Wedding Reception," "Corporate
  Drop-off," "Shabbos Sheva Brachos"). The identity carries name,
  taxonomy, scope, and status. It carries no content.
- **BLUEPRINT REVISION** — immutable authored content under an
  identity: structure, component entries, configuration, presentation,
  pricing intent, parameters. Revisions chain; history is total.
- **DRAFT REVISION** — the one mutable thing in this constitution: a
  revision not yet published. Becomes immutable at publish.
- **PUBLISHED REVISION** — the revision an identity currently offers
  for instantiation. At most one per identity.
- **INSTANTIATION** — the single verb that crosses from organizational
  knowledge into live event work at the design grain. The word is
  SPEC-002's, deliberately: the grammar generalizes across grains
  (Library → Canvas instantiates a component; Blueprint → Design
  instantiates a design). One grammar, two grains.
- **PROVENANCE** — the immutable stamp instantiation leaves:
  {blueprint, revision, fingerprint, instantiated_at, parameters as
  given, branches taken}. A fact about origin, forever.
- **DIVERGENCE** — the honest, measured relationship between a living
  design and its frozen instantiation baseline. The word **override is
  REJECTED from this vocabulary** (§7): once independence exists,
  edits are edits; there is no layer to override.
- **PROMOTION** — the explicit ceremony by which an Event Design (or a
  selected scope of one) becomes a blueprint draft revision (§8).
  Cousin of SPEC-004's component-grain promotion; never its
  replacement.

The distinctions that must never blur:

◆ BLUEPRINT ≠ TEMPLATE. The v241 Template is presentation-only: the
portable dress stratum, savable and applicable under the match law. A
blueprint is the WHOLE authored answer — structure, components,
configuration, pricing intent — and MAY carry a portable presentation
within it. Templates survive under their own name and law; nothing in
this constitution amends §6.15. A blueprint that carries dress
extracted from a template records the template's provenance as a
fact.

◆ BLUEPRINT ≠ PUBLICATION. The publication is a design wearing
customer clothes — a projection toward a person. A blueprint precedes
any customer and faces inward. The overloaded phrase "blueprint
publication" is BANNED: the verb is PUBLISH, the noun is "published
revision," and the word "publication" continues to mean exactly what
docs/PUBLICATION.md says it means.

◆ BLUEPRINT ≠ EVENT DESIGN. The design is event-bound truth — the
workspace review's nucleus. The blueprint is company knowledge.
Instantiation crosses that boundary exactly once, in one direction.

◆ BLUEPRINT REVISION ≠ INSTANTIATED DESIGN. The revision is immutable
knowledge; the design is live work with its own identity, its own
frozen baseline, and its own future.

◆ BLUEPRINT PROVENANCE ≠ LIVE INHERITANCE. Provenance is a recorded
fact ("started from Wedding Reception r7"). Inheritance would be a
dependency (a blueprint edit reaching into a design). The first exists
forever; the second never exists at all.

No implementation vocabulary appears in this document: no table names,
no RPC names, no file paths for new code. Those belong to the slice
map, after ratification.

## 2. Blueprint identity versus blueprint revision — DECIDED

◆ STABLE IDENTITY OVER IMMUTABLE REVISIONS. The operator thinks
"the Wedding Reception Blueprint" is one thing across years; the
system needs immutable history underneath the name. Both are right,
so both exist:

- The IDENTITY is stable: its name may be corrected, its taxonomy
  refiled, its status changed — none of that touches content.
- REVISIONS are immutable once published, supersede-and-chain (the
  same revision semantics SPEC-002 gave definition layers — proven
  law, reused, not reinvented). Nothing published is ever edited;
  it is only superseded.
- PUBLISHED is a designation the identity confers on exactly one
  revision (or none — an identity between publications offers
  nothing). Publishing r8 supersedes r7's designation; r7 remains
  readable, citable, and reproducible forever.
- RETIREMENT happens at the identity level (§3, §14): the identity
  stops offering anything for new use while its entire chain remains
  historical truth.
- HISTORICAL REPRODUCIBILITY is unconditional: any design that ever
  cited any revision can display exactly what that revision said, at
  any future time, regardless of what the identity does next.

This is precisely the shape the commercial review's Terms Blueprints
expect to twin ("versioned, instantiated with provenance, immune to
retroactive edits" — review §6, principle 19). The twin is not built
here; the pattern is built twinnable.

## 3. Lifecycle — every state earns its verbs

The admission test is constitutional (workspace review, principle
family): A STATE EXISTS ONLY WHERE IT CHANGES THE AVAILABLE VERBS.
Each candidate was tested, not inherited:

**DRAFT** (revision-level). Verbs: edit, discard, publish. A draft is
editable and NOT instantiable — knowledge under construction binds no
one and seeds nothing. Earns its place: it is the only mutable state
and the only non-instantiable content state.

**PUBLISHED** (revision-level designation). Verbs: instantiate, begin
new draft (seeded from this revision), retire the identity. A
published revision is NOT editable and cannot be amended in place —
amendment IS a new draft that supersedes on publish. Earns its place:
it flips both edit and instantiate.

◆ PUBLICATION REQUIRES INTENT, NOT MERELY AUTHORITY (ratified
amendment). Authority answers "who may publish?"; intent answers
"was publication deliberate?" — and both are required. The publish
act carries an explicit declaration — THIS REVISION IS NOW
ORGANIZATIONAL KNOWLEDGE — whose wording is constitutional (the
APPLY_CONFIRM_WORDING discipline: one sentence, fixed, displayed and
affirmed at the act, recorded with the act). No flow, migration,
import, promotion, or API path may confer the published designation
as a side effect of anything else. Accidental organizational
knowledge is a contradiction in terms, and this clause is what makes
it a mechanical impossibility rather than a hope.

**RETIRED** (identity-level). Verbs: view history, reproduce any
revision, reinstate (a deliberate act restoring the last published
designation). NOT instantiable, NOT editable. Earns its place: it
removes instantiation while preserving citation — the difference
between "we don't sell this anymore" and "this never existed."

**ARCHIVED — REJECTED.** Tested: what verb does Archived change that
Retired has not already changed? None found. Hiding a retired identity
from default discovery is a LIBRARY visibility concern (§12), not a
lifecycle state. If a state changes no verbs, it does not exist.

**REVIEW/PENDING before publish — REJECTED (ratified, §16.5).**
A review state earns verbs only if a second party's approval is a
distinct act from the publisher's own. Under the ratified authority
model (§13) the publish capability plus the intent declaration IS
the review; a separate state would be ceremony without verbs —
publish is publish. If two-party publication is ever ruled
necessary, the state earns its place and enters by amendment.

## 4. The instantiation law — the constitution's center

◆ INSTANTIATION CREATES INDEPENDENCE, NOT INHERITANCE.

One act, from a PUBLISHED revision, produces: a new, independent
Event Design + an immutable provenance stamp. Not a linked child. Not
a subscription. The blueprint never reaches back; the design never
reaches up.

What the act does, exactly:

- **Authored structure is COPIED**: chapters, sections, arrangement,
  authored prose — materialized into the design as its own material.
- **Component entries are RESOLVED**: each entry references a
  component definition by identity plus an authored configuration
  delta. Instantiation runs the SPEC-002 machinery per entry —
  `instantiate` against the definition's then-current published
  revision, stamping the definition provenance SPEC-002 already
  stamps — then applies the blueprint's authored configuration as
  part of the seed. TWO provenances land: the component's (per
  SPEC-002, unchanged) and the design's (this constitution's stamp).
- **The portable presentation is APPLIED** under the v241 law
  unchanged: portable stratum only, match law in force, application
  provenance recorded. Bound dress does not travel through the
  blueprint — it never travels through presentation verbs, and a
  blueprint carries no bound identities to map.
- **Parameters are TAKEN** (§10): required inputs supplied at the
  moment of instantiation, recorded in the stamp; conditions evaluate
  once; branches taken are recorded.
- **Prices ARRIVE AS DEBT** (§11) unless an explicit fixed-price
  decision travels with its own provenance.
- **Identity facts are NOT COPIED and NOT RESOLVED here**: company
  facts project at publication/render time through projectIdentity(),
  exactly as they do for every design today. A blueprint stores no
  company fact, ever.

◆ ONE COHERENT ORGANIZATIONAL SNAPSHOT (ratified amendment).
INSTANTIATION IS DETERMINISTIC WITH RESPECT TO THE STATE OF
ORGANIZATIONAL KNOWLEDGE AT THE INSTANT OF INSTANTIATION. The act
observes one consistent snapshot of the shelf: the blueprint
revision, every referenced definition's then-current published
revision, and every current catalog value are read as of one moment
— never "whatever happened halfway through." If Sushi r18 publishes
while an instantiation is in flight, the instantiation sees r17
throughout or r18 throughout, and the provenance stamp records
which. Two instantiations of the same revision against the same
organizational moment produce the same design. This is the
determinism claim concurrency will one day lean on, stated now so
no implementation can accidentally read a torn shelf.

◆ CONFIGURATION NEVER APPLIES BY GUESS. If a definition has moved
since the revision was authored and some authored configuration no
longer applies (an option removed, a scheme renamed), instantiation
does not silently drop it and does not silently force it: the
conflict is NAMED and staged for the instantiating operator's
decision before the design exists — the same never-guess discipline
as THE MATCH LAW (applyPortable throws on undecided ambiguity) and
the same staged-never-silent discipline as the curation ceremonies.
Partial application without a decision is forbidden.

◆ LATER BLUEPRINT EDITS TOUCH NOTHING. Publishing r9 changes no
design instantiated from r8, r7, or r9-yesterday. This is the same
immutability the commercial review makes legally load-bearing for
Terms — established here first, at the design grain, so the twin
inherits proven law.

◆ REPLAY IS MOOT BY CONSTRUCTION. The question "can an instantiation
be replayed?" dissolves: the design's frozen baseline (SPEC-002 Rev E
— a snapshot with named provenance, never a pointer to anything
mutable) already records what actually materialized, and the revision
remains readable forever. Reproduction is CITATION of frozen
material, not re-execution — re-running against moved definitions
would manufacture a different design and call it history. No replay
machinery exists.

◆ THE CITATION VOICE. A design says "Started from Wedding Reception
r7" — started from, never powered-by, never proof-of (the v243
attribution honesty, extended to the design grain). The citation
resolves to the exact revision, forever.

## 5. The portable content boundary

What a blueprint revision MAY carry — the blueprint-portable set:

- structure: chapters, sections, groups, arrangement, authored prose;
- component entries: definition references + authored configuration
  deltas + item selections (including unresolved choice groups —
  choices are authored questions, and deferring them is authorship);
- presentation: the v241 portable stratum, by value, with template
  provenance when extracted from one;
- pricing intent (§11) — never confirmed prices;
- media REFERENCES: photo pins by asset reference, never bytes;
- parameters and conditions (§10), within the declared closed shapes;
- taxonomy, service-style declarations;
- kosher constraint DECLARATIONS as design facts entered once —
  meat/dairy character, supervision requirements, calendar-sensitivity
  flags (the enter-once law, applied at authoring where it belongs).

What a blueprint NEVER carries — the barred list, absolute:

- customer identity, contact facts, or any party;
- event-specific dates, times, venues-as-facts;
- guest counts as facts (guest count is a PARAMETER — a question the
  blueprint asks, never an answer it presumes);
- negotiated commercial material: deposits, discounts, payment terms,
  agreement states, terms text;
- delivery records, signatures, execution actuals, event-specific
  approvals;
- company identity facts (projected through the one gate at render
  time, never stored — the v239 law admits no second copy);
- confirmed prices (§11), except under the explicit fixed-price
  decision with its own provenance.

The barred list is the envelope's shadow: everything the workspace
review assigns to the commercial envelope, and everything bound to a
specific event's life, is barred from organizational knowledge here —
which is how this constitution prepares for the envelope/interior
split without building it.

## 6. The reference-versus-copy matrix — DECIDED

Not everything travels the same way. Three treatments, and every
field in the blueprint shape declares exactly one (a field without a
declared treatment is a constitutional violation — the closed-set
discipline of box kinds, applied to knowledge):

**COPIED AS AUTHORED STRUCTURE** (the blueprint's own words,
materialized into the design at instantiation): section arrangement
and authored prose · authored configuration deltas · item selections
and choice-group authorship · the portable presentation stratum ·
pricing-intent declarations · parameter and condition declarations.

**REFERENCED AS SHARED KNOWLEDGE** (identity held, content never
duplicated): component DEFINITIONS by identity — the organization's
component knowledge stays in one place · media assets by reference,
with the availability law: a missing asset degrades honestly (the
frame renders, the absence is visible) and never blocks — the
graceful-degradation posture fonts already established · template
provenance as recorded fact, never dependency.

**RESOLVED AT INSTANTIATION OR LATER** (fresh at the moment of use):
definition REVISIONS — current-published at instantiation, stamped
per SPEC-002 · catalog PRICES — current values fetched, arriving
unconfirmed (§11) · company identity facts — resolved later still,
at publication/render, through projectIdentity(), untouched by this
constitution.

◆ WHY DEFINITIONS RESOLVE CURRENT, NOT PINNED. The alternative —
pinning definition revisions at blueprint publication — was evaluated
and REJECTED. Pinning would make every blueprint a staleness machine:
a promoted definition improvement (the Goldberg lesson, SPEC-004's
whole reason to exist) would be silently suppressed by every blueprint
that predates it, and the organization's component knowledge would
fork into as many pasts as there are blueprints. The blueprint's claim
is STRUCTURAL ("this class of event includes a Sushi Station,
configured thus"), not ARCHIVAL ("the Sushi Station as it stood in
March"). Freshness flows; provenance keeps history honest; the
design's frozen baseline records what actually arrived; and the
never-guess conflict rule (§4) catches the case where flow and
authorship disagree. Truth lives in one place — which is the
governing question's first clause answered.

## 7. Divergence — provenance-aware independence

◆ "OVERRIDE" IS THE WRONG WORD, AND IT IS REJECTED. Override implies
a live layer beneath the edit — something still asserting itself to
be overridden. After instantiation there is no such layer: the design
is independent and its edits are ordinary edits. What the system
keeps is not control but MEMORY:

- The instantiation baseline is FROZEN ON THE DESIGN (the SPEC-002
  Rev E pattern at the design grain: a snapshot with named
  provenance, never a pointer to anything mutable).
- Divergence is a deterministic state-versus-baseline comparison
  (the Rev B correction, inherited: history may annotate the diff,
  never derive it). The design always knows: what originated from
  the blueprint, what was added, what was removed, what changed.
- Honesty tiers follow v243's proven vocabulary: unchanged · light ·
  heavy · earlier-revision ("the published revision has moved on —
  this design started from r7"; started-from, not proof-of).
- Divergence is DISPLAYED, never prevented, never synced, and never
  judged. Empty-is-information: an undiverged design is a fact, not
  a virtue.

◆ NO UPDATE-FROM-BLUEPRINT VERB EXISTS. "Bring this design up to r9"
is RESERVED, not built: if it ever earns its place it will be a
compare-style staged ceremony (the v242 pattern), never a sync — and
it requires cause this constitution does not have. The reservation is
named so silence cannot be read as permission.

## 8. Promotion — the curation ceremony at the design grain

How does a good Event Design become reusable knowledge? Never by
existing. The prohibition is constitutional:

◆ EVENT-SPECIFIC CONTENT NEVER BECOMES ORGANIZATIONAL TRUTH SILENTLY.
References are not decisions (SPEC-004 §10, elevated here to the
design grain). An event instance — however brilliant — is evidence,
not curation, until a person with authority performs the ceremony.

The ceremony, staged and never silent:

  Event Design (or a selected scope of one)
      ↓ select authored scope          — partial promotion is
                                          first-class; a chapter or a
                                          station may travel alone
      ↓ review event-specific facts    — the §5 barred list surfaces
                                          every violation for strip or
                                          normalize; nothing barred
                                          passes silently
      ↓ normalize                      — guest-count facts become
                                          parameters; event prose
                                          becomes class prose;
                                          confirmed prices become
                                          intent
      ↓ name                           — new identity, or a new draft
                                          revision on an existing one
      ↓ draft                          — promotion produces a DRAFT,
                                          never a published revision

Rulings:

- **Promotion never publishes.** Publication is its own act under its
  own authority AND its own intent declaration (§3). The ceremony
  ends at a draft; the shelf changes only when the publisher
  deliberately says so, in the constitutional wording.
- **One promotion, one blueprint** — the SPEC-004 §6a boundary,
  echoed at this grain. A review session may group promotions; it is
  never a transaction across identities.
- **Evidence informs, never writes.** Event actuals and outcome
  evidence may be DISPLAYED to the promoting operator
  (provenance-only, the v243 law); they never enter blueprint content
  automatically, and no ranking vocabulary appears anywhere in the
  ceremony.
- **The cousin boundary.** Component-grain divergence discovered
  during design promotion does NOT write component definitions from
  this ceremony — that path is SPEC-004's, shipped, gated, and
  untouched. The blueprint's honest place for such divergence is the
  authored configuration DELTA it carries against the definition. If
  the organization wants the definition itself to move, that is a
  separate SPEC-004 act by its own ceremony. Two ceremonies, two
  grains, one discipline.
- **Provenance survives promotion**: the draft records
  promoted-from {design, event, snapshot fingerprint, scope} — so a
  blueprint can always answer "where did you learn this?"

## 9. Blueprint composition — DECIDED, restrictively

May a blueprint include another blueprint? Live composition was
evaluated and REJECTED; authoring-time composition is ADOPTED:

◆ NO LIVE COMPOSITION, EVER. A published revision never references
another blueprint for resolution at instantiation. There is no
include-graph to walk, no version skew to arbitrate, no cycle to
detect — cycles are impossible because the edge type does not exist.
One instantiation reads one revision.

◆ COMPOSITION IS AN AUTHORING ACT. While drafting, "insert from
blueprint X" COPIES portable material from X's cited revision into
the draft, recording nested provenance as annotation ("this chapter
began as Cocktail Hour r4"). The result is one flat, self-contained
revision. Later edits to X touch nothing — the same independence law
(§4), applied between blueprints.

◆ LIVE COMPOSITION IS RESERVED, NOT FORBIDDEN FOREVER. If a genuine
need arrives (a shared station library so hot that flat copies burn),
it enters by constitutional amendment with the cycle law, resolution
order, and skew semantics decided THEN, deliberately — never by an
implementation discovering it can.

## 10. Parameters and conditional structure — the taxonomy DECIDED

A reusable design asks questions a specific event answers. Four words
that are not interchangeable:

- **PARAMETER** — a named, typed input the blueprint REQUIRES at
  instantiation: guest count, service style, daypart, meat/dairy
  character, venue capability flags, price tier. A parameter has no
  default masquerading as a fact — an unanswered parameter blocks
  instantiation, because empty-is-information and a guessed guest
  count is a lie.
- **CONDITION** — a declarative inclusion/visibility predicate over
  parameters, attached to structure ("include the carving station
  when guests ≥ 150"; "the dairy dessert chapter exists only when
  character = dairy"). Conditions evaluate ONCE, at instantiation;
  branches taken are recorded in the provenance stamp; the design
  that results contains no conditions — it is a resolved answer.
- **CHOICE** — an authored option set deliberately DEFERRED to the
  design (the pricing engine's choice groups, already law): the
  blueprint authors the question, the event answers it later.
  Choices survive instantiation; conditions do not.
- **OVERRIDE** — rejected (§7); not a member of this taxonomy.

◆ A BLUEPRINT IS AUTHORED MATERIAL, NEVER A PROGRAM. Declarative
parameters and conditions are PERMITTED; arbitrary executable logic
is PROHIBITED. Condition predicates come from a CLOSED, versioned
shape set (comparisons and boolean combinations over declared
parameters — the box-kind discipline applied to logic); anything the
closed set cannot express is not expressible, by design. A second
workflow engine will not grow here by accretion.

Scope note (ratified, §16.1): the taxonomy above is constitutional
NOW — so no early slice forecloses it — while implementation stages
(structure-only blueprints first; guest count as the seed parameter,
BP-3; conditions in BP-7). The constitution decides the shape; the
slice map decides the order.

## 11. Pricing freshness — its own ruling

Money in a blueprint can mean five different things, and pretending
they are one thing is how stale numbers become invoices. The forms,
each explicit:

- **reference-current** — resolve the catalog price at instantiation;
- **authored-suggestion** — a number the author proposes;
- **formula** — computed from parameters (per-guest, per-station);
- **fixed-package** — a deliberate, policy-backed package price;
- (absent) — priced later, honestly unpriced on arrival.

◆ BLUEPRINT MONEY IS INTENT, NOT FACT. The law:

NO PRICE BECOMES CONFIRMED BY BEING COPIED. Every price that arrives
in a design through instantiation arrives UNCONFIRMED — price debt,
the existing amber discipline: `price_confirmed` false, counted in
the totals' unconfirmed tally, gold-ticked in the paper's margin —
regardless of form, INCLUDING formula results and current catalog
values. Confirmation is an event-side act by an event-side person
looking at an event-side number.

ONE exception, narrow and stamped: a **fixed-package** price may
arrive confirmed ONLY when (a) the published revision explicitly
declares fixed-price policy for that package, (b) the publishing
authority (§13) covered that declaration, and (c) the arrival stamps
the decision's provenance — which revision, which publisher, when.
Even then it remains an event-side price that event-side authority
may unconfirm and change; the blueprint asserted a starting decision,
not a permanent one.

This grounds directly in shipped law: the v194 pricing engine's
price-debt semantics and the unconfirmed-copy tick are the mechanism;
this section only rules which side of them blueprint money lands on.

## 12. The Blueprint Library — a projection, not a home

◆ THE LIBRARY IS A DISCOVERY PROJECTION OVER BLUEPRINTS, NOT THEIR
SOURCE OF TRUTH. Blueprints join the Library by REGISTRATION — the
v215/v243 pattern, browser file untouched — as a fifth registered
kind beside templates, themes, brand assets, and photography.

What a blueprint card carries: name · taxonomy · status ·
published-revision designation · provenance-only proof in the v243
shape, extended to this grain: Instantiated · Sent · Accepted ·
Acceptance rate (NULL at sent = 0, never 0/0 bravado) · Average
accepted value (NULL when unknown) · divergence honesty on citing
designs. ATTRIBUTION IS PROVENANCE-ONLY: a design that resembles a
blueprint but carries no stamp is refused as evidence by
construction. NOTHING RANKS: no best/rank/top field exists in the
proof shape, "best performing" appears nowhere, and the existing
grep-pin extends to cover the new kind.

Discovery concerns — search, taxonomy browsing, recency, favorites,
status visibility (including hiding retired identities from default
view, §3), eligibility, permission filtering — are LIBRARY concerns,
projections over identity metadata; none of them is a blueprint
field except the taxonomy the identity itself declares.

PREVIEW: a blueprint can wear the paper. The continuous renderer
projects the revision's authored material as a document preview —
parameters shown as asked questions, identity facts projected as
today's company facts with the projection labeled as such (a preview
is today's clothes on timeless structure, and it says so). The
renderer is not modified to do this; the blueprint is projected INTO
the shape the paper already eats.

## 13. Permissions and tenancy

A blueprint is ORGANIZATIONAL knowledge — company-scoped, tenant-
isolated absolutely (existing law, restated not invented). It is
never personal scratch content unless a future amendment explicitly
scopes it so (§16.4: ratified NO, not yet).

Verb gates ride the capability discipline already shipped (SPEC-004's
capability-gated curation is the mechanical precedent), and the
gating capability is NAMED here, deliberately untied from any role
word (ratified amendment — no "executive," no title):

◆ **CURATE ORGANIZATIONAL KNOWLEDGE** — the one capability that
gates publish, retire, and reinstate. It is a capability, not a
person and not a rank: Burger Bar maps it one way, Partini another,
any future tenant its own way. The constitution fixes WHAT the
capability protects — the act of declaring what the organization
knows — and refuses to care who wears it.

- **draft / edit drafts** — authoring capability;
- **publish / retire / reinstate** — CURATE ORGANIZATIONAL
  KNOWLEDGE, and publish additionally requires the §3 intent
  declaration: capability opens the door, the declaration walks
  through it;
- **instantiate** — anyone who may create event designs; consuming
  the shelf is operating, not curating;
- **promote** — authoring capability (it produces only a draft; the
  capability-and-intent gate still stands between the ceremony and
  the shelf);
- **view history** — anyone who may view the identity; history is
  not a privilege tier.

## 14. Deletion, retirement, and historical truth

◆ A PUBLISHED REVISION WITH INSTANTIATIONS IS NEVER HARD-DELETED.
Historical designs must answer "which revision did I come from?"
forever, and a citation must never dangle.

The distinct acts, never blurred:

- **remove from discovery** — a Library visibility act; changes
  nothing about the blueprint;
- **retire from new use** — the §3 lifecycle act; instantiation
  stops, history stands;
- **preserve for provenance** — not an act but the default and the
  floor: every cited revision remains readable and reproducible;
- **redact** — EXCEPTIONAL, policy-gated, logged: content removal
  under legal or safety necessity. Redaction must leave a TOMBSTONE
  that preserves the citation's existence, the revision's identity
  and fingerprint, and the redaction's own provenance (who, when,
  under what policy) even where content is removed. The full
  redaction policy is RESERVED for definition when a real requirement
  arrives; the tombstone floor is constitutional now so no future
  policy can dangle a citation.

Never-published drafts may be discarded freely. An identity with no
published revisions and no instantiations may be deleted outright —
nothing ever cited it.

## 15. Constitutional invariants

1. A blueprint is reusable authored structure — organizational
   knowledge; not an event, not a publication, not a program.
2. Blueprint identity is stable; published revisions are immutable;
   amendment is supersession.
3. Instantiation creates an independent Event Design. Independence,
   not inheritance; the blueprint never reaches back. A blueprint is
   never a live ancestor of an Event Design: INSTANTIATION SEVERS
   ANCESTRY WHILE PRESERVING MEMORY.
4. Existing Event Designs never change because a blueprint changed.
5. Instantiation is deterministic with respect to the state of
   organizational knowledge at the instant of instantiation: one
   coherent snapshot of the shelf, never a torn read, with the
   moment recorded in provenance.
6. Provenance survives independence: every design cites its source
   revision forever, in the started-from voice.
7. Copied authored structure, referenced shared knowledge, and
   resolved-at-instantiation material are distinguished explicitly;
   every field declares its treatment; definitions resolve current
   and are stamped.
8. Instantiation never guesses: inapplicable authored configuration
   is a named, staged conflict, never a silent drop or a silent
   force.
9. Promotion is an explicit, staged, attributed ceremony that
   produces drafts; publication is a separate act requiring BOTH the
   CURATE ORGANIZATIONAL KNOWLEDGE capability AND the explicit
   intent declaration — accidental organizational knowledge is
   mechanically impossible.
10. Event-specific facts never enter organizational knowledge
    accidentally; the barred list is absolute and surfaces in the
    ceremony.
11. Blueprint money is intent: no price becomes confirmed by being
    copied; the fixed-package exception travels with its own stamped
    decision.
12. Historical revisions remain reproducible and citable
    unconditionally; redaction, if ever, leaves a tombstone; a
    citation never dangles.
13. Blueprint composition cannot create live dependency chains:
    composition copies at authoring time; no resolution edge between
    blueprints exists at instantiation.
14. Parameters and conditions are declarative, closed-set, and
    resolved at instantiation with branches recorded; choices are
    authored questions that survive into the design; "override" is
    not a word this system uses.
15. The Library is a projection over blueprints, never their source
    of truth; its proof is provenance-only and nothing ranks.
16. Blueprints capture reusable design knowledge, never commercial
    offerings: the blueprint knows how the parts compose, not what
    the company sells or for what.
17. The renderer, the continuous paper, the v241 template law, and
    SPEC-002/SPEC-004's component-grain law are unmodified by this
    constitution.

## 16. Formerly open questions — RESOLVED at ratification

1. **Parameters and conditions in the first constitution?** YES.
   The §10 taxonomy and closed-set law are constitutional now;
   implementation is staged — structure-only slices first, guest
   count as the seed parameter, conditions in a later slice (§18).
2. **May one blueprint compose another?** Authoring-time copy with
   nested provenance, ADOPTED; live composition RESERVED behind
   amendment; no runtime graph, ever (§9).
3. **Partial promotion?** YES — scope selection is first-class in
   the ceremony; a chapter or a single station may become a
   blueprint alone (§8).
4. **Personal/private blueprints?** NO, not yet. The organization
   owns organizational knowledge; unpublished drafts already cover
   the scratch need; explicit personal scoping is reserved until a
   real requirement names itself.
5. **A review state before publish?** NO. Publish is publish —
   ceremony is not invented where no verb changes. The intent
   declaration (§3) is part of the publish act itself, not a state.
6. **What authority publishes?** A CAPABILITY, not a role: CURATE
   ORGANIZATIONAL KNOWLEDGE (§13). Burger Bar maps it one way,
   Partini another; the constitution fixes what the capability
   protects and refuses to care who wears it.

## 17. Ratification record

Ratified by Ben with four amendments, all adopted in full and folded
into the body above: (1) the governing question is design knowledge,
not commercial offering (§0); (2) the one-coherent-snapshot
determinism law (§4, invariant 5); (3) publication requires explicit
intent, not merely authority (§3, §13, invariant 9); (4) the
negative law — instantiation severs ancestry while preserving memory
(preamble, invariant 3). This document is FROZEN. Amendment from
here forward follows the constitutional-amendment discipline only.
The first act of v251, before any Blueprints code, remains the §0
housekeeping: remove the three recorded non-canonical artifacts
behind the explicit proof there stated.

## 18. The slice map — LOCKED

One new responsibility per slice; every slice under the full
verification bar (§5 of the handoff protocol), one canon entry, one
zip. Canon numbering begins at §6.25 and is assigned at ship time.
No reordering without a constitutional contradiction.

**BP-1 (v251) — THE SHELF.** The housekeeping act first, behind its
proof. Then: blueprint identity + revision model (supersede-and-
chain), draft/publish/retire/reinstate lifecycle, immutability at
publish, the CURATE ORGANIZATIONAL KNOWLEDGE capability gate, the
constitutional intent-declaration wording, SQL migration. The shelf
exists and holds knowledge; nothing consumes it yet.

**BP-2 (v252) — AUTHORING.** The draft editor: authored structure
(chapters, sections, prose), component entries (definition reference
+ authored configuration delta + item selections + choice-group
authorship), portable-presentation attachment under v241 law with
template provenance, pricing-intent declarations, kosher constraint
declarations, taxonomy. Field-treatment declarations (§6) land in
the shape with a unit claim that every field declares exactly one.

**BP-3 (v253) — INSTANTIATION.** The center: one coherent
organizational snapshot; per-entry SPEC-002 instantiation with dual
provenance; authored-configuration seeding with the staged never-
guess conflict surface; the seed parameter (guest count) taken and
stamped; portable application; price-debt arrival with the fixed-
package exception's stamp; the design's frozen instantiation
baseline. The negative law gets its grep-pins here: no live edge,
no update path, no blueprint import downstream of the act.

**BP-4 (v254) — DIVERGENCE & CITATION.** The baseline comparison at
design grain, honesty tiers (unchanged · light · heavy ·
earlier-revision), the started-from citation line resolving to the
exact revision, displayed-never-prevented, the reserved
update-from-blueprint verb pinned absent.

**BP-5 (v255) — PROMOTION.** The ceremony: scope selection (partial
first-class), barred-list review staged-never-silent, normalization
(facts → parameters, event prose → class prose, confirmed prices →
intent), name-or-revise, draft-never-publish, promoted-from
provenance. One promotion, one blueprint.

**BP-6 (v256) — THE LIBRARY.** Registration as the fifth kind
(browser untouched), cards with the provenance-only proof shape and
the no-ranking grep extended, discovery/visibility including retired
hiding, the paper preview projection with today's-clothes labeling.

**Staged extensions, locked in order after the core:**

**BP-7 (v257) — CONDITIONS.** The closed predicate set, condition
evaluation at instantiation, branches recorded in provenance,
parameters beyond the seed. The a-blueprint-is-never-a-program law
gets its grep-pin: no executable logic shape exists.

**BP-8 (v258) — AUTHORING-TIME COMPOSITION.** Insert-from-blueprint
as draft-time copy with nested provenance annotation; flat result;
the no-live-composition law pinned: no resolution edge between
blueprints exists anywhere in the instantiation path.

The renderer got built without a single reopened decision by exactly
this discipline; the shelf gets built the same way.
