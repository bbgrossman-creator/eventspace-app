# THE PUBLICATION RENDERER — constitutional specification (FROZEN)

Ratified with Ben's review adopted in full: the Layout Snapshot as a
first-class abstraction, the forward-only/no-backtracking law, the
hardened deterministic Measurement Port, and the incremental-pagination
reservation. The slice map PR-1–PR-6 is LOCKED; no reordering without a
constitutional contradiction.

Publishing Assets defined WHAT a publication is. The Renderer determines
HOW that publication becomes pages. These are different responsibilities
and they must never blur: the renderer knows nothing about proposals,
bookings, pricing, templates, or proof — it consumes a fully resolved
publication and concerns itself only with layout. If a future engineer
finds proposal vocabulary inside the paginator, the constitution has
been violated.

Mission sentence: THE RENDERER TURNS ONE RESOLVED PUBLICATION INTO A
DETERMINISTIC SEQUENCE OF PAGES, AND IT DOES NOTHING ELSE.

---

## 0. The Renderer Ruling (load-bearing)

◆ WHAT A RENDERER IS. A renderer is a pure projection from a RESOLVED
PUBLICATION to a PAGED ARTIFACT. "Resolved" means every question of
meaning has already been answered upstream: inheritance collapsed,
policy applied, facts projected, pins denormalized, words frozen. The
renderer never resolves, never queries, never decides what something
means — only where it sits and where it breaks.

◆ WHAT IT CONSUMES. Exactly one input: the ResolvedPublication — the
same material the presentation snapshot freezes at send (v225/v231/v239
law): the presentation model (the composed document), the resolved
theme (every treatment leaf present), region words, resolved company
facts, and photo pins. For sent and approved versions the renderer
reads THE SNAPSHOT, never live state — a sent document renders the same
pages forever. For drafts it consumes the live resolution the Studio
already computes. In both cases the input arrives whole; the renderer
performs zero reads of its own.

◆ WHAT IT PRODUCES. A PAGED ARTIFACT: an ordered sequence of pages,
each a set of placed, styled, absolutely-positioned primitives inside a
declared page geometry — plus artifact provenance (engine version,
generated-at, source fingerprint). The artifact's file format (PDF,
print-HTML, DOCX) is a BACKEND concern behind a port; the paged
artifact exists as a first-class model before any format does.

◆ THE SEMANTIC WALL. Downstream of composition (§2), no stage may
reference publication vocabulary. Sections, components, items, prices,
regions — these words exist only in the composer. Everything after
speaks BOX. Provenance tags on boxes carry source paths for debugging
and continuation labels, but tags are opaque strings to the paginator:
it may copy them, never interpret them.

◆ THE WEB KEEPS ITS PAPER. The Studio's continuous renderer
(ProposalRenderer) is untouched by this phase, forever. Continuous
scroll is the correct projection for authoring; pages are the correct
projection for print. Both project the SAME resolved publication;
neither owns or feeds the other. Nothing in this constitution modifies
a single line of the web paper.

## 1. The Layout Box Model — evaluated and adopted

Three architectures were weighed.

(a) PAGINATE THE DOM. Render the existing React paper, measure real
DOM nodes, slice with CSS paged media or a headless browser's
print-to-PDF. Rejected: break control in CSS paged media is advisory
and inconsistently honored; keep-with-next, widow minimums, and
split-with-continuation are not reliably expressible; measurement is
tied to a browser runtime, making server-side generation heavy and
pagination untestable without a browser; and the renderer would be
permanently coupled to the UI framework — the exact coupling this
phase exists to avoid.

(b) DIRECT-TO-PDF. Walk the publication and emit PDF primitives,
deciding breaks as you draw. Rejected: pagination decisions become
entangled with drawing calls; the rules cannot be tested without
producing PDFs; a second output format means a second paginator; and
the PDF library's coordinate model leaks upward into layout logic.
This is how print code rots.

