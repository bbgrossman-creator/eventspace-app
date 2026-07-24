# EventCore 1.0 — Application Shell & Visual Information Architecture
## The companion to PRODUCT_ARCHITECTURE_1.0.md: what it should feel like
### FROZEN as Product Architecture 1.0 (July 24, 2026) — with §14 refinements recorded

**Standing.** Visual IA, not implementation. Constitutional stack fixed.
This document incorporates the owner's three cautions as *structural decisions*:
navigation is not frozen (§2, the shell registry); the Promise/Work split is
taught progressively (§9); department words are configurable labels over fixed
constitutional keys (§10). Wireframes are drawn in text so they live in the
repo, diff, and survive any tool.

---

## 1 · The shell: one frame for everything

Every screen in EventCore lives inside the same four-part frame. This is the
single most important decision in the document, because the user's feeling of
"one application" comes from the frame never changing — only its contents.

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│            │  ⌕ Search anything…        📅 Today · Thu 12 Adar   ⚖ 3   ◐  │  ← top bar
│  EventCore ├──────────────────────────────────────────────────────────────┤
│            │  CONTEXT HEADER (morphs per place: event · day · department) │
│  ▸ Events  ├──────────────────────────────────────────────────────────────┤
│  ▸ Ops     │                                                              │
│  ▸ Library │                                                              │
│  ────────  │                     CONTENT CANVAS                           │
│  Prep      │                                                              │
│  Pulls     │          (the only region that changes per place)            │
│  Routes    │                                                              │
│  Roster    │                                                              │
│  ────────  │                                                              │
│  ⚙ Admin   │                                                              │
└────────────┴──────────────────────────────────────────────────────────────┘
   left rail                                  content
```

**Left rail** — places. Spaces on top, the user's departments beneath a thin
divider, admin at the bottom. Collapses to icons at narrow widths; never
disappears. The rail is *data-driven* (§2) — it renders what the shell
registry says exists, in the order the user's role prefers.

**Top bar** — three instruments, identical everywhere:
1. **The omnibox** (⌕, Ctrl+K). Search, command line, and jump — §7.
2. **The time context** (📅). Shows *when you are* — Today by default, any day
   or week when you've navigated in time. Civil + Hebrew date together,
   because in this business the Hebrew date is operational information, not
   decoration. Clicking it opens the time axis (§6).
3. **The ceremony tray** (⚖). Every pending human ceremony — approvals,
   adoptions, transfers, promotions, amendment confirmations — in one queue
   with a count. This is where authority lives in the UI: notifications inform,
   the tray *asks*. It is the visible enforcement of "AI recommends, humans
   sign," and it belongs in the frame precisely because ceremonies can
   originate anywhere.

**Context header** — the morphing strip that tells you where you are and what
posture the place is in. An event shows name · date · stage · posture badge
(DESIGN / SEALED). A department shows its label · today's load · debt count.
The day shows the date pair and events in motion. The header is also the
breadcrumb: its left edge always offers the one-tap step *up* (event → its
day; department item → department queue).

**Content canvas** — the only region that changes. Everything below describes
canvases.

---

## 2 · The left rail, exactly — and why it isn't frozen

The owner's caution is right: Pipeline and Resources don't exist as
constitutional objects yet, and navigation is the last thing to freeze. The
answer is already in the codebase's own pattern: **the lens registry,
promoted to the shell.** The rail renders from a *shell registry* — a
data-driven list of doors, each gated on the constitutional objects that back
it (exactly how lens availability is already doubly gated). Doors appear when
their engine exists; nothing is hard-coded; adding a door is a registry row,
not a redesign.

**At 1.0 ship, three doors:**

```
  EventCore
  ─────────────
  Events          ← engagements: portfolio, studio, command boards
  Operations      ← Today / Week / Day Sheets
  Library         ← components · blueprints · playbooks
  ─────────────
  Prep            ← the user's departments (label-configured, §10);
  Pulls              rendered only for departments the user belongs to
  ─────────────
  Admin ⚙
