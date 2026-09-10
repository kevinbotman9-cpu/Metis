# METIS — Agent Implementation Instructions

## Absolute Rules

These are non-negotiable. Every PR must enforce them.

1. **Never hardcode sample data in a component.** Mock data lives only in MSW handlers derived from the OpenAPI spec. If you need sample data, generate it via MSW fixtures and register the mock in the fixture store.

2. **Never call fetch directly from a component.** All data goes through `packages/client`, which is generated from the OpenAPI spec. If an endpoint is not in the spec, it does not exist.

3. **Never add an endpoint to packages/client by hand.** Add it to the OpenAPI spec and regenerate the client (`npm run generate`). Hand-edited client code is a liability.

4. **Never write a literal colour, spacing or radius value in app code.** Use CSS custom properties mapped to design tokens. If you need a new token, add it to the token system and update all theme axes.

5. **Never build a dialog, menu, combobox or tooltip from scratch.** Use Radix UI. We do not hand-build accessible components.

6. **If a capability is not in the OpenAPI spec and not BUILT in the platform, stop and ask.** Do not invent the API. Register the gap in `/docs/gaps.md` and mock it for development.

7. **Never author a status claim.** Status is emitted by tooling and lives in one
   place, `docs/CAPABILITIES.md`. Do not write a document that asserts completion,
   and do not mark anything ✅. Where a state must be named, use `BUILT` (a named
   check fails if it breaks), `ENGINE-ONLY` (works, no screen), `SCAFFOLD`
   (renders, does nothing), `ABSENT`. Every row you write cites a file path and a
   check name, or it does not go in. `tests/docs-status.test.ts` fails on a table
   row whose status cell asserts completion.

8. **Never hand-write a form.** Every entity a user can create or edit declares its
   form in the metadata registry: fields, types, validation, conditional
   visibility, permissions, help text. The renderer is generic. **Adding a field to
   an entity must require zero changes under `apps/console/app/`.** The registry is
   diffed against the OpenAPI schema for that entity; a schema property with no
   descriptor entry is a failure. A hand-built form caps extensibility permanently.
   Before building any screen, ask: *could a customer add a field to this without a
   vendor ticket?*

9. **Never trust a check you have not seen fail.** Write the assertion, break the
   thing it guards, watch it go red, restore. A check verified only by passing is a
   check whose subject you have assumed. Three tests here were found passing for
   the wrong reason — a substring locator matching the page's own heading, a
   `toHaveCount(0)` that beat the fetch, and a `toContain("2")` satisfied by any
   number starting with 2. All three were green for weeks. When you fix a defect,
   write the check that would have caught it, and prove that one bites too.

10. **Never assume a text-parsing check behaves the same on both platforms.** CI is
    Linux; the machines this is written on are Windows. `.` does not match a
    carriage return, so `$`-anchored patterns over markdown mis-parse under
    `core.autocrlf=true` — `gaps-register.test.ts` reported 36 anonymous entries and
    35 duplicate ids that did not exist: green in the only place anyone looks, red
    in every place anyone works. Normalise line endings once, where the file is
    read, not at each call site.

---

## The Unit of Work: Vertical Slices

There are no backend PRs and no frontend PRs. There are slices.

A slice is one thing a named persona can do end to end. It is not done until all
nine of these exist **in the same PR**:

| # | Artefact | Where it lives |
|---|---|---|
| 1 | Typed contract (a hand-authored spec is a bug) | `docs/metis-api.openapi.yaml` |
| 2 | Engine or service implementation | `packages/*`, `engines/*` |
| 3 | Public API endpoint | `planes/authoring` or `planes/execution` |
| 4 | Generated client method (never a hand-rolled `fetch`) | `packages/client`, via `npm run generate` |
| 5 | A route in the console the persona can reach from nav | `apps/console/app/...` |
| 6 | Form descriptor / screen configurability metadata (Rule 8) | `packages/ui-metadata/src/registry` |
| 7 | Trace contribution, if it affects a decision | `packages/ledger` |
| 8 | Deterministic test + one `@screen-only` e2e | `tests/`, `apps/console/tests/e2e` |
| 9 | Accessibility pass on the new route | `npm run test:a11y`, axe clean |

