# PUBLICATION — Content · Presentation · Brand
**Status: ADOPTED (v224). All decisions below are canon, including §13's
three, resolved as follows: (a) RE-SEND RE-SNAPSHOTS — every explicit send
stamps the resolved presentation actually sent and logs it; editing alone
never changes a prior send's snapshot; approval permanently locks the latest
stamped artifact. (b) THE OVERRIDE IS THE VERSION OVERRIDE — it lives at
version level and copies, snapshots, and locks with the version. (c) AN
EMPTY PRESENTATION RENDERS HONESTLY — the complete branded publication shell
(cover, typography, paper, logo, empty state), inventing no sections or
content. This document extends the five-level pipeline by one layer and
amends no existing constitutional text.**

---

## 0. The Law of Three Layers

**Content is what you're selling. Presentation is how it's published. Brand
is who it's from.** Three layers over one proposal, separable by
construction:

1. **A theme decides how things look. It may never decide what exists.**
   Fonts, colors, paper, margins, photo treatment — theme. Which components,
   which sections, which prices, which photos *are in* the document —
   content. The one place these meet (photo selection rules) is governed by
   §7's propose-and-pin ceremony, which keeps the decision on the content
   side.
2. **Structure is owned by the Design lens, everywhere and always.** The
   Presentation lens may not rearrange, add, or remove what Design owns —
   no drag, no reorder, no instantiate. If Dinner must precede Cocktail
   Hour, you turn the dial to Design.
3. **A customer artifact is historical.** Once a proposal has been put in
   front of a customer, neither its content *nor its dress* may change
   underneath the record (§3).

---

## 1. The PublicationTheme object — DECIDED

The pipeline gains one layer, exactly where the seam already was:

```
Proposal data → Lens projection → PublicationTheme → Renderer
```

The theme is **renderer parameterization as a first-class, reusable,
swappable object** — "Wedding Luxury" is a row, not a stylesheet. Its
contents (all optional at every inheritance rung — sparse by design):