```

**Future doors, registry-gated:** Pipeline appears when inquiry/date-claim
objects land; Resources appears when Resources become constitutional. Until
then, their content lives where it already does (bookings list serves as
proto-pipeline inside Events; staff/venues/vendors remain reachable via search
and Admin). The rail may show future doors dimmed with a lock glyph in
owner/admin roles only — a roadmap the owner can see and staff can't trip on.

Role ordering: the rail is the same list, reordered per role default —
operational roles see Operations first; planners see Events first; the order
is a preference, not a fork.

---

## 3 · Canvas: Operations Today (the console)

The default landing for operational roles. Answers the five morning questions
top-to-bottom, in order, above the fold:

```
┌─ TODAY · Thu 12 Adar ─── 2 events in motion ───────────────────────────────┐
│                                                                            │
│  ┌ My work ─┐  ┌ Nobody's ─┐  ┌ At risk ──┐  ┌ Changed ──┐                 │
│  │    7     │  │    3 ⚠    │  │    2 ⚠    │  │    5      │   ← the counts │
│  │ 4 active │  │ logistics │  │ 1 lapse   │  │ 1 amend   │     are doors  │
│  └──────────┘  └───────────┘  └───────────┘  └───────────┘                 │
│                                                                            │
│  MY WORK                                          state · event · dept     │
│  ● Load truck 1 — chafers ×12, rounds ×20     [active] (Goldberg) (Pulls)  │
│  ● Confirm carver seat 2                      [active] (Stein)   (Roster)  │
│  ◐ Prep brisket rub — window opens 15:00    [standing] (Goldberg) (Prep)   │
│                                                                            │
│  NOBODY'S — visible debt, never hidden                                     │
│  ○ Truck departs 14:00 — no driver             [derived] (Stein) (Routes)  │
│      [ claim ]  [ suggest owner ↗ ]                                        │
│                                                                            │
│  AT RISK                                                                   │
│  ▲ Collect balance — due tomorrow, T-1         [active] (Goldberg) (Coll.) │
│  ▲ Venue dock constraint changed — 2 routes stale        (Stein) (Routes)  │
└────────────────────────────────────────────────────────────────────────────┘
```

Design rules of the console: the **Nobody's** band cannot be filtered away —
it is the product's conscience; state renders as the constitutional vocabulary
under a color language used identically everywhere (§8); every row carries the
two chips; **Changed** is a diff-of-truth feed (supersessions, amendments,
re-derivations since last visit), which is what makes the console trustworthy
— you never wonder what moved while you slept. The Week canvas is the same
projection over the operating week, drawn with its real shape: Sunday peaks,
Thu–Fri crunch, Shabbos rendered as a visually distinct quiet band.

---

## 4 · Canvas: the Event — one room, two postures

### Design posture (pre-seal) — today's Studio, kept
```
┌─ Goldberg wedding · Aug 22 · DRAFT v4 ── [DESIGN] ── lens: ▾ Design ───────┐
│ ┌ palette ┐ ┌──────────── Design Stage ────────────┐ ┌ right region ─────┐ │
│ │ Library │ │  Chapters → components → items       │ │ pricing · paper  │ │
│ │ pulls   │ │  (drag grammar, bands, grips)        │ │ versions · pub   │ │
│ └─────────┘ └──────────────────────────────────────┘ └──────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```
Unchanged in substance. The only 1.0 additions: the date-claim indicator in
the context header (this date already carries N events) and the feasibility
whisper when Resources land.

### The acceptance reveal — the teaching moment
Acceptance is staged as a full-canvas moment, not a toast:
```
┌────────────────────────────────────────────────────────────────────────────┐
│                     The Goldberg wedding is accepted.                      │
│                The design is sealed. The work now exists.                  │
│                                                                            │
│     47 responsibilities across 5 departments                               │
│     Prep 18 · Pulls 12 · Routes 6 · Roster 9 · Collections 2               │
│                                                                            │
│     31 already have owners by standing rule · 16 need owners →             │
│                                                                            │
│                    [ Enter the command board ]                             │
└────────────────────────────────────────────────────────────────────────────┘
```
One screen teaches the whole model: promises become work, automatically, with
provenance, and ownerless work is visible from second one. This is also the
progressive-disclosure hinge (§9) — the user *watches* the product cross from
Promise to Work, so the two-space navigation stops being abstract.

### Command posture (post-seal)
```
┌─ Goldberg wedding · Aug 22 · SEALED v4 ── [COMMAND] ── lens: ▾ Operations ─┐
│ ┌ sealed design ─┐ ┌──────── responsibility board ──────────────────────┐  │
│ │ read-only      │ │  Nobody's (3)  │ Standing (11) │ Active (28) │ ✓5  │  │
│ │ reference;     │ │  ○ driver 14:00│ ◐ brisket rub │ ● truck 1   │ …   │  │
│ │ [Amend…] opens │ │  ○ carver s.2  │ ◐ florals in  │ ● seat conf │     │  │
│ │ a ceremony     │ │  ○ dock check  │ …             │ …           │     │  │
│ └────────────────┘ └────────────────────────────────────────────────────┘  │
│  Amendments: v4→v5 diff — "+4 seats · +1 pull · 2 superseded" [confirm ⚖]  │
└────────────────────────────────────────────────────────────────────────────┘
```
The board's columns are the lifecycle vocabulary, not invented statuses.
Amendment is a ceremony whose UI *is* the re-derivation diff. The lens rail
persists — the same lenses now project derived work.

---

## 5 · Canvas: a department (one anatomy, many labels)

Drawn once because it is one design. Shown as Pulls; Prep, Routes, Roster,
Collections are the same anatomy with their own vocabulary and grouping
dimensions (§10).

```
┌─ PULLS · Sunday load ─── 3 events · 41 items ── debt: 1 ───────────────────┐
│  [ Today ] [ Week ] [ Day sheet 🖨 ]           group by: ▾ truck            │
│                                                                            │
│  TRUCK 1 — departs 13:00                                                   │
│  ● Chafers ×12         (Goldberg)(Stein)    [ pulled ] [ short ]           │
│  ● Rounds 60" ×20      (Goldberg)           [ pulled ] [ short ]           │
│  ◐ Consolidated pull — committed by Moshe (attestation)  covers 3 events   │
│                                                                            │
│  NOBODY'S                                                                  │
│  ○ Late-add: 2 heat lamps (Stein amendment v5)     [ claim ]               │
│                                                                            │
│  evidence verbs are the buttons; "short" is one tap — honesty is cheap     │
└────────────────────────────────────────────────────────────────────────────┘
```

The anatomy, always: header (label · load · debt) → time tabs + print (the
day sheet is a first-class projection: paper on a warehouse door is also a
lens) → queue grouped by the department's natural dimension (station /
truck / route / seat / account; regrouping is presentation and R-13
guarantees it changes nothing) → the Nobody's band → verbs as buttons, where
the verbs are the department's evidence vocabulary. Aggregated rows show
every contributing event's chip. A committed consolidation renders with its
attestation provenance visible.

---

## 6 · Moving between places without changing buildings

The owner's question — Event → Operations → Department without feeling like a
different application — is answered by five continuity devices, all already
drawn above:

1. **The frame never changes.** Rail, top bar, ceremony tray: identical.
2. **The two chips are the transit system.** Every responsibility row,
   everywhere, carries (event) and (department). Tap event → that event's
   command board, scrolled to this item. Tap department → that department's
   queue, scrolled to this item. Same record, new vantage; the item the user
   was looking at stays briefly highlighted after the jump — the eye never
   loses the thread.
3. **The context header morphs; it never blanks.** Transitions animate the
   header from one context to the next (event name slides out, department
   label slides in) so the user sees *re-framing*, not *re-loading*.
4. **The time context persists.** If you were looking at Sunday in
   Operations, tapping into Pulls shows Sunday's pulls. Time is a property of
   *you*, not of the page.
5. **One state color language** (§8). An `active` teal dot means the same
   thing in a command board, a department queue, the console, and search
   results. Color is the proof that it's one engine.

The worked path: console → tap (Stein) on the driverless truck → Stein's
command board, Nobody's column, item highlighted → tap (Routes) on the same
row → Routes queue, same item, same highlight → claim it → the ceremony tray
ticks, the console's Nobody's count drops. Three places, one record, zero
re-orientation.

---

## 7 · The omnibox

One field, three behaviors, Ctrl+K from anywhere:

**Find** — `klein` → grouped results with state chips:
```
  EVENTS        ● Klein bar mitzvah · Feb 9 · SEALED · 6 open items
  CUSTOMERS     Klein, Shmuel · 3 events · last: Feb 2026
  RESPONSIBILITIES  ▲ Collect balance — Klein · active · Collections
  KNOWLEDGE     Blueprint: "Klein-style smorg" · rev 3 · used 4×