Artefact 10 was *"a docs page generated from the typed contract in `docs/api/`"*. That
directory has never existed, there is no generator and no check, so every slice this
repo has shipped was nine-tenths of a slice and none of them said so. Removed rather
than left standing: a definition of done containing an item nobody has ever met
teaches everyone to round off. Registered as a work item; the spec is readable and
`validate-spec.mjs` keeps it honest in the meantime.

If you cannot finish all nine, **make the slice smaller**. Do not ship 1–4 and
promise 5–9 later.

A capability is not built until a user can do it from the screen, alone, without
you. Backend work with no screen is not progress; it is inventory, and it is
`ENGINE-ONLY`.

---

## The Check That Matters Most

Every slice ships one Playwright test tagged `@screen-only`.

Rules for `@screen-only` tests:
- Setup uses **zero** API calls, zero DB seeding, zero fixtures beyond a logged-in
  user and a base tenant.
- Everything the test needs, it creates by clicking.
- It asserts the persona reached their outcome.

If the test needs an API call to get into position, the journey has a hole in the
UI. Fix the hole. That is the whole point of this rule — it converts "we lost focus
on usability" from a judgement call into a failing test.

---

## Definition of Done for Every PR

- [ ] Storybook story for every new component, covering all four theme axes (light/dark × compact/comfortable)
- [ ] Vitest unit tests for logic; Playwright test for any new user flow, including the `@screen-only` test above
- [ ] axe-core clean (zero WCAG 2.2 AA violations)
- [ ] Full keyboard path verified; visible focus indicators
- [ ] Loading, empty, error and permission-denied states implemented
- [ ] Strings in a message catalogue, never inline in JSX — **not currently
      possible.** This rule named `/packages/i18n/messages.json`, which never
      existed; the stub package it lived in was deleted on 2026-09-05. Every
      string is inline today. Do not add a new one-off i18n mechanism to satisfy
      this line; the gap is registered in `docs/gaps.md` and needs a decision,
      not a workaround.
- [ ] Every displayed number links to its source trace or explains why it cannot
- [ ] Route bundle size within budget (checked in CI)
- [ ] Screenshot attached to the PR description, showing the component in Storybook

---

## Build Order Within a Task

1. **Read the OpenAPI spec** for the endpoints you need. Check existing tokens.
2. **Build in Storybook first** against MSW fixtures, before wiring into a route. Forces states to be enumerated.
3. **Screenshot and self-critique** against the design direction (§5 of the Experience Layer plan) before opening the PR.
4. **Wire into the route**, add Playwright test, run axe.

Building in Storybook first is not optional. It makes output reviewable in seconds, not minutes.

---

## What to Do When the Platform Is Not Ready

The platform will lag the console. This is normal and OK.

1. Add the contract to the OpenAPI spec as a proposed operation
2. Generate the mock via MSW
3. Build the component against the mock
4. Register the gap in `/docs/gaps.md` with the operation ID and brief rationale

**Do not stub inside the component.** The mock goes in MSW, not in your code. The UI always reads from the generated client, which routes to either the real API or the mock depending on the environment.

---

## Vocabulary

**This list is normative**, in code, APIs, UI and documentation. It follows §3 of the
METIS platform specification, which is itself normative and states the principle:
*wherever an industry-standard term already exists — frequency capping, feature store,
contextual bandit, placement, holdout — METIS adopts it verbatim rather than inventing a
synonym.*

