# PUBLISHING ASSETS — the phase constitution (draft for adoption)

Status: ADOPTED (final review complete; rulings marked ◆). Constitution
frozen — implementation begins at v238. Copy into docs/ at v238. Extends docs/PUBLICATION.md;
contradicts nothing in it. Governing insight: knowledge isn't just menu
content; it is also the accumulated knowledge of how the company presents
itself successfully. Presentation joins Knowledge as a first-class asset.

## The sentence the phase serves

PRESENTATION ASSETS ARE ORGANIZATIONAL KNOWLEDGE. THEY ARE AUTHORED ONCE,
REUSED MANY TIMES, MEASURED HONESTLY, AND NEVER INFERRED FROM HISTORICAL
COINCIDENCE.

## 0. The Portability Ruling (load-bearing)

A presentation is TWO strata:

PORTABLE — transfers across proposals, savable as a Template:
  · theme key & the document-level delta (fonts, palette, paper, margins)
  · document treatments (title, measure, spacing, divider, background, photo)
  · regions (cover, watermark, footer, signature, terms — style/visibility)
  · SECTION treatments & section photo pins — bound by SEMANTIC SECTION
    ROLE (tenant-global type today; a stable role key when types prove too
    broad). ◆ APPLICATION NEVER GUESSES AMONG MULTIPLE MATCHES:
      no matching section  → the dress waits silently (empty-is-information)
      exactly one match    → applies automatically
      multiple matches     → a MAPPING DECISION surfaces in preview; one
                             dress goes to all matches only by explicit
                             user choice, never by default.

BOUND — ◆ non-transferable BY DEFAULT, not metaphysically impossible:
  · component & item treatments, component photo pins. Bound presentation
    NEVER travels through presentation-only verbs (Apply From…, templates).
    It MAY travel only when an underlying content-copy operation supplies
    an explicit source→destination identity map — duplicate version, full
    proposal copy, blueprint instantiation already know which new
    component came from which old one, and may carry its dress faithfully.

`portablePresentation(version)` extracts the first stratum; every
presentation-only verb operates on it exclusively.

◆ REPLACEMENT SEMANTICS: template/Apply-From application replaces the
ENTIRE portable override namespace with the source's portable namespace.
Omission of a leaf means NO version override — i.e. inheritance from
brand/theme — never preservation of the destination's old portable value.
Explicit None/Off replaces with None/Off. The confirm states it plainly:
"This will replace this version's document, region, and section-level
presentation. Component and item-list styling will remain." The
operation is therefore reconstructable.

## 1. Company Identity (PA-1)

The Brand rung grows from "look + words" into the company's PERMANENT
PUBLISHING IDENTITY, all riding app_settings (no migration for facts):

  identity   · legal name, trade name, address, phone, website, email
  commerce   · tax id, payment terms, bank/ACH instructions
  legal      · terms & conditions, disclaimers, licensing/supervision
               (KCL line lives here), signature default
  assets     · logo (photo_library, tagged brand — bucket upload later)
  socials    · handles list

◆ PUBLICATION ELIGIBILITY: the Brand owns company TRUTH; publication
POLICY governs which truths may enter a customer document. Every fact
declares: value · eligibility (customer-facing / customer-facing-but-
sensitive / restricted) · default region · default visibility. Tax ID is
restricted (never included unless explicitly enabled); ACH is sensitive
(payment region, hidden by default); trade name is header, visible.
◆ The snapshot freezes only the brand facts actually RESOLVED into that
publication — never the company's whole identity record.

◆ REQUIRED vs AVAILABLE REGIONS: brand-required regions are ON for every
new publication (company header · company footer · contact · standard
terms); brand-choice (signature, cover, payment per policy); off by
default (watermark). A version may disable any required region only by
explicit exception. New proposals are therefore complete automatically.

Renderer gains the COMPANY HEADER region (§2): logo + trade name +
contact block above the document, brand-owned, region-toggled, frozen
into the snapshot at send like all region words (v231 law extends).
Brand Studio gains grouped panels for all of it; Save brand remains the
one commit; sent documents never rewrite (already law).

## 2. Page Structure (PA-2)