```
**Jump** — `sunday pulls`, `stein routes`, `today` → straight to projections.
**Ask** — a leading `?` hands the query to the assistant with citations
(`? how long was load-out at Lakewood last three times`). Find and Jump are
deterministic; Ask is labeled AI. The user always knows which one answered.

Results rank by relationship (provenance makes this honest): a menu item finds
its component, then events that used it, then the evidence where it ran short.

---

## 8 · The state color language

One mapping, used everywhere a responsibility appears — console, boards,
queues, search, mobile, print (as glyphs):

```
derived    ○  hollow gray      — exists, nobody's yet (debt when surfaced)
standing   ◐  half amber       — owned, waiting on window/dependency
active     ●  solid teal       — owned, in window, go
discharged ✓  check, quiet     — evidence satisfied it
lapsed     ▲  red triangle     — window closed unmet; permanent, honest
superseded ⇢  gray arrow       — replaced; links to its replacement
void       ∅  gray slash       — truth withdrawn
```

The vocabulary is constitutional; the palette is the product's accent set.
Nothing else in the application may use these seven marks for anything else.

---

## 9 · Teaching the two centers (progressive disclosure)

The owner's caution B, answered structurally rather than with a tutorial:

**Stage 1 — one door.** A new organization starts with *Events only* visible.
Pipeline-ish work lives inside Events (the portfolio has an "inquiries" band).
Nothing to explain: it's an event manager.

**Stage 2 — the reveal earns the second door.** The first acceptance triggers
the reveal screen (§4). *Then* Operations appears in the rail — with a
one-line birth note: "Your promises now create work. This is where you keep
it." The space appears at the moment its reason exists, for every user, at
their own first acceptance. The product never asks anyone to understand a door
before they've seen why it's there.

**Stage 3 — departments follow membership.** Department entries appear in the
rail when a user is added to a department. A kitchen hire's rail is: Prep,
Operations. That's the whole app for them, and it's complete.

Empty states everywhere teach the model in the product's voice: the empty
Nobody's band says "Nothing is ownerless. That's the goal." — the console
explains its own conscience.

---

## 10 · Labels are configuration; keys are constitution

The owner's caution C, adopted fully. The constitutional department keys
(R-12: `culinary, equipment, staffing, venue, logistics`) are fixed law.
Everything the user reads is a **label pack** resolved per tenant:

```
key         catering pack (default)   generic pack        a-v company pack
culinary    Prep                      Production          Content
equipment   Pulls                     Warehouse           Gear
logistics   Routes                    Deliveries          Transport
staffing    Roster                    Staffing            Crew
venue       Venue                     Sites               Venues
```

Labels are presentation, and R-13 is precisely why this is safe: renaming
Pulls to Warehouse can never create, destroy, or alter a responsibility. The
catering pack ships as default because EventCore's first domain deserves its
own language; the pack mechanism is how the platform outgrows the domain
without a rewrite. Evidence-verb sets ride in the same pack (pulled/staged/
loaded are catering verbs; a pack supplies its own).

---

## 11 · Mobile shell

The frame collapses to: **bottom tabs** (Today · My Work · [department] ·
⚖) + the omnibox behind a search glyph. Canvases become single-column,
verb-forward:

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ MY WORK · Thu            │   │ ● Chafers ×12            │
│ ● Load truck 1           │   │   Goldberg · Truck 1     │
│ ● Confirm seat 2         │   │                          │
│ ◐ Brisket rub · 15:00    │   │  [ PULLED ]  [ SHORT ]   │
│ ─ nobody's (1) ─         │   │  📷 attach   ⚖ hand off  │
│ ○ Driver 14:00  [claim]  │   └──────────────────────────┘
└──────────────────────────┘
│ Today · Work · Pulls · ⚖ │
```