The list before 2026-09-05 was Pega's vocabulary almost verbatim: proposition, treatment,
engagement policy, contact policy, lever, decision strategy. That was renamed throughout,
including the hashed decision, which is why every chain hash in the conformance corpora
changed on that date. `tests/vocabulary.test.ts` scans source for the words the platform
was renamed away from.

### The catalogue

- **objective** — the top taxonomy level: what the business is trying to achieve
  (Acquisition, Retention, Service)
- **category** — the second level, a product or service grouping (Credit Cards, Broadband)
- **offer** — the third level: the commercial object itself
- **action** — an offer instance made decidable in a context. Today an offer carries the
  `key` used as the action; splitting them properly is a modelling change, not a rename
- **creative** — the content for an offer on a channel. §3.1 allows *variant*; *creative*
  is used here because *variant* is already taken by experiments

### Deciding

- **decision flow** — a DAG of operators. Never "strategy"
- **targeting policy** — the three-tier qualification model below
- **eligibility** — hard filters: CAN we offer this?
- **relevance** — situational: SHOULD we offer it now? (never "applicability")
- **suitability** — affordability and ethics: is it RIGHT for this customer?
- **frequency & suppression policy** — caps and cooldowns. `FrequencyPolicy` in code
- **arbitration**, **ranking** — retained deliberately. §3.2 keeps both as industry-standard
- **propensity** — retained. A standard statistical term
- **business boost** — a multiplicative weight applied to a candidate. `boost` in code,
  never "lever"
- **ranking function** — the formula that combines the terms into a priority
- **placement** — a content slot in a customer journey

### After the decision

- **artifact** — a compiled decision flow plus metadata
- **decision record** — one entry: what was decided and why. `DecisionRecord` in code
- **interaction log** — the append-only store those records land in
- **trace** — the audit view of a decision record. Kept as a UI and API word
- **replay** — re-execute a historical decision against its recorded snapshot
- **change set** — the approval interface, like a PR. Never "change request" or "revision"
- **release** — a change set promoted to an environment
- **shadow** — a version running beside the active one in an environment, deciding
  nothing. `shadowVersion` in code. Reserved for flow versions; a *model* running beside
  another is shadow scoring, which is a different thing — do not use this word for it
- **profile store** — where customer state lives
- **package** — a distributable unit (node types, themes, packs)
- **pack** — a regulatory or industry-specific package

Never use "submit" for buttons. Buttons name their effect ("Publish", "Approve", "Reject", "Replay").

---

## When You Are Blocked

- **Platform API doesn't exist** → register in `/docs/gaps.md`, add to OpenAPI spec as a proposed operation, generate mock
- **Uncertain which audience this screen is for** → check the persona list in the Experience Layer plan (`METIS_Experience_Layer_Build_Plan.md`)
- **Uncertain what state to show** → the Playwright test file has the full state matrix (loading, empty, error, permission-denied, stale-data)
- **Uncertain whether a design decision is right** → check the design direction (§5 of the Experience Layer plan); if it conflicts, flag for product review
- **Uncertain what screen this is, where it sits in nav, or which layout pattern it uses** → `docs/METIS_CONSOLE_SPEC.md`. Parts 2 and 3 are the screen inventory and nav tree; Part 4 the six layout patterns; Part 5 the visual specification; Part 6 the demo bar
- **Uncertain what to build next** → `docs/JOURNEY_SPINES.md`. Work is pulled from there in order, not from a feature list. One spine open at a time
- **Uncertain whether a UI rule is enforced or advisory** → `docs/UX_CONTRACT.md`. Every rule there is checked by `npm run conformance`; a rule with no check is a suggestion

---

## Key Decisions Already Made

These are locked in. ADRs exist in `/docs/adr/` if you want the rationale.

