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