Capture-first: verbs are thumb-height, *short* costs one tap, photos attach to
evidence, capture queues locally and syncs as facts (a loading dock with one
bar of signal must never lose an attestation). Ceremonies work on mobile
(claim, transfer, adopt) — authoring does not. Temporary staff see My Work
and nothing else.

---

## 12 · What this replaces (route disposition)

| Today | 1.0 |
|---|---|
| `/dashboard` | Operations Today |
| `/bookings`, `/bookings/[id]/*` | Events (portfolio · studio · command) |
| `/calendar` | the time context, in the frame |
| `/blueprints` `/blueprint-shelf` `/templates` `/package-guides` `/sop` `/price-book` | Library, three shelves |
| `/rolodex` | retired; content in Events/customers + search |
| `/operational-profiles` `/component-basis/[id]` | inside Library component pages and event component detail |
| `/staff` `/venues` `/vendors` `/locations` | Resources when it lands; until then Admin + search |
| `TodoPanel` | dissolved into the console's My Work projection |

A "classic links" bridge can exist behind Admin during migration; it sunsets.

---

## 13 · Refinements recorded at freeze (owner's review)

**13.1 · Events and Operations are viewpoints, not destinations.** Recorded as
a standing design pressure rather than a redesign: the user must always feel
*inside EventCore*, with the two spaces as windows on one building. The
existing devices (constant frame, morphing context header, persistent time
context, two-chip transit) already carry most of this; every future shell
decision is tested against it, and any treatment that makes the two spaces
feel like separate applications — separate visual languages, separate search,
separate ceremony queues — is drift by definition. If the rail's *visual
grammar* needs softening (views, not doors), that is a Rev B decision made
with real users in front of it, not now.

