# EventCore — Booking Workflow Constitutional Review

**Scope.** Architectural review only. No implementation, no SQL, no redesign of frozen
law. The question under review: does the Booking experience still represent the
constitution that now exists (PL-1…PL-4, v263–v279), and if not, what should it
become architecturally — without increasing Base-tier cognitive load.

**Grounding.** This review was performed against the actual repository and deployed
schema, not from memory. The specific code citations below (workflow.ts line numbers,
pricingEngine shape, the booking row's hold fields) were inspected during the review.

---

## 1 · Constitutional analysis

### 1.1 What the legacy pipeline actually is

The visible Booking pipeline — Hold → Menu Call → Menu → Estimate → Confirm Count →
Final Invoice → Payment → Complete — is a **stored status enum driving a stage
machine** (`VENUE_WORKFLOW.stages` in workflows.ts, ported from the original
CONFIG.gs). Every stage is a value of one mutable `status` column on the booking
row, and the UI, priority engine, automations, and calendar all read that column as
truth.

Under the constitution as it now stands, that structure is a pre-constitutional
artifact. The constitution's first law — *relations and immutable records are
authoritative; status fields are projections, never competing truth* — was written
precisely against this pattern. The legacy pipeline is not wrong because it is old;
it is wrong because it stores, as one mutable scalar, what the constitution now
derives from three independent bodies of authoritative record.

### 1.2 The pipeline conflates three constitutional domains

Walking the eight legacy stages against the current constitution:

| Legacy stage | What the constitution says it is now |
|---|---|
| Hold | A **scheduling reservation with a deadline** — a claim on capacity. Today: a status value + `hold_expires` timestamp. Constitutionally: a recorded fact whose *active/expired* state must be derived, never read from status. |
| Menu Call | A **workflow convenience** — a scheduled conversation. Not a lifecycle state at all; it is a task/touchpoint. |
| Menu | Superseded. The menu *is* the proposal content. Immutable proposal versions (PL-1…PL-3) are the authoritative commercial artifact. The legacy `menu` JSON on the booking row (still read by `menuDone()` in workflow.ts) is a **second, competing commercial truth**. |
| Estimate | Superseded. An estimate is a **proposal version** — priced, sealable, presentable. The Studio already produces exactly this. |
| Confirm Count | A **financial-settlement input** (guest count true-up). It is not a stage of the engagement; it is a fact recorded on the settlement side. |
| Final Invoice | A **financial projection + artifact** derived from the accepted (frozen) commercial model plus settlement facts. |
| Payment | **Evidence** — an append-only financial fact (deposits and payments are recorded events, not stages). |
| Complete | Superseded. Completion is now the **derived `closed` stage** of the v276 lifecycle, established by the close ceremony's evidence — not a status anyone sets. |

The pipeline therefore interleaves three independent domains — commercial
formation, operational execution, financial settlement — into one line, and adds a
fourth thing (scheduling/capacity) disguised as its first stage. The middle of that
line (execution) has *already been constitutionally rebuilt* (v275/v276: released →
in_prep → ready → in_service → closed, all derived), which is why the Booking page
currently shows two disagreeing mental models at once: the legacy line above, and
the Event Operations workspace below it.

### 1.3 Answers to the specific questions

**Should Hold still be the first visible stage?** No — because Hold is not a stage
of the engagement at all. It is a *capacity claim*: "this date/time/room is reserved
for this party until this deadline." Two properties follow constitutionally: (a) the
claim is a recorded fact (who, what window, what deadline, extended/released by
whom), and (b) its current force — active or lapsed — is a **derivation over the
deadline**, exactly as obligation state and event stage are derivations. A booking
can meaningfully exist with no hold (off-premise catering that claims no room), with
a hold and no proposal, or with a proposal and no hold. First-stage placement forces
a false ordering.

**Is Hold a ceremony rather than a stage?** Yes — three small ceremonies, in the
same family as everything else in the constitution: *place hold* (creates the claim
with its deadline), *extend hold* (a recorded extension, attributable), *release
hold* (append-only release). "On hold," "expiring," and "expired" are projections
over those facts. Nothing about this is speculative: it is the identical pattern
already certified for staffing (assignment / release as facts; coverage as
derivation).

**Should Proposal exist before Hold?** They are **independent, not ordered**. The
constitution binds proposals to the engagement (booking) — not to the hold. An
inquiry may want a quote without claiming a date; a caller may claim a date before
any menu conversation. The *typical Base sequence* is inquiry → hold → proposal →
acceptance, and the Base presentation may present it that way — but that sequence is
a workflow convenience, not law. The architecture must permit either order; the
legacy pipeline forbids one of them.

**Should Acceptance become the commercial→operations transition?** It already is —
constitutionally and mechanically. PL-4 made acceptance the immutable commitment
(offer snapshot frozen, acceptance recorded, rescission append-only), and the v275
release predicate *already requires an unrescinded acceptance* — the v279 smoke test
proved the router refuses Operational Release without one. The review finding is not
that this boundary should exist; it is that **the Booking UI does not communicate
the boundary that already governs the system**. Acceptance is the moment the
commercial question ("what did we agree to?") closes and becomes read-only truth.

**Should Operational Release become the constitutional handoff?** Yes, and again it
already is: release is the ceremony that converts a commitment into an event with
obligations, gated by commitment + clearance + sign-off. Acceptance closes the
commercial domain; Release opens the operational domain. Those are two different
moments and must not be collapsed: a signed contract in March for an August wedding
is *accepted* for months before it is *released* into execution. The gap between
them is where deposit collection, planning conversations, and count confirmation
live.

**Should Booking expose a single linear pipeline?** No. The booking row is the
**engagement root** — the identity that all four domains hang from — and the
constitution now gives each domain its own authoritative records and its own derived
stage:

- **Commercial** — proposal versions → presented → accepted (or rescinded). Derived
  from the PL ledger.
- **Scheduling** — no claim / active hold (with deadline) / confirmed date /
  released date. Derived from reservation facts.
- **Operational** — released → in_prep → ready → in_service → closed. Derived (v276,
  already shipped).
- **Financial** — deposit state, count confirmation, invoice state, paid state.
  Derived from settlement facts against the frozen accepted model.

Four projections over one engagement. The one-line pipeline should be replaced —
architecturally — by *independent derived projections*, with the **line itself
retained only as a Base-tier presentation** (see §4). The hypothetical model in the
review request (Commercial / Operations / Financial lanes) is directionally correct;
the one amendment this review makes is that **Scheduling is a fourth, distinct
concern**, not a stage of the commercial lane — the expired-hold defect (§2.1) is
exactly what happens when a capacity claim is treated as a pipeline stage.

---

## 2 · Contradictions

Genuine constitutional contradictions found — not stylistic drift:

### 2.1 Availability derives from stored status, not from truth (defect, live)

`findConflicts` (workflow.ts:350) excludes a booking from conflict only when its
*stored status* is `hold_expired` (or cancelled/lead). It never evaluates
`hold_expires < now()` — even though `isHoldExpired()` exists in the same file
(workflow.ts:134) and does exactly that. Consequence, confirmed by the smoke test:
an `on_hold` booking whose deadline lapsed but whose status row was never flipped
continues to block availability, generate conflicts, and produce alternate-date
suggestions indefinitely.

This is the clearest possible violation of *status is a projection, never competing
truth*: the availability predicate trusts a stale stored scalar over a derivable
fact. It is also self-inflicting commercial harm (dates look booked that are
actually free). **This is a corrective-patch priority independent of everything else
in this review** — the availability predicate must derive hold force from the
deadline (and any extension/release facts), with the stored status treated at most
as a display cache. The same audit must cover every consumer of the conflict
projection: new-inquiry conflict panel, calendar, first-refusal gate, alternate-date
suggester.

### 2.2 Two competing commercial truths

The legacy `menu` JSON and `menu_completed` flag on the booking row are still live
truth (`menuDone()` gates invoice steps), while immutable proposal versions are the
constitutional commercial artifact. Two writable representations of "what are we
serving" is precisely the competing-truth condition the constitution forbids. During
migration the legacy fields can survive as a *compatibility projection* for
pre-constitutional bookings, but no current-architecture path may treat them as
authoritative.

### 2.3 The stored status enum spans domains and is written freely

One mutable column encodes commercial state, scheduling state, operational state,
and financial state simultaneously, and it is written by UI flows rather than
ceremonies. Every constitutional rebuild to date (obligations, lifecycle, staffing,
routing) has replaced exactly this pattern. The booking status column is the last
major pre-constitutional stage machine left standing.

### 2.4 Price confirmation is a boolean where the model requires lineage

`price_confirmed: boolean` (pricingEngine.ts) is the entire provenance model. A
two-state flag cannot distinguish *originated in v4 / carried into v5 / confirmed in
v5 / modified in v6* — which is why the UI can only say "CARRIED" and "Confirm."
This is not merely a labeling gap: the immutable version ledger already *contains*
the lineage (each sealed version records its amounts), so provenance is **derivable
today** by walking versions — no new stored truth is required for origin/carry/
modify. The one fact that is genuinely new is the *confirmation act itself* ("a
human affirmed this inherited value in this version"), which is a small recorded
fact in the ceremony family, not a boolean on a row. See §6 items 1–5.

No contradiction was found in PL-1…PL-4, v275–v279 themselves. The frozen law is
coherent; the Booking surface predates it.

---

## 3 · Recommended workflow (architectural, not visual)

**The Booking becomes an engagement root exposing four independent derived
projections, with ceremonies as the only writers, and a composed "next action"
projection as the Base-tier face.**

Correct constitutional relationships between the named concepts:

- **Inquiry** — the creation of the engagement root. A recorded beginning, not a
  stage. (An inquiry that dies becomes a lead-lost fact; the pipeline's habit of
  treating leads as pseudo-holds ends.)
- **Hold** — an optional capacity claim on the engagement: placed / extended /
  released by small ceremonies; force derived from its deadline. Participates in the
  availability projection only while in force.
- **Proposal** — the commercial formation artifact: immutable versions, presented
  offers. Already constitutional (PL-1…PL-3). Independent of Hold.
- **Acceptance** — the commercial close: the frozen commitment. Already
  constitutional (PL-4). This is the commercial→operations *boundary*; after it, the
  commercial projection is read-only history (absent rescission).
- **Deposit** — financial evidence recorded against the engagement; feeds both the
  financial projection and (as clearance) the release predicate. It is not a stage —
  it is a fact that several projections read.
- **Operational Release** — the handoff ceremony: commitment + clearance + sign-off
  → event + obligations. Already constitutional (v275). Opens the operational
  projection.
- **DailyOps / Execution** — the operational domain: obligations, evidence,
  staffing, lifecycle stages, workspace, routed actions. Already constitutional
  (v275–v279) and already correctly derived.
- **Completion** — the derived `closed` stage established by the close ceremony.
  The engagement's *financial* projection may still be open (final invoice, payment)
  after operational closure — which is normal and is exactly why one linear line
  cannot represent the truth.

What disappears architecturally: Menu Call (becomes a task/touchpoint convenience),
Menu and Estimate (become the proposal), Confirm Count / Final Invoice / Payment /
Complete as *stages* (become financial facts + a derived financial state + the
derived operational close).

What is deliberately **not** proposed: no new statuses, no second workflow engine,
no changes to any frozen ceremony, no operational-side changes at all. The
operational half of this model already exists and is certified; this review is about
bringing the commercial, scheduling, and financial thirds up to the same law.

---

## 4 · Base / Pro / Enterprise presentation strategy

The absolute requirement — Base cognitive load must not increase — is satisfiable
precisely *because* the recommendation is projections, not architecture-per-edition.
One constitutional model; three renderings of it.

**Base — one line, derived.** Base users keep a single simple pipeline visual. The
difference is invisible to them: the line is now a *composed projection* — "the
furthest lawful point of the engagement plus the single next action" — computed from
the four domain projections, instead of read from a stored enum. A Base line would
read, in order: Inquiry → Date Held → Proposal Sent → Accepted → Deposit → In
Preparation → Event Day → Wrapped Up → Paid. Nine familiar words; zero new concepts;
every word backed by derived truth instead of a hand-set status. The single most
valuable Base improvement falls out automatically: the line can never lie (no more
"Hold" showing on a date whose hold lapsed last Tuesday), and the *one suggested
next action* ("Send the proposal," "Collect the deposit," "Confirm the count") is
the same next-action discipline the workspace already uses. Base users see fewer
wrong things, not more things.

**Pro — the lanes.** Pro reveals the four projections as parallel lanes (Commercial
· Schedule · Operations · Financial), each with its own derived state and history.
Same data, one more level of structure, aimed at operators who juggle the March
acceptance / August release gap daily.

**Enterprise — the Execution OS.** Enterprise additionally exposes what already
shipped: the Event Operations workspace, routed action panel, staffing coverage,
DailyOps, evidence trails. Enterprise is not a different model; it is the same model
with the operational third fully opened.

Edition gating is therefore purely a *rendering* decision — which projections a
surface subscribes to — never a schema, ceremony, or authority difference. That is
the strongest possible guarantee that complexity stays additive by edition.

---

## 5 · Migration strategy (if the recommendation is adopted)

Additive, in the program's standard order, with the legacy pipeline retired only
after its replacement is proven — never removed while load-bearing.

1. **Corrective patch first (independent of the rest):** fix the availability/
   conflict predicate to derive hold force from the deadline rather than stored
   status, and audit every conflict consumer. This is a live commercial defect and
   should not wait for the workflow work.
2. **Constitution:** record the four-domain model and the hold-as-ceremony law as a
   canon section, including the explicit statement that the Base pipeline is a
   projection.
3. **Scheduling facts + ceremonies:** hold place/extend/release as recorded facts;
   derived hold-force and availability projections; proofs (including "an expired
   hold never blocks scheduling" as a named claim) and a race where warranted
   (competing holds on one slot is genuinely race-sensitive).
4. **Domain projections:** derived commercial state (from the PL ledger — no new
   truth), derived financial state (from deposit/count/payment facts; where legacy
   fields are the only source, the projection reads them as compatibility inputs),
   and the composed Base next-action projection.
5. **Status column demotion:** the stored status becomes a write-through display
   cache during transition (ceremonies keep it consistent for legacy consumers),
   then read-only, then vestigial. Legacy bookings that predate the constitution
   remain readable forever through a compatibility projection; they are never
   force-migrated into invented proposal versions.
6. **UI re-pointing by edition:** Base line switches to the composed projection
   (visually near-identical, now truthful); Pro lanes and Enterprise surfaces mount
   the domain projections. The legacy stage machine is deleted only after browser
   acceptance proves the replacement on every surface that read it (booking page,
   calendar, priority engine, automations, SOP flows).
7. **Pricing provenance:** derive origin/carry/modify lineage from the existing
   sealed versions; add the small confirmation fact; re-point the Inspector chips.
   Independent of steps 3–6 and can ship separately.

Each step is provable in isolation; no step reopens frozen law; every step is
reversible until the final deletion, which happens last and only after proof.

---

## 6 · Smoke-test findings, reviewed

**1 · Price provenance.** Agreed, and the recommendation sharpens it: *Originated /
Carried / Confirmed / Modified* are four different assertions, and three of the four
are already derivable from the immutable version ledger — origination is "first
sealed version containing this amount," carry is "subsequent version inheriting it
unchanged," modification is "version where the amount differs from its
predecessor." Only *Confirmed* is a new fact (a human affirmed the inherited value
in this version), and it belongs in the recorded-fact family, not in a boolean
column. Classification: lineage = **projection**; the confirmation act = **ceremony-
recorded fact**; the chip = **UI**.

**2 · Component/category confirmation inconsistency.** Reviewed as an audit item,
not law: the component/package path carries its own `package_price_confirmed` flag
parallel to item-level `price_confirmed`, so there are two confirmation code paths
that can diverge (confirmation write, carried-flag removal, refresh). The observed
inconsistency is most plausibly an implementation bug in the second path, and the
provenance work in §5.7 would collapse both paths into one derivation — which is the
durable fix. Classification: **implementation audit**, resolved structurally by the
provenance projection.

**3 · Confirmation semantics.** Correct reading: "Confirm $3.50" means *accept the
inherited value unchanged into this version*. The button should say what the act is
("Keep carried price" / "Confirm inherited $3.50") — pure **UI**, no law change.

**4 · Editing adopts ownership.** The observed behavior — editing a carried price
makes it native to the draft and removes the confirm affordance — is
constitutionally *correct*: a draft edit is a native assertion of the draft, and
sealing will freeze it. The gap is communication only. The UI should state the
consequence at the moment of edit ("This version now sets its own price"), and the
provenance projection will record it as *Modified in vN*. Classification:
**intentional behavior; UI communication gap**.

**5 · Price history vs provenance.** Agreed — the emphasis should be commercial
lineage (which version originated/carried/confirmed/modified), which is §5.7 /
finding 1. Numerical history is a byproduct of the same derivation.

**6 · Expired holds blocking.** Confirmed as a real, live defect with a located
cause (§2.1) — the availability predicate trusts stored status and never evaluates
the deadline. It is the review's one genuine constitutional contradiction in force,
and it is also the strongest evidence for the hold-as-ceremony recommendation: had
hold force been a derivation from day one, this class of bug could not exist.
**Corrective-patch priority.**

**7 · Legacy compatibility.** Agreed and folded into §5: pre-constitutional bookings
are served by compatibility projections and are never treated as evidence about
current-architecture behavior. Any smoke finding sourced from a legacy booking
should be re-verified against a constitutional one before it drives a change.

---

## 7 · Classification of every element in scope

**Constitutional (authoritative records):** the booking row as engagement root;
proposal versions and offer snapshots (sealed); acceptances and rescissions; events,
obligations, execution evidence; staffing requirement/assignment/release; hold
place/extend/release facts with deadlines (*recommended*); deposit, payment, and
count-confirmation facts (*recommended — today partly legacy columns*); the price-
confirmation fact (*recommended*).

**Ceremonies:** accept_offer, rescind_acceptance, release_event, start_service,
close_event, record_execution_evidence, the staffing ceremonies, perform_event_action
(all frozen); place/extend/release hold, record deposit/payment, confirm count,
confirm carried price (*recommended*).

**Projections (derived, never stored):** availability/conflicts (must derive hold
force — currently defective); hold state; commercial stage; operational stage
(v276, shipped); staffing coverage (v278, shipped); available actions (v279,
shipped); financial state; price provenance; the composed Base pipeline/next-action.

**Workflow convenience:** menu-call scheduling and reminders; automations; priority
scoring; touchpoints; alternate-date suggestions.

**UI only:** the pipeline visual; lane layouts; chips ("CARRIED"); button labels and
confirmation wording; edition-specific grouping and disclosure.

---

## 8 · Verdict of the review

The frozen constitution (PL-1…PL-4, v263–v279) is internally coherent; nothing in it
requires reopening. The Booking surface, however, still presents the
pre-constitutional stage machine, and in one place — availability — pre-
constitutional *storage* still overrides derivable truth in production, with
commercial consequences. The recommended direction is: engagement root + four
derived domain projections (Commercial, Scheduling, Operational, Financial) +
hold-as-ceremony + a composed Base-tier line that preserves today's simplicity while
becoming incapable of lying. One corrective patch (the availability predicate) is
warranted immediately, ahead of and independent of any workflow decision.