- **Framework:** Next.js App Router, `output: standalone`
- **State management:** TanStack Query for server state; URL for navigation state; Zustand for canvas-local state only
- **Styling:** Tailwind mapped onto CSS custom properties (token layer)
- **Primitives:** Radix UI (unstyled, accessible)
- **Graph canvas:** React Flow (xyflow)
- **Testing:** Vitest (unit), Playwright (E2E + visual), axe-core (a11y)
- **Design north star:** Compliance Officer (the trace is the hero)
- **Theme axes:** light/dark × compact/comfortable (2×2 = 4 axes)
- **Panels:** Signed-partner-only in v1; customer-authored (iframe sandbox) deferred

---

## Flag for Review Before Implementing

- Any use of third-party charting beyond Recharts
- Any custom layout algorithm in the canvas
- Any panel-host security model changes
- Any new token (colour, spacing, radius)
- Any change to the i18n structure

These are high-touch and need product/design review before code.

---

## Session Discipline

- One slice per branch, one branch per PR. `git fetch` and verify local `main`
  matches `origin/main` before branching — a stale local ref has already sent one
  slice off a week-old commit.
- Start the session by running `npm run conformance` and reporting the current
  failure count. End the session the same way.
- **The count may not rise, with one exception:** a rule that fires once per route
  and has no implementation behind it (today, `layout-manifests`, W-041). Adding a
  screen adds exactly one such failure. When that happens, say which rule and why,
  and never invent a format nothing reads in order to move a number.
- If you are more than 60% through context and slice artefacts 5–9 are not done,
  stop, commit nothing, and report what remains.
- Do not proceed past a red gate. Report it and stop.
- Read-only means read-only. Do not fix things during a survey phase.
- Do not report numbers from a run you disturbed — a branch switch mid-suite, a
  dev server saturated by another suite, a server that has been up for hours.
  Re-run on a stable tree or discard the run and say so.

### Working a spine unattended

When the product owner opens a spine rather than a single slice, work it slice by
slice, in order, branching and opening a PR for each. **Stop and report** when any
of these happens:

- a decision is needed that is not already settled in an accepted ADR;
- a gate goes red for a reason outside the slice;
- you find something wrong outside the slice;
- the spine's next step turns out to be wrong as written.

Otherwise keep going until the spine closes. Erring toward stopping is correct;
the cost of an unnecessary stop is one message.

### Say where you are

At the start of a slice, list the artefacts you expect to build and mark each as it
lands. When starting a long-running suite, say roughly how long it takes. There is
no progress bar; the narration is the only signal anyone has.

### End every session by naming what is wrong

The last line of every session report names **the single largest absent or broken
thing you saw that is outside this slice.** One paragraph. Do not fix it. Do not
soften it. If there was genuinely nothing, say that explicitly rather than
omitting the line.

This exists because the scope rules above are deliberately narrow, and narrow
scope means a session can end with everything green while something structural is
missing. A session that ships a working form and never mentions that the entity
has no data behind it has told the truth and left the wrong impression. This is
the one place in the process where bad news has somewhere to go, and it is not
optional.

The end-of-session finding is reported to the product owner. It does not become
the next session's work. Work is pulled from `docs/JOURNEY_SPINES.md` in order,
or from what the product owner has picked. A finding enters the queue only when
the product owner puts it there.

### Every fifth session is read-only

No building. Pick the area of the platform least examined so far and audit it
against `docs/CAPABILITY_TAXONOMY.md`. Report what is absent, not what is done.
Write findings to `docs/evaluation/` and register real gaps in `docs/gaps.md`.

A survey session that finds nothing has failed — either it surveyed something
already well understood, or it flinched. Choose the area you would least like to
look at.

`docs/gaps.md` accumulates what sessions happened to trip over. It has no coverage
guarantee, and absence from it means nobody looked. These surveys are what give it
coverage.

---

**Questions?** `docs/gaps.md` for known gaps, `docs/CAPABILITIES.md` for status,
`docs/METIS_CONSOLE_SPEC.md` for what a screen is meant to be, `docs/JOURNEY_SPINES.md`
for what comes next. None of these is complete. Say so when you find the edge of one.