**13.2 · Resources is demoted from planned space to candidate door.** The
shell registry already keeps it unfrozen mechanically; this makes it explicit
editorially. No part of the shell may assume Resources becomes a space until
its constitutional model is defined and accepted. Wherever this document or
its companion says "when Resources land," read "if and as the Resources
constitution rules." The same holds for Pipeline.

**13.3 · The ceremony tray admission rule.** The overload risk is real, and
the constitution already contains the answer. The tray holds an item if and
only if resolving it **appends an authority-bearing record signed by the
person** — an act that passes through the action gate or its equivalents:
ownership assign/transfer/release, sealing, amendment confirmation,
attestation, knowledge promotion, adoption of an AI recommendation,
exception acknowledgment where policy demands a named human. The test in one
sentence: *does completing this create a record that cites you as the
authority?* If yes, tray. If it merely informs (a fact was appended, a state
changed), it is a notification. If it is ordinary evidence capture (pulled,
made, delivered), it is a verb on the work itself and never enters the tray.
Corollaries: the tray can never be filtered by anyone else's priority scheme,
nothing may auto-expire from it (an unanswered ask is visible debt, like
ownerless work), and nothing that can be completed without a signature may be
placed in it to "get attention" — that is what the console's risk band is
for.

---

## 14 · What was decided here

The frame is one and constant; contents morph. The rail is a registry, not a
hard-coded list — navigation stays unfrozen by construction. Three doors ship;
doors are earned by engine reality and revealed by the user's own milestones.
The acceptance reveal is the product's single teaching moment. The two chips
are the transit system between the three axes. One state color language proves
one engine. Labels are packs; keys are law. The ceremony tray puts human
authority in the frame itself. And the day sheet prints, because a warehouse
door is also a screen.