(c) THE LAYOUT BOX MODEL — ADOPTED. The renderer first constructs an
abstract LAYOUT TREE of boxes; measurement gives boxes intrinsic
sizes; pagination places boxes onto pages; only then does a backend
draw. This is how durable publishing systems are built (TeX's boxes
and glue; XSL-FO's area tree; every serious typesetter since), and it
is correct here for constitutional reasons, not fashion: pagination
becomes a PURE FUNCTION over boxes — provable with synthetic trees in
a unit suite, no browser, no fonts, no PDF; break rules become BOX
ATTRIBUTES instead of scattered conditionals; and backends become
interchangeable because they receive placed geometry, not layout
questions.

◆ THE COST, NAMED HONESTLY. Owning a box model means owning TEXT
MEASUREMENT — the one thing the DOM gave for free. The constitution
answers with a PORT (§2): measurement is an injected service with a
narrow contract (string × font × size × width → lines and heights),
backed in production by real font metrics from the same font files the
web serves (v232's fontsource set), and in tests by a fixture measurer
with fixed character widths. Measurement is the model's tax;
determinism and testability are what the tax buys. Paid knowingly.
◆ The port's contract is STRICT: pure and total (same string × font ×
size × width → same lines and heights, always, on every machine);
backed only by DECLARED metrics shipped with the engine — never system
fonts, never environment discovery, never network; and VERSIONED — the
metrics set carries a version that stamps into artifact provenance, so
a metrics upgrade is a visible event, not silent drift. A font the
metrics set lacks is a composition-time ERROR, never a fallback.

◆ WHAT A BOX IS. A box is one of a SMALL CLOSED SET of kinds — block,
text, image, rule, spacer, group — carrying: resolved style (concrete
values only; no theme keys, no inheritance, no CSS), break rules
(§3), an opaque provenance tag, and children where the kind allows.
Boxes contain NO publication semantics, no callbacks, no components,
no framework types. A box tree serializes to JSON losslessly; that
property is a unit claim, because it is what makes pagination
replayable and artifacts reproducible.

## 2. The Pipeline — responsibilities in sequence, not features

    ResolvedPublication
      → COMPOSITION   (publication vocabulary → box vocabulary; the
                       ONLY stage that knows what a section is)
      → MEASUREMENT   (boxes gain intrinsic sizes; the injected port)
      → PAGINATION    (boxes → pages of placed boxes; pure; §3)
      → MASTERS       (page geometry, furniture, numbering; §4)
      → BACKEND       (placed pages → artifact bytes; dumb; §5)

Each stage consumes only its predecessor's output. Each is
independently provable. The composer is the semantic wall's gate: it
translates once, completely, and forward-only. The paginator never
sees the publication; the backend never makes a layout decision. A
stage that reaches around its neighbor violates the constitution.

◆ THE LAYOUT SNAPSHOT. The measured box tree and the paginator's break
decisions serialize together as a LAYOUT SNAPSHOT — a first-class,
lossless artifact of the layout run. It is what determinism replays
against (§6), what a regenerated document is compared to, and what any
future incremental work would diff. The Layout Snapshot is derived
state, never authored: it can always be rebuilt from the
ResolvedPublication + fonts + engine version, and it never feeds
anything upstream.

◆ ABSTRACTIONS THAT EXIST BEFORE ANY PDF LIBRARY IS CHOSEN: the Box
(§1), the Measurement port (§2), the PageMaster (§4), the PagedArtifact
(§0), the Layout Snapshot (§2), and the Backend port (§5). All six are typed, unit-proven, and
library-free. The first PDF library arrives in PR-4 as an adapter
behind the Backend port, and could be replaced without touching a
single upstream stage — that replaceability is the abstraction's test.

## 3. Pagination Law

◆ WHERE PAGINATION BEGINS. Pagination begins at the box tree and
nowhere earlier. The web never paginates; the composer never
paginates; masters supply geometry but make no break decisions. One
stage owns breaks, so break behavior has exactly one home and one
test suite.

◆ THE BREAK RULES are box attributes, consumed only by the paginator:
  · keepTogether — the box and its subtree move to the next page
    rather than split; if taller than any page body, it splits at the
    least-bad boundary and the violation is RECORDED on the artifact
    (an honest overflow note, never silent clipping).
  · keepWithNext — a break may not fall between this box and its next
    sibling (headings never end a page alone).
  · minLinesBefore / minLinesAfter a break in text boxes — widow and
    orphan control, counted in lines, defaulting to 2/2.
  · breakBefore / breakAfter: auto | avoid | always — sections may
    demand a fresh page; nothing else may.

◆ FORWARD-ONLY, NO BACKTRACKING. Pagination proceeds forward through
the box sequence and never revisits a completed page: once a page is
closed, its contents are law. Every break rule in this constitution is
expressible with bounded lookahead (keepWithNext looks one sibling
ahead; widow control looks a fixed line count ahead); no rule may be
added that requires reopening placed pages, because global
backtracking is where pagination engines go to become unmaintainable.
A future rule that seems to need backtracking must instead be
expressed as lookahead or rejected — and that argument happens in a
constitutional amendment, not in code.

◆ SPLITTING. Text boxes split between lines, honoring widow/orphan
minimums. Group boxes split between children unless keepTogether.
IMAGES ARE ATOMIC: an image never splits; an image taller than the
printable body scales down to fit, preserving aspect, and the scaling
is recorded in provenance — never silently cropped. Rules and spacers
never begin a page.

◆ CONTINUATION. When a box's subtree splits across pages, the
paginator emits CONTINUATION MARKERS at the cut — carrying the box's
provenance tag — so PR-6 can render "continued…" and "continued from
previous page" without the paginator knowing what words are. The
marker is a pagination fact; the wording is proof furniture.

## 4. Page Masters — the v240 reservation, fulfilled

v240 named page-master regions and reserved them for this phase. The
reservation is now honored, not violated: page numbers and repeating
furniture were gated on REAL pagination, and PR-1/PR-2 build real
pagination. §6.7's sentence retires with its condition met.

◆ THE MASTERS. Three named masters — FIRST, INTERIOR, LAST — plus the
degenerate case (a one-page document uses FIRST with LAST's closure
furniture; the constitution prefers naming this to discovering it).
Each master declares: page size, margins, PRINTABLE AREA (the body
extent pagination fills), a running-header region, a running-footer
region, and decorations (page numbers, print watermark). Masters are
GEOMETRY AND FURNITURE ONLY — they contain no break logic and no
content of their own.

◆ FURNITURE vs CONTENT — the ruling that keeps v240 intact. The
continuous regions (company header, contact, footer line, signature,
terms) are CONTENT: they enter the box tree through the composer,
flow once, and paginate like everything else — exactly as they render
on the web. Running headers and footers are FURNITURE: they repeat
per page, live on masters, and never enter the flow. The two may
DERIVE from the same company facts (a running footer typically shows
the trade name the §1 identity already resolved), but they are
separate switches on separate objects: disabling the content footer
never touches the running footer, and vice versa. FIRST typically
suppresses the running header, because the content company header
already opens the paper — a master decision, declared, not inferred.

◆ DERIVED RULING (adopted at PR-3, from the forward-only law): LAST IS
A FURNITURE DISTINCTION, NEVER A GEOMETRY ONE. Forward-only pagination
cannot know which page is last until it has finished, so last's size,
margins, and printable extent are DEFINED equal to interior's — the
constructor enforces this even against a caller who disagrees. FIRST
may differ in geometry, because page one is known before placement
begins.

◆ PAGE NUMBERS are master decorations, never boxes in the flow.
"Page N of M" requires M, so numbering is a post-pass over the
completed page sequence — trivially cheap, constitutionally
important: nothing inside pagination may depend on the final count.

## 5. Backends

◆ THE PORT. A backend receives the PagedArtifact — placed boxes with
resolved styles inside declared geometry — and produces bytes. It
makes no layout decisions, measures nothing, breaks nothing. PDF is
the first adapter. HTML-print and DOCX are future adapters that
change NOTHING upstream; if adding one requires touching the
composer or paginator, the port has failed and the phase reopens.
No PDF library is named in this constitution; the library is an
implementation detail chosen at PR-4 and replaceable thereafter.

## 6. Determinism & Artifact Provenance

Same snapshot + same fonts + same engine version → byte-identical
page geometry. Determinism is a bar claim, not an aspiration: the
pagination suite replays a serialized box tree and asserts identical
break decisions. Every artifact carries provenance — engine version,
generated-at, and the fingerprint of its source (the presentation
snapshot's stamp for sent documents) — so a regenerated PDF can say
honestly whether it could differ from the one sent last month.
Sent/approved documents render from their snapshot, never live state:
the v231/v239 freezing law extends to pages without amendment.

## Reserved (named now so nothing contradicts them)

◆ BLEED, CROP MARKS, AND COMMERCIAL PRESS GEOMETRY — the printable-
area model leaves room for bleed insets; press furniture arrives only
if commercial printing ever matters. ◆ IMPOSITION (booklets, n-up).
◆ INTERACTIVE PDF (forms, signature fields) — the signature REGION
stays content; a signable field is a different object. ◆ A TOC EDITOR
— PR-6 renders a TOC from provenance; authoring TOC structure is
Publication Blueprint territory and stays reserved with it.
◆ INCREMENTAL PAGINATION — one changed paragraph on page 2 of a
seventy-page proposal need not recompute the whole document; the
Layout Snapshot (§2) is the natural diff substrate and the
forward-only law (§3) is what makes resumption from a stable prefix
coherent. Reserved by name so nothing built now assumes pagination
must always be global — and NOT built now, because a correct global
paginator is the prerequisite for a correct incremental one.

---

## Slice map (proposed)

Your PR-1–PR-5 sketch is adopted with one amendment, offered with its
justification: the pagination engine cannot be proven before the tree
it paginates exists, and welding box model + composer + paginator into
one slice would make PR-1's bar unhonest — three proven cores under a
single claim. The map therefore splits your PR-1 into two slices and
renumbers; the sequence is otherwise yours.

  PR-1  ✓ SHIPPED (v245) — LAYOUT BOXES & COMPOSITION — the box kinds (closed set), break
        attributes, provenance tags, lossless JSON serialization; the
        Measurement port with the fixture measurer; the COMPOSER:
        ResolvedPublication → box tree, with the semantic wall proven
        (no publication vocabulary downstream — grep-claim) and
        default break policy attached (headings keepWithNext;
        signature group keepTogether; terms keepTogether). Nothing
        visual. The bar is entirely unit claims.

  PR-2  ✓ SHIPPED (v246) — PAGINATION ENGINE — the hard problem, pure: printable-extent
        filling, keepTogether/keepWithNext, widow/orphan minimums,
        group and text splitting, atomic images with scale-to-fit,
        continuation markers, honest-overflow recording, determinism
        replay. Proven on synthetic trees AND on real composed
        fixtures under the fixture measurer. Still nothing visual.

  PR-3  ✓ SHIPPED (v247) — PAGE MASTERS — FIRST/INTERIOR/LAST declared; printable areas
        drive PR-2's extents; running header/footer furniture derived
        from company facts; page-number decorations as a post-pass;
        the furniture-vs-content wall proven (toggling one never
        moves the other). The v240 reservation formally retired.

  PR-4  ✓ SHIPPED (v248) — PRINT RENDERER — the Backend port and the first PDF adapter;
        real font metrics behind the Measurement port (the v232
        fontsource set); artifact provenance stamped; the download
        verb on sent/approved versions rendering FROM THE SNAPSHOT.
        Mostly plumbing, because the hard work already happened —
        exactly as your sketch says.

  PR-5  ✓ SHIPPED (v249) — PRINT TYPOGRAPHY — the POLICY layer refined against real
        proposals: station titles keep their first item; signatures
        and terms never orphan; photo placement and scaling rules;
        margin tuning. This slice edits composer policy and box
        attributes only — if it needs to touch the paginator, the
        rules were modeled wrong and the slice stops to say so.

  PR-6  ✓ SHIPPED (v250) — PRINT PROOF — page numbers rendered ("Page N of M"),
        continued/continued-from wording over PR-2's markers,
        bookmarks and a rendered TOC from provenance tags,
        cross-references. Only now do page numbers appear on paper,
        with their reservation's condition fully met.

◆ THE PUBLICATION RENDERER PHASE IS COMPLETE (v245–v250, PR-1 through
PR-6 all shipped). The pipeline stands as constituted: ResolvedPublication
→ composition → measurement → pagination → masters → proof → backend →
bytes, with the semantic wall grep-enforced in every downstream module,
one metrics source by construction, forward-only pagination with
chain-respecting bounded lookahead, and every reservation either
honored (page numbers), formally retired (v240), or still standing
(bleed/crop, imposition, interactive PDF, TOC editor, incremental
pagination).

Standing gates unchanged: every slice keeps the full verification bar;
the web paper is untouched in every slice; build against the real
asset corpus (the seeded identity, real templates, realistic
proposals) from PR-3 onward, because masters and typography are only
provable against real material.