Regions graduate from "five slots" to the PAGE'S ANATOMY:

  Header region      — company identity block (new, PA-1's renderer slot)
  Body               — the document (exists: everything v226–v235 built)
  Footer region      — exists (v231)
  Page decorations   — watermark (exists) · page numbers (STILL gated on
                       real pagination; §6.7's sentence stands)
  Sidebar            — reserved; named so nothing built now contradicts it

Each region: visibility · treatment · inheritance · override — the ladder
already does all four; PA-2 is renderer slots + Rooms, not new physics.
◆ CONTINUOUS vs PAGE-MASTER: a web header/footer is a continuous-scroll
region; repeating per-page headers/footers/page-numbers are PAGE-MASTER
regions, reserved for the PDF slice and named separately so the two are
never conflated.

## 3. Publication Templates (PA-3)

◆ THEME vs TEMPLATE — declared, not blurred. A THEME is design
vocabulary (fonts · palette · paper · base spacing). A TEMPLATE is a
composed reusable arrangement (theme + document treatments + regions +
section-role dress + section pins). One table may hold both, but the
domain declares `asset_kind = theme | template`, because Apply Theme and
Apply Template have different replacement scopes and must never confuse.

A Template is a NAMED PORTABLE PRESENTATION (add: description, tags,
cover thumbnail ref, asset_kind). Verbs:

  · "Save current presentation as template…" — captures the portable
    stratum of the open version, names it. (BrandKit's "Save as theme…"
    was the seed; it graduates.)
  · Template application at creation (exists since v227) and mid-flight
    (Appearance room — exists; gains preview-before-apply).
  · Applying a template REPLACES the portable stratum of the override and
    keeps bound dress — stated in the confirm.

## 4. Apply Presentation From… (PA-4)

In the Appearance room: Apply From… → search versions (the Library's
summon machinery, kind=version) → PREVIEW (resolve the source's portable
stratum against THIS document on the Second Sheet — the compare axis
finally earns its keep) → Apply (render state; Save look commits — the
ceremony is untouched). Copy Content already exists (blueprints, v216);
this is its presentation twin, and the two are never one button.

## 5. Presentation Knowledge (PA-5)

Library registry (v215) gains kinds: templates · themes · brand assets ·
photography. Template cards carry PROOF, computed (never stored opinions):

  used N proposals · sent M · accepted K · acceptance K/M · avg accepted $

◆ PROVENANCE, NOT RECONSTRUCTION: template performance is attributed
from provenance RECORDED AT APPLICATION TIME — template_id · revision
fingerprint · applied_at · application mode · subsequent portable
divergence — never inferred from the current theme_key (which post-edit
proposals falsify in both directions). Proof distinguishes: applied and
sent unchanged · lightly modified · heavily modified · merely started
from. Metrics shown honestly: Used · Sent · Accepted · Acceptance rate ·
Average accepted value · Modified after application. NOTHING is labeled
"best performing" until sample size and divergence are accounted for.
Templates aren't just reusable; they're proven — carefully.

## Reserved assets (named now so nothing contradicts them)

◆ PUBLICATION BLUEPRINT — the asset AFTER templates. A template carries
presentation; a Publication Blueprint carries EDITORIAL STRUCTURE: the
narrative arc of the proposal itself (Cover → Welcome → Cocktail Hour →
Dinner → … → Investment → Terms → Signature). Distinct from the Event
Blueprint (which carries menu content) and from templates (which carry
dress). It is a STRUCTURE asset — it lives on the content side of §0.2's
wall, and its interaction with archetypes (v221) is the design question
its slice must answer first. Not built now; reserved by name.

◆ COMMUNICATION IDENTITY — Company Identity eventually owns VOICE:
greeting, closing, thank-you, signature wording, welcome and closing
paragraphs. Editorial, not legal; the eligibility model of §1 already
fits them. Reserved, not added.

◆ THE VERB IS "COMPARE PRESENTATION…" — adopted in place of "Apply
From…". The mechanism was already a compare engine (Second Sheet ·
preview · mapping · differences); the verb now says so. Users compare
before replacing; Apply is the compare view's closing act, not the
door's name. PA-4 renamed accordingly.

## Slice map (amended)

  v238        INSPECTOR UNIFICATION (queued first — the standing critique):
              one visual language: the SELECTION color becomes the shared
              accent — the selected object gains a left accent bar, warm
              wash, and a small transition; the wing's seam and subject
              tick INHERIT that same color so the pair reads as one
              thought. The predates-configuration notice collapses unless
              actionable. Commercial group (Price · History ·
              Requirements) so price stops reading as a second
              application. Values turn conversational (label over value,
              no property-grid dashes). ◆ LENS-AWARE FACETS: the
              inspector's facet ORDER comes from the lens declaration
              (capabilities registry, never kind-checks) — Presentation
              foregrounds Presentation/Photography/Typography/Price
              display; an operations lens will foreground Requirements/
              Equipment/Timing/Staff when it ships.
  PA-1  v239  ✓ SHIPPED — Company Identity & Publication Policy (structured facts,
              eligibility, required/default regions, snapshot projection,
              sensitive-value handling)
  PA-2  v240  ✓ SHIPPED — Page Anatomy (continuous regions; page-master reserved)
  PA-3  v241  ✓ SHIPPED — Portable Presentation & Templates (engine proven:
              match law, omission semantics, asset kind, provenance;
              capture verb live; application UI rides v242's compare)
  PA-4  v242  ✓ SHIPPED — Compare Presentation… (the five exposures live;
              Apply gated on decisions; provenance recorded midflight)
  PA-5  v243  ✓ SHIPPED — Presentation Knowledge (four kinds registered;
              proof computed, provenance-only, nothing ranks)

  ── THE PUBLISHING ASSETS PHASE IS COMPLETE (v238–v243, all shipped). ──
  Reserved and untouched, as adopted: PDF renderer · pagination · page
  masters · page numbers · logo/photo bucket uploads · Publication
  Blueprint · Communication Identity.

Standing gates unchanged: page numbers await pagination; logo/photo
uploads await buckets; every slice keeps the full verification bar.
