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
   thing it guards, watch it go red, restore — against a server that has your
   change in it, which is not automatic; see Rule 10. A check verified only by passing is a
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

    **This applies to writing a file, not only to reading one — and so far every
    instance has been on the writing side.** A patch whose pattern is
    hand-written with `\n` does not match a CRLF file, and all three ways it goes
    wrong are quiet: the replacement silently does not apply and an unasserted
    script reports success; a blanket `replace('\n', '\r\n')` over the *pattern*
    corrupts any escape sequence inside it, so patching a line containing
    `.split('\n')` rewrites the source's two characters into a real line break;
    and a `\` continuation followed by CR stops being a continuation, so a
    patched YAML or shell block changes meaning rather than failing. All three
    happened in one session on 2026-09-10, in the storefront, a workflow's gate
    step and three test files.


    **A bite-proof taken against a reused dev server proves nothing.** Same
    class, different environment: the result is an artefact of where the check
    ran rather than of what it guards. The mock store seeds at module load, so
    a fixture edited after a server started is invisible — the suite answers
    from a seed nobody is looking at. A proof run against it comes back green
    and reads as *"this check does not bite"* when the truth is *"the check was
    never shown the change"*: a false negative on the one control Rule 9
    depends on. It happened on 2026-09-12 — a boost was set to 1.0 to prove an
    e2e assertion needed it, the suite passed, and the conclusion was wrong.
    A server that has been up a while fails the other way, and the same day
    showed that too: one slowed from twenty tests a minute to one partway
    through a suite, which turns every timing-sensitive assertion into a coin
    flip and makes a slow suite read as a flaky one.

    So the e2e harness starts its own server every run, on its own port and
    dist directory, and never reuses one (G-035), and `global-setup.ts` refuses
    a server that is not the one the run started or whose seed differs from
    disk (G-002). The refusal *decision* is unit-tested; its wiring is not
    (G-095). None of this covers a server started by hand — a preview, a curl,
    a script run against port 3000 — so a proof taken that way is still worth
    a restart.

    **Write prose and patches through a file, first.** Put the text in a file
    and apply it with `scripts/patch-file.mjs`, or with a script file that does
    the same three steps: normalise to `\n`, patch with plain `\n` patterns,
    restore the endings the file had, asserting every match — because the
    failure being guarded against is a patch that quietly does nothing. Never
    put prose or a patch inline in a shell heredoc or a quoted command, and never
    hand-escape a pattern to match what you think is on disk. This is the
    default, not the fallback after the shell mangles something: backticks,
    apostrophes, `\n` and CRLF have each broken a heredoc this month, and the
    recovery was the same every time — write it to a file. Decided by the
    product owner on 2026-09-13.

11. **Check what an instruction says about this repository against the
    repository.** Instructions from the product owner may describe the
    repository incorrectly: a file name, an API, a count, the queue order, what
    an ADR decided. An instruction decides what to do. It is not evidence of
    what exists. Before acting on a factual claim, read the file, the ADR or the
    check that would confirm it. When the claim does not hold, say so plainly —
    what was claimed, what is actually there, and where — before doing anything
    that depends on it. This happened seven times in four days, and every
    instance was caught by looking rather than by trusting the sentence.
    Decided by the product owner on 2026-09-15.

---

## The Unit of Work: Vertical Slices

There are no backend PRs and no frontend PRs. There are slices.

A slice is one thing a named persona can do end to end. It is not done until all
nine of these exist **in the same PR**:

| # | Artefact | Where it lives |
|---|---|---|
| 1 | Typed contract (a hand-authored spec is a bug) | `docs/metis-api.openapi.yaml` |
| 2 | Engine or service implementation | `packages/*`, `engines/*` |
| 3 | Public API endpoint | Decision operations — `POST /api/decisions` and the placement decision — in `planes/execution`, the decision service ([ADR-016](docs/adr/ADR-016-deployment-operations-and-scale.md) §1), reading the catalogue, registry and ledger stores. Every other operation is still `apps/console/app/api/[...path]/route.ts`, the console's development API over `apps/console/mocks/store.ts`, which also still answers the decision operations until the console calls the service |
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
- **Uncertain what screen this is, where it sits in nav, or which layout pattern it uses** → `docs/METIS_CONSOLE_SPEC.md`. Parts 2 and 3 are the screen inventory and nav tree; Part 4 the seven layout patterns; Part 5 the visual specification; Part 6 the demo bar
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

- **Work slices in batches of three: one branch and one pull request per batch.**
  Decided by the product owner on 2026-09-13. A slice goes alone only when it has
  to land before the next can start. `git fetch` and verify local `main` matches
  `origin/main` before branching — a stale local ref has already sent one slice
  off a week-old commit.
- Start the session by running `npm run conformance` and reporting the current
  failure count. End the session the same way. The count is ratcheted against
  `docs/ux-conformance-baseline.json`, and `npm run gates` fails if it rises —
  or if it falls and the baseline was not lowered in the same commit.
- **CI is the gate, not the local gates run.** Decided by the product owner on
  2026-09-13. Before a push, run `npm run gates:quick`: typecheck, lint and every
  unit suite. Then push, and let CI run everything else on clean runners —
  end-to-end in four shards, nothing competing for the machine.

  Run `npm run gates:pre-pr` — every gate but end-to-end, Storybook and bundle
  budgets included — only when the change could plausibly break something CI
  runs later that the quick run does not: the harness, the fixtures, the build
  config, a screen's structure. A locator change, a prose change or a register
  edit is not that. A six-minute local run in front of every push is the old
  habit wearing the new rule's name.

  Run the full `npm run gates` locally only with a reason to think end-to-end
  will fail: a change to the harness, the fixtures, a screen's structure, **a
  label a screen or a response carries, or where a screen's data comes from.**
  A red local end-to-end run on a loaded machine is not evidence of a defect.
  On 2026-09-13 three of them cost three re-runs and disproved nothing (G-104,
  G-105).

  The last two were added on 2026-09-16. Slice 3 moved every report onto the
  ledger and changed what provenance means; reading the code found the tests
  that pinned the old counts, and missed two that pinned the old *label* —
  `contract.spec.ts` expected `recorded` on a decision the suite had just
  made. The local run found them in 25 minutes. A label and a data source are
  exactly the changes whose blast radius is invisible in a diff, because the
  assertion that breaks names neither.
- **Report gates by running the script, never by naming individual commands,
  and say which script ran.** `npm run gates` runs exactly what CI runs, in CI's
  order, and `tests/gates-parity.test.ts` fails if the two ever drift;
  `npm run gates:pre-pr` is that list less end-to-end, and says so when it
  finishes; `npm run gates:quick` is typecheck, lint and the unit suites. A claim of "lint clean" or "gates green" from anything else is a
  claim about an unknown subset, and the subsets were not small: until
  2026-09-10 the root lint ran nowhere on a pull request, `test:core`,
  `test:catalogue` and `test:portability` ran in no CI job at all, and
  `npm run conformance` — named twice in this file — was not a script. Three
  sessions reported lint clean while the directory they were editing went
  unlinted. `npm run gates -- <id>` re-runs one gate; `--skip <id>` runs all but
  one.
- **The count may not rise. There is no exception.** Until 2026-09-11 a new screen
  was allowed to add one `layout-manifests` failure, because the rule had no
  implementation behind it. It has one now (ADR-015): a new screen is a manifest
  in `packages/ui-metadata/src/layouts/` and a `page.tsx` that is
  `<Screen manifest="…" />` and nothing else, so it adds no failure. A screen on
  a pattern with no renderer yet — list–detail is the only one today — needs that
  renderer first, and building it is part of the slice. Never invent a format
  nothing reads in order to move a number. The baseline has risen once, and not
  for a regression: on 2026-09-13 the product owner had `layout-manifests` stop
  exempting every dynamic route, and the four `[id]` pages no manifest names took
  the count from 23 to 27 (ADR-015 §5.3, amended). A check that starts to see
  what it could not is recorded in the baseline in the same commit, with the
  owner's decision cited; a change that breaks the contract never is.
- **A slice that deletes something shared costs the deletion plus everything
  that pins it, and the second number is the larger one.** Size it by finding
  the references first, not by the size of the thing being deleted. Slice 3
  removed one committed fixture and its builder, estimated at one to two days;
  what it actually touched was nine test files, four `CAPABILITIES.md` rows,
  a CI step, the gate runner's own list, an `npm run generate` script and two
  source comments — and it left one route with no check over the real corpus
  until that was noticed and replaced. None of that is optional work: a deleted
  export takes its callers with it, and a check that pins a figure pins the
  source of that figure too. Decided from slice 3, 2026-09-16.
- If you are more than 60% through context and slice artefacts 5–9 are not done,
  stop, commit nothing, and report what remains.
- Do not proceed past a red gate — a red local run of any gate script, or a red
  CI run. Report it and stop.
- Read-only means read-only. Do not fix things during a survey phase.
- Do not report numbers from a run you disturbed — a branch switch mid-suite, a
  dev server saturated by another suite, a server that has been up for hours.
  Re-run on a stable tree or discard the run and say so.
- **Never pipe a failing test run through `head`, `tail` or `wc`.** Capture the
  complete output and read what you need out of the file. A truncated capture
  cannot be un-truncated: the run is over, the failure is a name with no detail
  behind it, and the only way back is to run the suite again and hope it
  reproduces. Two failures this month were fully diagnosable and became
  name-only at the moment of capture — the flake-hunt job uploaded an empty
  artifact because its reporter and its upload path disagreed, and a full e2e
  run was piped through `tail -12` by hand, leaving one red test with nothing
  but its title. Pipe to a file, or use a reporter that writes one.

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
