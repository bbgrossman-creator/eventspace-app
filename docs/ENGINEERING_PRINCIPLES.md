# ENGINEERING PRINCIPLES

*EventCore · v1.0 · February 2026 · frozen; changes by RFC amendment only*

Implementation philosophy, distinct from product philosophy. Every principle here was earned — each one has a scar behind it. New principles are added the same way: when friction during building proves a rule, it is amended in here with its reason. Nothing enters this document speculatively.

---

**State is derived whenever possible.** If it can be computed from the graph, compute it. Stored derivations drift; derived state cannot lie.

**Render decisions are never persisted.** Focus-mode collapse, flight spacers, armed guides, expanded panes — presentation state lives and dies with the interaction. If "restore previous state" ever needs code, the design is wrong. *(Earned: the drag collapse needed no restore logic, which is how we knew it was right.)*

**No duplicated sources of truth.** Before building a cache, a loader, an interface, or a store — search for the existing one. *(Earned twice in one rebuild: a duplicated price-memory cache and duplicated interfaces, both caught mid-implementation.)*

**The browser is the source of truth for interaction claims.** jsdom, TypeScript, grep, and handler counts cannot prove a gesture works. A green harness on the wrong question is worse than no harness. Interaction features ship with real-Chromium acceptance tests using real input — and a regression variant that proves the tests can still detect the original bug. *(Earned: a drag that passed 30 DOM tests while no human could drag anything; a diagnostic from the real browser found it in one run.)*

**Native browser behavior beats custom implementations — until the browser is proven wrong.** Prefer the platform; replace it only on real-browser evidence, not frustration. *(Earned: native HTML5 drag was one deferred setState away from working; rewriting it would have replaced a one-line bug with a subsystem.)*

**Layout is stable under interaction.** Nothing may shift geometry while a gesture is in flight. A target that moves when approached is a moving target. *(Earned: growing drop bands caused three distinct measured failures.)* Mounted-ness is part of stability: **the drag source node must remain in the DOM for the whole flight** — Chromium delivers `dragend` to the node captured at dragstart, so unmounting it (even re-mounting a copy) silently kills cleanup. Collapse in-flight ancestors with CSS, never by unmount. *(Earned: cancelling a cross-category item drag froze the Studio until refresh; the source list had unmounted when the destination opened.)*

**Every capability is declarative.** `can("library.promote")`, never `if (plan === "Professional")`. Tiers are data. Enforcement is layered: the UI hides, the API refuses — a hidden button is not a security boundary.

**Grammar grows by declaration, never exception.** New kinds register projections, renderers, payloads, and legal destinations. If adding a knowledge type requires editing the Library — or adding a feature requires an exception to the interaction matrix — the abstraction has failed and the failure is fixed first.

**Provenance is never discarded.** Every copy, instantiation, promotion, and migration carries its stamps. Deleting lineage to simplify a migration is forbidden; lineage *is* the product.

**Tenant isolation is proven, not assumed.** Every new table, index, and search surface adds rows to the verify matrix. A cross-tenant leak through a secondary surface (search, projections, caches) is still a leak.

**Verification is unconditional on touched files.** Brace balance, SWC parse gate, full `tsc` read — and the full unfiltered output gets read, not grepped for expected codes. Known harness noise is documented by code and file; anything else is a stop.

**Verify against the project's own build config, never a fabricated one.** A hand-rolled tsconfig, bundler alias, or lint profile answers a question the deployed build never asked. If the real config isn't available in the environment, verify against the *strictest plausible* one and say so — a green check under invented settings is not evidence. *(Earned: a `Map` iterator spread passed a fabricated `target: es2017` check and broke the production Next.js build on the first deploy; the project's own target rejected it in one second.)*

**Fixes ship with the experiment that falsified the alternatives.** A root cause is claimed only after a controlled comparison isolates it — and the test suite must fail against the unfixed code, or the tests have no teeth. *(Earned: the isolation matrix that acquitted the drag image and convicted the synchronous setState in one run.)*
