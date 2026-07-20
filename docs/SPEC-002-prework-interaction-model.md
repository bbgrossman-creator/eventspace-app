# SPEC-002 PRE-WORK II — The Configuration Interaction Model

*EventCore · design document · no implementation · builds on the seven kinds (Pre-work I) and UI_GRAMMAR*

The brief: a caterer drags Sushi Station from the Library onto the proposal. Design what happens next — for how experienced caterers actually build events, not how developers think about forms.

---

## 0. The operator this is designed for

Two moments, one person. **Moment one:** on the phone with the client, needs Sushi Station on the proposal in ten seconds, looking complete and plausibly priced, because the conversation is moving. **Moment two:** Thursday, twenty minutes blocked out, making this station exactly what the Goldbergs are buying. A configuration model that serves only moment two is a wizard; one that serves only moment one is a toy. The design principle that reconciles them:

**Landed is legitimate.** The instant the drop completes, the instance is a *complete, valid, quotable configuration* — the family's seeded defaults. Configuration is refinement, never a prerequisite. There is no wizard, no required step, no "finish setting up." An operator who never opens the configuration has a real Sushi Station, because most stations at most events *are* the house standard. The interface is therefore organized around **divergence, not completeness**: the operator's work is the handful of ways this event differs from normal, and the interface's job is to make those differences fast to make, easy to see, and trivial to undo.

## 1. The sixty seconds after the drop

Narrated, because the walkthrough is the design:

The card lands (landing pulse, per UI_GRAMMAR). The instance appears on the Stage as a full component — name, seeded menu items, description — indistinguishable from one built by hand, and it is selected. The Inspector, which already answers "is this right?" for any selection, now shows the **Configure facet** at the top. It is not a form. It is a *summary the operator can read in five seconds:*

> **Sushi Station** — from *Sushi Station* (definition) · no changes
> **Look** — Black Slate (house default)
> **Menu** — 8 rolls, 3 sauces · *on the canvas*
> **Size** — serves 180 of 180 guests · 240 pieces *(suggested)*
> **Service** — attended, replenished · 1 attendant
> **Setup** — 14 props, 2 equipment *(from Black Slate)*
> **Requires** — 6 *(kitchen 3 · warehouse 2 · floor 1)*
> **Notes** — none

Every line is closed. Every line opens with one click into its editor and closes back to a sentence. The operator on the phone reads the summary, says "yes, our sushi station, per person," and moves on — total interaction: zero clicks. That is a designed outcome, not a degenerate case.

On Thursday, the same operator opens **Look**, taps the Acrylic scheme card, reads the staged change — *"Acrylic & Mirror sets: 6 acrylic risers, mirror bases, white linen, glass soy dishes — replaces 9 Black Slate pieces"* — and confirms. Opens **Menu** via the canvas, drags Dragon Roll in from the Library rail, deletes ginger (the Goldbergs). Opens **Size**, changes pieces to 300; the suggestion stays visible beneath. Opens **Service**, switches to *live chef*; the **Requires** count ticks 6 → 9 with a brief quiet flash. Types one line into Kitchen notes: *"Uncle is a sushi chef — expect commentary."* The header now reads **"7 changes from definition."** Done in four minutes, and every one of those seven changes is individually visible and individually reversible.

## 2. Where configuration lives — and why

**The Stage shows what the guest experiences. The Inspector shows what it takes.** This is the existing field rule extended one sentence: a salesperson screen-shares the Stage, so the Stage carries the customer-visible composition — the name as displayed, the rolls, the description, the media. The Inspector carries the operator's machinery — schemes, quantities, staffing, props, consequences, constraints, notes.

One deliberate consequence: **menu selections are not duplicated into the Configure facet.** Selections already live on the Stage as items — that is the selections axis of the seven kinds, and it already has a mature editor (the canvas itself, with the drag grammar). The facet's Menu line is a *summary and a doorway* ("8 rolls · on the canvas"), never a second editor. Two places to edit which rolls exist is the interface version of duplicated truth, and it is refused here, at the design layer, before any schema can enshrine it.

Lens behavior: the Configure facet exists in the Design lens. The Customer lens shows none of it. The Production lens (SPEC-003) will *read* what configuration produces — the Requires section is, quite literally, the preview of what Kitchen will see.

## 3. Schemes — preset, then own

The **Look** row opens to scheme cards — small, visual, cover-imaged (the covers hierarchy already built for the Library serves here): *Black Slate · Acrylic & Mirror · Wooden Boats · Custom.* Schemes are the fourth kind: bundles that set many dimensions at once.

- **Applying is staged, never silent.** Choosing a card shows what will change, in business language, before anything changes: which props arrive, which leave, what linen, what vessels. Confirm applies. (Never-silently-merge, applied to presets.)
- **Then the grip releases.** Every scheme-set value carries a quiet scheme tag. Edit any one — swap the chopstick stands — and its tag flips to *customized*. The Look row then reads "Acrylic & Mirror · 2 customized." The scheme is a starting point that remembers it was one, not a mode the operator is trapped in. This is instantiate-then-own at the dimension level — the same verb the whole platform runs on.
- **Re-applying a scheme** is the scheme-level reset, staged the same way, explicitly listing the customizations it would undo.