| Field | Governs |
|---|---|
| `name` | Identity ("Wedding Luxury", "Burger Bar Standard") |
| `fonts` | A curated PAIRING reference (§9) — heading + body, never free-form |
| `colors` | Palette: primary, accent, ink, paper tint |
| `paper` | Texture, tint, page proportions |
| `margins` | Reading measure, section spacing |
| `logo` | Placement + treatment (the asset itself is Brand's, §8) |
| `cover` | Cover page layout |
| `dividers` | Section separators |
| `photography` | Placement/treatment rules per slot (§7) — never selections |
| `header` / `footer` | Running chrome |
| `watermark` | Draft/confidential marks |
| `print` | Page rules for the print renderer — **first-class from day one** (SPEC-003 §7: print is a renderer over the same model; a theme that can't print is not a theme) |

Swapping the theme on a hundred proposals changes a hundred publications and
zero menu items. That separation is also what makes §11 possible.

## 2. The four-rung inheritance ladder — DECIDED

```
System Default  →  Company Brand  →  Named Theme  →  Version Override
```

Every rung overrides **only what it defines**; everything else falls
through. Resolution is one pure function — `resolveTheme(system, brand,
theme, override)` — deterministic, unit-testable, and consulted by exactly
one caller (the renderer parameterization step). This is the provenance
ladder's shape wearing publication clothes: the most specific defined value
wins, and *where a value came from* is always answerable (the Presentation
lens's x-ray can show it: "this gold is Brand's; this font is Wedding
Luxury's; this title size is yours").

System Default ships in code and guarantees a complete resolved theme even
for a tenant who has configured nothing. Brand and Named Themes live in the
Brand Studio (§8). The Proposal Override is a sparse delta stored **on the
version** (§13-b proposes version-level; awaiting confirmation) and travels
with version copies the way sections do.

## 3. The Snapshot Rule — DECIDED, constitutional

```
Draft      → inherits LIVE   (brand/theme edits flow in as they happen)
Sent       → SNAPSHOT        (the resolved effective theme freezes onto the version)
Approved   → LOCKED FOREVER  (the snapshot is as immutable as the prices)
```

**The stamp is caused by the SEND CEREMONY — an act, not a value change**
(v225b precision on ruling a): re-sending an already-sent version (sent →
Send → sent) takes a fresh snapshot and logs it, even though the lifecycle
value did not move. A passive/programmatic status write stamps only on
transitions into "sent" (the safety net). Sent-but-unapproved versions
REMAIN presentation-editable — the stamp protects the record, approval is
the lock; no revision ceremony is required to keep polishing the dress
between sends.

Marketing may recolor *Wedding Luxury* in June; the proposal the Goldbergs
signed in March keeps its gold and its Playfair, because what they approved
was an artifact — content **and** appearance. Presentation joins content
under the version lock. Changes after that are what they've always been: a
new version, which as a draft re-inherits live. The print renderer reads
the same snapshot the screen does — the PDF and the page can never disagree.

## 4. The vocabulary — DECIDED: the lens is **Presentation**

"Proposal" was doing two jobs — the business object and the customer lens —
and the collision was real. Resolution: the business object remains a
**Proposal**; its customer-facing lens is the **Presentation** lens. The
dial reads *Design · Presentation · Kitchen · Warehouse · Staffing ·
Finance*. Internally the registry key `customer` survives unchanged (keys
are wire-stable — the `operations` precedent); the sweep is user-facing
labels only, and constitutional documents retain their original terms, per
standing convention.

This also completes the v213 arc: the word "preview" is now impossible.
Nothing is being previewed — the Presentation lens **is the live customer
publication, and editing it is editing the publication itself.**

## 5. Lens Capabilities — DECIDED, multi-dimensional

`LensDef` gains a declaration, replacing single-purpose flags over time
(v218's `xrayMode` folds into it):

```ts
edits:    { presentation?, content?, structure?, pricing? }
supports: { xray?, print?, compare? }
```

| Lens | edits | supports |
|---|---|---|
| Design | content, structure, pricing | xray (inherent), print? later |
| Presentation | **presentation only** | xray (as provenance ink, §2), print, compare |
| Kitchen / Warehouse | — (read-only) | print |
| Staffing | its own notes (its slice's call) | print |
| Finance | pricing confirmations (its slice's call) | — |

**The law: nothing outside the registry may ask `if (lens === X)`.** Every
toolbar, inspector affordance, keyboard shortcut, and menu renders from the
declarations. The Line's control surface becomes lens-owned the way the
Dial already is: turn to Design and the structural controls exist; turn to
Presentation and the toolbar becomes *Theme · Typography · Colors · Paper ·
Photography · Layout · Cover · Brand* — a publishing application, because
the registry said so, not because the chrome knows a name. In Design, the
presentation controls aren't disabled — they **do not exist** (the picker's
absence rule, applied to chrome).

## 6. THE CANVAS (amended v226) — the Presentation lens as design surface

Same Paper, same Law: STUDIO_COMPOSITION §0 governs unchanged, and in the
Presentation lens it is enforced hardest — **the publication is visually
dominant; the chrome recedes; the paper is the primary interaction
surface.** The lens must feel like designing a beautiful document, never
like configuring one.

**6.1 The Rooms Law (amended v230).** All presentation editing happens in
ROOMS: one summoned surface whose ENTIRE identity is what you're working
on (Appearance · Typography · Palette · Paper · later Photography, Brand).
Opening a room replaces the previous room — nothing stacks, exactly one
room may be open, and Esc puts you back on the paper. A room is a
workspace you browse, not a dropdown you operate.

**THE ROOM NEVER OBSCURES THE PAPER: IT RESHAPES THE WORKSPACE AROUND
IT.** Opening Presentation recomposes the stage to Room | Paper — the
paper gently contracts, remains fully visible and dominant, and expands
back when the Room closes. Not a modal overlay; not a permanent sidebar;
a temporary studio beside the document. Rooms are summoned, never
resident — the §0 composition law is the reason the model works, not an
obstacle to it.

**6.2 Presentation Treatments.** Object-scoped dress exists, and it
attaches to **presentation identities** — "this section, as it appears in
this publication" — never to content objects. Content owns existence;
presentation owns dress; a treatment references an identity and lives
entirely within the presentation layer (inside the Version Override, riding
the ladder, snapshotting and locking with the version like every other
presentation fact). Treatments are **semantic, never free-form**: named
options from a curated registry (divider style, heading treatment, spacing
scale), so every choice remains theme-compatible and print-safe. SCOPE
(advanced v234): document, section, and COMPONENT treatments are live —
components carry four semantic axes (title · description · price · photo),
each §0.2-safe: description and price options re-dress what Design chose
to show, never hide it. Component imagery pins under the "comp:" slot
namespace, isolated from section slots by construction. ITEM treatments
arrived v235: the ITEM RUN — "the items of component X", the stable
identity individual items can't be (reordering would orphan their dress)
— carries bullet · category heading · emphasis · layout, where layout's
"As designed" default DEFERS TO DESIGN's authority and every option
re-dresses, never removes. All four identity levels of the paper are now
selectable, each with real furniture behind its door.

**6.3 Selection-contextual toolbars.** Clicking an identity on the paper
summons a floating toolbar of THAT identity's semantic treatments — the
toolbar belongs to the selected thing, not the application, and it renders
from declarations (the capability table gains a selection axis), never from
scattered kind-checks. The toolbar carries NO structural actions: no
reorder, no remove, no instantiate — §0.2 survives the canvas fully
intact. Toolbar and room are mutually exclusive: one thing open, always.

**6.5 The Line's Grammar (amended v228).** The Line is three owned zones —
Identity (what document) · Workspace (the global Ask) · Lens Tools — laid
as a grid that never wraps; zones never fight for width. A lens contributes
exactly ONE entry to the Line — labeled for WHAT'S BEHIND THE DOOR
("Style ▾"), never for the lens itself, so it can't read as a duplicate
of the dial (which states where you stand); all secondary navigation
— the room navigator included — lives inside the Room, which (v230) is a
workspace WING beside the paper, never an overlay and never the browser
edge. Save
look/discard are commit chrome and stay on the Line, tiny and always
reachable. Dismissal is the dial's physics: outside interaction closes the
Room and lands where it was aimed, atomically; Esc retreats one layer.

**6.7 Publication Regions (v231).** The paper has optional SLOTS — cover,
watermark, footer, signature, terms — each a document-treatment leaf
riding the ladder (style and visibility snapshot with the version). THE
WORDS (footer text, signature name, terms copy) are COMPANY FACTS: they
live in Brand Studio, freeze into the presentation snapshot at the send
ceremony (a sent document is whole), and a region toggled on with no
words renders nothing for the customer — and a coaching line in the
Studio. Page numbers are deliberately absent until real pagination exists
(the print/PDF slice): a page number in continuous scroll is a lie.

**6.8 Font Delivery (v232).** Typography is DETERMINISTIC: every pairing's
primary faces ship as versioned npm dependencies (Fontsource woff2/woff,
self-hosted, font-display: swap), imported through src/app/fonts.css from
the manifest in src/lib/fonts.ts. The manifest, the pairings, and the css
are one fact expressed three ways — the v232 unit suite fails on any
drift, and the acceptance suite proves the faces render by METRICS, not
by trust. Studio, customer page, and print share one set of faces from
one origin. The stacks keep graceful fallbacks for the first paint only.

**6.9 Photography (v233, delivering §7).** Propose · choose · pin ·
render. THE PIN DECIDES EXISTENCE; THE TREATMENT DECIDES DRESS. A pin is
a version-level presentation fact (photo_pins), denormalized at pin time
so a stamped document renders whole forever; pins ride render state and
Save look like every presentation edit, copy with version copies, and
freeze into the snapshot at the send ceremony. Placement (band/side/full/
none) is a treatment on the ladder — "none" suppresses render without
losing the pin. The system PROPOSES by pure tag-matching against the slot's
name; the library (photo_library) is company assets, managed in Brand
Studio, ingested humbly by URL until bucket upload arrives. Component and
item imagery join when their treatments do (§6.2 scope rule).

**6.10 The Pressure Law & Protected Geometry (v236).** Primary controls
retain usable geometry; secondary controls surrender first. On the Line:
the ⌘K hint yields, then X-ray and the split sheet collapse into the desk
⋯ — Search's floor (240px) is grid-guaranteed and the Line never wraps.
On the stage: THE PAPER OWNS PROTECTED GEOMETRY — supporting chrome (the
Meter included) participates in workspace layout and yields before the
paper does; nothing floats over the paper's rendered bounds.

**6.11 The Inspector Wing & the Version Identity Menu (v237).** The
Inspector obeys the same law as the Room: a workspace WING hinged to the
PAPER (Proposal | Inspector), never the browser edge — a gold seam on its
paper-facing edge, a subject thread naming the selection so the eye never
hunts, lawful reflow with restoration (the v217 no-reflow rule is
REPEALED in favor of §6.10's protected geometry). And the DISPOSAL
RULING: the Studio owns the OPEN VERSION's lifecycle; its verbs
(duplicate · reset presentation · archive · delete) live behind the
version's own name in the Line's identity zone — never a fifth peer
control — gated so sent and approved versions, being history, refuse
disposal. Reset Presentation is a presentation act; disposal is a
version-lifecycle act; deleting the proposal remains outside the Studio.

**6.39 Proposal Lifecycle — Send & the Sent Snapshot, Phase A (PL-3 · v265).**
The birth of immutable commercial artifacts — and the constitution's
longest design phase (a design document, a Reconciliation Addendum,
ratified Amendment 3 (Offer Sealing), and the Send Publication Boundary
Amendment) before a line of code. Phase A ships the truth-bearing core;
Phase B (transport) is reserved. ◆ THE IDENTITY, STABLE AT LAST
(Amendment 3): a Version is editable only until its first successful
publication, which SEALS it; the sealed Version IS the Offer; exactly
ONE permanent Snapshot belongs to each sent Version; every later
customer-visible change is a NEW Version — so "the customer accepted
Version N" and "accepted Snapshot F" become one claim, the clean target
PL-4 needs. ◆ THE CONTROLLING ORDER, mechanized: archive ≺ publish ≺
visibility/transport. The Publish door verifies the mandatory archived
artifact EXISTS and is immutable (Guarantee C) BEFORE it seals,
promotes, or supersedes — so the HEADLINE INVARIANT (I-15) is a
transaction-ordering fact: an offer is never superseded until its
replacement exists as a complete, frozen, durably presentable artifact.
Proven live (PB-6): archive absent → publish refused → no seal, no
snapshot, no offer_published, no supersession → the prior offer stays
current. ◆ THE FIFTEEN-STEP ATOMIC DOOR (publish_offer): serialize;
prove publishable; verify staged fingerprint + tenant + version;
evaluate CURRENT policy (completeness core + declared offer profile +
review gate, each named); verify the archive; seal; PROMOTE the staged
package into the permanent Snapshot; record offer_published; → Sent;
identify and supersede the prior current offer (offer_superseded's FIRST
honest writer, exactly as PL-1 promised); mint the durable endpoint;
(transport = Phase B, inactive, not faked); retire the staged identity;
commit all or nothing. ◆ THE VERB IS offer_published (not "sent," not
"extended"): the organization made THIS exact frozen artifact durably
available. Two evidence bases, never conflated: observed (a durable
endpoint minted in-transaction) and attested (in-person; the archived
artifact already exists; the constraint archive ≤ occurred_at ≤
recorded_at makes fraud unconstructible arithmetic, PB-7b). Email/SMS-
only is refused (INVALID_CHANNEL) in Phase A — no transport-backed
presentability is claimed without the outbox. ◆ THE CONSTITUTIONAL
FINGERPRINT: SHA-256 over the canonical customer-visible model (sorted
keys, NFC, minor units, the omission law), renderer identity excluded
(recorded beside, not within — a renderer upgrade never moves it); the
shipped djb2 fingerprintPortable kept for its provenance-churn duty,
replaced here because reuse, staleness, staged verification, and
integrity all hang on collision resistance. ◆ COMPLETENESS, corrected:
the universal core is FORM-INDEPENDENT (a visible commitment, resolved
amounts, one currency); guests and date are demoted to the shipped
CATERING PROFILE — so this operation's behavior is unchanged while the
law generalizes to venues, rentals, retainers, rate cards. ◆ REVIEW is
evidence, never a token: the door evaluates current policy at Publish;
Management may deliberately invalidate an un-published approval by
tightening policy (PB-5b STALE_APPROVAL). ◆ IMMUTABILITY: the Snapshot
is insert+select-only and unfabricatable (no app insert path; only the
SECURITY DEFINER RPC writes it); a sealed Version's customer-visible
content is frozen by a trigger (PB-11c); a snapshotted Version is
hard-delete-blocked (I-10). ◆ NO PARALLEL SEND PATH: sendVersion is
RETIRED to a refusing stub; `sent` is reachable only through the door;
the presentation_snapshot stamp is subsumed as the Snapshot's
presentation section (F-1). ◆ GRANDFATHERING: the migration created
ZERO snapshots, archives, publications, seals, or supersessions; legacy
sent Versions keep their partial stamp, unsealed; the first PL-3
publication on a thread supersedes the legacy current offer honestly
from that point forward. ◆ PROVEN THRICE: seventeen server claims on
real Postgres (PB-1..PB-11: the door, every refusal tooth —
ALREADY_PUBLISHED, STALE_PREPARATION, STALE_APPROVAL, REVIEW_REQUIRED,
INCOMPLETE_OFFER, ARCHIVE_MISSING, INVALID_CHANNEL, NOT_PUBLISHABLE,
cross-tenant promotion — atomicity with zero residue, the I-15
headline, immutability under the app role); eleven unit claims (the
fingerprint law, form-independent completeness, org-neutral evaluator,
the source-order of archive-before-seal, no parallel send path); and an
EIGHTH Chromium suite (accept-publish, PU-1..PU-6) with a SEAL-BITING
variant that fails PU-5 when a sealed offer leaks an edit affordance.
DEPLOY (Phase A): additive — src/ + docs/ + supabase/v265_publish.sql
(run AFTER v263; the proof file is optional verification). RESERVED for
Phase B: the outbox, workers, provider integration, delivery/bounce/
download facts — none may create or alter any constitutional fact.
LOOKING AHEAD: PL-3 Phase B (transport), then PL-4 — Acceptance & the
Instrument, binding to a sealed Version that is one-to-one with its
Snapshot. (v265.publish — 11 claims · PB-1..PB-11 · PU-1..PU-6.)

**6.39a Proposal Lifecycle — Phase A Hardening (PL-3 · v266).** The
adversarial acceptance audit of v265 (conducted against the shipped SQL,
not the release notes) returned STOP with three blocking and three
required findings — and v266 corrects all six. NOT a change to
constitutional law: the law was right; the implementation under-
delivered it in six bounded places, and this release is the catch-up.
◆ B1 · THE THREAD IS SERIALIZED. v265 locked only the publishing
version row; two salespeople publishing sibling versions of one thread
could each find and supersede the same prior offer, committing TWO
current offers — the exact ambiguity the Publication Boundary Amendment
exists to kill. v266 locks the THREAD (proposal row) BEFORE the version,
in a consistent order. A load-bearing discovery, surfaced honestly: the
naive version-then-proposal order DEADLOCKED under a genuine parallel
race; thread-first makes concurrent sibling publishes serialize cleanly
— both commit, the second supersedes the first, exactly ONE current
offer survives. Proven with two real backends racing (v266_race.sql),
not sequentially. I-16 (Single Current Offer). ◆ B2 · THE SEAL SPANS THE
CONTENT. v265's seal froze only proposal_versions columns; the version's
customer-visible CONTENT rows (event_components, component_items,
component_requirements) stayed mutable — a hidden second source of truth
where the Studio could edit a sealed offer. v266 adds BEFORE triggers on
all three content tables, resolving ownership through the FK path to the
owning version's sealed_at and refusing SEALED_VERSION_IMMUTABLE. I-18
(The Seal Spans the Content). ◆ B3 · FRESHNESS IS A DATABASE FACT. v265
trusted the staged package's own fingerprint ("caught by the app's re-
resolve"); v266 adds a content_revision counter bumped by unbypassable
triggers on every content write, captured at Prepare and compared in the
door under lock — STALE_PREPARATION is now a database fact, not an app
courtesy. ◆ R2 · ARCHIVE INTEGRITY. The door now verifies
sha256(artifact_bytes) = artifact_hash before seal/promotion, refusing
ARCHIVE_CORRUPT. I-17 (Verified Promotion). ◆ R3 · APPROVER AUTHORITY.
When policy declares requiredApproverRoles, the door evaluates the
recorded approval authority, refusing INVALID_APPROVER_AUTHORITY;
empty-is-information preserved (no declaration → no gate). ◆ R1 · THE
DURABLE ENDPOINT. /api/offer/[token] now serves offer_snapshots
.artifact_bytes by token — the archived artifact, never live content;
non-disclosing 404 for invalid/inactive/cross-tenant/nonexistent tokens;
an x-artifact-sha256 integrity witness; revocation flips active without
touching the Snapshot. I-19 (Endpoint Honesty). ◆ THE APP CAUGHT UP:
the retired "↻ Send again" affordance is GONE (sending is Publishing;
re-presentation is a communication) — the lifecycle T-5 claim was
updated to assert its ABSENCE, a claim tracking the corrected law, not a
weakening. Sealed versions read "View (sealed)" and offer no content
edit. ◆ FOUR NEW INVARIANTS enter canon: I-16 Single Current Offer
(at most one sent, non-superseded version per thread at every committed
state); I-17 Verified Promotion (a package promotes only if its bytes
hash to its recorded hash); I-18 The Seal Spans the Content (a sealed
version's customer-visible truth includes its content rows; no app-role
write alters it); I-19 Endpoint Honesty (an observed endpoint resolves
to the archived artifact, never live content). ◆ PROVEN: seventeen v266
server claims (HB-1..HB-7, including the two-backend race and a v265-
guarantee regression block confirming no regression under the hardened
door); a genuine parallel race (v266_race.sql); ten new unit claims
(seven source-law pins + three real-renderer-identity integration
claims); four route claims (I-19); the full standing bar re-run
(53 unit suites; both compiler gates; eight Chromium suites — T-5
updated; five variants biting). ◆ RESERVED, RECORDED, NOT IMPLEMENTED:
the staged-package cleanup job; archive bytea scaling (move bytes to
immutable object storage keyed by hash when it bites); an offer validity
window for PL-4 (a future offer-profile fact); a first-class shown-
recipient line; and the legacy approved→won acceptance-shaped writer,
which PL-4 must subsume exactly as PL-3 subsumed sendVersion. DEPLOY:
additive — run v266_hardening.sql AFTER v263 + v265. NO Phase-B transport
and NO PL-4 acceptance were added (a unit pin proves it). VERDICT: after
v266, PL-3 Phase A is READY FOR BOTH.

**6.45 Proposal Lifecycle — PL-4 Close-Out & Certification (v273).** The Phase B
integrity close-out and the formal PL-4 certification, grounded in the four frozen
constitutional documents and the actually-deployed v268–v272 artifacts (not
summaries). The integrated audit found PL-4 Phase A had shipped as a reduced
observed-path implementation: two settled invariant clauses were under-enforced
by `accept_offer` even though the frozen data to enforce them was already sealed
into every post-v268 Snapshot — I-22 expiry (the frozen `validUntil` was never
read; an expired Offer stayed acceptable) and I-26 cardinality (only option
membership and duplicate-freeness were checked; the frozen `min`/`max`/`chooseCount`
bounds were ignored, so "choose exactly N" could be met with fewer, more, or
none). Neither was a false certification — the v271 proof never claimed them and
§6.43 recorded them by omission — so both are honest under-enforcement gaps, not
contradictions. v273 closes them with ONE narrow, no-schema, no-signature
replace-in-place of `accept_offer`: the half-open `[published_at, valid_until)`
expiry check against the database server clock (observed acceptance governs on
the recorded moment; the attested claimed-moment branch is a documented
unreachable seam, not dead code), and per-frozen-group cardinality with the
binding legacy precedence — explicit `min`/`max` → frozen `chooseCount` as
`min=max` → refuse `ACCEPT_LEGACY_CHOICE_UNRESOLVED` (never infer a cardinality
the artifact did not freeze; absent-mandatory and excessive both refused). No
other object touched; v271's offers (empty model) regress green because the
checks correctly no-op on legacy-shaped snapshots. PROVEN: v273_proof.sql, 35
claims rerunnable with zero residue — XP-1..XP-4 (past→EXPIRED, future accepts,
null open-ended, at-boundary refused under the half-open rule), SC-1..SC-8
(under→INCOMPLETE, over→INVALID, exact accepts, absent-mandatory→INCOMPLETE,
optional min-0 empty accepts, chooseCount-only derivation, legacy-unresolved
refused, canonical immutable storage), CL/BY/LR/PX/IM/TI (accepted bar without
rescission; unauthorized and evidence-missing rescissions refused; the
rescind-then-supersede bypass unconstructible; **a status column forged to
`rescinded_republishable` with no rescission record does NOT release — the gate
reads the acceptance⋈rescission relation, never the flag**; ledger replay
fact→record→`republish_permission`→exact projection; terminal bars republication;
atomicity; immutability under role `authenticated`; tenant isolation with no
existence leak). GENUINE two-backend race certification (v273_race.sql, throwaway
db): six load-bearing pairs — rescind×rescind, rescind×publish, rescind×withdraw,
accept×rescind, terminal×publish, unauthorized-rescind×supersede — each with both
launch orders exercised, both lawful serializations observed for rescind×publish,
zero deadlocks, no split state, no bypass. Standing bar green, NO regression:
v265–v272 proofs pass, v271/v272 races regress, 54/54 unit suites, TypeScript
diagnostic set unchanged from the v272 baseline (v273 is SQL-only), es5 gate at
the pre-existing baseline, strict gate clean, eight Chromium suites (98) +
production (7) + route (7), five variants biting. Deliverable: PL-4_CERTIFICATION.md
carries the full I-15..I-30 traceability matrix, the object/ceremony/lock-order/
authority/projection maps, and the deferred seams. VERDICT: **FREEZE THE
IMPLEMENTED PL-4 SURFACE.** Acceptance (observed) + Rescission are complete and
frozen — every invariant I-20..I-30 traced to enforceable SQL, a functional proof,
and a genuine race proof where concurrency is claimed, with no reliance on mutable
status text; nothing in the implemented surface is provisional. Attested Acceptance
(§4.2 / plan A.5) is an explicitly RESERVED constitutional capability — recognized
in the constitution, recorded as a later slice (§6.43), its record slots already
provisioned — scheduled as its own future slice; it was intentionally not built,
not left undone, and being additive rather than corrective it extends the frozen
surface later without reopening any frozen law. CONSTITUTIONAL STABILITY: the audit
found NO contradictions among the constitution, reconciliation addendum,
implementation plan, reconnaissance, deployed SQL, proofs, and race behavior; every
discrepancy was either an implementation omission corrected in v273 (expiry,
cardinality; no schema/law change) or a documented deferred capability recognized
before build — NO constitutional law required amendment. This closes the PL-4
constitutional design phase: the law is stable, the implemented surface conforms
and is frozen, and the one unbuilt capability is a reserved extension of that
stable law. DEPLOY: additive —
`v273_pl4_closeout.sql` after v272; the proof is optional verification, the race
file is throwaway-database only. Next: the Attested Acceptance slice, then the
Agreement lifecycle (PL-5), whose cardinality over accepted Offers is reserved.

**6.44 Proposal Lifecycle — PL-4 Rescission (v272).** The authority-gated
release of an Acceptance — the only door out of the accepted state (I-23), and
the door is default-deny (I-29). One immutable record: acceptance_rescissions
(insert+select only; NO update/delete policy — the v269 evidence discipline),
plain UNIQUE(acceptance_id) because EVERY row is a binding release (commentary
and refused attempts belong to audit logs, never this table); policy_class is
the Addendum's closed five-class contract (self_withdrawal, mutual_release,
operator_correction, fraud_correction, compelled_reversal — CHECK, no sixth);
republish_permission lives ON the record and is the SOURCE the projection and
the publish gate derive from (I-30). One ceremony: rescind_acceptance —
SECURITY DEFINER, tenant-scoped resolution (out-of-tenant = CEREMONY_NOT_FOUND,
no existence leak), the SHARED thread-first lock (v266 order; publish/withdraw/
accept/rescind serialize in one total order, no deadlock constructible),
relation-checked single effective rescission (UNIQUE as race backstop only),
then the default-deny gate: self_withdrawal demands the SAME endpoint
capability that accepted (evidence.capability = the acceptance's
capability_ref); mutual_release demands BOTH assents; operator_correction
demands supervisory authority; fraud_correction demands the determination ref
AND an explicit republish outcome (class alone cannot determine it —
RESCIND_PERMISSION_REQUIRED); compelled_reversal admits the external basis ONLY
as an authorized platform actor attesting the instrument; unknown class refuses
(RESCIND_UNKNOWN_CLASS); contradicting a class-fixed permission refuses, never
silently corrects (RESCIND_INVALID_PERMISSION); reason mandatory. The richer
per-class authority MODEL stays the deferred seam, honored as deferred — v272
enforces the structural default-deny shape only. Atomic write: the binding
record + the acceptance_rescinded ledger fact whose object_ref IS the record
(replay resolves record → republish_permission → the exact projection, I-30) +
the derived projection — rescinded_republishable or rescinded_terminal, both
free text (v270 C.3: status stays a projection, never a lifecycle model; two
projections because fraud/compelled may permit OR bar republication). The
acceptance and its selection set are NEVER touched (I-27 — rescission is
additive, a second fact BESIDE the evidence, not an eraser); a rescinded Offer
still refuses withdrawal (the surviving acceptance relation) and its snapshot
can never be re-accepted (a new commitment requires a NEW Offer). publish_offer
STEP 10/11 reworked in place: discovery widened to the full current-Offer
vocabulary ('sent','accepted','rescinded_republishable','rescinded_terminal')
so the structural gate — never a discovery accident — decides; the gate reads
the acceptance JOINED to the rescission RECORD (never status text): acceptance
without rescission → PUBLISH_BLOCKED_BY_ACCEPTANCE (the v270 law, unchanged);
terminal release → PUBLISH_BLOCKED_TERMINAL_RESCISSION (distinct refusal);
republishable release → the thread is open again and STEP 11 supersedes the
prior from its TRUE state (the ledger fact records
from_state='rescinded_republishable'). PROVEN: v272 proof RS-1..RS-16, 37
claims rerunnable with zero residue (all five classes; the default-deny battery
with rowless refusals and untouched projections; the rescind-then-supersede
bypass unconstructible; ledger replay reconstructing the projection;
immutability under role authenticated with prod-like grants; tenant isolation;
forced-failure atomicity — record+fact+projection are one transaction);
GENUINE two-backend races (v272_race.sql, throwaway db): rescind/rescind → one
binding rescission, loser refused; rescind/publish-sibling run repeatedly in
both launch orders — BOTH lawful serializations observed (publish-first barred
by the still-unrescinded acceptance, rescission lands after; rescind-first
opens the thread and publish supersedes from the true state), zero deadlocks.
Standing bar green, NO regression (zero new tsc against a pristine v271
baseline, 54 unit suites, both gates, eight Chromium suites 98/98, route 7/7,
five variants biting — the paper persist-on-pick variant recipe updated to
PresentationRooms, where the pick handler now lives; v265–v271 proofs pass).
Additive + the publish_offer replace-in-place; deploy v272_rescission.sql after
v271. Next: v273 — PL-4 close-out (integrity/concurrency hardening
consolidation) and the constitutional acceptance/rescission model review.

**6.43 Proposal Lifecycle — PL-4 Acceptance Ceremony (v271).** The first
operational realization of Acceptance: the SQL ceremony public.accept_offer that
converts a published Offer into an immutable Acceptance. SECURITY DEFINER,
search_path=public; authorization is by current_tenant_id() (auth.uid() → active
tenant_users), so definer privilege never becomes the authorization model —
every read/write is tenant-scoped and an out-of-tenant version does not resolve
(CEREMONY_NOT_FOUND, no existence leak). The ceremony: (1) takes the SHARED
thread-first lock — proposal row, then version row, identical to publish_offer /
withdraw_offer, so accept/publish/withdraw acquire locks in one compatible order
(no deadlock); (2) at the linearization point proves eligibility from the locked
row (sealed, not withdrawn/superseded) and refuses a second acceptance via the
RELATION (offer_acceptances by snapshot), before the status check, so replay
returns ALREADY_ACCEPTED not NOT_ELIGIBLE; (3) resolves the immutable snapshot
(one per version) and binds ITS fingerprint (I-21, no recompute); (4) validates
selections against the FROZEN model.choiceGroups (v268 groupId/optionId) — never
live choice_groups — refusing foreign options (ACCEPT_INVALID_SELECTION) and
duplicates (ACCEPT_DUPLICATE_SELECTION, never deduped); (5) ATOMICALLY writes
offer_acceptances (A.1) + acceptance_selection_sets (A.2, by-value frozen ids) +
one offer_accepted ledger fact (snapshot_ref/fingerprint_ref identify the same
object) + the status='accepted' projection (I-30). Observed self-service: it
populates snapshot/fingerprint/booking/tenant, evidence_basis='observed',
channel, authority_basis='self', principal=acting_person, capability_ref,
recorded_moment=now(); recording_operator/claimed_moment/attestation_ref stay
NULL (no invention; the attested path is a later slice). v271 DELTA to
publish_offer: STEP 10 discovery widened from status='sent' to ('sent',
'accepted') so an accepted Offer (now projected 'accepted') remains discoverable
and the v270 accepted-bar evaluates it — the STEP 11 UPDATE still targets ONLY
'sent', so an accepted prior is barred, never mutated. (This closed a real
projection/bar interaction found in proof: without it a sibling published over an
accepted Offer.) Application: POST /api/offer/[token] gathers only acknowledgment
+ selections and calls the ceremony once — no eligibility judgement, no
client-authored timestamp, no selection mutation, refusals mapped to stable
non-disclosing codes. PROVEN: v271 proof AC-1..AC-12 (normal accept; one
acceptance; one selection set; double refused; fingerprint equality; atomic
forced-rollback leaves neither row; foreign+duplicate options refused; accepted
cannot be withdrawn/superseded; tenant isolation; replay leaves one row+one
ledger fact; zero residue), rerunnable; GENUINE two-backend races (accept/accept
→ one acceptance; accept/withdraw → one serialization; accept/publish → accepted
Offer never superseded) all deadlock-free. Standing bar green, NO regression
(zero new tsc, 54 unit suites, both gates, eight Chromium suites, route 7/7, five
variants biting; v265–v270 proofs pass). Additive; deploy after v270. Next: PL-4
rescission (v272) per the approved roadmap — NOT part of v271.

**6.42 Proposal Lifecycle — PL-4 Protective Compatibility Amendments (v270).**
The bars that MUST exist before the v271 acceptance ceremonies, so an acceptance
can never exist for even one production interval without the accepted-Offer
protections and the shared thread-first lock. Narrow replace-in-place amendments
to exactly two PL-3 functions; no acceptance rows, no validation, no rescission,
no new lifecycle model; no PL-3/PL-4 invariant weakened. (C.1) publish_offer
gains an ACCEPTED-OFFER BAR at STEP 10/11: when the prior current Offer has an
acceptance record it refuses PUBLISH_BLOCKED_BY_ACCEPTANCE rather than superseding
it (I-23) — under the existing STEP-1 thread lock, so race-safe; the body is
otherwise the byte-identical v267 law with the v267b digest qualification
preserved. (C.2) withdraw_offer gains TWO amendments: it adopts the v266
thread-first lock order (proposal row first, then version row — the deployed body
locked only the version), bringing withdrawal into the single total order (I-25);
and an ACCEPTED-GUARD refusing WITHDRAW_BLOCKED_BY_ACCEPTANCE on an accepted Offer
(releasing a commitment is rescission, a later slice, never withdrawal). (C.3)
status vocabulary: proposal_versions.status is free text (no CHECK/enum, verified),
so 'accepted' is already admissible with NO DDL — deliberately no CHECK is added
(that would be a new lifecycle model, and status stays a projection of the
immutable acceptance record, never a substitute, I-30). Both bars resolve
STRUCTURALLY against the immutable v269 acceptance relation (an offer_acceptances
row whose snapshot's version_id is the Offer's version), NOT status text. PROVEN:
v270 proof — PV-1 unaccepted publishes, PV-2 unaccepted withdraws, PV-3 accepted
cannot be replaced + PV-3b the accepted object is not mutated, PV-4 accepted
cannot be withdrawn, PV-5 protection is STRUCTURAL (status held constant at 'sent',
removing the relation re-enables withdrawal), PV-6 thread-first lock present in
withdraw, PV-7 tenant isolation — rerunnable, zero residue, production-faithful
identity harness. Standing bar re-run with NO regression (zero new tsc, 54 unit
suites, both gates, eight Chromium suites, five variants biting; v265/v266/v267/
v268/v269 proofs green). Rerunnable, production-safe; deploy after v269, before
v271. Next: v271 acceptance ceremonies. (Also: the v268 proof was corrected to
the production-faithful discover-existing-user identity harness, matching v269.)

**6.41 Proposal Lifecycle — PL-4 Acceptance Records (v269).** The second PL-4
slice: the immutable acceptance data model, storage only — no ceremony, no
validation, no rescission, no publication change. Two additive tables. (A.1)
offer_acceptances — the immutable acceptance evidence, insert+select only, with
UNIQUE(snapshot_id) enforcing at-most-one-acceptance-per-Offer (I-20). It
reserves EVERY constitutional field now so the schema needs no later redesign:
snapshot_id + fingerprint (the accepted object and its binding, I-21), and the
reserved identity model — principal, acting_person, recording_operator,
authority_basis, evidence_basis, channel, recorded_moment, claimed_moment,
capability_ref, attestation_ref — of which the identity/attestation fields are
first POPULATED by the v271 ceremony (present here so the shape is settled). (A.2)
acceptance_selection_sets — the immutable 1:1 selection-set child, insert+select
only, with UNIQUE(acceptance_id) enforcing exactly-one-child. Its selections are
stored by value naming FROZEN group/option identities from the snapshot model,
with NO FK to the live choice_groups table (I-21/I-26), and an explicit empty-set
marker when the Offer carried no choices. Validation is NOT implemented here — it
belongs to v271. Immutability is structural: neither table has an update or delete
policy (the PL-3 append-only discipline). PROVEN: v269 proof (AR-1 immutable
create, AR-2 UNIQUE(snapshot) duplicate refused, AR-3 exactly-one selection child,
AR-4 tenant isolation, AR-5 no update path), rerunnable with zero residue; the
standing bar re-run with NO regression (zero new tsc vs baseline, 54 unit suites,
both gates, eight Chromium suites, five variants biting; v265/v266/v267/v268
proofs intact). Additive, forward-compatible, rerunnable; no PL-3/earlier-PL-4
object touched. Next: v270 protective compatibility amendments (publish_offer
accepted-bar, withdraw_offer accepted-guard + thread-first locking, status
vocabulary widening) — which MUST deploy before v271 ceremonies.

**6.40 Proposal Lifecycle — PL-4 Offered Terms (v268).** The first PL-4 slice,
additive, PL-3 untouched. The publication resolver's frozen model now carries the
offered terms the acceptance ceremony will bind to. THREE additions, all frozen
by value into offer_snapshots.model at publication and therefore fingerprint-
covered — the customer accepts them exactly: (1) valid_until — the offered
validity deadline, an additive nullable version-scoped field (null = open-ended);
(2) stable frozen choice-group and option identities (groupId, optionId) captured
by value at seal, the referents a recorded acceptance selection will name —
never the live choice_groups table (I-21/I-26); (3) explicit minimum/maximum
selection bounds, with the legacy choose_count mapping to min=max (exact choice).
The choice identities and bounds are pure resolver output (no schema change — the
model is already sealed jsonb). Only valid_until needs a column; it is added to
proposal_versions, read by the resolver, and — extending the v267 version-row
seal guard and revision witness by one field each — frozen at seal and staling a
prepared package on a draft edit. Forward-compatible: absent valid_until reads as
null/open-ended, so every existing draft and published Offer is unaffected;
missing choice bounds are NOT defaulted (a group with neither explicit bounds nor
choose_count will refuse at acceptance with LEGACY_CHOICE_CONTRACT_UNRESOLVED —
the ceremony never infers contractual meaning). PROVEN: v268 proof (VT-1 null
default, VT-2 draft bump, VT-3 sealed refusal) on the full stack; the standing
bar re-run with NO regression (54 unit suites, both gates, zero new tsc vs
baseline, eight Chromium suites incl. paper rendering the enriched model, five
variants biting; v265/v266/v267 proofs intact under the extended guard/bump). No
PL-3 law, ceremony, or invariant altered — publish_offer, the publication
ordering, and the archive discipline are unchanged. Next: v269 acceptance
evidence records.

**6.39b Proposal Lifecycle — Phase A Boundary Completion (PL-3 · v267).**
The enumeration closed. A verification audit of v266 found the seal and
the revision witness were built against an INCOMPLETE list of the
resolver's version-scoped customer-visible tables; a dedicated
reconnaissance then traced buildPresentationModel (the one resolver
feeding the renderer) exhaustively and proved the true boundary. v267
brings the ENTIRE resolver read-set inside both mechanisms. ◆ THE CLOSED
ENUMERATION. buildPresentationModel reads exactly ten tables. Of those,
the version-scoped customer-visible set is SEVEN: event_components,
component_items, component_requirements (sealed in v266) PLUS
version_adjustments, version_guests, version_sections, choice_groups
(sealed here) — the last, choice_groups, was missed by BOTH prior audits
and carries the customer-facing choice labels and counts. PLUS three
customer-visible FIELDS on the version row the v265 guard never listed:
customer_intro, customer_closing, price_visibility (the offer's opening
letter, closing text, and whether prices show at all). version_adjustments
is the gravest: it carries the offer's MONEY — the service charge, the
mashgiach fee, discounts. Outside the boundary, correctly: bookings and
proposals (booking- and thread-scoped — frozen BY VALUE in the Snapshot,
never sealed at their operational source, which would freeze data that
legitimately changes for reasons unrelated to any one offer);
section_types and guest_categories (tenant config); blueprints (a
template-lineage pointer, not in the model). The distinction IS the
constitutional content: the boundary is version-scoped customer-visible
truth; booking/thread/config data is frozen by value, not sealed. ◆ THE
SEAL SPANS IT ALL (I-18, completed). guard_sealed_version_scoped (a
version_id-direct trigger) refuses insert/update/delete on all four new
tables when the owning version is sealed; the version-row guard now also
freezes customer_intro/closing/price_visibility. A sealed offer's money,
guests, structure, choices, and prose are all immutable — proven
(VB-1..VB-5). ◆ THE REVISION WITNESS SPANS IT ALL (B3, completed). Each
new table bumps content_revision; the version-row bump now covers the
three fields. The gravest v266 hole is closed: an adjustment edited
between Prepare and Publish now stales the package — MONEY cannot be
published stale (VB-7). ◆ STEP-11 HARDENED. The supersession UPDATE
carries a status='sent' guard and offer_superseded is written only when
exactly one row was actually superseded — a withdraw racing between the
prior-offer SELECT and the supersession UPDATE can no longer overwrite a
withdrawn offer to superseded or write a false ledger entry (VB-8).
Invariant: supersession transitions sent→superseded and no other state.
◆ PROVEN: twelve v267 server claims (VB-1..VB-8 on real Postgres); the
full standing bar re-run with NO regression (54 unit suites incl. a
closed-enumeration pin that fails if the resolver grows an unclassified
read; v266's 17 server claims and genuine race intact under the v267
door; both compiler gates; eight Chromium suites; five variants biting).
◆ THE ENUMERATION IS CLOSED: every version-scoped customer-visible source
the publication resolver reads now participates in both the seal and the
revision witness; no additional such source remains. DEPLOY: additive —
run v267_boundary.sql AFTER v263 + v265 + v266. NO Phase-B transport and
NO PL-4 acceptance were added. After v267, PL-3 Phase A is READY FOR BOTH.


**6.38 Proposal Lifecycle — Relationship (PL-2 · v264).** The second
identity, stored at last, built to the corrected PL-2 specification
(three operator corrections adopted: the audited correction ceremony;
door-only creation as slice scope, not ontology; the compound-door
arithmetic — plus the naming refinement: CORRECT CITATION, because the
object corrected is the engagement's citation). Reconnaissance had
found the system waiting by name — customer.ts self-described as
"pre-customer-entity," party identity derived on read, the customer
page addressed by a booking id. ◆ THE OBJECT: relationships — IDENTITY
ONLY per Interpretive Note 1: name, kind (person/household/
organization, projected as Individual/Family/Organization), normalized
contact identity, standing notes. Statelessness is STRUCTURAL: no
status/state/stage/lifecycle/tier/role column EXISTS (proven against
information_schema, RP-8d) — nothing to misuse; and NO delete policy —
a Relationship never expires (RP-8e). The citation: ONE nullable
relationship_id on bookings, NULL = honestly unattached, written by
exactly three SQL sites and nothing in the app (pinned). ◆ THE
COMPOUND DOOR (open_inquiry_with_relationship): one user action, one
transaction, TWO ceremonies, TWO entries — it CALLS PL-1's
open_inquiry unchanged (its own `opened` entry) and writes exactly one
of its own (relationship_established / relationship_found); v263
byte-untouched (pinned). ATOMICITY PROVEN (RP-3): a door refused
mid-way — the legacy-ahead guardrail firing on the spine leg — left
ZERO residue: no orphaned party, no citation, no entries. FOUND
pre-selects only on an unambiguous match (V-1/V-2: one candidate
pre-selects, two present as explicit choice, CREATE always adjacent);
identity (name + phone-or-email) required at the door (RP-4).
◆ ADOPT: one existing engagement, one human act, one entry;
ALREADY_ATTACHED — adoption never re-writes (RP-5b); SPINE-ORTHOGONAL,
proven: a legacy-ahead engagement (won proposal, NULL spine) adopted
cleanly with its spine untouched (RP-5/6) — identity and lifecycle are
different questions, mechanically. ◆ CORRECT CITATION — the operator's
correction made law: append-only means corrections stay VISIBLE, not
that falsehoods become permanent. Previous ref + replacement ref +
MANDATORY reason; the original adoption entry STANDS (RP-7 counted
it); three named refusals; NOT merge — combines nothing. The history
honestly reads "attached to A; corrected to B because the office
landline matched the wrong family." ◆ AMEND: owned facts; contact
changes append relationship_identity_amended WITHOUT the values — no
PII in the undeletable ledger (RP-8c greped the entry for digits and
@ and found none). ◆ THE TWO VOICES, structural: ceremonial surfaces
carry data-rel-provenance="ceremonial", derived ones "derived"; the
new-booking door mounts found-or-create above the old dupes panel;
the customer page speaks both voices — RelationshipHeader + per-item
Adopt suggestions when attached, the honest derived banner when not —
and customer.ts survived byte-untouched as the suggestion law, pure
and read-only (no IO, pinned): no code path leads from a match to a
write. ◆ HONEST GRANDFATHERING, third verse: the migration created
ZERO relationships, ZERO citations, ZERO entries (RP-8a/b);
extraction proceeds by ceremony as engagements are touched.
◆ PROVEN TWICE: fifteen server claims on real Postgres (RP-1..RP-8)
and a SEVENTH Chromium suite (accept-relationship, V-1..V-7:
unambiguous pre-selection, ambiguous explicit choice, the two voices
never blended, singular adoption with no select-all, the correction
door demanding target AND reason and firing once, rendering firing
nothing, statelessness visible). DEPLOY: src/ + docs/ +
supabase/v264_relationship.sql (run AFTER v263; the proof file is
optional verification). LOOKING AHEAD: PL-3 — Send and the Sent
Snapshot. (v264.relationship — 10 claims · RP-1..RP-8 · V-1..V-7.)

**6.37 Proposal Lifecycle — Spine & Ledger (PL-1 · v263).** The
first slice of the LOCKED PL map, and the Execution OS era's
foundation stone, built exactly to the corrected PL-1 specification.
◆ THE SPINE: bookings.spine_state — the engagement's CEREMONIAL
lifecycle position, NULLABLE with NULL meaningful (an untouched
legacy engagement has no ceremonial state), full constitutional
vocabulary admitted by CHECK so later slices never re-open the
column, added BESIDE the existing sixteen-value operational
`bookings.status` pipeline — which stays exactly what the corrected
spec ruled it: the untouched legacy operational workflow axis, not
the spine, carrying no authority over lifecycle state, synchronized
with nothing, and deliberately left constitutionally UNCLASSIFIED
(the Execution Constitution's ruling to make). Dormant states
(committed…settled, cancelled) are VALUES WITH NO DOOR: no function
writes them, pinned. ◆ THE CEREMONY MODEL, built once for every
future slice: four RPCs (open_inquiry · open_proposing ·
decline_engagement · withdraw_offer), each atomic — row lock,
precondition at the door, one state write, exactly ONE ledger entry
— attached at the product's real choke points (booking creation
births the spine; both create-proposal paths fire the Proposing
door; the Withdraw door lives on the version row) and tolerated on
refusal (a refused ceremony leaves the row honestly derived,
never fabricated). ◆ THE GUARDRAIL AS LAW: no bridge transitions —
open_inquiry refuses legacy-ahead rows (CEREMONY_LEGACY_AHEAD);
open_proposing's third honest outcome is legacy_untouched (zero
writes; the create proceeds; the row stays derived); decline
refuses NULL. ◆ THE LEDGER: engagement_ledger, append-only AT THE
POLICY LAYER (insert+select only — the blueprint_compositions
discipline), four required fields NOT NULL, zero commercial
content, and NEVER an input to state — the slice's central
invariant (state is the answer; the ledger is the history of
answers) pinned as the sole-reader rule. ◆ THE TWO-CONCEPT MODEL at
the center of honest grandfathering: CEREMONIAL SPINE STATE
(stored, ledger-backed) vs LEGACY-DERIVED LIFECYCLE CLASSIFICATION
(read-time, provenance-marked, ceremonial state ABSENT and legible
as absent) — the badge exposes value AND provenance, never
collapsed; an old won proposal reads "Committed · legacy-derived ·
ceremonial spine state: absent," claiming no ceremony, no
Instrument, no history. The migration fabricated NOTHING: no
backfill, no ledger seed, no default. ◆ VERSION TERMINALS:
Withdrawn reachable only by its ceremony; SUPERSEDED SHIPPED WITH
NO WRITER — vocabulary + labels + read tolerance + a setter that
refuses it by name; its first honest writer is PL-3/PL-4 (the
sendVersion recon stands recorded in the spec). ◆ PROVEN TWICE:
fifteen server claims green on real Postgres (SP-1..SP-8: virgin
opening, double-open refusal, the guardrail's three refusals,
policy-layer append-only under the app role, withdraw semantics,
superseded-has-no-writer via pg_proc, fabrication zero) and a NEW
SIXTH Chromium suite (accept-spine, 6 claims: value-and-provenance,
plain ceremonial badge, zero edit affordances on history + honest
emptiness, no door for legacy rows, decline fires once with its
reason, ordinary interaction leaves the badge inert). DEPLOY: src/
+ docs/ + supabase/v263_spine_ledger.sql (run it; the proof file is
optional verification). LOOKING AHEAD: PL-2 — the Relationship,
found-or-created at the Open Inquiry door this slice just built.
(v263.spine — 10 claims · SP-1..SP-8 · S-1..S-6.)

**6.36 Blueprint Workflow Unification (v262).** The reconciliation
named in §6.35 — the last competing Blueprint doctrine retired. NOT a
feature: product coherence only — no SQL, no law, validator, resolver,
or ceremony change (all pinned). After this slice there is ONE
workflow and ONE language, and every remaining Blueprint action in
the product maps onto exactly one of FOUR CATEGORIES: CREATION →
Instantiation (BP-3, New Proposal → Start from Blueprint) · AUTHORING
REUSE → Composition (BP-8, Copy into Draft on the Shelf) · KNOWLEDGE
CAPTURE → Promotion (BP-5, the Studio header ceremony) · REFERENCE →
Citation / View Source. ◆ THE v216 LAND/APPLY DOCTRINE, RETIRED —
audited consumer by consumer, capability preserved, implementation
replaced: the Studio page's landing orchestration (openLanding /
commitLanding / landing state / the apply, replace-with, and subset
verbs / the legacy promote and list calls) removed wholesale; the
canvas drop branch for the retired drag payload removed and the
payload mime extinct across src (pinned); the two onLandDesign hosts
now no-ops with the retirement named (no Library kind has emitted
land since v256); the desk's legacy "Save as Blueprint" removed —
v255's ceremony IS the capture door; LandingDecision.tsx DELETED (a
blueprint-specific surface with no non-legacy caller); the genesis
blueprint route removed from VersionGenesis (props, mode, option,
pick surface) and from both callers — new versions are revise/copy/
blank; designing from a Blueprint is a proposal-creation act.
◆ THE PANE'S BLUEPRINTS TAB, RECLASSIFIED into the reference
category: it now reads the PUBLISHED shelf via the v261 read and
shows shelf cards with View-on-Shelf links, routing creation and
reuse to their doors BY NAME; no add/copy action touches blueprint
content (the constitutional ruling stands: subset-into-a-DESIGN has
no equivalent by design — composition is draft-side authoring;
instantiation is whole and parameterized). ◆ THE GLOBAL PIN v261
COULD NOT MAKE, now made: zero live importers of the legacy module
across src — only the module itself and its retired-in-place page.
◆ VOCABULARY swept product-wide (word-bounded, fragment-built in the
suite so the pin cannot trip itself): the apply/replace-with/refresh-
from/update-from/pull-latest/sync phrases are extinct; the product
teaches Start from Blueprint · Instantiate · Copy into Draft · View
Source · Promote. ◆ PROVENANCE INTACT, INDEPENDENCE UNMOVED: the
citation keeps toggle/detail/answers/view-source; v255/v258
provenance records and their append-only policies byte-free of v262;
the instantiation wrapper and SQL, divergence law, and citation reads
untouched — independence still rests on the proven acts.
◆ ACCEPTANCE FOLLOWS THE PRODUCT, recorded: lifecycle G-1's route
list shrinks to revise/blank and G-4 is REWRITTEN as the negative
claim (the retired route does not exist; looking commits nothing) —
count stays 27; the landing suite RESTRUCTURED: the decision-mode
claims D-1..D-5 retired WITH their surface (their commitment
disciplines live in the constitutional heirs' unit pins —
CopyIntoDraft's staged problems block the single act;
StartFromBlueprint's conflicts land nothing), while the drag-ENGINE
claims D-6..D-8 remain over a fixture wearing neutral card-payload
vocabulary — landing count is now 3, and the retired decision-variant
recipe is removed with its target. ◆ THE ONE STORY a new user learns: write
reusable organizational knowledge → publish it → instantiate it into
a proposal → customize → accept → execute → promote improvements
back. ◆ LOOKING AHEAD, per the operator's direction: the Blueprint
platform is FUNCTIONALLY COMPLETE. The roadmap pivots from knowledge
authoring to the PROPOSAL LIFECYCLE — v263 begins the arc from
conception through client approval into operational execution:
EventCore as an Execution OS. DEPLOY: src/ + docs/ only.
(v262.unification — 10 claims.)

**6.35 Blueprint-to-Proposal Workflow Integration (v261).**
Instantiation becomes a NATIVE proposal-creation path — composed
entirely from existing law, with no SQL and no law edits (pinned).
◆ THE THREE PATHS: New Proposal now opens a deliberate chooser —
Start blank (the existing seed/archetype/theme flow) · Start from
Blueprint · Copy an existing Proposal (the EXISTING createProposal
copy machinery, fed by a REAL latest version of this booking's
proposals — never a pointer). ◆ START FROM BLUEPRINT
(StartFromBlueprint.tsx): pick an EXACT published revision (read
filters active + offering; the offered revision fetched by id, pinned)
→ answer the Blueprint's declared questions (typed inputs; guest count
required) → read the DETERMINISTIC REVIEW — verdicts from v260's
simulate, i.e. BP-7's own evaluation law (the flow pinned free of any
evaluation of its own), blocking BY NAME on missing required answers,
and disclosing honestly where BP-3's act lands the design (a new
version on the booking's latest proposal when one exists; a new
proposal named after the Blueprint otherwise) → the act is BP-3's
EXISTING v253 wrapper (the slice's only write; staged conflicts render
named with the zero-residue truth) → success opens Proposal Studio at
the exact created version. ◆ ORIGIN WITHOUT CONTROL: the citation
details (v254/v257) now read as the full origin panel — "Started from
{name} rN" · instantiated timestamp · fingerprint · "Answers given:
…" · a View-source pointer to the shelf — and the entire slice is
pinned free of live-dependency vocabulary (no refresh-from,
apply-latest, or update-from-source anywhere). Divergence view and
Promotion already sit beside the citation from v254/v255.
Independence needs no new proof: it IS the existing law (v253
independence claims, v257 one-time resolution), which this slice is
pinned not to have touched. ◆ THE LEGACY v182 MODEL LOSES ITS
CREATION-TIME CONSUMERS: the New Proposal dropdown (which fed
createProposal from a stale source_version_id pointer) and the
VersionGenesis blueprint route (createBlank + getBlueprint +
applyBlueprint) are superseded; the card imports nothing from the
legacy module (pinned). ◆ NAMED NEXT RECONCILIATION — recorded, not
half-fixed: the STUDIO-side legacy consumers remain — SourceEventPane's
blueprints tab (listBlueprints/previewBlueprint), LandingDecision's
BlueprintPreview, and the studio page's apply verbs (applyBlueprint,
replaceWithBlueprint, applyBlueprintSubset, promoteToBlueprint,
getBlueprint) — the v216 land-and-apply machinery reading the retired
pointer model live into open designs. Retiring it is a full slice
(drag machinery + the 27-claim lifecycle harness ride on that page)
and is the queue's next reconciliation. DEPLOY: src/ + docs/ only.
(v261.workflow — 8 claims.)

