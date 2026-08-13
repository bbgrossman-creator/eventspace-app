# Amendment Five to the EventCore Constitutional Framework

**Adopted 12 August 2026. Amendments One, Two, Three and Four stand unaltered.**

This amendment banks a rule that had been operating as an unwritten expectation: that
consolidating authority behind a surface does not entitle a release to remove what the
surface gave the user. It was stated as an owner ruling during the v308 design pass, when
the v308/v309/v310 sequence was found to contain two candidate removals of user-visible
behaviour that no release note had ever declared as removals.

Adopted under the cumulative rule settled by owner ruling A5: RFC-form amendment is the
**vehicle**, owner ratification is the **authorization**, and neither substitutes for the
other. The authorization recorded here was given as an owner/architect ruling on
12 August 2026, in the ruling set that also approved the v308 Class-U mechanism and the
five-item v308 change contract. This amendment is the vehicle that authorization lacked.

Nothing in Amendments One through Four is altered. This amendment adds one rule and one
governed inventory.

---

## The ruling this amendment integrates

**Owner ruling, 12 August 2026, verbatim in the operative part:**

> **Legacy Preservation Law**
>
> Backend-path retirement is not feature retirement.
>
> A refactor, authority consolidation, projection replacement, or removal of a duplicate
> internal derivation may not silently remove a useful user-visible capability, workflow,
> information surface, interaction, return contract, or integration contract.
>
> Every affected legacy behavior must be explicitly classified:
>
> PRESERVE · CHANGE · ADD · RETIRE
>
> RETIRE requires explicit owner approval.
>
> When an obsolete backend surface can instead become a projection/adapter over canonical
> truth without preserving competing business logic, prefer projection over feature removal.

---

## Article A · The Legacy Preservation Law

The ruling above is adopted verbatim as a binding constitutional rule.

### A.1 · What it governs

The law governs any release that changes where truth is derived rather than what the user
may do. That includes authority consolidation (a new canonical predicate absorbing several
older ones), projection replacement (a stored or separately-derived surface becoming a view
over canonical truth), duplicate-derivation removal, and the retirement of a legacy backend
path in favour of a successor.

It does not govern the correction of a defect. A release that removes an *invented*
condition — one the preview enforced but the ceremony never did — is not removing a
capability; it is restoring one. Such a correction is classified **CHANGE**, and the
direction of the correction is declared.

### A.2 · The four dispositions

Every legacy behaviour a release touches carries exactly one disposition, declared before
implementation and proven after it.

**PRESERVE** — the behaviour survives unchanged in what the user observes. Its derivation
may move freely; its observable form may not.

**CHANGE** — the behaviour survives in a declared, different form. The release states the
before and the after, and which direction the change moves in.

**ADD** — the release introduces an observable behaviour that did not exist. New states,
codes, fields and surfaces are additions and are declared as such, because a consumer that
does not yet know them must be able to find out that they arrived.

**RETIRE** — the behaviour is removed. **RETIRE requires explicit owner approval, recorded
by name, before implementation.** No release may take a RETIRE disposition on its own
authority, and no RETIRE may be inferred from the absence of an objection.

### A.3 · Projection is preferred to removal

Where an obsolete backend surface can become a projection or adapter over canonical truth
without carrying competing business logic forward, that route is preferred to removing the
feature. The purpose of consolidation is to end the duplication of *law*, not to end the
availability of *information*.

The test is whether the legacy surface, reduced to a projection, would restate any rule the
canonical authority already owns. If it would not, the projection is the correct outcome and
removal must be justified rather than assumed. If it would, the duplication is the defect
and the surface is a genuine RETIRE candidate requiring approval under A.2.

### A.4 · Silence is not consent

A capability that no release note mentions has not been retired. A capability whose only
consumer is a test has not been retired. A capability that is difficult to carry forward has
not thereby become retirable. In each case the disposition is unrecorded, and an unrecorded
disposition is a defect in the release, not a licence.

### A.5 · Prospective application

This law applies prospectively to v308, v309, v310 and the new-UI program. It is not applied
retroactively to close releases already certified, whose dispositions were not recorded in
this form. Where an earlier release is reopened for any other reason, its dispositions are
recorded then.

---

## Article B · The initial governed inventory

The fourteen-item legacy inventory produced by the v308 design pass is adopted as the
initial governed inventory under Article A. It is recorded here by reference rather than
transcribed, so that one inventory exists rather than two that can drift: the authoritative
text is the v308 design pass report, and each subsequent release amends the inventory rather
than restating it.

The inventory's standing dispositions at adoption:

| Scope | Items | Standing disposition |
|---|---|---|
| v308 | 1–9 | CHANGE, ADD or PRESERVE. **No RETIRE.** |
| v309 | 10–13 | Item 10 ruled **not retired** — see Article C. Items 11–13 CHANGE or PRESERVE |
| v310 | 14 | RETIRE **not approved**; carried forward as a compatibility item — see Article D |

Items 1–5 of the v308 scope are the five declared behavioural corrections; each is a
movement of the preview toward a stationary ceremony, and each is classified CHANGE with its
direction declared. Item 6 is the preservation of the legacy six-code reason vocabulary and
is classified PRESERVE. Item 7 is the new `unavailable_pending_argument` state and is
classified ADD. Item 9 records that the closed-event restrictions on `assign_staff` and
`correct_staffing_assignment` are legitimate declared rungs and are classified PRESERVE —
the correction at item 1 applies to `release_staffing_assignment` alone.

---

## Article C · `event_workspace.next_actions` — preservation ruled

The v309 forecast offered a choice: `event_workspace.next_actions` becomes a projection of
`action_evaluate`, **or is removed** in favour of the existing `actions` key.

**Owner ruling, 12 August 2026: the user capability is not retired.** When v309 opens, the
legacy surface is to be converted into a projection or adapter over canonical availability
truth where technically appropriate, rather than deleted.

This is Article A.3 applied to its first case. The duplication that v309 exists to end is
the duplication of *derivation*; `next_actions` reduced to a projection restates no rule the
availability authority does not already own, and so it survives as a projection.

This ruling does not authorize v309 implementation.

---

## Article D · The `.stage` success-payload key — carried forward

`start_service` and `close_event` both return `jsonb_build_object('event_id', …, 'stage',
public.event_stage(p_event))`. Retiring `event_stage` at v310 therefore changes an
externally observable ceremony return payload, which is why the v306 frozen design recorded
that v310 cannot be described as internal cleanup.

**Owner ruling, 12 August 2026: retirement of the `.stage` key is not approved.** It is
carried forward as an explicit compatibility item for the v310 charter. v310 must present a
concrete compatibility and migration proposal before any RETIRE ruling is sought, and no
release before v310 may deepen dependence on that field.

---

## What this amendment does not do

It does not alter Amendment Four Article C, which remains the governing constraint on the
Class-U version boundary. It does not alter the C1 instrument. It does not change any
frozen v306, v307a or v307b semantic. It creates no new evaluator, surface or authority.

It records a rule that was already being obeyed, so that the next release cannot be the
first to disobey it by accident.