## 4. Numbers show their work

Every derived value renders as: the **effective number, editable, large** — and beneath it, quiet: *"Suggested: 240 (180 guests × 8 per person)."* Override the number and the derivation stays: *"You set 300 · suggested 240."* One tap returns to the suggestion.

When an input changes later — the guest count moves to 210 — **overridden values never move on their own** (the UI never surprises; the operator's judgment is not the system's to revise). The suggestion beneath updates — *"suggestion now 280"* — with a quiet marker on the Size row, and the operator decides. Non-overridden values follow their derivations silently, because following the formula *is* what the operator chose for them.

This is the constrained vocabulary applied to numbers: the system states its arithmetic and its sources; it never insists.

## 5. Consequences whisper

The **Requires** row is where the fifth kind surfaces: requirements computed from choices. Its rules of conduct:

- **Collapsed to a count, grouped by layer** ("Requires — 9 · kitchen 5, warehouse 3, floor 1"). Consequences are mostly *for other people* — the kitchen, the warehouse — so they do not interrupt the person making choices.
- **Changes whisper.** Switching to live chef makes the count tick upward with a brief "+3" flash. No dialog, no confirmation, no red. The operator who cares opens the row; the operator who doesn't isn't slowed by information addressed to someone else.
- **Open, each consequence names its cause**: *"Handwash station — from live-chef service."* Auto entries are tagged derived; the operator can add manual ones and can suppress an auto one (it strikes through rather than vanishing — a suppressed requirement is a decision worth seeing, and Kitchen deserves to know it was considered and declined).
- **Consequences never gate choices.** They are the cost of a choice made visible, not a permission system.

## 6. Constraints advise, with their sources named

Constraints — the sixth kind — arrive from *other objects*: the venue's power and footprint, the event's date, the client's kashrut standard, the allergy list. Their conduct differs from the Studio's DropBands deliberately: a drop target that's illegal shouldn't render, but a catalog option that *conflicts* must remain visible — because an experienced operator can often resolve the conflict (call the venue, adjust the hold plan), and a hidden option is indistinguishable from one that doesn't exist.

So constrained options render **marked, not hidden**, each with its constraint and its source: *"Refrigerated display — needs a power drop · The Rockleigh: 1 available, east wall"* · *"Outdoor placement — 90-minute hold limit · from venue + June date."* Kashrut runs through the same mechanism with full dignity: *"This supplier — not under ✕ certification · from client's kashrut standard"* — first-class, named, linked to the object that imposed it. Only genuine impossibility refuses, and it is rare. Everything else is the interface doing what a good banquet manager does: flagging the problem and trusting the operator.

## 7. Annotations are a different material

Each layer section ends with its **Notes** field, and notes are visually a different substance — a left-ruled, slightly textured block that cannot be mistaken for structured rows. They never interleave with configuration. This protects both directions: structure stays queryable and projectable (Kitchen's sheet can trust its fields), and the escape hatch stays honest — "the uncle is a sushi chef" goes where prose goes, not smuggled into a quantity field. Per layer, because the note about plating belongs to Kitchen and the note about the loading dock belongs to Operations.

## 8. Divergence is the operator's map

The header chip — **"7 changes from definition"** — expands to the diff, in business past tense: *Added Dragon Roll · Removed pickled ginger · Look: Black Slate → Acrylic & Mirror · Pieces: 240 → 300 · Service: attended → live chef · Staffing: 1 → 2 · Kitchen note added.* Every diverged row also carries its own quiet marker inline, with *"reset — was: attended"* one click away.

This is not bookkeeping. Divergence is where the operator's expertise lives — it's the record of every judgment call this event required — and it is exactly what SPEC-004's Promote ceremony will read: *these seven changes made the Goldberg station; which of them should become how we do it?* The diff view designed here is the promotion review screen arriving early.

**Reset,** two grains: per-dimension (the inline "was:" affordance — instant, low-stakes) and whole-instance ("Reset to definition"), which is destructive-adjacent and therefore gets a real decision point per UI_GRAMMAR §11: the confirmation *is* the diff list, stating explicitly that ad-hoc additions (Dragon Roll) will be removed, not just settings restored. Nothing resets silently; nothing resets partially without saying which part.

## 9. Operating principles (the distillation)

1. **Landed is legitimate.** Seeded defaults are a complete configuration; every editor is optional at every depth.
2. **Configure by exception.** The interface is organized around divergence from the family's normal, not around filling in a model.
3. **The Stage shows what the guest experiences; the Inspector shows what it takes.** Selections live on the canvas, once.
4. **Presets release their grip.** Scheme-then-own; every preset value individually reclaimable, every re-apply staged.
5. **Numbers show their work.** Derived until overridden; overrides never silently revised; suggestions keep updating beneath.
6. **Consequences whisper; constraints advise; only impossibility refuses.** Causes and sources always named.
7. **Notes are a different material** — per layer, never interleaved with structure.
8. **Divergence is always visible, reversible, and speaks business language** — because today's divergence is tomorrow's promotion.

---

*Approval of this interaction model is the gate for SPEC-002 proper, which will specify the data structures this model requires — the UX defining the schema, not the reverse.*