**6.34 Blueprint Studio — Object-Centric Authoring & Simulation
(v260).** A product refinement, PRESENTATION-ONLY over frozen
BP-1..BP-8: zero SQL, zero law edits, zero change to publication,
promotion, composition, or instantiation (all pinned; the law files
and ceremony surfaces are pinned free of v260 edits). The guiding
question changes from "where would you like to edit this rule?" to
"WHICH REUSABLE THING ARE YOU WORKING ON?". ◆ THE OBJECT WORKSPACE
(primary editing experience): a structural tree on the left
(chapters → sections → components); selecting an object opens a
workspace showing everything about it TOGETHER — and it is a
PROJECTION, not a second model: it renders the LITERAL EntryEditor on
the LITERAL patch path the structure dashboard uses (pinned: exactly
two EntryEditor sites, identical patch expression, no second save),
plus read-only cross-references — inherited chapter/section rules
described in words with "edit them on their own level", influencing
questions resolved from condition references, section dress presence.
Removing the object clears focus via onGone plus a content-derived
guard, so summaries can never go stale (pinned). ◆ FUTURE EVENT
BEHAVIOR: a descriptive summary assembled from the shape — appears-
when wording, pricing form name, governing conditions, questions,
choices — "descriptive only", with assistive vocabulary pinned absent
(no recommendations, predictions, or auto-anything; the editor stays
fully deterministic). ◆ describeCondition: deterministic plain
language over the full BP-7 vocabulary using parameter LABELS ("Guest
Count is at least 100", AND/OR/NOT composition) — WORDING only, never
evaluation. ◆ SIMULATION ("instantiate… without saving anything"):
typed inputs for every declared parameter; verdicts computed
EXCLUSIVELY by the existing law — branchMap + evaluateCondition, the
exact functions BP-3's SQL mirrors — with the studio module pinned to
never index an answer map itself (even the required-answer presence
check runs through the law's own `present` predicate); nothing
persists (panel and module pinned free of supabase/rpc/save). Missing
required answers block BY NAME ("Answer these first: …"); results
render ✓/✗ per section/component/item rule with expandable reasons
where EVERY row is the law's own per-leaf verdict (explainCondition
held-flags proven equal to evaluateCondition leaf-by-leaf; NOT
inverts and says so). Fixture-proven against instantiation semantics
(section gates cascade; 150/standard excludes the premium-gated
component). ◆ GLOBAL AREAS REMAIN as "Organizational dashboards"
beneath the workspace (all seven pinned present). ◆ REVIEW BEFORE
PUBLISHING gains READ-ONLY diagnostics: required questions every new
event must answer; unused parameters (guest_count exempt — the act
itself always asks it); conditions referencing missing questions.
Nothing auto-fixes (Diag pinned patch-free). DEPLOY: src/ + docs/
only. (v260.studio — 10 claims.)

**6.33 Editor Foundation / Guided Draft Entry (v259).** The FIRST
Blueprint Editor experience — a product-design layer, PRESENTATION-ONLY
over the frozen BP-1..BP-8 architecture: zero SQL, zero law edits (both
pinned), the guide modules write-free, publication untouched. Named
deliberately: this is Editor Foundation, NOT the complete Blueprint
Studio — simulation, richer structural authoring, and assisted
recommendations remain later work. ◆ THE FLOW COMPLETES: Event Design
→ review extraction → create draft → OPEN THE EXACT DRAFT in the
editor (?draft=<revision id>&onboard=1) → review opportunities to
generalize → author deliberately → publish separately. ◆ EXACT
DEEP-LINK: resolution by revision id; RLS scopes tenant (a foreign
draft is simply NOT_FOUND); state must be 'draft' (else NOT_A_DRAFT);
failure renders a NAMED banner — never a silent fall-back to the list.
◆ THE GATE IS THE ACT: event-review content appears only when THIS
exact draft has a BP-5 promotion act (act='promote' ∧ revision_id) —
never a seeded/promoted_from heuristic, so composed, seeded, and
future creation paths can never wear event-learning language (gate
region pinned free of lineage heuristics). The act's recorded detail
(transformations, omissions, decisions) is the sole source.
◆ HONEST LANGUAGE: the panel is "Review what came from the event" —
the software knows what was transformed or omitted; the AUTHOR decides
what should become optional, conditional, or parameterized (learning
claims pinned absent). FRIENDLY_STRIP_COPY maps ONE-TO-ONE onto
STRIP_REASONS (totality pinned) — "Guest count belongs to an event",
"Item prices stay with your catalog", "Pricing converted into reusable
guidance" — with the exact constitutional codes preserved under an
Advanced disclosure in the staged review. ◆ DELIBERATE ACTIONS ONLY:
the one content-changing action (create the guest-count question)
shows the FULL proposed parameter and commits only on explicit
confirm (offer button pinned patch-free; confirm button pinned as the
only patch site); pricing actions navigate; info rows say "leave
event-specific". ◆ DISMISSAL IS PREFERENCE, NOT STATE: a scoped
localStorage key flips visibility and nothing else; the checklist is
plain guidance bullets with jump links — no checkboxes, no completion
claims; copy states that readiness is judged by the validator and the
author. ◆ THE PERMANENT INFORMATION ARCHITECTURE, implemented
modestly: seven named anchorable areas — Reusable Structure
(structure + constraints) · Questions for Future Events (parameters) ·
Rules · Choices · Pricing Guidance · Portable Presentation · Review
Before Publishing (read-only status: validation, questions,
conditions, omissions; "Nothing here publishes" — the ceremony stays
behind the existing Publish… button with the constitutional
declaration). The knowledge banner declares the cookbook: "Reusable
Knowledge · Organization Standard — you are writing the company's
cookbook." One gentle per-entry hint: pricing is guidance for future
events, never a confirmed price. DEPLOY: src/ + docs/ only.
(v259.editor — 10 claims.)

**6.32 Authoring-Time Composition (v258 · BP-8).** THE ACT: an author
deliberately COPIES selected lawful authored material from an EXACT
source revision into a destination DRAFT; afterward the material is
ordinary destination content with NO edge back. ◆ COPY-ONLY BY
CONSTRUCTION (blueprintCompose.ts, pure — imports only the content
shape and the condition law): the composer emits ordinary BP-2
content — deep-copied structure, STABLE identity references
(section role, component definition identity — never a captured
definition revision), resolve-later fields absent, barred fields
impossible (emitted-key ∩ BARRED_KEYS = ∅, unit-proven) — validated
by BP-2's OWN validator before it is written. No second content
model; no live edge of any kind. ◆ FRESH LOCAL IDS: every copied
node (chapter/section/entry/choiceGroup) regenerates its key, so no
authored-id collision is possible and no two blueprints ever share a
key. ◆ MINIMUM LAWFUL ANCESTRY: selecting an entry brings its
section and chapter; a section brings its chapter; unrelated
siblings do not travel. ◆ CONDITIONS COPY AS PREDICATES, NOT
OUTCOMES: a copied condition arrives intact and unevaluated, and its
referenced parameters ride along automatically (conditionParamRefs)
or stage COMPOSE_PARAM_MISSING_DEP; keys are never renamed silently —
operator remaps are explicit and recorded; incompatible
type/meaning refuse (COMPOSE_PARAM_TYPE_INCOMPATIBLE /
COMPOSE_PARAM_MEANING_INCOMPATIBLE). ◆ DEFINITION UNAVAILABLE →
COMPOSE_DEFINITION_UNAVAILABLE (refuse, never embed source knowledge
or guess a substitute; resolution stays BP-3's concern). ◆ THE
COLLISION MATRIX, deterministic: role collision → append (default) /
insert-at / refuse (COMPOSE_ROLE_COLLISION); never a silent
overwrite; the destination content is never mutated in place.
◆ PRESENTATION portable-only, no silent blend: keep-destination
(omission named) / replace-with-source; fresh destination simply
receives the portable; bound dress never travels; template
provenance rides as recorded fact within the portable value.
◆ PRICING copies as intent exactly; fixed-package without its policy
→ COMPOSE_FIXED_PRICE_NO_POLICY. ◆ ONE ATOMIC TRANSACTION
(compose_into_draft, SECURITY DEFINER): (1) lock+validate the EXACT
source FOR SHARE — fingerprint cited, no floating "current", no
identity-alone, no latest-at-render; (2) lock+validate the
destination draft FOR UPDATE — published/superseded refuse
(COMPOSE_DEST_NOT_DRAFT), foreign tenant invisible both ways; (3)
write the candidate content; (4) append copy provenance LAST. A
failure at any step leaves the destination byte-identical and writes
no provenance (server CO-4 late-rollback). ◆ PROVENANCE OUTSIDE
CONTENT, APPEND-ONLY: blueprint_compositions records source identity/
revision/fingerprint, destination, actor, timestamp, selected
regions, collision choices, omissions, transformations — select+insert
policies only, no update/delete path; no resolver, view, or
instantiation ever reads it (v257 act carries no composition
reference, pinned). ◆ INDEPENDENCE (server CO-5): source
supersession + retirement + draft deletion change nothing in the
copied content; the destination publishes by the ordinary BP-1
ceremony, needing no composition edge; no source reference lives in
authored content (CO-6). ◆ LEGACY BOUNDARY: only constitutional
revisions supply material — the retired v182 pointer table is never a
source (pinned); legacy designs must first pass BP-5 promotion.
SURFACE: CopyIntoDraft.tsx in the draft editor — exact-revision source
picker, scope selection, the review showing what copies, what
dependencies ride, what is omitted, and how collisions resolve before
the act; copy verbs only. DEPLOY: run v258_composition.sql; server
proof psql -f supabase/tests/v258_proof.sql. (v258.composition — 11
claims · server CO-1..CO-6.)

**6.31 Conditions (v257 · BP-7) + THE v255/v256 SPEC RETROFITS.** The
v253 reservation on conditions retires: the complete authoring →
validation → evaluation → provenance → atomicity path exists.
◆ THE DISTINCTION, preserved by shape: parameter = a QUESTION answered
at instantiation; condition = a PREDICATE over parameter answers,
evaluated exactly once inside BP-3's act; choice = content for later
HUMAN selection. A condition never asks, never chooses for a customer,
never survives into the Design (C-2 proves zero predicate residue
design-side). ◆ CLOSED VOCABULARY (blueprintConditions.ts, pure, zero
imports): eight predicates — equals · not-equals · greater-than ·
at-least · less-than · at-most · one-of · present — with a typed
ADMISSION MATRIX (count: all eight; choice: equals/not-equals/one-of/
present; flag: equals/not-equals/present), typed operands, trim
normalization, present = answered (empty string is absence), and eight
named failures. Nothing programmable: no expressions, scripts, or
regexes (pinned). ◆ BOUNDED COMPOSITION: all · any · not; max depth 3;
max 10 predicates; cycles impossible by shape; empty groups refuse.
◆ CLOSED ATTACHMENT, treatment-registered: chapter · section · entry ·
itemSelection carry `condition` as COPIED authored structure whose
RESOLUTION is the branch map; the registry stays TOTAL; root-level
conditions stay refused. Parameters are referenced by STABLE KEY only;
label renames break nothing; a missing key stages
CONDITION_PARAM_MISSING. ◆ ONE TRANSACTION, EXTENDED: v257 REPLACES
instantiate_blueprint under its own name (no second path, pinned) with
the sequence: validate every required answer by type
(PARAMETER_REQUIRED / PARAMETER_INVALID per key, answers = p_answers +
guest_count) → validate every condition against the exact published
revision (SQL validator mirroring the client law, name-set parity
pinned) → evaluate deterministically → produce the COMPLETE branch map
→ stage ALL conflicts (C-3: missing answer, invalid answer, empty
group, unknown predicate name themselves in one refusal; nothing
created) → materialize only included branches (excluded sections/
entries never exist; a conditioned item selection under false applies
neither its exclusion nor its addition) → freeze and CITE with the
branch map AND the full answers on the citation (C-1). ◆ ONE-TIME
RESOLUTION: included branches are ordinary independent content; later
Design edits re-evaluate nothing (no machinery exists); an inverted
condition published as r2 changes no existing design byte (C-4).
Surfaces: the instantiate dialog asks EVERY declared question with
typed inputs and no defaults; the shelf editor authors all-of predicate
rows over declared parameters, admission-filtered. ◆ THE v255/v256
RETROFITS (recorded amendments, spec-audit): v255 gains the
EXTRACTION MATRIX (total, exported, disposition-closed:
copied/identity-reference/resolve-later/refused), explicit-only
parameters (a source guest count becomes a question ONLY by the
operator's choice, recorded verbatim as "source fact → reusable
question"; the default emits ZERO parameters), explicit pricing
carriage (carryPricing off → PRICING_OMITTED named; nothing silent
either way), ORPHANED_SELECTION naming, promotion provenance detail on
the act row (regions/transformations/omissions — metadata only, no
live edge), and PM-7/PM-8 middle- and final-provenance atomicity with
the widened source fingerprint (components+items+config+citations).
v256 gains taxonomy as a lawful search facet, database-alphabetical
neutral deterministic order, per-revision usage facts on the shelf
("used to start N Designs", descriptive labels pinned against
superlatives), and the projection-not-authority pin set (reads-only;
truth tables exactly the three; no barred column indexed). DEPLOY: run
the amended v255_promotion.sql, then v257_conditions.sql; server
proofs psql -f supabase/tests/v255_proof.sql and v257_proof.sql.
(v257.conditions — 7 claims · server C-1..C-4 + LB-1..LB-3; v255 →
12 claims · PM-1..PM-8; v256 → 10 claims; v252/v253 amended in place,
dated.)

**6.30 The Library Learns the Shelf (v256 · BP-6).** The fifth
registered kind, landed under the v215 doctrine EXERCISED FOR REAL:
the registration lives in the kind's own modules (blueprintLibrary.ts
= the pure LAW, zero imports; blueprintLibraryKind.ts = the projection
and its reads) and libraryRegistry.ts is byte-untouched by the slice
(unit-pinned: no shelf vocabulary in the machinery). ◆ VISIBILITY IS
THE SHELF'S OWN LAW, PROJECTED: shelfEntryVisible = active AND
offering; retired identities and draft-only identities are hidden —
not a judgment, the absence of an offer. ◆ PROVENANCE-ONLY PROOF: the
subtitle states the citation count from blueprint_instantiations as
FACT ("weddings · r3 · cited by 5 designs"; zero is said out loud —
"not yet cited"; singular grammar for one) and NOTHING RANKS BY IT:
the weight expression is rankPrefix(name, q) alone, pinned to contain
no citation variable and the query pinned to never order by usage.
◆ THE LIBRARY POINTS, THE SHELF PERFORMS: the kind's verb is
navigate-only — no land verb, no drag, no shortcut around the
guest-count ceremony; instantiation remains BP-3's act on the shelf
surface (all pinned). ◆ THE v216 LEGACY KIND SUPERSEDED: the old
registration read the retired v182 pointer table with a land verb and
the text/eventcore-blueprint drag mime; both are gone from
libraryKinds.ts (pinned), the shelf kind boots through the one
idempotent bootLibraryKinds() door, and one word means one thing.
◆ TODAY'S CLOTHES: BlueprintPaperPreview.tsx renders a published
revision as a page on the shelf, labeled out loud — "presentation
resolves at instantiation; the portable stratum travels by value" —
importing ONLY the content shape; the renderer wall stands
(src/lib/render still blueprint-free, re-pinned). No migration this
slice. (v256.library — 7 claims.)

**6.29 Promotion (v255 · BP-5) + THE v182 RECONCILIATION.** THE
CEREMONY: promote_design_to_draft(version, content, target|name) — one
security-definer transaction, ONE PROMOTION ONE BLUEPRINT (exactly one
identity insert and one revision insert in the RPC, grep-pinned;
PM-1/PM-3 prove counts), producing a DRAFT and nothing else: no publish
statement exists in the file, published_revision_id is untouched, and
publication remains §3's intent ceremony (PM-1). PROMOTED-FROM
provenance = promoted_from_version_id as a PLAIN uuid — deliberately no
foreign key: a recorded fact, never a dependency, never dangles.
◆ NORMALIZATION (blueprintPromote.ts, pure): the BP-3 reversal —
design config {schemeId,choices,scalars} → authored
{scheme,values}; items → selections carrying names and inclusion,
never prices; version presentation → the portable stratum (delta
without treatments, sectionDress from treatments.sections, photo_pins
split into sectionPins/documentPin); output validated by BP-2's OWN
validator (one shape, one law) and structurally unable to emit a
barred key (walked ∩ BARRED_KEYS = ∅, unit-proven). ◆ STRIPPED BY
NAME, staged for review before the act: STRIPPED_GUESTS ·
STRIPPED_ITEM_PRICES · CONFIRMED_PRICE_TO_SUGGESTION (a confirmed
design price arrives as authored-suggestion INTENT — §11: no price is
confirmed by copying, and promotion cannot invent a fixed-price
policy; the module cannot construct the fixed form, pinned) ·
STRIPPED_BOUND_DRESS (v241) · SKIPPED_NO_DEFINITION ·
OUT_OF_SCOPE. ◆ PARTIAL PROMOTION FIRST-CLASS: scope = chosen sections
× chosen components; the left-behind are named, the scoped result
validates. ◆ THE BARRED BELT: the schema re-carries §5 — a recursive
jsonb key walk refuses barred keys by name before any row exists
(PM-2); the SQL key array equals BP-2's BARRED_KEYS verbatim
(one-wording-one-source, unit-pinned). ◆ EVIDENCE INFORMS, NEVER
WRITES: the design's rows are byte-identical through the ceremony
(PM-4). Busy targets refuse (PROMOTION_TARGET_BUSY); blank names
refuse (PM-6); tenancy guarded (PM-5); the act vocabulary grows by
exactly one word ('promote'). SURFACE: PromoteToBlueprint.tsx in the
Studio — scope checkboxes, the staged stripping report, validation
refusals, then "Create the draft"; success points to the Shelf and
says out loud that publication is its own ceremony. ◆ THE v182
RECONCILIATION (the BP-1 reservation, resolved): the legacy /blueprints
surface is a pointer list reading content LIVE from proposal versions —
the exact live ancestry the constitution forbids; with lawful capture
now existing, it is RETIRED IN PLACE: nav entry removed, banner names
the reason and points to the Shelf, entries stay readable forever
(history preserved, nothing deleted, table and module untouched), and
no promotion file imports the legacy world (pinned). DEPLOY: run
v255_promotion.sql; server proof via psql -f
supabase/tests/v255_proof.sql. (v255.promotion — 8 claims · server
PM-1..PM-6.)

**6.28 Divergence & Citation (v254 · BP-4).** The frozen baseline earns
its keep. ◆ ONE SOURCE OF TRUTH BY SHAPE: compareToBaseline(current,
frozen_baseline) — arity two, and blueprintDivergence.ts imports
NOTHING: there is no channel through which the current blueprint, the
offered revision, event history, or the act ledger could reach the
result (unit-pinned; server D-3/D-4 prove the INPUTS byte-immune to
audit noise and to r2/r3 publishes). ◆ HONESTY TIERS from NAMED
STRUCTURAL CRITERIA, no weighted score, no numeric rank anywhere in
the report (pinned): HEAVY = component added/removed/moved · section
added/removed · presentation-replaced (theme change) ·
config-scheme-changed · pricing-mode-changed; LIGHT = item
add/remove/reorder/price · price-confirmation · package-price ·
config-value · retitle · component/section reorder · dress-adjusted
(same theme) · guest-count. Sets disjoint, every finding classified
exactly once, every criterion exercised alone in the suite;
light+heavy together = heavy WITH all findings preserved.
◆ EARLIER-REVISION IS ORTHOGONAL: citationStatus speaks about the
shelf (offered vs cited; retirement a note), never about the design;
unchanged×earlier and heavy×current proven coexistent; never collapsed
into the tier. ◆ AUTHORED PROSE: no editable design surface exists, so
the report carries prose:"unavailable" — reported, never compared,
never invented. ◆ BASELINE INTEGRITY: malformed baselines surface as
named states (MISSING_SECTIONS/COMPONENTS/GUESTS ·
COMPONENT_WITHOUT_ID · NOT_AN_OBJECT); comparison refuses; the input
object is proven unmutated (read, never repaired); server D-5: update
and delete on blueprint_instantiations touch zero rows under policy
absence. ◆ THE CITATION: "Started from {name} rN" — resolves by exact
revision id forever; D-1 supersession and D-2 retirement leave it
answering precisely; the banned voices (powered-by ·
inherited · synchronized-with · proof-of · based-on-current) are
grep-absent from the slice; the data layer reads blueprint_revisions
WITHOUT the content column (the current blueprint is not even
fetched). ◆ DISPLAY, NEVER JUDGMENT: nothing blocks, nothing urges,
nothing prices; empty divergence renders as itself ("that is
information, not praise"). SURFACE: BlueprintCitation.tsx — one line
under the Studio bar (v217-consistent: details summoned on click),
rendering nothing when no citation exists. No migration this slice;
server proof runnable via psql -f supabase/tests/v254_proof.sql.
(v254.divergence — 9 claims · server D-1..D-5.)

**6.27 Instantiation (v253 · BP-3 — the constitution's center,
delivered).** THE ACT: instantiate_blueprint(revision, booking,
guest_count) — one security-definer transaction turning the PUBLISHED
revision into one independent Event Design (proposal version + sections
+ SPEC-002-instantiated components + items + config + portable + frozen
guest count), ALL OR NOTHING, server-proven on real Postgres
(supabase/tests/v253_proof.sql, I-1..I-9). ◆ ONE COHERENT SNAPSHOT:
gather reads the revision and EVERY referenced definition's current
config revision in single statements with FOR SHARE locks — a
concurrent publish WAITS; the provenance records exactly what was seen
(definition_revisions map + snapshot_at). ◆ NEVER-GUESS: all conflicts
collected and raised as ONE staged list before anything builds — the
closed vocabulary (14 kinds: lifecycle, parameter, role, definition,
CONFIG_SCHEME/KEY/OPTION_GONE, fixed-price policy, v241
DRESS_NO_MATCH/AMBIGUOUS, CONDITIONS_RESERVED) is unit-pinned equal
between migration and client. ◆ ATOMICITY: early (parameter), MIDDLE
(entry-2 explosion rolls back entry 1, proof trigger), and LATE (a
fully-built design vanishes when the citation cannot be written)
failures leave the database observably unchanged. ◆ DUAL PROVENANCE:
SPEC-002's stamps untouched (seed_config_revision · instantiation_id ·
definition_id) beside blueprint_instantiations {revision · fingerprint
(md5 of canonical jsonb) · snapshot · parameters · branches (empty,
recorded, BP-7's) · definition_revisions · fixed_price_decisions ·
FROZEN BASELINE of the complete materialized result} — append-only by
absence, unique(version_id): one design, one origin. ◆ INDEPENDENCE
PROVEN: definition supersession + blueprint r2 change nothing; no
design table carries a blueprint FK (information_schema-asserted); no
refresh/follow/re-execute verb exists anywhere (grep-pinned); the
renderer still contains no blueprint vocabulary. §11: every arriving
price is DEBT; the fixed-package exception alone confirms, stamped
{policy · revision · publisher · published_at}. §10: guest count is the
one seed parameter — required, typed, stamped, never defaulted; a
structure section materializes under a semantic role (SECTION_ROLE
conflicts otherwise); authored prose rides the frozen baseline
(structure_prose) until the workspace era gives it a surface — kept,
not dropped. SURFACE: BlueprintInstantiate.tsx on the shelf page
(published+active only): staged conflicts displayed amber, success in
the started-from voice. ◆ v251 ERRATUM (recorded): the three shelf
RPCs were security-definer without a tenancy guard — a foreign
revision id could be published cross-tenant; re-issued in the v253
migration with the guard (I-9 proves both act and RPCs refuse foreign
tenants). v252 boundary-pin AMENDED (dated in-suite): the page hosts
the act's surface; the shape and data modules keep the
never-instantiates pins forever. DEPLOY: run v253_instantiation.sql;
server proof runnable via psql -f supabase/tests/v253_proof.sql.
(v253.instantiation — 6 claims · server I-1..I-9.)

**6.26 Authoring (v252 · BP-2).** The lawful content shape of a draft
revision (blueprintContent.ts) and its editor (/blueprint-shelf — the
constitutional shelf's surface; the legacy /blueprints pointer page is
untouched, reserved for BP-5). ◆ THE DEFINING PROOF: EVERY FIELD
DECLARES EXACTLY ONE TREATMENT — copied as authored structure ·
referenced as shared knowledge · resolved later — via a TOTAL registry
(FIELD_TREATMENTS) walked against a fully-populated content; an
undeclared field is a refusal, and the RESOLVED class is NAMED ABSENCE:
definition revisions, current prices, company facts, and conditions
have no field, and their presence refuses by name (conditions carry the
BP-7 reservation out loud). The shape: chapters/sections/prose (copied)
· section semantic role (referenced) · component entries by definition
IDENTITY (referenced — never a revision; authored config delta, item
selections, and choice-group authorship copied) · pricing intent (§11
closed forms; fixed-package must name its policy; no confirmed price is
representable and the key itself is barred) · constraints entered once
(character/supervision/calendar/service-style) · parameters as
QUESTIONS (§10 closed types; a default key refuses — no default
masquerading as a fact) · portable presentation BY VALUE with template
provenance recorded at application time (deep-copy proven: mutating the
template later changes nothing — a citation, never a dependency), bound
dress refused inside the stratum. The §5 BARRED LIST enforces as exact
keys anywhere (customer · dates · guest-count-as-fact · deposits ·
agreements · signatures · deliveries · actuals · approvals · tax ·
confirmed), and EVENT IDENTITY KEYS refuse separately — authored
content cannot become an Event Design by smuggling a booking/version/
instantiation id. Saves REFUSE invalid content staged-and-named; the
publish ceremony displays and affirms the §3 declaration verbatim,
capability-gated client-side, wording enforced again by the v251
schema. NEGATIVE PINS: the shape module imports only ./portable;
authoring reads touch only component_definitions + publication_themes;
no file names the legacy table or module; no instantiate() call exists
in the slice; offeredRevisionId is consumed nowhere. v251 shelf files
FROZEN and byte-untouched. No SQL this slice. (v252.authoring — 8
claims.)

**6.25 The Shelf (v251 · BP-1 — the PUBLICATION BLUEPRINTS phase
opens; constitution FROZEN in docs/PUBLICATION_BLUEPRINTS.md).** First
act, the recorded housekeeping: v194.test.ts and v248.print.test.ts
removed and the stale duplicated §6.22–§6.24 block removed from this
document — each behind the three-part proof (uninventoried · zero
importers · the retained §6.22 is the one the shipped backend and the
green v248.pdf suite agree with). Then THE SHELF: blueprint_identities
(stable identity — name/taxonomy/status/designation, never content)
over blueprint_revisions (immutable authored payload; the §6
field-treatment shape is BP-2's), supersede-and-chain. STATES EARN
VERBS: draft edit/discard/publish · published
instantiate/begin-new-draft/retire · retired view-history/reinstate;
Archived was refused admission (it changed no verbs). ◆ THE INTENT LAW,
mechanically: the constitutional sentence lives ONCE in src
(PUBLISH_DECLARATION) and twice in the schema (CHECK
bsa_publish_requires_intent + RPC guard PUBLISH_INTENT_REQUIRED) — an
undeclared publish act cannot exist as a row; accidental organizational
knowledge is impossible, not discouraged. CURATE ORGANIZATIONAL
KNOWLEDGE rides the licensing key knowledge.curate — capability opens
the door, the declaration walks through it. Immutability by trigger
against EVERY path; the acts ledger is append-only by ABSENCE; deletes
reach drafts only; empty identities alone are deletable. FOUND &
RESERVED: the legacy v182 blueprints table is a named POINTER whose
content reads live from a proposal version — a proto-promotion, and
precisely the live ancestry the negative law forbids; it shares a
word, not a nature; untouched, reconciliation reserved for BP-5.
Nothing consumes the shelf yet: instantiate is derived
(offeredRevisionId) and executed nowhere. Pure law in
blueprintShelf.ts, data in blueprintShelfSupabase.ts (the
promotion-module split). DEPLOY: run v251_blueprints_shelf.sql.
(v251.blueprints — 7 claims.)

**6.24 Print Proof (v250 · PR-6 — THE PUBLICATION RENDERER PHASE
CLOSES: PR-1–PR-6 all shipped).** The wording, finally on paper. PAGE
NUMBERS speak "Page N of M" per the master's DECLARED position
(footer-center / footer-outside carried on the numbering data);
unnumbered pages stay silent — the v240/§6.7 reservation is now FULLY
honored and retired. CONTINUED WORDING stands on PR-2's neutral
markers: "{label} continues…" at the crossing's foot, "{label},
continued" at its head; labels arrive as an OPAQUE MAP built at the
composer's gate (composeProofLabels: sections, components, Terms);
resolution is longest-prefix; THE MOST SPECIFIC LABEL WINS a crossing
("Carving Station, continued" over "Dinner, continued"); an
unresolvable tag yields SILENCE — a customer never reads machinery.
THE TOC is provenance data (tocEntries: each labeled entry once, at
its first page, in reading order) and becomes the PDF OUTLINE —
hand-rolled dictionaries, since pdf-lib offers no high-level API; the
digital contents ship in every artifact. A PRINTED TOC PAGE is
deliberately NOT built: it would need its own page reserved before
numbering, and proposals are short — the data exists the day that
changes. Cross-references: reserved, no present use case. proof.ts is
wall-clean to the last slice, grep-enforced. P-36 asserts proof in
Chromium: outline present, page two speaking its constitutional
wording. (v250.proof.)

**6.23 Print Typography (v249 · PR-5).** THE METRICS SWAP, delivered as
promised: brand faces (the v232 fontsource set — Playfair regular/bold/
italic, Inter regular/bold) behind the SAME strict port; realMeasurer
wraps by true advance widths; the PDF embeds THE SAME BYTES it measured
with, subsetted. ONE METRICS SOURCE BY CONSTRUCTION: the backend is
INJECTED with its metrics and cannot construct its own (grep-claimed);
render.ts threads one measurer through paginate and draw. Degradation
is graceful: absent brand fonts → null → Std14, never a blocked
download; the preview verb fetches brand-first. POLICY (composer-only):
station titles keep their first item — the title→description→first-item
chain never severs, proven by an EXTENT HUNT across page heights; print
type scale tuned; photo widths sized to the printable measure.
◆ TWO DECLARED CROSSINGS into the paginator, per the slice's discipline
clause — both defect fixes in existing law, neither a new rule: (1) the
wrap contract unified — the style.lineHeight scaler removed; heights
come from the measurer alone, one formula everywhere; (2) CHAINS
RESPECTED in bounded lookahead — a keepWithNext box's minimal prefix is
its whole self plus its companion's prefix, because a checked companion
that itself carries keepWithNext could defect and strand its patron
(the extent hunt caught exactly this). Each link still looks one
sibling ahead; transitivity emerges; the forward-only law stands.
P-36 upgraded: the browser render is brand-metric governed
(fontsource-1 in provenance). ◆ The nofonts variant's tooth SHARPENED
accordingly: it now fails exactly TWO claims — P-22 and P-36 — both
font-dependent by design; the protocol expectation is amended from
"exactly P-22" to "exactly P-22 + P-36". Deploy: copy the five woffs into
public/fontsource/ (script in notes) or the verb degrades to Std14.
(v249.typography.)

**6.22 The Print Renderer (v248 · PR-4).** The Backend port
(RenderBackend: PagedArtifact → bytes; a backend that imports compose
or paginate has failed — grep-claimed) and its first adapter: PDF via
pdf-lib. REAL METRICS behind the strict port: the Standard-14 AFM width
tables shipped inside the engine — declared, deterministic everywhere,
versioned (std14-afm-1); "serif" is Times, "sans" is Helvetica; brand-
face embedding is PR-5's metrics SWAP, and the fontsource road is
already proven passable (realMeasurer over fontkit, unit-covered). THE
WRAP CONTRACT: the port's wrap() returns the actual line strings and
measure() counts exactly those — a backend draws what was counted, so
counting and drawing can never disagree. ARTIFACT PROVENANCE stamps
into PDF metadata machine-readably: engine version · metrics version ·
generated-at · source fingerprint. THE SNAPSHOT LAW extends to pages:
renderPublicationFromSnapshot() reads every field off the stamp, and
the Download PDF verb lives on the preview page gated to SENT documents
only. ◆ Numbering amendment: a one-page document is never numbered —
numbering exists to locate a page among pages. Page-number WORDING
remains PR-6's; images draw honest bordered frames until the asset-
corpus work embeds them. P-36 proves the whole pipeline client-side in
Chromium: real %PDF bytes, honest provenance. Deploy: npm i pdf-lib
@pdf-lib/fontkit. (v248.pdf · P-36.)

**6.21 Page Masters (v247 · PR-3 — the v240 reservation formally
RETIRED, its condition met).** FIRST · INTERIOR · LAST declared:
geometry and furniture only, no break logic, no content of their own.
◆ THE GEOMETRY LAW, derived from forward-only: LAST is a furniture
distinction, never a geometry one — makeMasterSet() enforces
last.size ≡ interior.size against any caller, because pagination
cannot know the last page until it is done; FIRST may differ. ◆ THE
DEGENERATE CASE, named: a one-page document wears FIRST's geometry and
header with LAST's closure footer, and its numbering follows the
closure master. ◆ THE POST-PASS: imposePages() resolves {n, of} only
after the count exists and passes the pagination result through
byte-untouched; page one carries no number and no running header by
FIRST's declared policy; the WORDING stays PR-6's. ◆ §4 INDEPENDENCE,
proven: toggling the content footer never moves the masters (digest
equality); running furniture never enters the content flow
(furniture: tags absent from the tree); the running footer derives
from company facts at the composer's gate and survives the content
footer's death. masters.ts is wall-clean, grep-enforced.
(v247.masters.)

**6.20 The Pagination Engine (v246 · PR-2).** paginate(tree × measurer
× extents) → pages of placed boxes: PURE, and FORWARD-ONLY — once a
page closes its contents are law; keepWithNext and breakBefore:"avoid"
are the same bounded one-sibling lookahead; nothing may reopen a placed
page. THE LAWS, unit-hunted: pages fill and never overflow; the
widow/orphan minimums govern every text split, and a one-line orphan
pushes the whole paragraph (a pushed-whole placement carries NO slice
metadata — it is not a split); keepTogether moves whole when a page can
hold it and otherwise splits least-bad WITH an honest overflow note;
images are atomic — an image taller than any page scales to fit,
recorded, never silent, never cropped; rules and spacers never begin a
page; margins collapse at page tops. CONTINUATION MARKERS are emitted
one per crossing, carrying provenance tags verbatim and opaquely —
PR-6's wording will stand on them. DETERMINISM is a replay claim: a
serialized tree re-paginates to identical break decisions (compared as
decisions, never as key order). Proven on synthetic trees AND a real
composed three-section proposal with signature and terms — the
signature landed intact on one page because the composer's policy said
so and the engine obeyed. (v246.paginate.)

**6.19 Layout Boxes & Composition (v245 · PR-1 — the PUBLICATION
RENDERER phase opens; constitution at docs/PUBLICATION_RENDERER.md).**
The box model exists: a CLOSED kind set (block · text · image · rule ·
spacer · group), resolved concrete styles, break rules as attributes
(keepTogether · keepWithNext · widow/orphan minimums · breakBefore/
After), opaque provenance tags, and LOSSLESS STABLE serialization
(sorted keys — identical trees serialize identically; unit-proven,
because replay depends on it). The Measurement port is STRICT: pure,
total over DECLARED fonts only, versioned; an undeclared font THROWS —
never a fallback (the fixture measurer proves the contract). The
COMPOSER is the semantic wall's one gate: ResolvedPublication → box
tree, forward-only, carrying the constitutional default break policy —
headings and component titles keepWithNext; the signature group and
terms keepTogether. THE WALL IS GREP-ENFORCED: box.ts and measure.ts
contain no publication vocabulary and import nothing from outside
render/. Nothing visual shipped; the bar is entirely unit claims, as
constituted. (v245.boxes.)

**6.18 Inspector polish pass (v244 — Ben's five UX refinements, adopted
after living with v238).** Rhythm: Configure rows invert weight — the
summary wears the ink, the label recedes to an eyebrow, rows breathe;
information, not a property sheet. Menu is promoted: the item count
carries weight and the doorway is open by default — it is an editing
surface, not a buried row. Commercial breathes another notch (label-to-
value air, relaxed leading). Destructive actions read as FOOTER actions —
"Remove from this design…" separates from the facets with real distance.
The selection wash gains ~8% presence (#ECF3FD), still a whisper behind
the paper. All under the one SELECTION token; no physics touched.

**6.17 Presentation Knowledge (v243 · PA-5 — the PUBLISHING ASSETS
phase closes).** The Library gains its four publishing-asset kinds by
REGISTRATION (templates · themes · brand assets · photography — the
browser file untouched, exactly as v215 promised). Template cards carry
PROOF: computed at read time, never a stored opinion — Used · Sent ·
Accepted · Acceptance rate (NULL at sent=0, never 0/0 bravado) · Average
accepted value (NULL when unknown) · Modified after application.
ATTRIBUTION IS PROVENANCE-ONLY: a version whose theme_key matches but
carries no provenance is refused as evidence by construction —
reconstruction never happens (P-35's coincidence row proves it in the
browser). DIVERGENCE is honest: unchanged (0 leaves) · light (1–4) ·
heavy (5+) · earlier-revision (the fingerprint no longer matches the
template's current portable — "started from", not "proof of").
NOTHING RANKS: no best/rank/top field exists in the proof shape, and
"best performing" appears nowhere (unit-grepped) — and will not, until
sample size and divergence are accounted for. (v243.proof · P-35.)

**6.16 Compare Presentation… (v242 · PA-4).** The verb IS a compare
engine; users compare before replacing, and Apply is the compare view's
CLOSING ACT — never the door's name. The Second Sheet ceremony exposes,
before anything happens: WHAT CHANGES (leaf-level, both sides, including
omissions — the destination's own leaves surface as "(inherits)" because
omission never preserves) · WHAT STAYS BOUND (counted, never itemized as
change) · UNMATCHED source dress (named; it waits silently) · AMBIGUOUS
mappings (radio decisions; Apply is DISABLED until every ambiguity is
decided — "all matching" only by explicit choice) · MISSING PHOTOS (pins
whose photo the library lacks, flagged by slot and label; the pin
arrives, the photo waits). The confirm speaks APPLY_CONFIRM_WORDING
verbatim. Applying replaces the portable stratum, preserves bound dress
(P-34 measures survival ON THE PAPER), and records provenance at
application (template_id · fingerprint · applied_at · mode=midflight)
directly onto the version. "compare" is a room STATE, not a nav door —
reached only from a template's row in the Appearance room.
(v242.compare · P-34.)

**6.15 Portable Presentation & Templates (v241 · PA-3).** A presentation
is TWO STRATA. PORTABLE (theme key · document delta · document
treatments & regions · section dress and section pins keyed by SEMANTIC
ROLE — the section type id, tenant-global today) transfers across
proposals and is savable as a Template. BOUND (component & item
treatments, component pins) never travels through presentation-only
verbs; it may travel only when a content-copy operation supplies an
explicit identity map. portablePresentation() is THE extractor — every
presentation-only verb operates on its output exclusively. THE MATCH
LAW: application never guesses — no matching section waits silently;
exactly one match applies; multiple matches demand a mapping decision
("all" only by explicit choice; applyPortable throws on undecided
ambiguity). REPLACEMENT SEMANTICS: application replaces the ENTIRE
portable namespace — omission means inheritance from brand/theme, never
preservation; bound dress remains untouched; the confirm wording is
constitutional (APPLY_CONFIRM_WORDING). ASSET KIND is declared
(theme | template — one table, two kinds, never blurred; the theme shelf
filters). PROVENANCE is recorded AT APPLICATION TIME (template_id ·
fingerprint · applied_at · mode) — never inferred from theme_key; the
fingerprint is deterministic and key-order independent. (v241.portable ·
P-33; application UI arrives with Compare Presentation…, v242.)

**6.14 Page Anatomy (v240 · PA-2).** Regions graduate from slots to the
page's NAMED anatomy: Header · Body · Footer · Page decorations ·
Sidebar (PAGE_ANATOMY in publication.ts, reading order fixed). This is
DECLARATION, not new physics — visibility, treatment, inheritance, and
override all still ride the existing ladder; every togglable region is
claimed by exactly one zone (unit-total, unit-unambiguous). CONTINUOUS vs
PAGE-MASTER is now formal: continuous regions flow once in web scroll;
repeating per-page furniture (running headers, running footers, page
numbers) is PAGE-MASTER — a different kind of thing, reserved for the
PDF slice and NAMED in the anatomy so the reservation is legible (§6.7's
sentence stands; a page number in continuous scroll is a lie). The
sidebar is reserved: named, empty, inert. The renderer wears
data-page-zone slots (flow-neutral); the Regions room reads as anatomy
with page-master reservations spoken out loud. (P-32; v240.anatomy.)

**6.13 Company Identity & Publication Policy (v239 · PA-1).** The Brand
owns company TRUTH; publication POLICY governs which truths may enter a
customer document. The fact registry (src/lib/identity.ts) is the LAW:
every fact declares eligibility (customer-facing / sensitive /
restricted) · default region · default visibility. Tax ID is restricted
— it never reaches a customer document without explicit enablement. ACH
is sensitive — payment region, hidden until shown. projectIdentity() is
the ONE gate: the renderer receives resolved facts and never sees the
identity record or the policy. The snapshot freezes ONLY the facts
resolved into that publication. REQUIRED REGIONS (company header ·
contact · footer · standard terms) are ON for every new paper — new
proposals are complete automatically; a version may disable a required
region only by explicit exception. Empty-is-information holds: an unsaid
fact renders nothing, never a placeholder. The footer line derives from
facts when Brand Studio's explicit words are absent; explicit words
always win. (P-31 proves the leak-proofing; v239.identity proves the
gate.)

**6.12 Inspector Unification (v238, opening the PUBLISHING ASSETS
phase).** ONE VISUAL LANGUAGE: the SELECTION token (src/lib/selection.ts)
is the only source of selection color — the selected object wears a left
accent bar (inset, zero layout shift), a warm wash, and a 150ms
transition; the wing's seam and subject tick inherit the IDENTICAL
color, so the pair reads as one thought (P-30 asserts computed equality).
FACETS BY DECLARATION: the Inspector renders facet order from
LensDef.inspects and holds zero lens conditionals (unit-greppable);
Commercial groups Price · History · Cost · Requirements as one
intentional facet; values read conversationally (label over value, never
property-grid dashes); the predates-configuration notice keeps its place
only while actionable, and speaks quietly even then. The paper remains
the hero throughout (P-3/P-28 laws unchanged).

**6.6 Interaction Principles (constitutional, v230).** The paper always
remains the dominant visual object. The Room never obscures the paper; it
reshapes the workspace. Only one Room may exist. Esc retreats one level.
An outside interaction dismisses atomically and lands where it was aimed.
Save look is the only commit. Direct manipulation changes interaction,
never ceremony. Presentation controls are semantic, never low-level CSS.
Contextual toolbars render from Lens Capabilities plus SELECTION
CAPABILITIES (`selects` on the lens declaration), never from scattered
type checks.

**6.4 The ceremony is unchanged.** Direct manipulation changes the FEEL of
editing, not the commit: every pick — room or toolbar — redraws the live
publication instantly as render state, and **"Save look" remains the only
commit**. Canva autosaves; this product does not, because the publication
becomes a stamped historical artifact and nothing-until-chosen is
load-bearing law.

## 7. Photo rules — DECIDED: the rule proposes, the maker pins

The theme declares **placement and treatment** per slot: hero (top, full
width, rounded), component image (none / left / right / background / full /
circle / card). The theme may also declare a **preference rule** — "highest-
rated photo tagged Cocktail Hour" — but a rule is a *proposer*, never a
selector: the system surfaces its candidate, the maker **accepts or chooses
another**, and the accepted photo is **pinned** — a stamped asset reference
on the version, deterministic forever. Randomness has no place in a
historical document. Unpinned slots render honestly (empty, or with the
candidate marked *unpinned* in x-ray ink — empty-is-information). This
section ships only when the photo system can feed it honestly; it is
designed now so nothing built earlier contradicts it.

## 8. The Brand Studio

A tenant surface (Settings → Brand), not a proposal surface: logo, palette,
default typography pairing, **default theme**, named themes, photo style,
signature, footer, terms. Every proposal inherits it through the ladder;
individual proposals override only what they need. The creation moment
(Version Genesis / archetype question) gains its sibling field — *Structure:
Continuous Service · Theme: Wedding Luxury* — so every proposal is born
already looking like the company.

## 9. Curated typography — DECIDED: pairings, not fonts

Fifteen to twenty excellent pairings as registry data — *Playfair
Display/Inter (Luxury), Cormorant Garamond/Source Sans (Elegant),
Montserrat/Inter (Modern), Libre Baskerville/Lato (Classic)…* Users pick a
pairing, never a font, because users don't want typography — they want
something that looks expensive, and unlimited choice is how documents stop
looking expensive.

## 10. Consequences reserved, not scoped

A theme fully separated from content is a **distributable asset** — a
marketplace of themes (downloaded, never touching a proposal) becomes
possible by construction. Recorded as a consequence; deliberately not a
plan.

## 11. Slice map

- **v224 — Lens Capabilities.** The `edits`/`supports` declarations, the
  registry law, the Line's lens-owned control surface skeleton, the
  Presentation label sweep, `xrayMode` absorbed. No SQL.
- **v225 — The Theme.** PublicationTheme object + `resolveTheme` + the
  snapshot rule + built-in themes + the Presentation toolbar's first real
  controls (pairing, palette, paper) + print parity. Carries SQL, presented
  separately per standing rule.
- **v226 — Brand Studio** + pairings registry + the creation-moment theme
  field.
- **Photos** — after the photo system matures (§7 stands ready).

## 12. What this document deliberately does not do

It does not move status transitions into the Studio, does not give the
Presentation lens any structural power, does not introduce free-form CSS or
arbitrary fonts, and does not build the marketplace. Each of those is a
door this architecture leaves closed on purpose.

## 13. Formerly open questions — resolved at adoption

All three are answered in the Status block: re-send re-snapshots (each send
stamps and logs what was actually sent; approval locks the last stamp); the
override is the **Version Override**, version-owned; and an empty
Presentation renders the honest branded shell with no invented content.

---

## §6.46 — Execution OS · Spine (v275, slice 1)

v275 opens the Execution OS above the frozen commitment layer (PL-1…PL-4), the
first implementation after the v274 constitutional closeout. It builds the
execution spine and proves it end-to-end on one operationally-enriched component
(the staffed carving/sushi station). It reads the commitment layer and never
writes it; no PL object, ceremony, invariant, or proof is modified.

Three additive tables — `event`, `obligation`, `execution_evidence` — none
carrying a mutable status/stage column: operational state is a **projection** of
append-only evidence + dependencies, derived once in SQL (`obligation_state`,
`event_readiness`) and merely rendered by the app ("one derivation, many
renderings"). The canonical `event` is unique over the released **engagement**
(the booking identity), so amendments attach additively and never duplicate it;
the originating acceptance is recorded as **provenance**. `release_event` is a
default-deny, layered ceremony (unrescinded acceptance · financial clearance or
authorized waiver · operator sign-off; Agreement reserved as a policy slot),
which materializes the event and licenses **deterministic, idempotent**
obligation generation from the FROZEN accepted snapshot model — regeneration is
additive (obsolete obligations are *invalidated* by a new fact, never mutated or
deleted). Where operational knowledge is not yet modeled, generation emits an
explicit **decision-debt** obligation rather than a fabricated fact.

Verified against a production-faithful database: 26 proof claims (families
RL/BY/OB/EV/PR/DO/IM/TI), rerunnable with zero residue; four race pairs
(release×release, release×rescission, generate×generate, evidence×evidence) green
in both launch orders with no deadlock; and the full PL regression (v265–v273,
155 claims) green on the v275 stack. Invariants I-31…I-41 hold. DailyOps event
scope, the release action, and obligation detail render the proven spine; the
legacy `tasks(done)`/`OpsWorkspace` surface is untouched and superseded only for
released events. Company/personal DailyOps scopes, the non-operational work-item
classes, and the department domains follow in later slices.
