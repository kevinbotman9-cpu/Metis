# Gap register

**What is missing, why, and since when.** For what *is* built, see
[`CAPABILITIES.md`](CAPABILITIES.md), which is the single capability map. This
file never says what works.

Every entry has an id, a date and a status, and links to its work item in
[`BACKLOG.md`](BACKLOG.md) where one exists. `tests/gaps-register.test.ts` fails
when one does not, and when an entry cites a W-number the backlog has never
heard of — which is how `W-053`, `W-054` and `W-055` came to be cited from two
source files and this register before they existed anywhere.

**Restructured 2026-09-09.** This file had grown to 950 lines of undated prose
in no order, mixing entries from four different weeks with a "Status at a
glance" table that duplicated the capability map and had been stale since
2026-09-06. `CLAUDE.md` sends every blocked agent here first, and the file could
only be used by reading it end to end. No prose was deleted in the restructure;
the ids, dates and statuses are new, and the table is gone.

## Adding an entry

1. If it needs a platform API, add the operation to
   `docs/metis-api.openapi.yaml` marked `x-metis-status: proposed`, and mock it
   in the development store. **Never stub inside a component.**
2. Add an entry under **Open** with the next free `G-NNN`, today's date, and the
   W-number if one exists. If none does, add it to `BACKLOG.md` first — a gap
   with no work item is a note, not a register entry.
3. When it closes, move the entry to **Resolved**, set `**Resolved:**`, and say
   what closed it. Do not delete it: the record of what was wrong is worth more
   than the tidiness. `tests/gaps-register.test.ts` fails if an entry's section
   and its status disagree, in either direction.

Since 2026-09-04 the spec is enforced rather than aspirational. `packages/client`
is generated from it, the console compiles against those types, and
`apps/console/tests/e2e/contract.spec.ts` asserts that every operation not
marked `proposed` is served and returns what the spec declares. So this file can
no longer quietly disagree with the spec — only with reality about things the
spec does not cover, which is what the entries below are for.

Run `node scripts/validate-spec.mjs` for the current operation count. It is not
reproduced here, because a count in two places is a count that will disagree.

---

## Open

### G-148 — The policy funnel's headline names "Ranked" as the largest drop at every volume, because only one candidate can win

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none — a design question, tied to "Where it loses most"

`apps/console/components/policy-funnel-panes.tsx` opens the funnel with *"The
largest drop is <stage>"*, choosing the stage that removed most candidates. On a
flow that ranks five candidates for one slot, arbitration removes four of every
five by construction, so the sentence says the same thing at any volume and for
any tenant. Measured on 2026-09-17 against an empty console driven by hand:

| Decisions | Headline |
|---|---|
| 2 | The largest drop is **Ranked**: 8 removed, 80.0% of everything that entered |
| 22 | The largest drop is **Ranked**: 68 removed, 61.8% |
| 44 | The largest drop is **Ranked**: 96 removed, 43.6% — beside Frequency & suppression removing 58 |

At 44 decisions a customer contacted nine times that day lost 58 candidates to a
cap, which is the thing a reader of a *policy* funnel is looking for, and the
headline still leads with arbitration. Losing on priority is not a refusal — the
screen's own words call it *"Not a fault"* — so the most prominent sentence on the
screen is about the one stage that cannot be wrong.

**Done when:** the headline describes the largest *refusal* and treats ranking as
the expected remainder, or the product owner decides it should read otherwise;
and the choice holds at 2, 20 and a few dozen decisions, not only at 10,400.

### G-147 — A stopped experiment counts every decision made after it stopped, and reports an acceptance rate nothing can measure

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none

On `/experiments`, *Homepage hero wording* is **stopped**. After a hand-driven
session of 42 decisions on an empty console on 2026-09-17, every one made after it
stopped, its arm table read:

| Arm | Offered | Reported | Rate |
|---|---|---|---|
| control (holdout) | 0 | 0 | no rate yet |
| variant | **42** | **42** | **0.0% accepted** |

Three things, from what the code does:

- **It counts decisions made after it stopped.** The performance route recomputes
  each arm from the decision's customer reference — by design, so a months-old
  decision stays explainable — and for a stopped experiment forces the status to
  running first: *"`assignArm` returns null for a stopped experiment, so the arm
  is taken from the arms list directly against the same bucket"*
  (`apps/console/app/api/[...path]/route.ts`, the arm join). Nothing checks
  whether the decision was made while the experiment ran, so a stopped experiment
  keeps accruing exposures for as long as the tenant keeps deciding.
- **"0.0% accepted" is a measured zero where nothing is measurable.** The storefront
  reports `impression` and `click` only, so an acceptance can never arrive from
  it. Forty-two reported decisions and no acceptances reads as "nobody accepted";
  the truth is "no channel reports acceptance". The loop already draws this line
  for realised value (a dash, not $0.00); this rate does not.
- **A 50/50 split reads 42 / 0.** The arm is a function of the customer
  reference, and a hand-made history has three references — the storefront's three
  presets — which all fall into one arm. Correct arithmetic; unreadable without
  knowing it. A tenant driven by hand can never populate a control.

**Done when:** an experiment counts only decisions made while it was running; a
rate over an outcome type no channel has reported is a dash with that reason; and
the arm table says when its population is too few customers for the split to mean
anything.

### G-146 — `/decisions` reads "Suppressed 0" under its default filter, whatever was suppressed

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none — the worst case of G-144, and not only on a new tenant

`/decisions` opens with the removable filter *"Outcome: Offer made"*, and its three
tiles — *Decisions*, *Offer made*, *Suppressed · policy or consent* — count **in the
current filter**. Under that default, *Suppressed* can only ever be zero: the filter
has already removed every suppressed decision before the tile counts.

Measured on 2026-09-17, on an empty console driven by hand: contact history was set
to nine contacts today, and 14 of 44 decisions offered nothing. The loop said so
(44 decided, 30 offered). `/decisions` said:

| Decisions | Offer made | Suppressed |
|---|---|---|
| 30 · *in the current filter* | 30 | **0** · *policy or consent* |

A person who has just caused fourteen suppressions opens the screen that lists
decisions and is told there were none. The filter chip is on screen, and the
tile's own caption is "in the current filter" — both technically disclose it, and
neither stops the number from being read as a fact about the tenant.

G-144 registered the same tiles as confusing on a tenant with no decisions. This
is the same construction producing a false statement at any volume, which is why
it is its own entry.

**Done when:** the *Suppressed* tile cannot read zero because of the default
filter — whether by counting outside the filter, by the default changing, or by
the tile not being shown under a filter that excludes what it counts — and a check
drives a suppression by hand and asserts the tile moves.

### G-145 — Decision search returns `provenance` the contract never declared, and `/decisions` renders the banner from it

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none

`GET /decisions/search` (`searchDecisions`) is declared in
`docs/metis-api.openapi.yaml` with a response of `decisions` and `total`, and
nothing else. Since 2026-09-09 (`1f1e588`, *"a synthetic number says so, wherever
it goes"*) the development route has also returned `provenance`, and
`apps/console/app/decisions/page.tsx` renders `<ProvenanceBanner
provenance={data?.provenance} />` from it. The console depends on a field the
contract does not have.

**This is the shape of defect the spec exists to prevent.** `CLAUDE.md` rule 2:
*"If an endpoint is not in the spec, it does not exist."* A field is the same
claim at smaller scale. The decision service in `planes/execution` implements the
contract, not the development route, so a console pointed at it would lose the
banner on its most-read synthetic surface — silently, because an absent
`provenance` is exactly what the banner treats as "nothing to say".

**Why nothing caught it, three ways.**

- **The type is hand-written.** `apps/console/lib/api-client.ts` declares the call
  as `apiCall<{ decisions: DecisionDto[]; total: number; provenance?: ProvenanceDto }>`.
  The field's type comes from that line, not from `packages/client`, so the
  typecheck agrees with the route and neither consults the spec.
- **The contract test accepts extra keys.** `apps/console/tests/e2e/contract.spec.ts`
  validates each response with Ajv against the declared schema, and this schema
  leaves `additionalProperties` unset, which JSON Schema reads as allowed. A
  declared field that is missing fails; an undeclared field that is present
  passes. Measured on 2026-09-17: the response schema's properties are
  `decisions,total` and `additionalProperties` is undefined.
- **The other three reports declare it.** `PerformanceReport`,
  `PolicyFunnelReport` and `FlowVolumeReport` each have an optional `provenance`,
  so the field looks declared from any screen but this one.

**Done when:** `searchDecisions`'s response declares `provenance` (optional, as the
other three do, since an empty result carries none), the client type for it is
generated rather than written, and a check fails on an undeclared top-level key
in a response the console reads — proved by biting on this one before the
declaration is added.

### G-144 — On a tenant with no history, `/decisions` opens filtered and shows three zero tiles above the sentence saying nothing was decided

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none

Seen in a screenshot of a console with an empty ledger, 1680x1000, and not by
any check. The empty state itself is right — *"Nothing has been decided yet"*,
with what will appear — and three things around it contradict it:

- **A filter is already applied.** The screen opens with *"Outcome: Offer made"*
  as a removable chip. A filtered result that is empty is the blank that means
  "change the filter"; the new-tenant sentence means the opposite, and the page
  shows both at once.
- **Three tiles read 0.** *Decisions 0 · in the current filter*, *Offer made 0*,
  *Suppressed 0 · policy or consent* — figures over nothing, with "in the current
  filter" pointing the reader back at the chip.
- **The zero under "Offer made" is green.** A colour that says good, on a count
  that means nothing has happened.

**Done when:** a tenant with no decisions sees the new-tenant state without a
pre-applied filter or zero tiles above it, and a check in `tests/e2e-empty`
asserts it.

### G-143 — A history made by hand renders every slot, stops at "acted on", and never leaves a decision with nothing offered

**Registered:** 2026-09-17 · **Status:** Open · **Work item:** none — a precondition for the empty-by-default tenant, owed before it ships

The next step for the console is a tenant whose decision history starts empty
and comes from the person using it. This records what that person's clicking
produces, measured twice on 2026-09-17, because the version first asked for was
wrong in two places.

**How it was measured.** A console started with `METIS_SEED_LEDGER=0`, the
ledger confirmed at zero decisions with a signed-in session, then every
storefront preset (`eva_fiber`, `eva_no_fiber`, `eva_accepted`) on both of its
views. Six passes, 26 decisions. Then the loop and the policy funnel read over
exactly those.

**Every slot renders.**

| Preset | Home hero | Home grid | Account |
|---|---|---|---|
| `eva_fiber` | FIOS Gigabit | 3 of 5 shown | FIOS Gigabit |
| `eva_no_fiber` | 5G Home Ultimate | 3 of 4 shown | 5G Home Ultimate |
| `eva_accepted` | Gaming Plus Bundle | 3 of 3 shown | Gaming Plus Bundle |

**The loop stops at "acted on", because nobody pressed a call to action.**

| Decisions | Offered | Deliverable | Measured | Acted on |
|---|---|---|---|---|
| 26 | 26 | 26 | 26 | **0** |

Four stages at 100% and a fifth at zero is the shape a broken outcome join would
draw. Here it means the storefront records a click only when someone clicks, and
nobody did. A person reading their own fresh tenant cannot tell the two apart,
and "where the loop breaks" will name the last stage for a reason that is not a
break.

**Refusals happen, and the policy funnel shows them — but no decision is ever
left with nothing offered.** Over the same 26 decisions, 130 candidates entered:

| Not live | Eligibility | Relevance | Suitability | Consent | Frequency | Not ranked | Offered |
|---|---|---|---|---|---|---|---|
| 0 | **16** | **8** | not asked | 0 | 0 | **80** | 26 |

Fiber is refused for `eva_no_fiber` and the accepted offer rests for
`eva_accepted`, and the funnel counts both, because it counts candidates. What
it cannot get from a click-through is a *decision* that offered nothing: every
one of the 26 still offered something, so the loop shows no drop between
decisions and offered. The seeded corpus had 5,712 of 10,400 decisions offer
nothing. Consent and frequency never fire at all; `cpol_web_daily` does refuse
with `FREQUENCY_CAP_BREACHED` when a customer is re-decided enough (reproduced
on 2026-09-16), but a normal click-through never gets there.

**What was wrong first, and where it came from.** Asked for as *"127 of 202
active offers have no active web creative, so clicking through produces
decisions that win a slot and render nothing."* That figure was true of the
catalogue seeded when it was written and has been untrue since 2026-09-12
(`a6cc45e`), when the telco-us tenant became **five offers, all active, all with
an active web creative.** It survived in an undated, present-tense comment in
`apps/console/public/storefront/index.html` — *"127 of the 202 active offers in
the seeded catalogue have no active web creative"* — was quoted from there into a
survey without being measured, and passed on. That comment is dated in the same
change as this entry. A second claim, that the funnel would have nothing to draw,
was an inference from the first and did not survive the second measurement.

**Why it is registered rather than fixed.** Nothing measured here is a defect. It
is what an honest empty tenant looks like on day one, and the empty-by-default
setting is to be decided with it in view.

**Done when:** a person starting from an empty tenant can reach an acted-on
outcome, a decision that offered nothing, and a frequency refusal by using the
product; and the loop distinguishes "nothing has reached this stage yet" from
"this stage lost everything".

### G-142 — The storefront panel test races the panel's own re-render, and fails at a different line each time

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none

`apps/console/tests/e2e/storefront-panel.spec.ts` opens the first decision's
`<details>` and asserts its way down the fact list. It fails intermittently, on
`main` as well as on a branch, and never twice in the same place.

**Measured on 2026-09-16**, ten runs of the spec alone on one machine:

| Tree | Runs | Failures | Line it failed at |
|---|---|---|---|
| `fix/trace-page-one-grid` | 6 | 3 | 36, 43, 65 |
| `main`, the same spec | 4 | 1 | — |

The three failures are three different depths of the same subtree:
`.detail` hidden after 23 retries (line 36); `dl.facts` hidden (line 43); and
`decision` reading `""` while `chain hash`, `input snapshot` and `catalogue`
beside it in the same `<dl>` all matched their 64-hex patterns (line 65). A
feature that is missing is missing at the same line every time. This one is not
missing — it is being replaced while the test reads it.

**The leading suspect, not yet proven.** `decideAll` resolves placements one by
one, and each one calls `renderPanel()` when it lands
(`apps/console/public/storefront/index.html`, the end of the per-placement
path). That replaces the panel's DOM. A `<details>` the test has just opened
closes when the element it was opened on is thrown away, and an `innerText`
read against a node being detached mid-call returns `""` — which is exactly the
line-65 symptom, on a `<dd>` whose siblings were fine a millisecond earlier.
Whether the panel *should* discard what a person has opened is the other half
of the question: a re-render that collapses the explanation someone is reading
is a defect in the page, not only in the test.

**Why it matters more than one flaky test.** This is the `@screen-only` test for
the storefront panel, written in
[#99](https://github.com/kevinbotman9-cpu/Metis/pull/99) precisely because four
days of demos ran against a panel that explained nothing and no test opened it.
A check that passes three times in four is not the guard that failure deserved.

**Done when:** the panel preserves the open state of a decision across a
re-render — or renders each placement's card without replacing the others — and
the spec waits for every placement to settle before it clicks. The check that it
bites: the spec passes twenty consecutive runs.

### G-141 — The integrations screen shows the latency someone typed in, and never the latency that was measured

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none — a screen that has the data it needs one join away

`/integrations` ranks every connector against a 50ms tenant budget, marks the
ones over it, and refuses to compile a flow that names one. Every one of those
judgements is made against `declaredP95Ms` — a number whoever configured the
integration typed into a form. The screen says so itself: *"Latency is declared
by whoever configured the integration, and the compiler adds it to the critical
path. If the declaration is wrong, the budget is wrong."*

**The measurement exists.** `packages/runtime/src/integration/resolve.ts` stamps
every call with `ms`, `fetchedAt`, `cacheHit` and — for a cache hit — the
`observedAt` of the value it served, and all four land in the decision record.
A trace renders them: `apps/console/components/trace-evidence.tsx` shows the
connector id with its timing beneath, and the trace's own source-bindings card
shows the outcome with `{ms}ms cached` beneath it. So the observed number is in
the ledger for every decision, per connector, and the one screen whose job is to
say whether a connector is fast enough reads none of it.

**What that costs.** A connector that declares 20ms and returns 180ms is green
on this screen forever. Nothing reconciles the two, so the budget is a statement
about the configuration form rather than about production.

**Why it is registered rather than fixed.** Found while checking the two-line
value-with-provenance shape across the console, which is a layout slice.
Showing observed latency needs a rollup over the ledger by connector — the same
shape of read as [ADR-014](adr/ADR-014-the-data-spine.md) §10's
interaction rollups, and it belongs with them, not in a layout change.

**Done when:** each connector row shows its observed p95 beside the declared
one, over a named window, and a check fails when a connector's observed p95
exceeds its declaration by more than the budget.

### G-140 — The flow detail page draws two grids to make one two-column layout, and neither fills both columns

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none

At 1680 wide, `/decision-flows/next-best-action` renders two sibling grids, both
declaring `1fr 340px` with a 12px gap:

| Grid | Left | Right |
|---|---|---|
| `flow-editor.tsx:142` | 1,037px wide, 548px of graph | 340px wide, **nothing**, stretched to 549px |
| `page.tsx:198` | 1,037px wide, **nothing**, stretched to 1,267px | 340px wide, 1,267px of provenance |

The empty cells are not incidental. The editor's right column holds the node
inspector, which renders only when `editing && selected` — so on every read-only
visit it is a 340px void. The page below it then repeats the same track
definition with a literal `<div />` in the first cell, whose only purpose is to
push the provenance rail under the column the inspector would have used.

**This is the same symptom as G-139
and as the Architect home in
[#95](https://github.com/kevinbotman9-cpu/Metis/pull/95), and a different
cause.** There the grid's cells are both filled and the taller one drags the
shorter to its height, which `items-start` fixes. Here `items-start` would
change nothing visible, because what is stretched holds no content to sit at the
top of. The fix is one grid whose right column holds the inspector when there is
one and the provenance rail otherwise — or always the rail, with the inspector
somewhere that does not fight it.

**Done when:** the page declares its tracks once, no cell is rendered empty, and
the provenance rail sits beside the graph rather than 549px below it.

### G-139 — The agentic screen stretches an empty column to 1,339px, and 89% of it is nothing

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none

`apps/console/app/agentic/page.tsx:325` is `grid gap-stack lg:grid-cols-[1fr_1fr]`
with no `items-start`. Measured at 1680 wide: tracks 688.667px and 688.667px,
`align-items: normal`, both children 1,339px tall. The left column holds 1,339px
of scope cards. The right column — agent activity, with its outcome filter —
holds 150px. The remaining 1,189px is blank surface, 89% of the column.

**The same defect as the Architect home in
[#95](https://github.com/kevinbotman9-cpu/Metis/pull/95) and as
`/decisions/[id]`**, and the same one-word fix: a grid row defaults to
`stretch`, so the taller cell sets the height of every cell beside it, and a
pane becomes as tall as its loudest neighbour rather than as tall as what it
holds. `items-start` on the row is the whole change.

**Not fixed here** because this slice is `/decisions/[id]`, and a layout change
to a screen nobody measured during it is a change nobody watched land.

**Done when:** the row carries `items-start` and the activity column's height is
its content's height, verified in a browser at 1680 rather than by reading the
class list.

### G-138 — The mock-banner rule reads a route file's words, so honest prose about seeded data fails it

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none — a check that needs a better question, owed by whoever next trips it

`scripts/conformance.mjs` fails a route file that mentions
`mock`, `MOCK`, `fixture`, `sampleData`, `stubData` or `placeholderData` and
renders no `MockModeBanner`: *"A screen that lies about being wired is worse
than no screen."* The subject is right. The question it asks is a word search
over the file, including its comments and its visible prose.

**The case.** On 2026-09-16 `/simulations` gained a sentence explaining that the
simulation figures it used to show had been *"authored in a fixture"* and were
removed. The screen reads its change sets through the generated client, as it
always has. Nothing about it changed except an honest sentence about what is no
longer there — and the count rose from 23 to 24.

**The fix was the sentence, not the check**, and that was the right call *in this
instance*: the screen is wired, so a `MockModeBanner` would have asserted
something false, and the rule would have been weakened for the case it exists
for. The sentence now says "written by hand into the seeded data", which means
the same thing and does not trip the scan.

**The second occurrence, 2026-09-17.** The empty-ledger provenance slice changed
the note in the flow page's Export DIR to name the tenant's *"fixture
catalogue"*. `apps/console/app/decision-flows/[id]/page.tsx` reads the generated
client, as it did before and after; the only change was one noun in a string.
The count rose from 23 to 24, and the fix was again the sentence — it says
*"demonstration catalogue"* now.

**Two firings in two slices, and the honest fix was the sentence both times.**
Both files were wired correctly. Both were flagged for a word in prose. Both were
cleared by changing the word, which is the correct call when the screen is wired
and a `MockModeBanner` would be false — and is also, keystroke for keystroke,
what gaming the check looks like.

**Why that is not reassuring.** A rule that reads prose instead of imports is
answering a different question from the one it names. It will eventually be
right for the wrong reason: an unwired screen flagged only because it happens to
say *mock*, and quietly cleared the day someone rewords the comment. Or wrong when
someone needs it to be right: an unwired screen that never uses one of the six
words passes, and a check written to catch exactly that screen says nothing. Each
rewording so far has been honest. The rule has no way to know that, and neither
does the next person who meets it.

**Why it is registered anyway.** Rewording to satisfy a lexical check is one
keystroke from gaming one, and the next occurrence may need the opposite call: a
screen that really is unwired, whose author deletes the word rather than adding
the banner, passes a check that was written to catch exactly that screen. The
rule cannot tell the two apart, because it never asks what the file reads.

**Done when:** the rule decides from the file's imports and calls — whether it
reaches the generated client, or reads a fixture module directly — rather than
from whether a word appears anywhere in it; and a check proves both halves by
biting on an unwired screen that never says "fixture", and staying quiet on a
wired screen that does.

### G-137 — A money delta is a display string in the contract, where no formatter can reach it

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none — a modelling correction owed by whoever builds simulation (W-020), or by the slice that removes the field, whichever comes first

`ChangeSetSimulation.projectedMarginDelta` is declared `type: string`
(`docs/metis-api.openapi.yaml`, `ChangeSetSimulation`), and the four seeded
change sets carry values like `'+$43,200 / month'`
(`apps/console/mocks/fixtures/governance.ts`). A dollar sign, a thousands
separator and a period, baked into the payload.

**Why it is not [G-092](gaps.md).** That entry is Resolved and its fix stands:
`apps/console/lib/format.ts` is the only file that calls the platform
formatters, and a call site says *what* it shows while the tenant's locale
decides *how*. This value defeats that by arriving pre-formatted — there is no
call site left to fix, because the string is the data. `/simulations` renders
it verbatim, so a US tenant and a UK one see the same dollars, and the one place
that knows the tenant's currency is never asked.

It is also the one thing `Money` exists to prevent: an amount with no currency
code and no minor units, which cannot be converted, compared or summed, and
whose sign is parsed back out of the text to colour it
(`apps/console/app/simulations/page.tsx`, `startsWith('-')`).

**Scope.** One field. A scan of `*.ts`, `*.tsx` and the spec for a quoted
currency symbol followed by a digit finds nothing else outside test expectations
and comments.

**The accepted order removes the values, not the modelling.** The next slice
makes `simulation` present only when one has run and drops the authored
figures, so no such string will be served. The declaration survives it, and
whenever simulation is built the field will be filled again unless this is
decided first.

**Done when:** the field is either removed with the rest of the unrun
simulation's figures, or redeclared as `Money` — an amount in minor units with
a currency — with the console formatting it through `useFormat()`; and a check
fails on a quoted currency symbol followed by a digit in a fixture or a schema,
the way `tests/vocabulary.test.ts` scans for the words this platform renamed
away from.

### G-135 — A model version is published and never promoted, approved or pinned from the canvas

**Registered:** 2026-09-15 · **Status:** Open · **Work item:** [W-029](BACKLOG.md) — ADR-009 §4 names both halves; step two built the object and not its path to production

**What was built.** ADR-009 step two: a model version is a registry object with
a schema, a store, an export and a screen, and the compiler refuses a score
node whose pin names nothing, a kind it cannot read, or a declared p95 it cannot
afford (`packages/registry/src/models.ts`, `modelPinProblems` in
`packages/compiler/src/decision-flow/compile.ts`, `/models`).

**What is not, and what it costs.**
- **No promotion.** ADR-009 §4: *"A model is promoted between environments
  through the same change set and approval path as a flow."* A version here is
  published and nothing more. There is no environment pointer and no change
  set, so "who approved this scorer" has no answer — the publisher is
  recorded, an approver is not. Today that costs nothing, because no model
  runs; the day a scorer is real it is a decision-changing object with no
  approval path, which is the objection ADR-009 §7 raises against adaptive
  models.
- **No pin from the canvas.** A score node's `model` is set wherever the flow
  source is written; the canvas offers no picker over the published versions.
  So the compiler's refusals are reachable from a flow draft, and no screen
  lets a person choose a version to pin.
- **No screen shows a refusal.** No console flow has a score node, so
  `UNKNOWN_MODEL` and its siblings are proven by the compiler's tests and have
  never been read by anybody on a screen.

**Done when:** a model version is promoted to an environment through a change
set a second person approves, a score node's pin is chosen on the canvas from the
published versions, and an `@screen-only` test reaches one of the compiler's
model refusals by clicking.

### G-136 — One end-to-end shard runs half again as long as the others, and the threshold that was added measures something else

**Registered:** 2026-09-16 · **Status:** Open · **Work item:** none — an observation with one run behind it, recorded so the next few runs are compared rather than remembered

**What was seen.** On #90, the first run with the in-memory ledger seeded
(ADR-018 slice 2a), the four end-to-end shards took 6m52s, 5m43s, **9m21s** and
5m48s. Before that slice the four ran within about a minute of each other. One
run is not a pattern, and shard 3's contents differ from the others', so this is
an observation rather than a diagnosis.

**Why it might be the seed.** Each e2e server seeds its ledger once at start —
3.4s on #90's runner — and every `POST /api/_test/reset` between specs rewrites
that history into a fresh in-memory ledger. The specs are not spread evenly
across shards: a shard that resets more often pays more.

**What the existing check does not cover.** The warm-up asserts the seed at
start stays under 45 seconds (ADR-018, the deferred e2e-database alternative).
It says nothing about the restores between specs, which is the cost that would
grow with the number of specs on a shard. A threshold that measures the cheap
half is a threshold that will not fire.

**Seven runs, 2026-09-16.** Each row is one workflow run, in shard order. #92
ran twice because a second commit was pushed to the branch.

| Run | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| #90 | 6m52s | 5m43s | **9m21s** | 5m48s |
| #91 | 5m29s | 6m51s | 5m58s | 6m55s |
| #92 (first) | 6m43s | 7m12s | 6m40s | 4m38s |
| #92 (second) | 6m31s | 6m20s | **7m57s** | 5m18s |
| #93 | 7m13s | 6m24s | 5m31s | 5m27s |
| #94 | 5m39s | 4m28s | **8m5s** | 6m54s |
| #95 | 6m50s | 6m43s | **8m1s** | 5m31s |

Means: shard 1 **6m28s**, shard 2 **6m14s**, shard 3 **7m22s**, shard 4
**5m47s**. Shard 3 is the slowest of its run in four of the seven, and its
ceiling — 9m21s — is higher than any other shard has reached (7m13s, 7m12s,
6m55s).

**A correction.** After #94 this entry was read as "every shard varies by about
a factor of two, so there is no shard-3 effect". That was too quick, on five
runs, and two more moved it: the variance is real and wide on every shard, and
shard 3 is also consistently at the top of the range. Both things are true, and
the second one is what this entry is about.

**What the runs cannot settle.** #94 was documentation only and #95 changed one
component and three tests, so neither run's shard 3 was carrying new work. That
rules out "the slice made it slow" and rules in nothing: the cost could be the
specs that happen to sit on shard 3, the restores between them, or the runner.

**What the threshold still does not measure.** The warm-up asserts the seed at
start stays under 45 seconds. It says nothing about `POST /api/_test/reset`
between specs, which rewrites the whole history and is the cost that grows with
a shard's spec count — so whichever of the two explains shard 3, the check in
place cannot see it.

**Done when:** the shard timings from the next few runs on `main` are compared
against #90's; if shard 3 stays slow, the restore cost per reset is measured and
either the threshold covers it or the seed moves to a PostgreSQL service in CI,
which is the alternative ADR-018 already names.

### G-132 — A bundle-budget test can hang inside the measurement, and a retry is what turns it green

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — a harness defect; measured to the test body on 2026-09-16, with the wait that held it still unnamed. W-081 owns the budget check's measurement

The title said teardown until 2026-09-16, and the reading below with it. Both
are kept, with what disproved them, because a wrong diagnosis that was acted on
twice is part of the record.

**The observation.** #62's `verify` job at `1e9c499` (run 34891321276) failed
`bundle-size.spec.ts` › *`/creatives` is within budget*:

```
/creatives: 692.4 kB of 780 kB (11 prefetch requests not counted)
✘ … › /creatives is within budget (1.0m)
Test timeout of 60000ms exceeded.
```

The route was measured and was inside its budget. The only statement after the
line that printed it is a synchronous `expect`, so the sixty seconds went
somewhere after the measurement — most plausibly in teardown: the spec leaves a
`page.route('**/*')` handler installed and pushes a `res.body()` promise for
every `/_next/static/*.js` response, including any that arrive after
`Promise.all(pending)` has returned, and nothing awaits or removes either before
the page closes. That is a reading of the code, not a demonstration.

**Why it is not the change.** #62 touched one e2e spec and register prose,
nothing that ships in a route bundle. The same application code measured
`/creatives` identically (692.4 kB, 11 prefetch requests aborted) in 1.2s on
#61's run and 1.1s on main's push run at `34c7d7f`.

**Measured on 2026-09-16, and the reading above is wrong.** Four measurements,
in the order they were taken.

*The sixty seconds are inside the test body, not after it.* The failing job's
own timestamps: `/offers` printed its measurement at 20:14:31.7 and
`/creatives` printed its at 20:15:31.8 — sixty seconds later — and the five
tests after it printed at 20:15:33.4, :34.4, :35.6, :36.6 and :37.6, a second
apart. The only thing after that line is a synchronous assertion, so the sixty seconds
were spent before it printed. Teardown, which comes after both, cannot be what
took the time.

*The page had loaded and every byte had been read.* The failing run's artifact
is still on the run (`bundle-budget-report`, one `error-context.md`). Its page
snapshot shows `/creatives` fully rendered — the level-one heading, the ten
creatives, the nav — and the total the test printed, 692.4 kB, is the passing
re-run's number to the tenth of a kilobyte. Whatever the wait was, it was not
waiting for the page to draw or for a chunk to go uncounted.

*A route handler running at teardown does not hold the page.* The reading above
was tested directly: a probe installed `page.route('**/*')` with a handler that
sleeps twenty seconds, ended the body while it slept, and the test finished in
1.6s. Playwright closed the page without waiting for it.

*It does not reproduce here.* Fifty-four runs — every route six times against
one production build, 2026-09-16 — produced no run over 3.5s, and the time
outside each body was a steady ~110ms.

**What is left.** Two waits in the body had no ceiling: the quiet window
(`waitUntil: 'networkidle'`) and the `Promise.all` over one body read per chunk.
Both are consistent with the evidence and the run cannot distinguish them,
because a bare `Test timeout of 60000ms exceeded.` names neither. They are now
bounded at twenty seconds each, with messages naming the route, the wait and
what was outstanding (`tests/bundle/settle.ts`, checked in
`tests/unit/bundle-settle.test.ts`). The quiet window closes in 560–910ms per
route on a development machine and in 553–705ms on the runner that gates this
repository (#92's `verify`), so the ceiling has around thirty times the cost on
the machine the failure happened on. The measurement is unchanged: all nine
routes report the same kilobytes as before the change, on both machines, to the
tenth.

**What was done instead of a fix.** The failed job was re-run and #62 merged on
the result, by the product owner's decision. The re-run passed: `/creatives`
measured 692.4 kB in 1.1s — with **7** prefetch requests aborted where the failed
run aborted **11**, from the same build. The byte count matched; what the page
was doing on the network when the measurement ended did not, which is worth
knowing when this is diagnosed. The Playwright config's own comment
says a test that passes only on retry "is a defect to investigate, not a result
to accept"; this entry is that defect, recorded so the retry is not silent.

**Done when:** a recurrence names the wait that held it — which the ceilings now
do, in the run's own output — and that wait is fixed, or a season of runs passes
without one and this is closed as unreproducible. The spec releases its route
handler before the page closes as of 2026-09-16, which is worth doing and was
not the cause.

### G-131 — Every screen is titled "METIS Console", so nothing outside the page can tell two apart

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** [W-083](BACKLOG.md)

The console has one document title. It is rendered in the root layout
(`apps/console/app/layout.tsx`, since G-130), and no route sets its own: all 26
page routes, and the 29 addresses the accessibility sweep scans, read "METIS
Console".

**Who that fails.**
- **A screen reader user.** The title is what is announced when a page loads and
  when focus returns to the window. Moving from the decision list to a trace
  announces the same words as moving from Offers to Settings.
- **Anyone with more than one tab.** A compliance officer comparing two decision
  traces, or a change set beside the flow it changes, sees identical tabs, and
  the browser's history and bookmarks are a list of identical entries.
- **An exported or printed page.** A browser's PDF export and print header take
  the document title, so a saved trace is titled "METIS Console" with nothing to
  say which decision it records.

WCAG 2.4.2 *Page Titled* asks for a title that describes the page's topic or
purpose. axe's `document-title` checks only that a non-empty title exists, which
is why every scan passes: the rule cannot see that 26 routes share one.

**Why it is not a one-line change.** G-130 moved the title out of `metadata`
because Next's per-route metadata head is remounted on every client-side
navigation, and the document had no title for 14–37ms each time. Per-route
`metadata` would bring that gap back. A per-screen title has to be set without
reintroducing it, and `document-title.spec.ts` is the check that says whether it
has.

**Done when:** every route's title names the screen, and a detail route names
the thing it shows (the offer, the decision, the change set); two different
screens never share a title; and a check fails when a route has none of its
own, alongside `document-title.spec.ts` still passing.

### G-129 — Six screen families do not have a decomposition, and must not be given a Cascade rail

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found assessing every screen in `METIS_CONSOLE_SPEC.md` Part 3 against §4.7

§4.7 gives a rail only to a screen with a spine: one decomposition, ordered,
nested and named, where the first question is *where does it fall off*. The
Cascade now runs on five screens — `/`, `/performance`,
`/targeting-policies?view=funnel`, `/decisions/[id]` and
`/creatives?view=coverage` — and each passes: every stage is a subset of the
one above. The families below were assessed and do not, and giving one a rail
would be worse than giving it none, because a rail teaches a reader to expect a
subset relationship the page does not have.

- **Approvals, Environments, Release history.** Counts of different things —
  change sets proposed, simulated, released; versions per environment. A
  released change set is not a subset of the proposed ones in any window a
  screen shows, and the architect's own mockup drew this as a rail and
  withdrew it on 2026-09-13 (Part 3, Overview).
- **Version comparison, Shadow comparison, Bias check, Counterfactual.** Two
  populations side by side — before and after, active and shadow, one group
  and another. The question is *how do they differ*, not *where does one fall
  off*, and Split result is the pattern for it.
- **Replay.** One binary outcome, identical or divergent, with the byte-level
  difference behind it. There are no stages.
- **Attribution, Value, Cost.** Shares and sums. Cost "broken to component"
  adds up to a whole; attribution divides credit across touchpoints. Neither
  narrows from one stage to the next.
- **Health, Latency & throughput, Degradation, Capacity.** Degradation has an
  ordered ladder, but a rung is a mode the platform is in, not a subset of the
  rung above; the rest are measurements over time, not sequences.
- **Decision flows and Journeys.** Graphs, not sequences. A canvas has a
  topology, and volume through it is drawn as edge thickness on the canvas
  itself (G-127), not as a rail beside it.

Four more would earn a rail if their data existed, and are not in this entry
because the reason they have none is absence, not shape: the Delivery log
(decided → sent → delivered → opened → clicked, and nothing sends on email or
SMS today), Under-served analysis (a population → eligible → offered, which
needs simulation over a population), Paid audiences (segment → consented → not
suppressed → exported), and Journey performance for a linear journey.

**Done when:** never by adding a rail. This closes only if one of these gains a
nested decomposition from the platform, and then that screen is reassessed
against §4.7 rather than converted by default.

### G-128 — The trace reference staged its rail by policy tier and invented reason codes; the built rail is right

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found building the evidence pane of `/decisions/[id]` from `docs/design/metis-trace-directions.html`

The reference's Cascade tab for the trace draws its rail as Eligibility,
Relevance and Suitability — the three policy tiers — and fills them with reason
codes the engine does not have: `NO_CONSENT`, `NOT_IN_SEGMENT`,
`AGE_RESTRICTED`, `ALREADY_HELD`, `RECENT_DECLINE`, `AFFORDABILITY`. None is in
`REASON_CODES`. It also quotes "the reason shown to the customer", and no such
text exists in the platform (G-057).

**The built rail is right and the reference is wrong.** A trace's stages are
the nodes the flow actually ran, in the order it ran them, from the decision
record's own eliminations (`apps/console/components/trace-cascade.ts`,
`stagesFor`). Flows differ: `inbound-web-offers` has one filter and no
relevance or suitability node at all, so a tier-staged rail would show two
permanently empty stages on most of this tenant's decisions — a screen lying
about the flow it shows. The reason codes are the engine's closed set, and the
evidence pane quotes their meanings and the node's recorded reason rather than
customer-facing text nobody wrote.

This is the fourth behaviour in `docs/design/` the engine does not have, after
the three G-125 records; `docs/design/README.md` lists them beside the files.

**Done when:** nothing is built from the trace reference's rail or quote, and
the README beside it says so.

### G-127 — Volume through a flow is a proposed operation, served by the development API only

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found building the volume overlay on the canvas (`METIS_CONSOLE_SPEC.md` §4.2)

The canvas draws each edge as thick as the candidates that crossed it, and each
node with what it removed, over the flow's last 24 hours of decisions.
`getFlowVolume` is the operation that answers it, and it is
`x-metis-status: proposed`: the console's development API serves it, from the
seeded corpus and the ledger, and no plane does.

The figures are counted from the eliminations each decision recorded, so they
are only as current as the records. For the 10,400 seeded decisions that means
the decision index, which carries the node each removal happened at since
2026-09-14 so the overlay can be summed without re-executing the corpus.

The id is G-127 rather than the next number on `main`: G-123 to G-126 are
registered on branches not yet merged.

**Done when:** a plane serves `getFlowVolume` over live decision records, and
the operation is no longer proposed.

### G-122 — The arbitration weights API still publishes without a change set

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when `/arbitration` moved to raising change sets

Since 2026-09-14 moving a weight on `/arbitration` changes a preview and
nothing else, and the screen raises a change set that changes the weights only
once somebody approves it. The operation the screen used to call is still
built: `PUT /api/arbitration/{tenantId}` (`updateArbitrationConfig`) writes the
weights directly for any account holding `edit:arbitration`. It is audited, as
`ArbitrationWeightsChanged`, and approved by nobody.

So "nothing publishes until a change set is raised" holds for the screen and
not for the platform. `apps/console/tests/e2e/permissions-and-writes.spec.ts`
holds the bypass on purpose — `the weights API still publishes directly,
outside any change set` — so it is a check that names it rather than an absence
nobody mentions.

Two narrower edges of the same slice:

- **Only `arbitration_weights` change sets can be raised.** `createChangeSet`
  refuses every other change type with a 400, because the console has nowhere
  else to raise one from and approval applies only a handful of types.
- **`createChangeSet` was credited to a test that never called it.** Until this
  slice the operation answered 404, and `contract.spec.ts`'s coverage map
  pointed at a test whose `covers: createChangeSet` comment sat on an approval
  of a seeded change set — the `createOffer` defect that file describes, again.
  The comment now sits on a test that raises one.

**Done when:** `updateArbitrationConfig` either requires an approved change set
or leaves the built surface. Which one is a decision for the product owner, not
this register.

### G-121 — Parts of the console still judge flows by the fixtures

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when the console moved its flows onto the registry

Since 2026-09-14 a flow's draft and every version published from it live in
`@metis/registry`, and the flow list compiles each stored draft against the
stored catalogue. Three readings of a flow still come from the fixture modules,
so after a person edits and publishes a flow they describe the fixture instead:

- **The policy funnel's "asked" stages.** `GET /api/policy-funnel` decides
  which stages a flow asks from `findCompilation` in
  `apps/console/mocks/fixtures/compiled.ts`, compiled once at import from the
  fixture flow and the fixture catalogue. A node added and published is not a
  stage the funnel shows.
- **The fallback artifact.** `artifactFor` in
  `apps/console/app/api/[...path]/route.ts` runs `execArtifacts`, the fixture
  flows, for a flow with no production version.
- **A draft's version history.** `versions` and `activeVersion` on the draft
  are the fixture's lists, and publish and promote do not update them. The
  flow's page says "N versions, all replayable" from the draft while the
  registry holds the real list.

A fourth, shadow comparisons, moved into the registry on 2026-09-14
(`registry_shadow_comparisons`) with a restart test in
`apps/console/tests/unit/console-durable.test.ts`.

**Done when:** each of the three reads the registry, and a flow edited and
published through the API shows its own stages and history.

### G-120 — The console has three audit logs and `/audit` shows one

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when change sets and the audit log moved onto a store

Three append-only logs now survive a restart, and they do not agree:

- `governance_audit_events`, which `recordAudit` writes and `/audit` reads;
- `catalogue_events`, one row for every catalogue write;
- `registry_events`, one row for every publish, refusal, promotion and shadow.

The console writes its own summary into the first for most writes, so the
three overlap without matching. A publish the compiler refused is in
`registry_events` and not in `/audit`, because the route records only a
publish that landed. Seeding writes catalogue and registry events and no audit
events. Nothing joins them, so the question "who changed this, and was it
approved?" is answered by reading three tables by hand.

**Done when:** `/audit` shows one log a person can trust to be complete, either
by reading all three with their source named or by the stores writing one.

### G-119 — An approval is recorded before its diff is applied, in a separate write

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when change sets moved onto a store

Approving a change set is three writes across two stores with no transaction:
the decision into `@metis/governance`, the diff into `@metis/catalogue`, and the
audit event. The order is deliberate. The decision goes first because the store
writes it only over a pending change set, so an approval applies its diff at
most once — applying it twice was the failure a durable catalogue beside an
in-memory change set produced.

The price is the opposite failure. An apply that throws after the decision
leaves a change set approved whose diff did not land, and no audit event says
so. The same shape now holds for every console write and its `recordAudit`: a
write that lands and an audit append that fails leaves an unaudited edit, which
in memory could not happen. It is G-117's shape, one level up.

**Done when:** an approval records whether its diff was applied, and a write
and its audit event land together or not at all.

### G-118 — Data sources, tenant settings, autonomy and users still do not survive a restart

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when the console moved its catalogue onto the store

Since 2026-09-14 the console's catalogue lives in `@metis/catalogue` and
survives a restart when `METIS_DATABASE_URL` is set. That covers taxonomy,
offers, creatives, policies, boosts, the ranking function, connectors,
placements, the profile schema and experiments.

Since 2026-09-14 decision flows — drafts, published versions, environments and
the registry's event log, in `@metis/registry` — and change sets with the audit
log, in `@metis/governance`, survive a restart the same way. Each has the
catalogue's seeding rule (`apps/console/mocks/registry-source.ts`,
`apps/console/mocks/governance-source.ts`) and a restart test in
`apps/console/tests/unit/console-durable.test.ts`. What that did not finish is
G-119, G-120 and G-121.

What a person authors that is still held in `apps/console/mocks/store.ts`, and
seeded again on every start:

- **Data sources**, and the rows landed into them. They reference
  profile-schema fields that persist.
- **Tenant settings** (G-092), **autonomy settings** and **users**.

Two consequences of the catalogue persisting work as designed, but are not
obvious:

- **A stored tenant is used as found.** A fixture edited after a database was
  first seeded does not reach that database.
- **Lists come back in id order**, not in the order the fixtures were written,
  because that is the order the store reads in.
  `apps/console/tests/unit/placement-decision.test.ts` asserted the authoring
  order; it now asserts the set.
- **Flows and change sets list in the store's order too.** `GET /artifacts`
  lists flows by id and `GET /change-sets` newest request first; both followed
  the order of the fixture files before.
- **A registry holding published flows and no drafts is refused**, because
  decisions would run flows the console cannot show or edit. A bundle from
  before format 4.0.0 has no drafts, and format 3.x is refused on import anyway.

**Done when:** data sources, tenant settings, autonomy settings and users
survive a restart the same way, each with a restart test in
`apps/console/tests/unit/console-durable.test.ts`.

### G-117 — The console checks a catalogue rule and writes in separate awaits, with no transaction

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** none — found when the console moved its catalogue onto the store

Every console write reads the catalogue, checks a rule, then writes. The rules
checked this way:

- an offer, objective, category, placement or experiment key is not already
  taken;
- a category's objective and a creative's offer exist;
- an offer is not activated without an active creative on a channel the tenant
  decides on;
- that creative is not switched off or deleted while its offer is active;
- a policy an offer is bound to is not deleted;
- a placement a creative names is not deleted.

In memory, each handler ran its check and its write without yielding, so
nothing could get between them. Against a shared store they are separate
awaits, and `CatalogueStore` has no transaction to offer. Two requests can each
pass the check, and then both write.

**Some rules have a constraint behind them.** Offer, placement and experiment
keys are unique in the schema, and a category's objective and a creative's offer
are foreign keys. For these, the second writer now gets a 409 or 400 rather than
a 500 (`refusingCatalogueErrors` in `apps/console/app/api/[...path]/route.ts`).

**The rest have nothing behind them:**

- objective and category key uniqueness;
- the activation rule and the last-creative rule;
- the bound-policy and named-placement delete rules.

**Seeding an empty store has the same shape.** It is a sequence of writes, so an
interrupted seed leaves a partial tenant, and the next start uses it as found.

**Done when:** each rule either holds under concurrent writers — a transaction
around the check and the write, or a constraint — or is recorded as advisory.
Either way, a test runs two writers at once.

### G-116 — A live decision cannot be replayed after the console restarts

**Registered:** 2026-09-14 · **Status:** Open · **Work item:** [W-005](BACKLOG.md)

A decision record stores `catalogueSnapshotHash`, never the catalogue. Replay
looks the catalogue up by that hash in `apps/console/mocks/catalogue-state.ts`,
and that lookup is a map in memory.

Since 2026-09-14 the catalogue survives a restart, and so does a PostgreSQL
ledger. The map does not.

- **A decision recorded before a restart** names a hash nothing holds
  afterwards. Its replay answers 409 `catalogue_unavailable`, correctly and
  permanently.
- **The seeded decisions still replay**, because the fixture catalogue is
  registered at every start.

The store keeps the catalogue as it is now, not every version it has been.
W-005 named a snapshot per decision, cached by hash, as the likely shape; only
the cache was built.

**Done when:** the catalogue a decision was made against can be fetched by its
hash after a restart, and a test replays a pre-restart decision identically.

### G-115 — ADR-016 draws deployable boundaries without saying who may cross them

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-043](BACKLOG.md) covers people signing in to the console; nothing covers a machine calling the platform

[ADR-016](adr/ADR-016-deployment-operations-and-scale.md) splits the platform
into three deployable units: the decision service, the console, and the
migration job. It names who calls across those boundaries:
- a channel, meaning a website, an email platform or a contact centre, calling
  the decision service;
- the console calling the decision service;
- an operator running the migration job and `metis tenant create`.

It does not say how any of them proves who it is, or which tenant it may act
for. The first decision service deployed on it would serve anyone who can reach
its port.

What exists today:

- **The contract claims more than anything implements.** Every operation
  declares `bearerAuth`, an HTTP bearer token formatted as a JWT
  (`docs/metis-api.openapi.yaml`, `securitySchemes` and the root `security`).
  Nothing issues a JWT, and nothing verifies one.
- **The console's development API authenticates by assertion.**
  - `POST /api/auth/login` compares the password in clear against the seeded
    user store, then returns the token `metis.<userId>`
    (`apps/console/app/api/[...path]/route.ts`, the `auth` case).
  - `actor()` accepts any bearer starting `metis.` whose suffix is a seeded
    user id.
  - The token is unsigned and never expires. Knowing a user's id is being that
    user.
- **The JVM decision service has no authentication at all.** Its README says
  so, and that it is not deployable as-is.
- **Nothing identifies a machine.** ADR-007 covers the credentials the platform
  presents *outward* to connectors, not credentials a caller presents to the
  platform. W-043 covers people: SSO, SCIM, ABAC. `docs/CAPABILITIES.md` records
  single sign-on as `ABSENT`. Nothing anywhere covers:
  - per-tenant API keys, service tokens or mutual TLS;
  - how a credential is issued, rotated or revoked;
  - tenant scoping. A decision request names its tenant in the path, and a
    caller for one tenant naming another is refused by nothing.

This is not a gap in the first unit. ADR-016's build order builds that unit
refusable: a request without the configured credential gets a 401, and that is
all. Deciding identity inside it would decide it for every boundary the platform
has, in a pull request about something else.

**Done when:**
- An accepted ADR decides:
  - how a person authenticates to the console;
  - how a machine authenticates to the decision service, and which tenant that
    credential may act for;
  - how credentials are issued, rotated and revoked.
- The decision service refuses a request that lacks a valid credential for the
  tenant it names, and a test proves it.

### G-113 — A targeting policy's scope is in the model and cannot be set by a person

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-082](BACKLOG.md)

A targeting policy applies at a scope — the tenant, an objective, a category or
one offer — and the engine honours it: a policy is checked only against the
candidates its scope covers. The seeded tenant uses that: 21 of its policies are
scoped below the tenant, `pol_5g_bandwidth_need` to the one offer it concerns.

The console cannot author one. When targeting policies moved into the metadata
registry on 2026-09-13 (#49), `scope` was left out of the form and declared
unmanaged, with the reason *"No screen scopes a policy yet"*. The binding sends
`{ level: 'tenant', targetId: null }` for every new policy and keeps an existing
policy's own on edit (`apps/console/lib/layouts/sources.ts`,
`packages/ui-metadata/src/registry/targeting-policy.ts`). The hand-built dialog
it replaced did the same. So every policy a person has ever written from the
screen is tenant-wide, and one written to narrow a single offer applies to the
whole catalogue instead — silently, because the form never asked.

Raised in the review notes on #49.

What is missing is the scope in the form: a level, and a target chosen from the
records at that level, with a policy created at an offer's scope applying to
that offer only. It needs no new field type: `scope.level` is a closed select,
and `scope.targetId` a select over a named source filtered by the level chosen.

### G-112 — A route's bundle budget counts the screens it links to, so a link can fail an unrelated route

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-081](BACKLOG.md)

`tests/bundle/bundle-size.spec.ts` sums every JavaScript chunk a route loads
before the network goes idle. That includes what Next's router prefetches for
the links visible on the page, so a route's number is its own code plus the
screens it links to.

Measured on 2026-09-13 at `f371c7f` with
`apps/console/scripts/measure-route-payload.mjs --prefetch both`, aborting router
prefetch requests in the second run:

| Route | Prefetch on | Prefetch off | Prefetch adds |
|---|---|---|---|
| `/` | 811.5 kB | 664.7 kB | 146.8 kB |
| `/offers` | 871.5 kB | 712.7 kB | 158.8 kB |
| `/creatives` | 847.5 kB | 671.9 kB | 175.6 kB |
| `/decisions` | 682.7 kB | 581.1 kB | 101.6 kB |
| `/decision-flows` | 833.3 kB | 582.8 kB | 250.5 kB |
| `/decision-flows/next-best-action` | 1018.4 kB | 790.2 kB | 228.2 kB |
| `/audit` | 682.7 kB | 576.2 kB | 106.5 kB |
| `/settings` | 756.6 kB | 661.6 kB | 95.0 kB |

Every signed-in route pays a flat 95 kB for change sets it links to from the
header — the `/approvals/cr_…` links present on every page — which the budget
file had described as the shell. `/decision-flows` itself is 13 kB of route
code; 155 kB of its number is `/arbitration` and `/placements`, prefetched from
its links, and it failed its budget on 2026-09-13 because slice three made
those two screens heavier. Nothing on `/decision-flows` changed.

So a budget does not say what a route costs. Adding a link to a heavy screen,
or making a linked screen heavier, fails routes that did not change — and the
failure message tells whoever reads it to trim a page they did not touch.

**A second effect: the number was not repeatable.** Which links have
prefetched by the time the network goes idle varies between runs, so one
build gives different numbers. On 2026-09-13 the same commit measured
`/offers` at 871.5 kB locally and 885.2 kB on CI, and failed CI's run against
a budget the local run passed. Every other route matched to the decimal. A
budget that cannot measure one build twice the same way is not a budget: it
fails at random, and the failure names a route that may not have changed.

**What landed on 2026-09-13.** `bundle-size.spec.ts` aborts router prefetch
requests and reports how many it did not count. Two runs of one build then
measured every route to the same byte, although the prefetch requests aborted
differed between them — 3 against 11 on `/decisions` — which is the variance
this entry describes, now outside the number. The budgets were reset from
that measurement in the same change.

What is still missing is the check that would have caught this: a test that
makes a linked screen heavier and proves the route linking to it does not
fail.

### G-111 — The descriptor registry and the panel registry load whole on every route that touches either

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-080](BACKLOG.md)

The route budgets tripped on 2026-09-13, in the batch that declared targeting
policies and arbitration and made offers and approvals list–detail screens. The
first reading was that the shared shell had grown. It had not: across the batch
the shell grew 0.8 kB, and every kilobyte of the overrun was route-side.
Measured per commit with `apps/console/scripts/measure-route-payload.mjs`.

The growth is two chunks, each loaded as a unit:

- **The descriptor and layout registry, 40 kB.** `@metis/ui-metadata` exports
  every descriptor and every manifest from one module, so a route that imports
  one descriptor — `/creatives` for the creative form, `/settings` for tenant
  settings — ships every descriptor's copy, every manifest, the `conditions`
  editor's strings and the arbitration weights.
- **The list–detail host and every panel, 54 kB.** `PANEL_COMPONENTS` imports
  each panel so the map is complete, which means a screen rendering placements
  ships the offer panels and the change-set diff too.

Per-commit growth in route-side JavaScript, prefetch on, as the budget measures:
slice one (the renderer) +1.8 kB; slice three (the declared policy and
arbitration forms, the `conditions` type, the deletes) +14 kB on `/offers` and
`/creatives` and +48 kB on `/decision-flows`; slice two (offers and approvals as
list–detail screens) +45 kB on `/offers`, +21 kB on `/creatives`, and +136 kB on
`/`, which is G-112.

The budgets were first raised on 2026-09-13 to let that batch land, with this as
the recorded reason, and then reset the same day from a measurement without
prefetch (G-112). Those two chunks are still in every figure for a route that
touches either. The cost is structural: every descriptor or panel added for one
screen is paid by every screen that uses any descriptor, and it grows with the
registry, not with the screen.

What is missing is a registry a route can import per entity and per manifest,
and panels loaded per manifest.

### G-110 — A targeting policy, a placement and a creative can be deleted only through proposed operations

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-079](BACKLOG.md)

The console could create and edit all three and delete none: the spec had no
delete operation for any of them, so a policy written by mistake stayed in the
list and a slot configured by mistake stayed in the registry. Asked for on
2026-09-13, in the batch that gave targeting policies and arbitration their
descriptors.

`deleteTargetingPolicy`, `deletePlacement` and `deleteCreative` are added to
`docs/metis-api.openapi.yaml` as `x-metis-status: proposed`, and the console's
development API serves them. Each refuses rather than cascades while something
still depends on the record — an offer bound to the policy, a creative naming
the slot, an active offer whose last deliverable content this is — because a
delete that quietly changed what decisions do would be a decision nobody made.

`ArbitrationConfig` has no delete, deliberately. It is one record per tenant, and
a tenant without one has no ranking function, which publishing already refuses
(`UNKNOWN_UTILITY_FUNCTION`).

What is missing is a plane serving the three operations, with the same refusals.

### G-109 — What the engines are held to is a proposed operation, and it can name the checks but not their results

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-078](BACKLOG.md)

The decision architect's Overview has a panel for what makes a chain hash mean
the same thing whichever engine produced it. The persona mockup filled it with
"every decision replays byte-identical" and "two independent engines agree on
every chain hash" — and nothing the platform serves could say either.

`getConformance` (`GET /conformance`) is added to `docs/metis-api.openapi.yaml`
as `x-metis-status: proposed`, and the console's development API serves it: the
three committed corpora (`docs/conformance/`) with their case counts, counted
from the files as served, and the named check that holds each engine to them —
the `corpus` gate for TypeScript, the `kotlin-conformance` CI job for Kotlin.

**What it cannot say, on purpose.** Whether those checks passed. The development
API can run neither of them, so a figure claiming agreement would be invented,
and the panel says in words that it does not claim it. A per-decision replay
count — "10,400 of 10,400" — has no source at all: replay is on demand, one
decision at a time, on the trace reader.

**Done when:** a plane serves the operation, and it reports the most recent
result of each named check — when it ran, against which commit, and whether it
passed — so the Overview can say what it currently cannot.

### G-108 — The client generator ignores `nullable: true`, so 13 spec fields are typed as never null

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-077](BACKLOG.md)

`packages/client/generate.mjs` reads OpenAPI 3.1's spelling of a nullable field,
`type: [string, 'null']`, and generates `string | null` — `Denial.ruleId` is
correct. It does not read the 3.0 spelling, `nullable: true`, and the spec uses
that spelling in **13** places, counted on 2026-09-13. Each is generated as a
plain type: `ArmPerformance.acceptanceRate` is `number`, though the spec says it
is null when nothing was measured and the API sends null.

So the DTO tells a screen a value is always there when it is not, and TypeScript
cannot make that screen handle the null. The console copes by convention —
`?? null`, a comparison against `null` the type says cannot succeed — and nothing
fails when a new screen forgets. Found on 2026-09-13 while typing the policy
funnel's test fixture: its schemas were first written with `nullable: true`,
generated `asked: boolean`, and now use the 3.1 spelling.

**Done when:** the generator reads both spellings, or the spec uses one and a
check refuses the other, and a check fails if a nullable spec field is generated
non-null.

### G-107 — Where candidates fall out of decisions is a proposed operation, served only by the development API

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** [W-076](BACKLOG.md)

A decisioning architect's first question of a targeting setup is where
candidates fall out, across all decisions rather than in one trace. Nothing in
the spec answered it: `getPerformance` counts decisions after they are made, and
`PerformanceReport.suppressed` is one integer with no stage or rule behind it.

`getPolicyFunnel` (`GET /policy-funnel/{tenantId}`) is added to
`docs/metis-api.openapi.yaml` as `x-metis-status: proposed`. The arithmetic is
real platform code — `buildPolicyFunnel` in `packages/ledger/src/policy-funnel.ts`
— but the only thing that serves it is the console's development API
(`apps/console/app/api/[...path]/route.ts`), from the seeded corpus and the
ledger. No plane does.

**How it is served there, and why.** The 10,400 seeded decisions are rows in the
committed decision index, not ledger entries, and re-executing all of them to
read their removals took 5.5 seconds on 2026-09-13. So the index gained a
`removals` column — each removal as a reason-code index and a rule-id index into
a sorted `ruleIds` table — which took the file from 1.5 MB to 2.4 MB.
`apps/console/tests/unit/decision-index.test.ts` holds the column equal to the
generator. Decisions made through the API are read from the ledger, whose
records carry their eliminations whole.

**Done when:** a plane serves `getPolicyFunnel` from the ledger, the operation is
no longer proposed, and `contract.spec.ts` covers it.

### G-105 — A connection reset fails a test against a harness-owned server with nothing competing

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — the mechanism is unknown

[G-035](gaps.md) closed with one failure it could not account for: an
`ECONNRESET` on a teardown POST, seen on a *reused* server, "not reproduced
since", and "whether it survives a harness-owned server is unknown". It does.

**The observation, 2026-09-13.** A full `npm run gates` on the sentence-case
slice (`fix/sentence-case`, a class-name change touching no route, mock or
harness file) went red at end-to-end: 393 passed, 34 skipped, 1 failed.
`traffic.spec.ts` › *does not record reads of itself* failed in its
`beforeEach`:

```
Error: apiRequestContext.post: read ECONNRESET
  → POST http://localhost:3200/api/inbound-calls/clear
```

The server was the harness's own, on port 3200, started for that run. Nothing
was listening on port 3000 or 3200 before the run started, so this is not the
reused-server fault G-035 fixed, and not the competing server of
[G-104](gaps.md).

**What was tried.** `traffic.spec.ts` run in isolation, once, with
`--repeat-each 3` on a fresh harness-owned server: 22 passed, none failed. That
is one isolated run, not three. It did not reproduce.

**What is not known.** The mechanism. Nothing here establishes whether the
server closed the connection, the client reused one the server had already
closed, or something else did; no guess is recorded because none has evidence
behind it.

**Done when:** the reset is reproduced on demand, or a sustained repeat run on a
harness-owned server is recorded as not producing it, and either way the cause
is stated with the evidence that shows it.

### G-104 — Nothing stops a long-lived dev server competing with the suite's own server

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — the unfixed half of [G-035](gaps.md)

[G-035](gaps.md) was resolved by making the e2e harness start its own server on
port 3200 and never reuse one. That stops the suite *measuring* a stale server.
It does not stop one *competing* with the suite for the same machine, and G-035
says so in its own text: "A machine doing other work while the suite runs… no
harness setting prevents that." Until now that sentence had one observation
behind it, from 2026-09-12. It now has two more.

**The observations, 2026-09-13, on the prose slice (a docs-and-copy change).**
A `next dev` process had been on port 3000 since 08:18, serving the browser the
slice's screenshots came from. Two consecutive `npm run gates` runs on a fresh
harness-owned server each went red on one e2e test, and on different tests:

| Run | e2e | Failure |
|---|---|---|
| 1 | 393 passed, 34 skipped, 1 failed, 14.1 min | `accessibility.spec.ts` — axe reported the decision trace had no `<title>`. The title is Next `metadata` in `app/layout.tsx`, which the slice does not touch. The test passed 3 of 3 alone on a fresh server. **Not competition: see the correction below.** |
| 2 | 393 passed, 34 skipped, 1 failed, 17.0 min | `outcome-loop.spec.ts` @screen-only — the snapshot shows `/performance` still on "Joining outcomes to decisions…" when the 10-second wait ran out. The sentence it waited for is not in the diff. |

Both are timing assertions, not content assertions. Neither test is registered
as a flake. The second run was three minutes slower than the first.

**What this does not establish.** Causation. Process sampling taken after run
two showed the port-3000 server at 181 CPU-seconds since 08:18, which is not
heavy, and it had exited on its own by the time it was to be stopped before
the third run. A third run started with no other node process on the machine went green on all 23 gates (e2e 394 passed, 34 skipped, 0 failed, 16.3 min). That is consistent with competition and does not prove it: one green run after two red ones is also what an intermittent fault looks like.

**Correction, 2026-09-14: run 1's failure was not competition, and this entry
was wrong to count it.** The same `document-title` failure went red on CI
runners with nothing else on them — main's flake-hunt at `cd13e8e`, on the
decision trace and on the offer catalogue, and a pull request's shard at
`b74cc59` — and repeated on retry within each run. A competing server cannot
explain a clean runner or a retry that fails the same way. The cause was in
the product: the title lived in Next's per-route head, which the client router
remounts on every navigation, and every client-side navigation removed it for
14–37ms, measured ten times of ten. It is
registered, with the evidence and the fix, as [G-130](gaps.md). What remains
here is run 2 and the 2026-09-12 observation; the case for competition is
weaker by one of its three observations, and nothing here should be extended
with another failure until that failure's own cause has been looked for.

**Done when:** a gates run refuses to start, or warns loudly, when another
console server is listening on the machine, or the rule is written down with
the reason and a check holds it. Not a longer timeout: that hides the class
instead of naming it.

### G-103 — Two telco-uk fields are still in the telco-us fixtures, and renaming them moves every chain hash

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — a fixture change with a corpus regeneration behind it

The 2026-09-13 prose pass swept rendered text for facts left over from the
`telco-uk` tenant and fixed the ones that were prose: a placement help string
counting "four of this tenant's five channels" on a three-channel tenant, and
"Roaming pass" in the experiment form's placeholders. Two remain, and both are
data rather than prose:

- `customer.usage.roaming_days` in `apps/console/mocks/fixtures/profile-schema.ts`,
  rendered on `/data-model` as "Days roaming in the last period." and generated
  into requests by `apps/console/mocks/gateway.ts`. This tenant sells no mobile
  plan.
- The order-book connector's `billing.rollingSpendPence` path in
  `apps/console/mocks/fixtures/catalogue.ts`, rendered on `/integrations`, on a
  tenant that bills in dollars.

**Not fixed with the prose, on purpose.** Both reach the corpus requests and
`docs/conformance/service-bundle.json`, and this register already records that
one field falling out of the generated requests diverged all 60 conformance
cases on chain hash while agreeing on every winner. A rename is a fixture change
followed by regenerating the corpora and the service bundle, and that diff
should be reviewable on its own rather than inside a copy edit.

**Done when:** neither field is in the fixtures under a telco-uk name, the
corpora and bundle are regenerated in the same commit, and conformance is green.

### G-101 — The agent activity feed and the audit log disagree about what agents did

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — one decision about which is the record

The Overview puts two panels above the loop because they are the product's
thesis: what agents proposed, and what agents did. For `telco-us` the second is
empty, and the audit log beside it is not.

- `store.activity`, seeded from `agentActivity` in
  `apps/console/mocks/fixtures/catalogue.ts`, is **empty on purpose**: the entries
  it held were proposals about products this tenant does not sell, and they were
  removed rather than repointed at the new catalogue.
- `auditEvents` in `apps/console/mocks/fixtures/governance.ts` holds **three
  agent actions** — a copy change by `agent-copywriter-01`, a boost change by
  `agent-optimiser-01`, and an automatic revert after a bias gate — which were
  repointed at the new catalogue during the G-099 sweep.

So one screen says no agent has acted on this tenant and another lists three
times one did. Neither is wrong about its own source; the two sources are two
records of the same kind of fact, maintained separately, and nothing checks that
they agree. The Overview's empty state says so rather than claiming no agent
acted, and links to the audit log.

**What it needs is a decision, not a fixture edit.** Either the activity feed is
derived from the audit log (an agent-actor event *is* agent activity, and a
second store of it is a second thing to keep in step), or the feed is its own
record and every agent write lands in both, with a check that they match.
Seeding three feed entries to mirror the audit log would make this screen look
consistent without making the two records one.

**Done when:** an agent action cannot appear in one of the two and not the other.

### G-100 — A date reads in the viewer's time zone, and the tenant has none

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — one decision about whose clock a timestamp is on

G-092 gave the tenant a locale, which settles *how* a date is written. It does not
settle *which* date: every formatter still converts an instant to the time zone of
the machine the browser runs on. A decision made at 23:30 in New York is the next
day to a compliance officer reading its trace in London, and the same screen
shows the two of them different dates for one record.

On most screens that is a presentation choice. On a trace it is evidence: "the
customer was contacted on the 5th" should not depend on who is reading.

The options are a time zone on the tenant that every formatter reads, UTC with
the zone stated on every evidence surface, or the viewer's zone stated beside the
value. Which one a trace wants is plausibly different from what a marketing chart
wants, so this needs a decision before a change.

**Done when:** a timestamp names the zone it is in, and the zone is a decision
rather than the reader's machine.

### G-099 — The rename pass reads code, and a tenant lives in prose

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — one check to write

Renaming `telco-uk` to `telco-us` moved every hashed chain and every id the
type system covers, and `tests/vocabulary.test.ts` scans source for the words
the platform was renamed away from. Neither touches the two places a tenant
actually shows itself to a customer: **fixture strings that are not ids, and
prose.** What survived the rename, all of it found by hand on 2026-09-12, after
the tenant had been declared done:

- **Thirteen dead catalogue ids in `apps/console/mocks/fixtures/governance.ts`**
  — four change sets and nine audit events naming `prop_data_boost_10gb`,
  `pol_heavy_user`, `iss_retention`, `trt_roam_push`, `grp_accessories` and
  more. The approvals screen renders `targetScope.targetId` verbatim, so a
  reviewer opening `cr_0042` read a mono-spaced id belonging to a catalogue
  that no longer existed. `prop_` and `trt_` are also the *pre-2026-09-05*
  vocabulary, which the vocabulary check does not catch inside a string.
- **A UK regulator on a US tenant, twice more** — "fails the FCA fair-value
  test" in a change set's rejection reason, and "Retention offers carry FCA
  fair-value obligations" in an autonomy rationale. Both render on screen.
- **Ninety instances of the British spelling `fibre`**, including the boost id
  `lev_fibre_first`, the experiment id `exp_fibre_holdout`, and customer-facing
  creative copy: *"Full fibre is available at your address"*, shown in the
  storefront to a US household by a company that writes Fios and fiber.
- **`unit: 'pence'` on four money fields** in the profile schema, and four
  `projectedMarginDelta` figures denominated in `£`.
- **`customer.postcode_deprivation_decile`** in the agent guardrails'
  protected-attribute list — a UK census measure standing in for the bias proxy
  a US tenant would name.
- **Two policy ids in schema prose** (`pol_credit_pass`, `pol_afford_retention`)
  claiming a rule reads a field, where no such rule exists any more.

None of this broke a test, with one exception: the change-set approval e2e
failed because `cr_0042`'s diff named a policy that was gone. Everything else
was invisible to every check in the repository and visible to anyone reading
the screen.

**The class:** a check that verifies ids against the catalogue would have found
the first and last groups in a second, and it is about fifteen lines — every
`'(off|pol|cpol|lev|grp|iss|crt|conn|plc)_[a-z0-9_]+'` literal in
`apps/console/mocks/fixtures/*.ts` must be an id the catalogue declares, with an
allow-list for the deliberate historical ones (`off_legacy_dsl`, an offer
retired before this catalogue existed). That check is worth writing. The prose
groups — a regulator's name, a spelling, a currency word — are not mechanically
checkable against anything, and pretending otherwise would produce a
word-blacklist that goes stale the way the mockups' note did (G-097).

[G-092](gaps.md) is the same fault one layer down — `en-GB` and `GBP`
hardcoded in 77 formatting sites — and it was found the same way, by reading a
screen rather than by a check. Together they are the honest answer to "is this
tenant American": the ids are, the hashes are, and the words were not.

**Done when:** the id check exists and runs in `npm run gates`; and the register
says plainly that the prose half is a reading problem, not a tooling one.

### G-098 — The service corpus agrees with the console's own endpoint only by coincidence

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none

`docs/conformance/service-cases.json` holds 60 requests and the chain hash each
must produce, and `contract.spec.ts` replays every one of them through
`POST /api/decisions` — the console's own endpoint — to prove the two engines
agree on the product's own data. The corpus is built by running the engine
directly (`scripts/build-service-bundle.mjs`), and the endpoint does something
the builder does not: it **resolves the flow's connectors first**, and any field
the caller did not supply enters the hashed input from the connector.

So the two agree if and only if every field the flow's connectors provide is
already in the corpus request. Nothing states that condition and nothing checks
it. On 2026-09-12 one field fell out of the generated requests —
`customer.usage.roaming_days`, which no policy reads — and **all 60 cases
diverged on chain hash while agreeing on all 60 winners**. The failure names the
winner on both sides, so it reads as "everything is broken" when the cause is
one unread field, and the winner agreeing is the clue that it is an input
difference rather than a logic one.

It was fixed by dropping the field from `conn_network_usage`: the tenant sells
no mobile plan and no rule read it. That closes the instance and not the
mechanism. The next connector field somebody adds without adding it to
`buildRequest` reproduces this exactly.

**Two ways out, either acceptable:** the corpus builder could resolve connectors
the way the route does, so the cases are what a caller would actually send; or a
check could assert the condition directly — every field the flow's source node's
connectors provide appears in every corpus request. The second is smaller and
says the thing out loud.

**Done when:** the coupling is either removed or asserted, and the failure
message distinguishes "the input differed" from "the engines disagree".

### G-096 — No fixture exercises the console's "something is wrong" states any more

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — **queued in [JOURNEY_SPINES.md](JOURNEY_SPINES.md) for after the Verizon demo lands**, by the product owner on 2026-09-12

The console has a set of warning states, each with a screen built for it: an
active offer with no content at all, a creative written but switched off, an
offer that cannot reach a customer on any channel it serves. Until 2026-09-12
the `telco-uk` tenant carried examples of every one, deliberately — 240
generated offers, roughly one in nine with no creative, some paused, some
switched off — so the populated view of each warning was exercised by the suite
without anybody arranging it.

`telco-us` carries the five offers the customer's brief names. **Every one is
active, every one has content, and every one is deliverable**, which is the
honest state of that tenant and is the state the product owner asked for. The
consequence is that four checks lost their subject at once:

| Check | Asserted | Now |
|---|---|---|
| `fixtures.test.ts` → an active offer with no deliverable creative | at least one exists | inverted: none does |
| `creatives.spec.ts` → separates written from delivering | some row shows "off" | the switched-off lens is empty |
| `offers-drawer.spec.ts` → the summary is the filter | "Cannot be delivered" counts more than zero | zero |
| `offers-drawer.spec.ts` → an undeliverable offer says what will happen | the drawer explains `NO_DELIVERABLE_CREATIVE` | no such offer to open |

Each was rewritten to assert what is true and to say what it no longer covers,
which is the honest local move and leaves the same hole four times over. **The
screens still have the code; nothing now proves it renders.**

Three more lost their subject in the e2e suite on the same day, and these are
**skipped rather than rewritten**, because there was nothing true left to assert
— a green check over an unexercised screen is worse than a visible skip. Each
names this entry in its skip reason:

| Check | Needs |
|---|---|
| `seeded-tenant.spec.ts` → an offer held for bias review is findable and says why | an offer tagged `bias-review`, paused, with a stated reason |
| `creative-coverage.spec.ts` → an offer with nothing on any served channel says so in every column | an active offer with no creative at all |
| `creative-coverage.spec.ts` → (the counting check beside it) | kept, rewritten to assert the count-to-rows contract on whichever lens is non-empty |

So this slice owns un-skipping three tests as well as restoring four.

**Why the obvious fix is wrong.** Adding a broken offer to this tenant would be
inventing catalogue content — a product nobody sells, with no creative nobody
wrote — in a catalogue whose whole point is that it contains exactly what the
customer named. That is the filler rule, and it applies to data that exists to
make a test pass as much as to data that exists to make a screen look full.

**What it wants instead.** A fixture whose subject is the warning states rather
than a tenant: a small catalogue, built in the test, carrying one offer of each
broken kind, mounted where the component tests can render against it. The
G-071 guard was rebuilt this way on 2026-09-12 — it had rested on
`retention-outbound` happening to be broken, and now constructs its own case —
and that is the shape this needs.

**Done when:** each warning state is exercised by a fixture that exists for it,
and a tenant being healthy no longer removes the proof that the console can
describe an unhealthy one.

### G-095 — The check that decides whether other checks are trustworthy is itself unchecked

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — a harness, and it is its own piece of work

`global-setup.ts` refuses the suite when the dev server's seed differs from the
fixtures on disk ([G-002](gaps.md)). That refusal is the control on Rule 9:
without it, a bite-proof can be taken against a server that never saw the edit.

**Nothing automated exercises the refusal.** `seed-fingerprint.test.ts` covers
the comparison — `fingerprintDiff` against hand-built inputs, the part list, and
that the fingerprint is captured rather than recomputed — but the path that
*acts* on a mismatch has no test. It runs before the suite, in Playwright's
setup process, so a spec cannot assert it: asserting it from inside the suite
would need the very dev server whose trustworthiness is the question.

**It was proved by hand on 2026-09-12**, and that proof is worth reading because
the fix was wrong twice in ways that looked right:

1. The endpoint computed the fingerprint per request from the fixture modules.
   Next re-evaluates an edited `catalogue.ts`, so the endpoint reported the new
   hash while decisions still used the old boost — disk compared to disk, and
   the guard could never fire.
2. A module-scope constant in `store.ts`. The store is stashed on `globalThis`
   and survives hot reload, so the module re-ran, kept the old store, and
   recomputed the constant from the new fixtures. Measured: decisions on a boost
   of 1.07 while the file said 1.05 and the fingerprint agreed with the file.

Only a field on the stashed store object goes stale with the thing it
describes. **Neither wrong version would have failed visibly** — both would have
reported "server matches disk" for ever.

**A hand-proof is not a check.** It was done once, by someone who already
suspected the answer, and it leaves nothing that will notice if a later change
quietly reintroduces either mistake — a refactor moving the fingerprint back to
module scope, say, or an endpoint recomputing it for convenience. That is the
same class of hole the thing it guards exists to close.

**Half of it closed on 2026-09-13, by [G-035](gaps.md).** The decision —
whether to refuse, and what the refusal names — is now `serverRefusal` in
`apps/console/tests/server-trust.ts`, a pure function asserted by
`apps/console/tests/unit/server-trust.test.ts`: a missing or foreign run token,
a server that does not report its seed, and a stale seed each refuse, and the
stale-seed message names the part that moved. A refactor that stops any of them
refusing now fails that file.

**What remains is the wiring, which is where both wrong versions above were.**
Nothing checks that `global-setup.ts` still calls the function and throws what
it returns, or that the store's fingerprint still goes stale with the seed
instead of being recomputed from the modules. The harness now starts a fresh
server every run, so a stale seed cannot arise from reuse; it can still arise
from a fixture edited while that server is starting.

**What it would take.** A harness that boots a dev server on a spare port,
records its fingerprint, edits a fixture file on disk, invokes `globalSetup`
against that server and asserts it throws with the changed part named — then
restores the file and asserts it stops throwing. That is a test with a server
lifecycle, a file mutation and a cleanup path that has to survive a failure
mid-way, which is why it is named here rather than bolted onto the slice that
found it.

**Done when:** a check fails if the refusal stops refusing — true of the
decision since 2026-09-13, still not of the wiring or of the fingerprint's
staleness.

### G-093 — A class of contract gap: three responses that cannot be interpreted without reading another endpoint

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — a contract principle to adopt, then three instances to close against it

Three separate findings in two days turned out to be one fault. Naming the
class, because fixing them one at a time has already produced one fix that
needed a second reach into a different endpoint to work.

| Instance | The response says | To interpret it you must |
|---|---|---|
| [G-087](gaps.md) | a `chainHash`, and the input snapshot it covers | fetch the artifact, or the stored runtime record, for the catalogue snapshot the same hash covers — two of three served, so the hash could not be checked |
| [G-088](gaps.md) | a trace, in one of two envelopes | know **which service answered**, because the console serves a flat projection and the JVM service serves the canonical bytes at the same path |
| [G-092](gaps.md) | `valueMinor`, an integer | fetch `/taxonomy` and read an offer's currency, because the performance response carries no currency at all |

**The principle each one breaks.** A response should be interpretable from
itself. A number without its unit, a hash without its inputs, and a body whose
shape depends on which implementation answered are all the same defect: the
caller is handed something it cannot read without a second, undeclared request
to somewhere else. The second request is undeclared because nothing in the
contract says it is needed — which is why all three survived review and were
each found by someone rendering a screen.

**Why it reads as a UI problem and is not.** Every one of the three surfaced as
a rendering bug. An empty panel, a pound sign on a US tenant, a blank
`candidates` row. So each was fixed in the component that noticed — and the
`/performance` currency fix is the proof of how far that gets you: it now
reaches into the tenant's catalogue to learn what unit its own numbers are in.
That is a workaround wearing the clothes of a fix. The next consumer of that
endpoint — the Kotlin service, a customer's own dashboard, an export — has to
invent the same reach independently, and nothing makes them agree.

**What the class predicts.** Anywhere the platform returns a bare scalar that
needs a unit, a digest that needs its inputs, or a body assembled differently
by two implementations. Three worth checking against it rather than waiting to
trip over: `Money` is declared in the spec with a required `currency` and the
performance report returns minor units outside it; `POST /decisions` and the
JVM service's `POST /api/decisions` return different envelopes for the same
operation, which is [G-088](gaps.md) a second time on a second route; and every
`*Hash` the API serves should be checkable from the same response or say what
else is needed.

**Done when:** the contract states that a response carries what is needed to
interpret it — units beside amounts, inputs beside digests, one envelope per
operation — `validate-spec.mjs` can check the mechanical half of that, and the
three instances above are closed against the rule rather than one at a time.

### G-091 — A frequency cap counts contacts and cannot ask what the customer did with them

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — a modelling decision about what a cap may read

The brief's suppression slide names an **over-exposure cap**: *"Impressions ≥ 5
in 7 days with no click → pause the action 14 days, per channel."* It cannot be
expressed.

`FrequencyPolicy` is `{ channel, maxContacts, period, cooldownDaysAfterReject,
scope }`. The engine compares `withinPeriod[period]` — a count the caller
supplies — against `maxContacts`. Three things are missing at once:

- **A count per offer.** `withinPeriod` is a total per period across everything
  the policy's scope covers, so "this action was shown five times" cannot be
  distinguished from "five actions were each shown once".
- **A condition on the outcome.** *With no click* is the whole point of the
  rule: five impressions that were clicked is engagement, and five that were
  ignored is fatigue. Nothing in a frequency policy can read an outcome, and the
  request has no field carrying one.
- **A pause length distinct from the cap's period.** `cooldownDaysAfterReject`
  is the rest after a *decline*, which is a different event; there is no second
  window for a rest after indifference.

**This is the same boundary [G-086](gaps.md) found and did not cross.** A
decline reaches the engine because the caller states it on the request, and a
rest period runs from it. An *impression without a click* is not a statement
the caller makes — it is an absence, computed over the interaction log, which
is exactly the thing decisions here never read.

So the honest options are a field on the request that states the fatigue the
caller has already computed, matching how caps and declines already work, or
outcome-conditioned suppression inside the platform, which is a much larger
change and the neighbourhood [G-044](gaps.md) describes. Either is a decision
about what a cap is allowed to know.

**Done when:** a rule of the form "shown N times, never acted on, therefore
rest" can be authored and shown to fire, or the brief's row is agreed as out of
scope and the contact-policy screen says which of the customer's six rules this
platform implements.

### G-090 — Two of the five channels the customer asked for do not exist, so a third of their content cannot be authored

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — a channel is a platform capability, not a fixture

The brief names **fifteen pieces of per-channel content across five channels**:
web tile, app card, agent script, email and SMS. `Channel` is
`email | sms | web | push | outbound_call`.

| The brief's channel | Ours | Creatives authored |
|---|---|---|
| Web tile | `web` | 5 of 5 |
| Email | `email` | 4 of 4 |
| SMS | `sms` | 1 of 1 |
| **App card** | — | **0 of 3** |
| **Agent script** | — | **0 of 2** |

**Push is not an app card.** A push notification is something the platform sends
to a device; an app card is an inbound slot the customer is looking at inside
the app, decided when they open it. Authoring three app cards as push creatives
would put content in a channel that delivers it differently, counts it
differently and is refused differently — and the creative-coverage screen would
then report full coverage of a channel the tenant does not serve.

**Agent script is the larger absence**, because it is not only a channel. The
brief's inbound list is *"Web (MVO site), Mobile App, Agent Desktop, IVR /
Chatbot"*, and its channel logic row reads *"agent-assisted actions restricted
to trained queues"* — an agent desktop needs a channel, a creative shape for
talking points, and a notion of queue eligibility. `OutboundCallContent` has
`script` and `objectionHandling`, which is the closest shape in the domain, but
it is an *outbound* channel: the call is something this platform initiates, not
a conversation it joins. [G-044](gaps.md) is the neighbouring gap on
outbound-call content.

Five of the brief's fifteen are therefore absent from the catalogue
rather than approximated. The demo runs on inbound web, so nothing in the three
scenarios needs them — but a customer reading the creative list will count
ten where their own deck says fifteen, and this is the answer.

**Done when:** `app` and `agent_desktop` are channels with creative shapes and
delivery semantics of their own, or the brief's matrix is agreed down to the
three channels that exist.

### G-089 — Five offers carry no price, because the brief carries none

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — waiting on figures from the customer

Every offer in the `telco-us` catalogue has `price: usd(0)` and `cost: usd(0)`.
**Every screen that renders money shows $0.00 for all five**, and that is a
blank rather than a defect.

The customer's brief names five offers, two categories, a business value per
offer and a per-offer multiplier. **It names no prices at all.** So there were three
ways to fill `financials`, and two of them were worse:

- **Invent plausible figures.** A US carrier's gigabit fibre is "about ninety
  dollars a month" to anyone who has seen an advertisement, and a number sourced
  that way is presented on screen as a financial fact about a real product. It
  would survive into a pitch deck and nobody would know which figures came from
  the customer and which came from here.
- **Use the previous tenant's.** Sterling prices for UK mobile plans, attached
  to US broadband products. Worse, because it looks deliberate.
- **Leave them blank.** Visibly unset, wrong to nobody, and answerable in one
  sentence when somebody asks.

**`expectedMargin` is not blank**, because arbitration reads it: `V =
expectedMargin / 60000`. It carries the brief's own **business value** — 100,
100, 100, 80, 70 — in cents. Ranking depends on the ratio between those
numbers, so the order the demo produces is the order the brief describes, and
every value traces to a row in the deck. It is the brief's number in the brief's
own units, which is why it can be shown without inventing anything.

**Done when:** the customer supplies pricing, or the demo is shown without the
money columns and somebody decides that is permanent.

### G-088 — Two services answer the same operation with different envelopes, and only one of them can be checked

**Registered:** 2026-09-12 · **Status:** Open · **Work item:** none — an architecture decision, not a defect

`GET /decisions/{id}/trace` has two implementations, and they do not agree about
what a trace is.

| | Envelope | Verifiable against its own `chainHash` |
|---|---|---|
| Console API | the flat `DecisionRecord` the spec declares | **no** |
| JVM service | `{ id, decision, chainHash }`, where `decision` is the canonical bytes | **yes** |

`DecisionService.traceJson` writes the decision as
`Canonical.canonicalise(Canon.decision(...))` — literally the bytes that were
hashed — and `ServiceConformanceTest` has a case named *"the response body is
the bytes that were hashed"*. A caller can recompute sha256 over that object and
confirm the `chainHash` beside it. **That is not a stylistic difference; it is
the difference between a trace you can verify and a trace you must trust.**

The console's flat record is a projection. It is easier for screens — every
console page reads it, and returning the runtime shape there once broke every
live decision until 2026-09-09 — but no amount of adding fields to it makes it
re-hashable, because the hash is over a differently shaped object.

So the platform currently tells a caller two different things depending on which
implementation answers, and the spec declares only one of them. Whichever way
this resolves, one of the two is out of contract today.

**The decision this needs.** Does the platform's trace endpoint serve something
a third party can verify, or something a screen can render easily? The product's
central claim is that the trace is the hero and a decision can be proved after
the fact, which argues for the verifiable envelope — perhaps both, as
`{ decision, chainHash }` alongside the flat projection, so screens keep their
convenience and auditors keep their arithmetic. That is a contract change with
an ADR behind it, not a patch.

**Found while fixing [G-087](gaps.md)**, which is the shallower half of the same
confusion: the storefront panel was reading the JVM service's envelope from the
console's API. It was not wrong about the shape existing — only about which
service it was talking to.

### G-080 — The capability map's "configurable without code" answers a proxy, and the question it names is answered no

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** none — a correction to `docs/CAPABILITIES.md` and a missing check; the product half is ADR-006 §2, which nothing implements

**Five rows claim it, and they are the only five.** Of the 312 capability rows in
`docs/CAPABILITIES.md` that carry the *Config?* column, five answer YES:
objective and category as authorable levels (line 139), placement as a
configured object (171), the creative form (219), the offer form (220), and the
form descriptor registry itself (425). All five rest on one mechanism, the
descriptor registry.

**The column's definition tests something other than its name.** The legend,
under *The two columns E3 added*, reads: *"**Config?** — configurable without
code | `YES` only if adding a field or changing a rule needs no change under
`apps/console/`."* The five rows pass that test: descriptors live in
`packages/ui-metadata`, outside `apps/console/`. The question the column is
named for — configurable *without code* — and the one `CLAUDE.md` Rule 8 tells
every screen to ask — *"could a customer add a field to this without a vendor
ticket?"* — are answered **no**, three times over:

1. **A descriptor is code, compiled into the console.** The registry is
   TypeScript under `packages/ui-metadata/src/registry/`, imported at build time
   (`apps/console/components/entity-form-dialog.tsx:11`). Changing one is a
   commit and a deploy. ADR-006 §2 says schemas *"are served through the API"*;
   the OpenAPI spec has no descriptor operation at all.
2. **An entity cannot gain a field without the vendor.** The drift check refuses
   a descriptor field that the OpenAPI schema lacks
   (`packages/ui-metadata/tests/descriptors.test.ts:90`), and Offer, Placement,
   Objective and Category have no open field for a tenant to use; Creative's
   only open object is its channel-shaped `content`. Adding a field to an offer
   is an OpenAPI change, a server and store change and a descriptor change —
   three vendor changes, then a deploy.
3. **Nothing a tenant holds is read.** There is no stored descriptor and no
   per-tenant override, so there is nowhere a customer's change could go.

**What is true instead is real, and is a different claim.** The registry moved
forms out of hand-written React into declared data drawn by one renderer, and
the vendor's cost of adding a field fell. That is "declared, not hand-built" —
the words rows 219 and 220 already use — and it earns a row. It is not
"configurable without code".

**Why this is the more serious of the two findings from ADR-015's survey.** It
is a status claim, in the one document Rule 7 says makes status claims, on the
axis Spine 6 calls the differentiator. The true figure is **0 of 312**, not 5:
`docs/JOURNEY_SPINES.md` held these rows up as the exception to *"311 of 314
capability rows"* answering NO. And the definition as written invites the
column to be satisfied by moving code from `apps/console/` into a package, which
changes where the code is and not whether a customer needs a vendor.

**The check that would catch the difference**, in two halves:

- **Behavioural — a YES is earned by a check that makes the change the way a
  customer would.** Against a running console and API, with no rebuild: add a
  field to one tenant's entity through a served operation, open the create
  form, see the field, save a value, read it back through the API — and assert
  that no file in the repository changed. Nothing in the product can pass this
  today, which is the point: it fails until ADR-006 §2 is built and at least one
  entity has a field a tenant can extend.
- **Documentary — the column cannot say YES without that check.** Extend
  `tests/docs-status.test.ts`, which already refuses completion words outside
  the map, so that a row whose *Config?* cell is YES must cite a test file
  carrying a marker such as `@no-vendor-ticket`. This is the same shape as
  `tests/gaps-register.test.ts` requiring a DONE work item to cite a check that
  exists on disk. The marker is the reviewable promise that the test performs
  the behavioural check above; a row citing only `descriptors.test.ts`, which
  changes nothing at runtime, fails.

And the legend should ask the question it is named for: *YES only if a customer
can add a field or change a rule with no commit, no deploy and no vendor
ticket.*

**Done when:** the five rows answer NO, with the reason; the legend names the
real question; and the documentary check exists and has been seen to fail on a
YES row that cites no marked check. Building the capability itself — descriptors
served per tenant, and an entity a tenant can extend — is ADR-006 §2, and needs a
work item of its own.

### G-079 — A pull request can sit with no checks at all, and nothing says so

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** none — the platform is GitHub's; the mitigation is a habit

GitHub created **no check suite at all** for PR #23's head commit on two
separate occasions:

- **On open.** `2486223` sat for over thirty minutes with zero check runs and
  zero check suites. Closing and reopening the pull request, which normally
  re-fires `pull_request`, produced nothing either.
- **On a later push.** `f10ca61` behaved the same way.

Both times Actions itself was healthy: other lanes' pull requests ran normally
forty minutes earlier, `GET /actions/permissions` returned enabled, and the
workflow was `active`. Two other pushes on the same branch triggered normally,
so it is intermittent rather than a configuration fault — the event simply
never arrived.

**The diagnostic is `workflow_dispatch`.** Dispatching `console.yml` on the
branch created a run immediately, both times. That separates the two
explanations cleanly:

- **A dispatch also fails** → Actions is down, or the workflow is disabled, and
  no amount of pushing will help.
- **A dispatch works** → the workflow and the runners are fine and the
  `pull_request` event was lost; push again, or dispatch and rely on the check
  runs it writes against the same head SHA.

**Why it matters more than it looks.** A pull request with no checks does not
look failed — it looks like it is waiting. The ruleset refuses the merge, which
is the safe direction, but nothing distinguishes *"CI has not started"* from
*"CI is slow"*, and the only reason this was noticed twice is that somebody was
watching for named checks rather than for a green tick. A session that waited
politely would still be waiting.

**Done when:** something notices that a head commit has no check suite N minutes
after it was pushed and says so — or the process says to dispatch after a fixed
wait, and the wait is written down.

### G-001 — Project references do not build

**Registered:** 2026-09-04 · **Status:** Open · **Work item:** [W-001](BACKLOG.md)

The original cause is gone: `packages/compiler/src/compile.ts` was deleted with the rest of the Phase 0 tree. `tsc --build` still fails, on two causes that were hidden underneath it — the per-package tsconfigs have no `@metis/core/domain` path mapping (only `packages/registry`'s does), and `bench/harness` declares a `rootDir` of `bench/harness/src` that its own `@metis/runtime` imports fall outside. Until this is fixed the per-package tsconfigs cannot be used for typechecking, and `bench/*` is checked by nothing.

### G-038 — The catalogue's rules are written twice

**Registered:** 2026-09-09 · **Status:** Open · **Work item:** [W-005](BACKLOG.md)

`packages/catalogue` holds the catalogue's rules — referential integrity,
duplicate keys, the audit trail — in one class, behind a store interface, with
one behaviour suite proving memory and PostgreSQL agree
(`packages/catalogue/tests/suite.ts`). The console does not use it. Every write
in `apps/console/app/api/[...path]/route.ts` reimplements the same rules against
`apps/console/mocks/store.ts`.

They agree today because each one was written by reading the other. Nothing
holds them together: `Catalogue.putCategory` refuses `UNKNOWN_OBJECTIVE` and the
`categories` POST refuses the same thing in its own words, and a rule added to
one is not added to the other. This was already true of offers and creatives;
authoring the taxonomy on 2026-09-09 made it true of two more entities, which is
the reason to register it rather than keep noticing it.

**Done when:** the console's write path calls `packages/catalogue`, or the
duplication is deliberate and the behaviour suite runs against both.

### G-039 — Two conformance rules read prose and cannot tell it from code

**Registered:** 2026-09-09 · **Status:** Open · **Work item:** none

`checkMockBanner` in `scripts/conformance.mjs` decides a screen is unwired if
its source matches `/\b(mock|fixture|sampleData|stubData|placeholderData)\b/`
and shows no banner. It reads the whole file, comments included. On 2026-09-09
`apps/console/app/objectives/page.tsx` failed it for a doc comment explaining
that the taxonomy *used* to be authored in a seed file — a page that reads
every one of its four data sets through the generated client. The comment was
reworded to get past the rule, which is the wrong direction of causation and
the reason this is registered rather than forgotten.

`checkStatusHonesty` has the same shape and one of its two current failures is
the same false positive: `docs/gaps.md` is flagged for quoting the deleted
`PHASES_SUMMARY.md` in order to explain why it was deleted, and has been since
`7330292`. `tests/docs-status.test.ts` solved this problem for its own rule by
checking a **table cell** rather than any occurrence of a word, and its doc
comment says so explicitly.

Two false positives out of 25 failures is not a crisis. The cost is that both
rules train a reader to skim past their output, and a rule nobody reads is a
rule that has stopped working.

**It recurred on 2026-09-10.** `apps/console/app/placements/page.tsx` failed the
same rule for the same reason — a doc comment saying the entity *used* to be
authored in a seed file — and was reworded a second time to get past it. Twice
in two days is the argument for fixing the rule rather than the prose: the next
person will not know they are writing around a check, and the check will be
right about nothing.

**Done when:** both rules ignore comments, or state in their output that they
matched inside one.

### G-040 — Artefact 10 of the slice definition has never been built

**Registered:** 2026-09-09 · **Status:** Open · **Work item:** none

`CLAUDE.md` defines a slice as ten artefacts that must all exist in the same PR,
and the tenth is *"Docs page generated from the typed contract — `docs/api/`"*.
`docs/api/` does not exist. There is no generator, no npm script, and no check.
`CLAUDE.md:56` is the only reference to the path anywhere in the repository.

Every slice this repo has shipped has therefore been nine-tenths of a slice, and
none of them said so — including the one that registered this. The rule directly
above it in the same file reads *"If you cannot finish all ten, make the slice
smaller"*, and no amount of making a slice smaller produces a generator that
does not exist.

The point is not the missing pages. `docs/metis-api.openapi.yaml` is readable
and `scripts/validate-spec.mjs` keeps it honest. The point is that a definition
of done with an item nobody has ever met is a definition of done that everybody
has learned to round off, which is the same failure as a check that is red for a
known reason.

**Done when:** either `npm run generate` writes `docs/api/` from the spec and a
check fails when it is stale, or artefact 10 is removed from `CLAUDE.md` and the
decision to drop it is recorded.
### G-004 — No node, panel or layout manifests — the composable experience

**Registered:** 2026-09-03 · **Status:** Open · **Work item:** [W-038](BACKLOG.md)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNodePackage` | Canvas node renderers | MISSING | Week 3 | Fetch a node package. Must include canvas renderer + inspector schema + trace renderer fragment. Without this, canvas can only draw core 16 nodes. |
| `getPanelManifest` | Panel host security model | MISSING | Week 3 | Fetch panel manifest. Declares slots, data contract (API scopes), permissions, viewport. Used to validate panel capabilities. |
| `getLayoutManifest` | Layout editor / workspaces | MISSING | Week 3 | Fetch a screen layout artifact. Declares regions, slots, panel occupants. Versioned like flows. |
| `publishLayoutManifest` | Admin persona | MISSING | Week 3 | Save a layout. Triggers audit + optional approval. |

**Impact:** Panel extensibility cannot be demo'd without node renderers from packages.

---

### G-005 — Persona surfaces nothing serves

**Registered:** 2026-09-03 · **Status:** Open · **Work item:** [W-029](BACKLOG.md)

#### Data Scientist Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `listModels` | Model registry | MISSING | Week 4 | List all models + versions + champion/challenger state + shadow scoring status. |
| `getModelDetail` | Model detail view | MISSING | Week 4 | Fetch performance over time, drift, predictor importance. For adaptive models, binning + learning curves. |
| `getFeatureCatalog` | Feature catalogue | MISSING | Week 4 | Definitions, TTL, freshness, lineage. Which flows consume each. |
| `checkFeatureParity` | Online/offline parity check | MISSING | Week 4 | Given a feature, compare online (feature store) vs offline (batch compute). Return distribution diff. |

#### Marketer Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getTaxonomy` | Taxonomy browser | MISSING | Week 4 | Objective → Category → Action → Creative tree. Return inherited properties + overrides. |
| `getActionDetail` | Action editor | MISSING | Week 4 | Properties, catalogue membership, effective dating, approval state. |
| `getCreativeLibrary` | Creative library | MISSING | Week 4 | Assets, per-channel variants, channel preview, approval, expiry. |
| `listCampaigns` | Campaign builder + results | MISSING | Week 4 | Campaigns + segments + schedules. Query results by action/creative/channel/segment. |
| `getFrequencyPolicy` | Frequency policy editor | MISSING | Week 4 | Frequency cap matrix. Outcome-conditioned suppression rules. |

#### Operator Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getHealth` | Health dashboard | MISSING | Week 4 | Throughput, p50/p95/p99, error budget. Per tenant + route. |
| `getDegradationEvents` | Degradation events | MISSING | Week 4 | When the degradation ladder was used, why, what was served. |
| `getFeatureStoreHealth` | Feature store health | MISSING | Week 4 | Cache hit rate, hot keys, freshness distribution. |
| `getDeploymentState` | Deployment console | BUILT (registry) | Week 4 | Blue/green + blue/green promotion already exists. Wire to OpenAPI spec. |
| `getPackageDependencies` | Package console | MISSING | Week 4 | Dependency graph for installed packages. Pre-flight change reports for upgrades. |

#### Executive Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getValueMetrics` | Value dashboard | MISSING | Week 4 | Incremental outcome per decision, adoption by team, decisions served. |
| `getCostBreakdown` | Cost transparency | MISSING | Week 4 | Per-decision cost breakdown across compute, models, data, authoring. Trended. |
| `getShadowModeAgreement` | Shadow mode scoreboard | MISSING | Week 4 | Agreement with an incumbent **model**, disagreement analysis, estimated lift. Distinct from flow-version shadow mode, which is BUILT (`setShadow`, `getShadowReport`): that compares two versions of a decision flow, this compares two scoring models. Model shadow scoring belongs to §7 and is out of the Foundation MVP gate. |

**Impact:** Marketer and Operator personas cannot complete primary workflows without these. Executive cannot build the cost transparency story (a key differentiator vs Pega).

---

### G-006 — Edge surfaces — CSR widget and RTC SDK

**Registered:** 2026-09-03 · **Status:** Open · **Work item:** [W-016](BACKLOG.md)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNextBestAction` | CSR widget | MISSING | Week 5 | Given customer context, return top N actions + plain-language reasons. Embeddable contract. |
| `getRTCPlacements` | RTC SDK | MISSING | Week 5 | Real-time container rendering + placement debugger. Requires separate SDK. |

**Impact:** Not in v1 scope. Deferred to Phase U6.

---

### G-007 — Capabilities that were stubs, and are now gaps

**Registered:** 2026-09-05 · **Status:** Open · **Work item:** none

Fourteen packages were deleted. Each was a single file with no tests, imported
by nothing except the other thirteen. They are listed here rather than
forgotten: the capabilities are still wanted, and a gap register that omits
them would be as misleading as the packages were.

The change is one of honesty, not of scope. Nothing that ran stopped running —
the full suite was green before and after, with no source change beyond
deletions.

| Capability | Was | Now |
|---|---|---|
| Package system — registry, dependency resolution, signing | `packages/packages-system` | Not built. §5's composability claim rests on this. |
| Regulatory packs — SOC 2, GDPR, EU AI Act, FCA | `packages/compliance` | Not built. §11 evidence packs depend on it. |
| Panel host and panel SDK — iframe sandbox, manifest, slots | `packages/panel-host`, `packages/panel-sdk` | Not built. Signed-partner-only was the v1 decision; neither half exists. |
| Simulation — what-if, counterfactual, bias gate | `packages/simulation` | Not built. `simulateDecisionFlow` and `getCounterfactual` remain proposed operations. |
| Adaptive models — online learning, binning | `packages/adaptive-models` | Not built. Scoring is a seeded hash with the right determinism property and no predictive content. |
| Theme token system | `packages/themes` | Superseded. The console's own token layer is built and tested across four theme axes. |
| UI primitives | `packages/ui-kit` | Superseded by `apps/console/components/ui`. It was also the only declared owner of `class-variance-authority`, `clsx` and `tailwind-merge`, which the console imports directly — deleting it surfaced three undeclared dependencies. |
| Canvas | `packages/canvas` | Superseded. The console's read-only React Flow canvas is built. |
| i18n | `packages/i18n` | Not built. `messages.json` never existed. |
| Trace format and renderers | `packages/trace`, `packages/trace-ui` | Superseded by `packages/runtime`'s `DecisionRecord` and the console's decision detail page. |
| Shared types | `packages/types` | Superseded by `packages/core/src/domain.ts`. |
| Package authoring SDK | `packages/sdk` | Not built. It re-exported the DIR validator, which is also gone. |
| Approval workflow | `planes/execution/src/approval.ts` | Superseded by `packages/registry` and the console's change-set surface. |
| Authoring plane | `planes/authoring` | Not built. The directory held a `package.json` and nothing else. |

Also deleted, for the same reason:

- The Phase 0 DIR compiler — `compileDir`, `typeCheck`, `resolveVersions`,
  `analyzeCost`, the `metis-compile` CLI, `compile.js`, `dir.schema.json` and
  `metis-package.schema.json`. `compileDecisionFlow` is the only compiler.
- Four committed compiled artifacts — `compiled.json`, `my-flow.json` and
  the two `tests/fixtures/simple-filter*.json` files. Build output does not
  belong in git, and these embedded a node-type vocabulary nothing executes.
- `verify-metis.js`, which counted directories and reported "Packages: 11/11 ✓"
  for packages with no tests, then exited 0 while printing "Some components
  missing".
- `docs/PHASES_SUMMARY.md`, which marked Phases 0–4 "✅ Complete".


---

### G-008 — Integrations resolve, and cannot authenticate

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-051](BACKLOG.md) · **Decision:** [ADR-007](adr/ADR-007-secrets-and-connector-authentication.md), Accepted 2026-09-09

`resolveInputs` has been able to fetch since it was written and had nothing to
fetch with: `IntegrationGateway` was an interface whose only implementations
were test doubles, and nothing on any decision path called it. A comment in
`apps/console/mocks/fixtures/engine.ts` asserted the opposite — "`POST
/api/decisions` runs resolveInputs through a gateway before executing" — which
was not true when it was written. Both are fixed: `HttpIntegrationGateway` does
the I/O, `RecordedIntegrationGateway` serves development, and the console's
endpoint resolves before it executes.

Four gaps remain, and none is worked around in code.

| Gap | Notes |
|---|---|
| **No connector can authenticate** | `Connector` has no credential field and the gateway sends no headers. That is [ADR-007](adr/ADR-007-secrets-and-connector-authentication.md), which is **Proposed**: a secret in connector configuration is a secret in an append-only audit log and in every export made from it, so the shape has to be decided before the field exists. Until then, integrations work against internal and unauthenticated endpoints and fail against a real bureau. |
| **`feature-store` connectors cannot be read** | There is no feature service (W-009). Two of the five fixture connectors declare that kind, and in live mode the gateway names W-009 rather than attempting a `featurestore://` URL that was never going to resolve. |
| **The JVM service does not resolve** | The console does; `engines/kotlin` takes `input` as given. `service-cases.json` carries every field in its requests, so the 60 conformance cases still agree exactly — but the two are not interchangeable for a request that *omits* a connector-supplied field, and the corpus cannot see the difference. Resolution is outside the deterministic core, so this is a plane-level asymmetry rather than an engine divergence; it is recorded here because "either service, same answer" is a claim the project makes. |
| **The console's connector toggle still reaches neither** | Resolution reads `catalogueSnapshot.connectors`, deliberately, so provenance and resolution cannot disagree about whether a connector was active. `/integrations` writes to `store.connectors`, which neither reads. Same root cause as the entry above, and it resolves with W-005's second half rather than separately. |

---

### G-009 — Replay of a live decision needs an input snapshot

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-006](BACKLOG.md) · **Decision:** [ADR-004](adr/ADR-004-retention-and-erasure.md), Accepted 2026-09-09

**Corrected the same day, after attempting it.** The first diagnosis here said
the replay route only looked in the fixture corpus and needed "slightly more
than the same fallback". The fallback is now built — the route reads the ledger
and fetches the artifact from the registry — and it was the smaller half.

A decision record holds `inputSnapshotHash` and **never the values behind it**,
deliberately: a trace can then be kept for as long as an audit needs without
keeping the customer data it was made from. So the platform cannot replay a
decision on its own. `replayDecision` now takes the input from the caller and
answers 422 `input_required` when it is not given, which is an honest refusal
where it used to be a 404.

**The bound that remains.** Integration resolution runs before the engine, so
the hashed snapshot includes the fields the connectors supplied — and those
values are in no store either. A caller who sent every field can replay; a
caller who let the platform resolve any field cannot reconstruct what was
hashed, and gets a `$.inputSnapshotHash` difference. All three cases are
asserted in `ledger.spec.ts`.

So "byte-identical replay" is exactly true of the engine, and true of the
platform only for a decision whose every input the caller still holds.
`CAPABILITIES.md` now says so.

**This is ADR-004's question, not a routing one.** Making replay work in general
means retaining the input snapshot, which means retaining customer data in the
one place the design currently refuses to — and ADR-004 already has the answer:
encrypt it per subject, destroy the key on erasure, and let a replay of an
erased subject fail explicitly rather than return a decision computed from
nulls. Another reason that decision is the highest-leverage one open.

---

### G-010 — A slate is reproducible only alongside its placement

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-028](BACKLOG.md)

`POST /placements/{tenantId}/{key}/decisions` composes a slate from a decision
by ordering what reached arbitration and taking the placement's `slotCount`.
Every part of that is in the decision record except the slot count, because a
`Placement` is deliberately not in the `CatalogueSnapshot` the engine hashes —
it governs delivery, not the decision, and putting it in the hash would mean
changing a slot count moved every chain hash.

The consequence: "why did I see two offers rather than three" is answerable from
the record **plus** the placement as it was configured at the time, and nothing
version-pins the second half. A slot count edited afterwards leaves the decision
reproducing exactly and the page not.

Bounded today, because ordering by priority is the whole composition rule and it
is fully explained by the record. It stops being bounded at W-028: mutual
exclusion, diversity and inventory are rules that *choose* differently, and a
slate composed by a rule nobody recorded is not explainable. Those have to land
in the hashed decision, which is why W-052 shipped the contract and left the
composition alone.

---

### G-011 — Creatives can be authored, and not uploaded

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-015](BACKLOG.md)

`createCreative` and `updateCreative` exist as of today, with per-channel
validation and the activation invariant. What is still missing, and is what
W-015 is actually about:

| Gap | Notes |
|---|---|
| **No asset upload, and no asset store** | There is no `multipart`, `binary` or `octet-stream` anywhere in the spec, no upload endpoint and nothing that serves a file. `imageUrl` is a string the caller supplies; `apps/console/public/assets` does not exist, so every fixture image path 404s — which is why the storefront draws a placeholder. A creative can name an asset the platform has never seen and does not check. |
| **No content lifecycle** | No approval, no effective dating, no expiry, no versioning. A creative has `status`, `active` and `locale`. Editing one changes what is delivered immediately, with an audit entry and no review — while a *flow* change goes through change sets and approvals. Two governance regimes again, and content is the unguarded one. |
| ~~The console still cannot author one~~ | **Closed 2026-09-07.** The offer and creative dialogs are wired; see `CAPABILITIES.md`. Three affordances remain unbuilt and are now disabled with the reason rather than enabled and dead: `New boost` and `New scope rule` have no write operation in the spec, and `Request change` needs a diff builder before it can propose anything. |
| **`Offer.creativeIds` is a denormalisation** | `Creative.offerId` is the foreign key — `packages/catalogue` enforces it and refuses a creative whose offer does not exist. `creativeIds` exists because the offers list reads it for the channel-coverage column, and the write path maintains it. Two places holding one fact; it resolves when the console reads from the catalogue rather than the store (W-005). |

---

### G-013 — `packages/nodes-core` is imported by nothing

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-038](BACKLOG.md)

Fourteen node classes with `execute` methods, and no code path reaches them: the
engine implements node behaviour in `packages/runtime`, the compiler holds its
own `FlowNodeType` union, and nothing in the repository imports the package. It
also declares a dependency on `@metis/types`, which does not exist.

Found while clearing the twelve lint warnings, all of which were in this file —
so the only thing the package contributed to the build was noise in front of the
next real warning.

**Kept rather than deleted**, because the name is load-bearing where the code is
not: `@metis/nodes-core` is the package id every flow pins a version of, and
every decision records that pin — `packageVersions` is in the hashed decision.
Deleting the directory would leave a version identifier referring to nothing,
which is worse than dead code that says at the top of the file that it is dead.
Which it now does.

W-038's package system is where this either becomes real or goes. Until then it
is a stub with a name that matters.

---

### G-014 — Inbound traffic is recorded at the edge, not by the platform

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-016](BACKLOG.md)

`listInboundCalls` and `clearInboundCalls` are in the spec as
`x-metis-status: proposed`. The console's development API serves them from a
bounded in-memory ring; the execution plane serves neither, and should not serve
these in this shape.

**Why the shape is wrong for production, stated now rather than discovered
later.** The buffer holds full request bodies. Decision inputs are the one thing
the platform deliberately does not retain — a `DecisionRecord` carries
`inputSnapshotHash` and never the values, which is what makes the ledger safe to
keep and what ADR-004 (retention and erasure, still Proposed) is about. A
production endpoint that hands back request payloads would quietly reverse that,
and it would do it on the one surface nobody thinks of as storage.

So the production answer to the same question is an OpenTelemetry span — W-048 —
carrying the same correlation (`decisionId`, path, status, duration) and *not*
the payload. Whoever builds W-048 should treat these two operations as the
requirement, not the design.

**Why it exists anyway.** A partner site posting decisions could not demonstrate
it was reaching METIS at all. A correct decision that does not change between
reloads is indistinguishable from a hardcoded one, and the difference could only
be seen in devtools on the integrator's own machine. That is a real gap in the
development experience and it is worth a page. What it must not become is a
platform capability by accident, which is what this entry is for.

**Bounds it holds today, by construction rather than by policy:** memory only,
250 calls, 32 kB per body, lost on restart, `METIS_CALL_LOG=off` to disable.

---

### G-016 — Intake holds customer records

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-006](BACKLOG.md) · **Decision:** [ADR-004](adr/ADR-004-retention-and-erasure.md), Accepted 2026-09-09 — this entry was written while it was Proposed

`/data-model/intake` lands rows, maps them onto the model, validates and
activates. The landed rows are customer records in their original shape, which
is the one thing the platform has so far refused to retain — a `DecisionRecord`
keeps `inputSnapshotHash` and never the values, precisely so a trace can be kept
without the data it was made from.

So the shape of what is held is deliberately conservative, and none of it is a
substitute for the decision:

- **Memory only.** `store.landedRows` is a `Map`, never written to disk, and a
  restart clears it.
- **Bounded.** `MAX_LANDED_ROWS` is 5,000 per source, so a bad import is finite
  rather than somebody else's problem later.
- **Classified.** Every field the model declares carries `sensitivity`
  (`none | personal | special_category`), recorded at declaration time — which
  ADR-004 itself argues is far cheaper than classifying a populated store.

**What is still owed, and this is the whole entry:** durable storage, an
erasure path, and a retention period. ADR-004 proposes crypto-shredding —
encrypt per subject, destroy the key on erasure, let a replay of an erased
subject fail explicitly rather than return a decision computed from nulls. None
of that is built. Nothing here should be pointed at a real customer file until
it is.

The stage after this one is the profile store, and it is the stage that makes
retention unavoidable. The order is deliberate: schema, mapping and validation
all landed without retaining anything, so the decision can still be taken
before it is expensive.

---

### G-017 — The trace accessibility test asserts an arbitrary trace

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** none

`accessibility.spec.ts` opens `/decisions` and clicks the first row, so which
trace it checks depends on which decision sorts first — and that depends on
what other specs have left in the process-wide store. It failed twice and
passed twice across four runs on 2026-09-07 while flow authoring was being
built, and the violation text was not captured on any of them.

Two things are wrong with it and neither is the page:

1. **The subject is not pinned.** A test that checks "some trace" cannot tell
   you which trace is broken, and a red run cannot be reproduced from the
   failure alone. It should open a named seeded decision.
2. **The store is shared.** Specs that create decisions change what this test
   looks at, so it is coupled to test execution order.

Not fixed here because the fix is a change to a shared gate and this was found
in the middle of unrelated work; recorded so the next red run is understood
rather than re-diagnosed. Every other route in the sweep — 44 of 45, both
themes — passes consistently.

---

### G-018 — Experiments, and a plane asymmetry they extend

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-011](BACKLOG.md)

`/experiments` assigns arms and holdouts. An arm is a pure function of the
customer reference: nothing stores it, and it is recomputed from a decision
record months later. That is what lets this platform answer "which arm was this
customer in" for a decision made before the experiment ended, which most cannot
— their assignment lived in a service that has since rebalanced.

No engine change was needed. An arm reaches a policy as an ordinary field at
`experiments.<key>`, so a holdout is an eligibility rule that refuses when the
arm is the untreated one, written in the same editor as every other rule.

**A running experiment is frozen, and that is the feature.** Recoverability
depends on the assignment function being stable, so reweighting a live split
would make every recomputed arm disagree with the one that actually applied and
the trace would confidently report the wrong arm. Arms and key are editable in
`draft` only; stopping and starting another is the supported way to change a
split, which is what anybody running a real test would do anyway.

**The asymmetry this extends.** Assignment happens in the console's decision
path, beside integration resolution, and `engines/kotlin` does neither. So a
request that omits `experiments.*` gets an arm from the console and not from the
JVM service, exactly as it gets connector fields from one and not the other.
The existing entry above records the resolution half; this is the same boundary.

It was found rather than reasoned about: the fixtures originally seeded a
*running* experiment, and the cross-engine hash test went red immediately —
a running experiment adds a field to every decision's hashed input. Correct for
an experiment somebody started, and precisely the wrong thing for a fixture to
do on everybody's behalf. Both seeds are now draft or stopped, and starting one
is a deliberate act with a visible consequence.

**Not built:** significance testing. Reporting a p-value or a confidence
interval would be a statistical claim of exactly the kind this platform refuses
to make without showing the workings. Per-arm counts and rates are there; what
to conclude from them is not the platform's to assert.

---

### G-019 — Two operations are declared in the spec and served by nothing

**Registered:** 2026-09-04 · **Status:** Open · **Work item:** [W-020](BACKLOG.md)

These are declared, generate client types, and are exempt from the contract
test by their `proposed` marker. Nothing serves them.

| Operation | Console impact | Registered | Notes |
|---|---|---|---|
| `simulateDecisionFlow` | Ad-hoc simulation | Week 2 | `/simulations` says plainly that this is not built and shows only simulations attached to change sets. |
| `getCounterfactual` | "What would have changed the outcome" | Week 2 | No UI yet. |

### G-034 — Propensity is a hash, and every model surface is absent

**Registered:** 2026-09-09 · **Status:** Open · **Work item:** [W-029](BACKLOG.md)

`score-model` and `score-adaptive` pin a model id and version and produce
`0.05 + seededUnitInterval(customerId, offerKey, modelKey) * 0.9`
(`packages/runtime/src/deterministic/engine.ts:490-527`). That is arithmetic
over a hash. There is no model entity, no registry, no scoring service, no
feature store, and no route in the spec matching model, score or feature.

Registered here on 2026-09-09 for a reason that is about this file rather than
about models. `engine.ts:522` and `apps/console/mocks/fixtures/artifacts.ts:147`
both cite **W-029** to a reader, and `CLAUDE.md` tells a blocked agent to look
in `docs/gaps.md`. W-029 was only ever in `BACKLOG.md`, so following the
citation the way the instructions describe found nothing. The work item has not
moved; this entry is the thing that was missing.

**What the trace already does right.** It says so, in the sentence a person
reads: *"Scored 19 candidate(s) with propensity_accept_v4@4.2.0 — a pinned
deterministic function, not a trained model (W-029)."* The comment above it
records that the sentence used to read like a real model had scored, and that
nobody wrote a false claim — a pinned model id made one anyway.

**Why it matters more than one gap.** Every ranking decision is
`boost × value × a hash of the customer id`, and the arbitration story is what
the product is for. Adding 10,400 realistic decision records made this harder to
see, not easier, because the records now look exactly like a real model would
have produced.

---

### G-072 — The decide route injects `experiments` at the input root, which no root declares

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-075](BACKLOG.md)

`POST /api/decisions` assigns experiment arms and writes them into the decision
input as a third root-level branch, `experiments.<key>`, so a policy can read
`experiments.checkout_banner`. The schema declares two roots, `customer` and
`context`, and neither contains it.

**What that does to the pin.** A decision now carries `{ schemaId, version,
hash }` and the claim it makes is *this decision's fields were resolved through
this model*. A branch the model does not declare makes that claim true of a
subset and silently false of the rest: `inputSnapshotHash` covers the injected
branch, the pin does not describe it, and a reader six months later cannot tell
whether `experiments` was a field the schema lost or a field it never had. The
compiler cannot check a policy that reads it, either — `conditionProblems`
resolves against the schema, so `experiments.anything` is an unresolved field,
and the only reason no diagnostic fires is that no fixture policy reads one.

**It should be declared in `Context`, not moved and not removed.** An arm
assignment is request-scoped by construction — it is computed for this decision
and never stored against the subject, which is exactly what `Context` is for —
and it must stay in the hashed input, because a decision that cannot say which
arm it was in cannot be explained. Declaring it is a schema change:
`context.experiments` as a map is not a shape `SchemaField` can express today,
so it needs either a field type for a keyed map or one declared field per live
experiment, and the second turns starting an experiment into a schema version.
That choice is the work, and it is why this is registered rather than fixed
here.

**Done when:** every branch of a decision input is declared by the schema the
decision pins, and something fails when one is not.

### G-070 — Consent and frequency denials attach to whichever constraint node ran first

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-074](BACKLOG.md)

The engine enforces frequency caps and consent at *every* `constraint` node,
whatever that node is for — `engine.ts`, the `case 'constraint'` branch. A flow
with two constraint nodes records those denials against whichever one the
topological sort ran first, and the second finds the candidates already gone.

The data shows it. Across 400 seeded decisions, `constraint_fair_value` — a
suitability node — carries 416 `SUITABILITY_FAILED` denials and also 52
`CONSENT_WITHHELD` and 23 `FREQUENCY_CAP_BREACHED`, because it is its flow's
only constraint node. In `next-best-action`, `constraint_contact` takes all 184
consent denials and `filter_suitability` none — both sit in parallel branches,
so which one gets them is a tie-break rather than a decision.

The reason code is right and the rule id is right. The node is not: a screen
grouping refusals by stage shows a consent refusal under Suitability in one flow
and under Frequency & suppression in another, for the same cause. The tier now
on each node ([G-058](gaps.md)) makes that visible; it did not cause it.

**Done when:** consent and frequency are enforced at a node that declares them,
or the denial records which enforcement produced it, so attribution does not
depend on graph order. Either changes the hashed decision, so it moves chain
hashes and has to be done deliberately.

**Narrowed, 2026-09-13 — [G-015](gaps.md).** A flow with no constraint node before
ranking now has consent applied by the platform, as a `__consent` step that
belongs to no node, so its consent denials are attributed to exactly what
produced them. Flows with a constraint node are unchanged, and so is this entry
for them.

### G-068 — The ledger stores the raw customer reference beside the hash that was meant to replace it

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-006](BACKLOG.md) · **Decision:** [ADR-004](adr/ADR-004-retention-and-erasure.md), Accepted 2026-09-09 on a premise this entry contradicts; the correction is its *Amendment, 2026-09-11*

`decision_records` has a `subject_hash` column so that *"the subject is
queryable without the ledger holding the identifier in clear"*
(`packages/ledger/src/types.ts:24-32`). The `record` column beside it holds the
whole `DecisionRecord` (`types.ts:39-40`; `jsonb` at
`packages/ledger/migrations/001_ledger.sql:37`), and the hashed half of that
record carries `customerRef: request.customerId` — the raw identifier
(`packages/runtime/src/deterministic/engine.ts:659`). Every row holds the
identifier in clear, one column over from the hash that exists to avoid it.

The hash would not be enough on its own either. `subjectHash` is an unkeyed
sha256 of `tenantId.length:tenantId:customerRef`
(`packages/ledger/src/ledger.ts:62-64`). Anyone who can list candidate
identifiers can hash them and match: the seeded ids are `cust_` plus a base-36
counter, and a real telco's account and phone numbers are enumerable the same
way.

ADR-004 rests on the opposite. Its rejection of *"tokenise identifiers only"*
begins *"the ledger already hashes the customer reference per tenant, so the
subject is pseudonymous rather than identified"*
(`docs/adr/ADR-004-retention-and-erasure.md:88-89`), and concludes that the
per-subject key is needed for the attributes, the identifier being handled.

**Why now rather than later.** `decision_records` is append-only by trigger
(`001_ledger.sql:171-174`). The console writes the ledger to PostgreSQL only
when `METIS_DATABASE_URL` is set, and the truth audit found PostgreSQL *"used
by no service"* (`docs/evaluation/TRUTH_AUDIT.md:78`), so what is in it today is
test data. The first real customer id written there cannot be removed by any
means the design permits. Correcting the shape now means dropping a store that
holds nothing real; correcting it later means rewriting an append-only table,
which is the operation ADR-004 exists to forbid.

Found while tracing the data spine for
[ADR-014](adr/ADR-014-the-data-spine.md) §6.

**2026-09-15: the constraint is now a refusal, not a sentence.** ADR-016 §4
landed: `createLedgerStore` refuses to start when `METIS_DATA_CLASS` is `real`,
a database is configured and `SUBJECT_PROTECTION` is `none`, and the decision
service refuses to start without a declared data class. That stops the first
real customer reference reaching `decision_records` by accident. It does not
close this entry: the record still holds `customerRef` in clear, and the
refusal lifts only when the change above makes `SUBJECT_PROTECTION` something
other than `none`.

**Done when:** a test records a decision and asserts the raw `customerId`
appears in no column of `decision_records` in clear; the subject column cannot
be recomputed from a candidate identifier without a key the ledger does not
hold; and ADR-004 records the correction to its premise.

---

### G-067 — The capability map's rollup row names the wrong checks

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** none — a correction to `docs/CAPABILITIES.md`, owed by whoever next edits that row

`docs/CAPABILITIES.md:329` — *"Aggregations over history resolved at decision
time"* — names two tests, and neither exercises what the row claims:

- `usage becomes decision input` is `packages/core/tests/volume.test.ts:78`. It
  tests `resolveVolume`, a volume-cap module that nothing outside its own test
  imports. The name reads like rollups; the subject is something else.
- `merging into the input` is `packages/runtime/tests/aggregate.test.ts:179`,
  which tests `mergeAggregations` on its own.

The test that does exercise the claim — a rollup computed on the console's
decision path and changing the decision — exists and is not named: `a rollup
decides`, `apps/console/tests/unit/aggregation-decision.test.ts:62`.
`docs/evaluation/TRUTH_AUDIT.md:163` carries the same two names, so the audit
copied the citation rather than following it.

And *"over history"* describes nothing. The rollups read collections the caller
puts in the request (`packages/runtime/src/integration/aggregate.ts:48-69`);
there is no history for them to read (W-011).

The capability itself is not overstated — its wiring test exists. What is wrong
is Rule 9's shape, in the register: a reader who breaks what the row describes
and runs the two named checks will watch both stay green.

Found while tracing the data spine for
[ADR-014](adr/ADR-014-the-data-spine.md).

**Done when:** the row names `a rollup decides`, verified to bite by removing the
`resolveAggregations` call at `apps/console/app/api/[...path]/route.ts:606`;
drops `usage becomes decision input`; and says what the rollups read.

---

### G-066 — A rollup that could not be computed leaves no trace

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-009](BACKLOG.md)

`resolveAggregations` returns `unresolved` beside its values, with a reason for
each, so that *"this customer has no accounts in arrears"* and *"we never loaded
their accounts"* — which *"look identical in the input and mean opposite
things"* — stay distinguishable
(`packages/runtime/src/integration/aggregate.ts:38-45`). Its only caller
computes it at `apps/console/app/api/[...path]/route.ts:606` and reads only
`.values` at `:622`. `unresolved` reaches no record, no trace and no response.

The test for this path shows what that costs.
`suppresses when one child breaches it` and
`suppresses when the children were never loaded`
(`apps/console/tests/unit/aggregation-decision.test.ts:91-106`) both end with the
fibre offer denied `ELIGIBILITY_FAILED` on `pol_fibre_available`. One customer
is 34 days in arrears; the other's accounts were never looked at. The trace
gives both the same reason code naming the same real policy — the failure
`docs/review/DATA_MODEL_DESIGN.md` §0 opened with for typos, reintroduced one
layer down for missing data. Failing closed is right. Failing closed without
saying why is the defect.

In the seeded tenant it is every decision. Both declared aggregations read
`customer.accounts`, which no preset, seed or data source populates, so both are
unresolved on every decision. The fixture says as much and adds that this is
*"registered in docs/gaps.md"* (`apps/console/mocks/fixtures/profile-schema.ts:31-32`).
It was not, until this entry.

Found while tracing the data spine for
[ADR-014](adr/ADR-014-the-data-spine.md).

**Done when:** a decision records which rollups were unresolved and why, and a
test asserts that the never-loaded case and the in-arrears case produce
distinguishable records. W-009's own done-when — *"a miss is explicit in the
record, not an implicit default"* — is this, for rollups.

---

### G-065 — Absent consent is granted, in both engines

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-013](BACKLOG.md) · **Decision:** [ADR-014](adr/ADR-014-the-data-spine.md) §7, Proposed

**A decision request with no `consent` is decided as though marketing and
profiling consent were given.** `packages/runtime/src/deterministic/engine.ts:302`:

```ts
const consent = request.consent ?? { marketing: true, profiling: true, thirdParty: false };
```

The Kotlin engine does the same
(`engines/kotlin/engine/src/main/kotlin/com/metis/engine/Engine.kt:247`), so the
two agree — and the conformance corpus proves they agree on it: 26 of the 27
cases in `docs/conformance/decision-corpus.json` carry no `consent`.

Three things make it worse than a default:

- **The trace asserts it.** `consentState` is in the hashed decision
  (`engine.ts:689`) and records the substituted value, so the record of a
  decision nobody consented to says, under a chain hash, that consent was given.
- **The right source is configured and not read.** `conn_consent_registry` is
  set to fail closed — `defaultValue: false`, *"because assuming consent is the
  one mistake with a regulator attached"*
  (`apps/console/mocks/fixtures/catalogue.ts:1302-1320`). Its `marketingConsent`
  and `profilingConsent` are fetched, hashed into the input snapshot, and read by
  no policy. The engine's consent check reads `request.consent` and nothing else
  (`engine.ts:460`).
- **The caller grants it.** In the storefront, consent is three checkboxes the
  visitor ticks (`apps/console/public/storefront/index.html:441-443`, sent at
  `:644-648`). A request can grant what the registry withholds.

Not G-015. That entry is a flow with no constraint node, where consent is never
checked. This one is every flow that does check, checking a value that defaults
to yes. The capability map's consent row gives its limit as *"consent arrives on
the request"* (`docs/CAPABILITIES.md:259`), which is true and leaves out what
happens when it does not arrive.

**Done when:** absent consent is enforced as withheld and recorded as absent,
distinct from withheld, in both engines, with a corpus case for each; consent is
taken from the platform's source and the request can only narrow it; and
restoring the default at `engine.ts:302` turns a named test red.

**Half landed, 2026-09-13 — ADR-014 §7.1.** Both engines now record consent per
purpose as `granted`, `withheld` or `absent`, and enforce `absent` exactly as
`withheld`: commercial offers are removed and duty-of-care offers survive
(`packages/runtime/src/deterministic/consent.ts`,
`engines/kotlin/engine/src/main/kotlin/com/metis/engine/Consent.kt`). A purpose
left out of a stated consent is absent too — the Kotlin service's JSON reader
had been reading a missing `marketing` field as granted, one level below this
entry's default. `ConsentState` in the spec is the three-valued form.

The decision corpus gained two cases, *absent consent is enforced as withheld and
recorded as absent* and *a purpose left out of stated consent is absent, not
granted*, and its other 31 cases now state the grant they had been assuming.
Every chain hash moved, and only that: predicted before regenerating and diffed
after, across the 34 corpus cases, the 60 service cases and the 10,400 seeded
decisions, no winner, elimination or snapshot hash changed — only `consentState`,
and with it the chain hash and the decision id derived from it. Restoring either
default turns named tests red in both engines.

**What is still open is the second half, §7.2–§7.5:** consent is still what the
request asserts. `conn_consent_registry` is still fetched and read by nothing, the
storefront's checkboxes can still grant what the registry withholds, a stale
value is not yet absent, and the trace does not name where consent came from.
And consent is still checked only at constraint nodes — of the 31 corpus cases
that had sent no consent, only 4 would have changed winner under the new rule,
because the others have no constraint node (G-015).

**No longer, since the same day — [G-015](gaps.md).** Consent is applied to every
decision, whatever nodes the flow declares. Sent absent again, those 31 cases
change winner in 24 places rather than 4: the same 4, and 20 of the 25 flows that
rank before any constraint node. The other 5 of those 25 had nothing commercial
left to remove.

---

### G-061 — No aggregate latency view has a source

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-071](BACKLOG.md)

Until 2026-09-11 the console showed latency over many decisions in three places:
"Avg latency · SLA 50ms" on `/decisions`, a sortable Latency column on the same
screen, and the home page's "Avg latency", given as a percentage of the 50 ms
budget. All three read `totalMs` from `/decisions/search`. Nothing in
`planes/` implements that operation, so the only thing that has ever served it
is the mock. What the mock returned was a stopwatch reading of the fixture
generator, frozen into `decision-index.json` on whichever machine last built
it. The screens presented it as the platform meeting its SLA. It was removed with
[G-052](gaps.md) rather than kept, because no number is better than a number
that looks measured and was not.

What exists:

- **Per decision:** the trace reader's Latency figure and per-node timings,
  `/decisions/[id]`, measured when the trace executes (in the mock, when it is
  re-executed on being opened). Real, and about one decision at a time.
- **Offline:** `bench/harness/tests/gate.test.ts` gates p99 under 50 ms in CI
  against a controlled workload. That benchmarks a process; it does not observe a
  running system.
- **Nothing in between.** The nav declares `/operations/latency`, "Latency &
  throughput" (`apps/console/lib/nav/persona-manifest.ts`), specified in
  `docs/METIS_CONSOLE_SPEC.md` as p50/p95/p99 by tenant and placement. No route
  exists behind it. `docs/CAPABILITIES.md` already records seeing the decision
  endpoint's latency distribution as `ABSENT`.

This matters beyond a screen. The Phase 3 gate in
`METIS_Vision_and_Build_Plan.md` is that the performance claims in the business
overview can be restated against a 10M-customer dataset. A restatement needs
latency measured on the running decision path and aggregated somewhere it can be
read. Today the one aggregate is the offline bench, and until this change the
console's home page was showing a fixture's timing as if it were the platform's.

**Done when:** an operation in the spec serves an aggregate latency, at least
p50, p95 and p99 over a stated window, from measurements the running decision
path records, and a console screen reads it with the window and the source
stated beside the number.

### G-059 — Every `next-best-action` decision considers the same 22 offers, out of 251

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-067](BACKLOG.md)

`candidateCount` is **exactly 22 on all 3,467** `next-best-action` decisions —
minimum 22, maximum 22, mean 22. The flow's artifact carries a fixed
`candidateKeys` list of 22 entries, and the catalogue holds 251 offers. Nothing
in the decision narrows the candidate set; authoring already did.

**The filtering is genuine.** Averaged over 30 sampled traces, eligibility
removes 4.4, relevance 1.4, the contact constraint 5.4, suitability 5.4 and
ranking 5.1, and only 8 of the 30 produce a winner at all. Six of the eight
reason codes fire. The elimination cascade is real work over a real policy set,
and the trace reader shows it honestly.

What is not real is the width of the funnel's mouth. A viewer sees *22
considered, 1 offered* and reads it as the platform choosing from what it had;
the platform chose from a list somebody typed. `retention-outbound` and
`plan-fit-nudges` build their candidate sets partly from a seeded helper, so the
shape differs by flow — this entry is about `next-best-action`, which is the
flow with all three targeting tiers and therefore the one the trace reader
demonstrates.

**The demo path leans on this screen.** `/decisions/[id]` is the design north
star — the trace is the hero — and it is the centre of the eight-minute
walkthrough. The number a viewer anchors on is the first one on the rail, and it
is a fixture decision rather than an engine result. That is not dishonest, and
nobody watching would know to ask.

Two things could change it, and they are different in kind. A candidate set
built by a query over the catalogue rather than by an enumerated list would make
the entry figure a property of the tenant's data — closer to how a real
deployment works, and a modelling change. Or the seed could simply enumerate
more, which widens the mouth without making it mean anything.

**Done when:** either the seeded flow selects candidates by a rule the trace can
show, or the demo script says out loud that the candidate set is authored — so
the figure is understood rather than assumed.

### G-057 — Nothing records what a customer was told when an offer was withheld

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-066](BACKLOG.md)

A decision that offers nothing, or that removes 21 of 22 candidates, produces a
complete internal record: the rule, its conditions, the field, the reason code.
It produces **no customer-facing text at all**.

Creatives say what an offer *is*, per channel. Nothing anywhere says what a
person was shown, or told, when an offer was refused — or whether they were told
anything.

This surfaced while rebuilding the trace reader. The design mockup for that
screen included a line per refusal in a customer's own words — *"You have opted
out of marketing contact"* — and the field does not exist; the mockup invented
it. The screen now states the absence where that line would have gone.

On a product whose design north star is the compliance officer, this is the
question a regulator asks that the platform cannot answer. Every other part of
"why was this not offered to me" is recorded to the field and the rule. The half
the customer actually experienced is not recorded at all.

**Assessed 2026-09-11, and deliberately not built.** The three entries beside
this one were code changes. This is a modelling decision, and three questions
have to be answered before any field is added. They are product and legal
questions rather than engineering ones.

**Where would the wording live?** Three candidates, and they are not
equivalent.

1. **On the reason code.** Eight codes, one sentence each, so a refusal always
   has wording. It is also the least useful: every eligibility refusal in every
   tenant would say the same sentence, and "you are not eligible for this" is
   not what a regulator means by an explanation.
2. **On the policy.** Precise, and authored by whoever wrote the rule — the
   person who knows why it refuses. It is also where the disclosure risk sits:
   some refusals must not be explained precisely, fraud and credit rules above
   all, and a free-text field beside a rule invites exactly that. It needs an
   explainability flag and a review step, which is a workflow rather than a
   field.
3. **On the creative, per channel.** What a customer is *shown* is
   channel-shaped — an SMS refusal is not a web one — and creatives are already
   the per-channel content model. This is where the sentence a person actually
   read belongs, and it is furthest from the rule that caused it.

**Who authors it, and in how many languages?** There is no message catalogue.
`/packages/i18n` never existed and its stub was deleted on 2026-09-05; every
string in the console is inline today, which CLAUDE.md's definition of done
already records as a gap. Customer-facing copy is the one category of string
that cannot live inline in a component, so this cannot close before that does.

**Was the customer told anything at all?** Usually not. A suppressed offer means
a slot rendered something else, or nothing. What a customer saw is a property of
the *delivery*, not of the decision, so recording it honestly needs the delivery
record to carry it — a different subsystem from the trace, and the only place
"nothing was shown" can be recorded as a fact rather than inferred from an
absent field.

**Recommendation, for the product owner rather than for the next session:** the
sentence belongs on the creative, per channel, with the policy carrying an
explainability flag that decides whether a specific reason may be disclosed at
all — and neither is worth building before there is a message catalogue to hold
the strings. Declining to model it is also defensible: a platform that refuses
to invent customer-facing copy is more honest than one that ships eight generic
sentences and calls the gap closed.

**Done when:** either a refusal can carry customer-facing wording that the trace
records alongside the reason code, or an ADR states why the platform deliberately
does not model what the customer was told.

### G-053 — A storefront slot can name a decision while showing no offer

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-064](BACKLOG.md)

`runPlacement` decides `status: 'filled'` from `rendered.length`, where
`rendered = filled.filter((f) => f.creative)` — *any* entry with a creative. But
`renderHero` and `renderInline` both read `r.filled?.[0]` and fall back to
`fallbackReason(r)` when that **first** entry has no creative.

So a slate whose first entry lacks a creative and whose second has one takes
both branches: `status` is `filled`, so the slot gets `data-decision-id` and
reports an impression; and the renderer draws the "won this slot, and has no web
creative for it" notice, with no call to action. The customer sees an
explanation of an absence, and `/performance` counts it as seen.

That is G-041's defect a third time — counting a win rather than a render — in
the one place the last two corrections did not look. It is a narrower case: it
needs a multi-entry slate whose first entry is the one without content.

**Not what made run #33 red.** That was a torn read in the test, fixed in
[G-054](gaps.md)'s slice. This is latent and does not currently fire: the
storefront runs fixed preset customers against a deterministic engine, so the
slates are stable and none of them is currently shaped this way. It is one
catalogue edit away from firing, and it would present as an intermittent
impression count rather than as anything obviously wrong.

`renderCards` is not affected — it iterates rather than indexing.

**Done when:** the hero and inline renderers draw the first entry that has a
creative, or `status` is decided by what the renderer will actually draw rather
than by what exists in the slate — and a test covers a slate whose first entry
has no creative.

### G-051 — `/integrations/traffic` rendered customer data in the clear to anyone signed in

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-061](BACKLOG.md)

Registered in its own right even though [G-050](gaps.md) has now gated it,
because the gate closes the door and says nothing about what was behind it.

The screen renders each inbound call's request and response body verbatim —
`JSON.stringify(body.json, null, 2)`, by design, because the reader is usually
looking for one field. A decision request carries a customer identifier and
whatever profile attributes the caller sent. Until 2026-09-10 the route enforced
nothing, so **every signed-in account could read it**, including accounts with no
permission to see a decision, an offer or the audit log.

Three things the gate does not answer, and this entry exists to hold them open:

**Nothing redacts.** `view:integrations` now decides who may look. It does not
make the payloads safe to look at, and a debugging surface that shows raw
customer attributes to everyone who can debug is a different decision from one
that shows them to everyone at all — it has just never been made.

**Nothing is logged.** Reading the call log leaves no trace. The audit log
records what was changed, and viewing customer data is not a change, so a
platform whose north star is the compliance officer cannot answer who looked at
whose data.

**Nothing expires.** The calls accumulate for the life of the process, and in a
deployment with a real store they would accumulate for the life of the store.
There is no retention window on a surface holding personal data.

The synthetic marker on the seeded tenant means no real customer was exposed
here. That is a property of the fixture, not of the code, and the code is what
ships.

**Done when:** payloads are redacted by default with a deliberate reveal, the
reveal is audited, and a retention window exists — or a decision is recorded
that says why each of those is not needed.

### G-048 — The vocabulary check cannot see a file until it is committed

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-001](BACKLOG.md)

`tests/vocabulary.test.ts` scans `git ls-files`, so an untracked file is
invisible to it. Its own doc comment says so — *"an untracked file can carry any
vocabulary at all until it is added"* — and treats it as deliberate, on the
grounds that the check guards what the repo actually carries.

The hole is worse than that framing suggests, because the files most likely to
introduce new prose are exactly the ones it cannot see: **new** ones. A slice
adds a component, runs the suite green, commits, and the violation appears in
the *next* session's run with nothing pointing at who wrote it.

Found on 2026-09-10 exactly this way. `apps/console/components/placement-form-dialog.tsx`
was written the previous day using one of the renamed words in its ordinary
English sense — the same slip the check's own comment records finding on its
first run, in the same words — and `npx vitest run tests/` reported 48 passing
while the file was untracked. It failed the moment it was committed, one slice
later.

(This entry cannot quote the word, because doing so fails the check it is
about. That is correct behaviour and a small demonstration of why the rule is
worth having: the register is scanned like everything else.)

The same blind spot applies to `tests/source-hygiene.test.ts` and every other
check built on `git ls-files`.

**Done when:** the scan reads tracked files **and** the working tree's untracked
ones, so a new file is checked in the session that writes it.

### G-047 — The seeded corpus has four conversions

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-017](BACKLOG.md)

A consequence of G-046 rather than a defect in it, and worth its own entry
because it is now the demo's binding constraint.

The corrected corpus holds **416 impressions, 79 clicks, 6 acceptances, 27
rejections and 4 conversions** across two years and 10,400 decisions. The
realised-versus-expected value story on `/performance` — one of the things the
demo exists to show — now rests on four data points, and
`seeded-outcomes.test.ts` says so where it guards the ratio.

Nothing here is wrong. The platform delivers on one channel of five, and the
numbers are what that looks like when reported honestly. But a reviewer opening
`/performance` sees a product that decided 10,400 times and converted four, and
the reason is W-017 rather than anything about the decisions.

Raising the coverage constants to make the funnel look fuller would be inventing
reach the platform does not have, and is the wrong fix. The right one is an
adapter, or a demo that shows one channel working well rather than five
channels mostly not.

**Done when:** either W-017 lands and the corpus reports on more than one
channel, or the demo states on `/performance` that its numbers describe a single
delivered channel. The second of those is done: [G-049](gaps.md), the Cascade
rebuild, states it on the rail and on every rate below the break. W-017 remains.

### G-044 — The seeded catalogue has almost no content for an outbound call

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** [W-015](BACKLOG.md)

Now visible on `/creatives?view=coverage`, which is what that screen is for.

Of 435 creatives in the seeded catalogue, **two are for an outbound call**, and
they cover two of 251 offers. Every other channel is authored in volume — 78
active email, 79 sms, 75 web, 69 push. So 200 of the 202 active offers have
nothing an agent could read aloud, and before the outcome generator was
corrected on 2026-09-09 the corpus was reporting 284 outbound-call impressions
of which 281 were impossible.

**This is a content gap, not a modelling one.** The channel is modelled, the
placement is now registered (`retention_queue`), decisions are made for it 2,061
times, and the compiler and `offerMayBeActive` will both now refuse an offer
that has nothing on any served channel. What is missing is that somebody wrote
two creatives and stopped.

The wider shape, for whoever picks this up: **no active offer has live content
on all five channels served**, and 38 have live content on none. The screen's
four blocks read 202 / 38 / 164 / 0 on 2026-09-10.

**Done when:** either the seeded catalogue carries outbound-call content in the
same proportion as its other channels, or `retention_queue` is switched off and
the corpus stops deciding for a channel the demo cannot illustrate.

### G-045 — An untouched number field sends zero, and each descriptor pays for it separately

**Registered:** 2026-09-10 · **Status:** Open · **Work item:** none

`toPayload` in `packages/ui-metadata/src/codec.ts` reads a number field as
`Number(raw || 0)`, so a field the author never touched arrives as `0` rather
than as absent. The server's own default is then overwritten by a value nobody
chose.

Three descriptors have hit it in two days:

- `Offer.boost` and `financials.termMonths`, where 0 is a sensible value and the
  bug is invisible.
- `Objective.sortOrder`, 2026-09-09: a new objective sorted above everything
  that existed. Worked around by passing a default from the screen.
- `Placement.slotCount`, 2026-09-10: the spec's `minimum: 1` then made the form
  silently unsubmittable — the browser refused it and nothing said why. Worked
  around the same way.

Two workarounds in two days for one cause is the signal. The fix belongs in the
codec — an untouched number should be absent from the payload rather than zero,
so the server's default applies — and it is not a one-line change, because
`toPayload` cannot currently tell "the author typed 0" from "the author typed
nothing" without consulting `touched`.

**Done when:** a number field the author never touched is omitted from the
payload, and a descriptor no longer needs a screen-supplied default to avoid
sending zero.

### G-114 — `ExecNode.frequencyPolicyIds` is declared and never populated or read

**Registered:** 2026-09-13 · **Status:** Open · **Work item:** none — found in G-015's investigation, 2026-09-07, and carried out when G-015 closed

`toExecArtifact` does not map it, and the engine draws frequency policies from
`catalogue.frequencyPolicies` by scope instead. So a flow author who set it
would get no error and no effect — the same kind of silence G-015 was about,
one field over.

**Done when:** it is wired, so a constraint node applies only the policies it
names, or deleted. Wiring it changes which caps apply at a node, and so what
decisions do; that makes it a decision rather than a cleanup.

## Resolved

### G-133 — The PostgreSQL restart tests timed out locally: the console's cold import was paid inside the first test's five seconds

**Registered:** 2026-09-14 · **Resolved:** 2026-09-15 · **Status:** Resolved · **Work item:** none — a local-environment failure with no diagnosis; the suite's subject is W-005

**The observation.** `apps/console/tests/unit/console-durable.test.ts` › *keeps
an edit made through the API across a restart, and decides the next request
against it* timed out at Vitest's default 5000ms when the file was run alone,
with the other seven tests passing, on three commits:

| Commit | Alone |
|---|---|
| main, `3e49396` | 1 failed (the timeout), 7 passed |
| #59 before merging main, `b74cc59` | 1 failed (the timeout), 7 passed |
| #59 with main merged, `017145b` | 1 failed (the timeout), 7 passed |

Inside a full `npm run gates:quick` the same file failed five tests: that one
timing out, four more with `expected false to be true`. PostgreSQL at
`localhost:5432` was accepting connections throughout. CI runs the suite against
its own database and passed it on main at `34c7d7f`.

**What is not known.** Why the first test takes more than five seconds here and
not on a runner. The likeliest reading — the first test paying the connection,
schema and seeding cost inside its own timeout — is a reading, not a measurement;
nor is it known whether the four assertion failures in the full run are the
same cause or a second one.

**What was done instead.** The #59 and #60 merges of main were pushed with
`gates:quick` red on this file alone, and CI was left as the gate, by the product
owner's decision.

**Done when:** the time the first test spends is measured and the cause stated;
the suite passes locally the way it does on CI, or the reason it cannot is
written down; and the four assertion failures seen under a full run are either
shown to be the same cause or registered as their own.

**What was measured.** On 2026-09-15, `console-durable.test.ts` was run
alone three times from an instrumented copy that timed every boot phase, with
a 120-second timeout so nothing was cut short. The first boot's import of
`app/api/[...path]/route` and `mocks/store` took 10.3s, 11.1s and 12.4s:
every module transformed and the fixtures built. Every later boot, all four
stores ready, took 0.9–1.3s. The first restart test took 11.8–14.0s; the test
that boots three times took 4.1–4.6s; `TRUNCATE` took 150–490ms.

**The cause.** The fixed 5-second default was too tight, for a specific
reason: the cold import happened inside whichever test booted first, so that
test failed on every local run, and the three-boot test had under a second of
headroom, so a busy machine took the rest of the file with it. Two other
readings were checked and ruled out as the cause of these failures. A shared
database: the gates runner runs suites one at a time, this is the only console
file that opens the database, and the dev server had no `.env.local`. A
missing wait: `bootConsole` did not await `governanceReady`, which is a real
race, but in every measured boot governance was ready within a millisecond of
the registry. The earlier `expected false to be true` failures are what a
timed-out test leaves behind: Vitest does not cancel it, so its boot goes on
seeding while the next test truncates.

**What was done.** The cold import is paid once in `beforeAll`, under a
60-second hook budget. `bootConsole` awaits all four stores, and a test makes
governance open 1.5 seconds late and asserts the boot waited, seen to fail with
the wait removed. The two describe blocks run under 20 seconds, about four times
the slowest test measured warm. After the fix, run alone three times, the first restart test took 2.7–2.9s and the three-boot test 4.4–4.5s, and the file passed inside the console unit gate, 531 tests.


### G-134 — The lockfile lists fifteen packages that no longer exist, so `npm install` fails and no workspace can be added

**Registered:** 2026-09-15 · **Resolved:** 2026-09-15 · **Status:** Resolved · **Work item:** none — found building the decision service (ADR-016); a repository-hygiene fix with a CI install behind it

**What was seen.** `npm install` at the root fails:

```
npm error 404 Not Found - GET https://registry.npmjs.org/@metis%2ftrace
npm error 404  '@metis/trace@*' is not in this registry.
```

No `package.json` in the repository depends on `@metis/trace`. The committed
`package-lock.json` does. It still carries workspace entries for fifteen
directories that are not on disk:

- **packages:** `adaptive-models`, `canvas`, `compliance`, `i18n`,
  `packages-system`, `panel-host`, `panel-sdk`, `sdk`, `simulation`, `themes`,
  `trace`, `trace-ui`, `types`, `ui-kit`;
- **planes:** `authoring`;
- **links:** `node_modules/@metis/types → packages/types`, also missing.

It also carries a `planes/execution` entry named `@metis/execution-plane`, with
`express` and `uuid` as dependencies, all marked extraneous: the untracked
`dist/` ADR-016's context describes, from 2026-09-04.

**Why CI is green anyway.** `npm ci` installs exactly what the lockfile says and
prunes what nothing needs; it does not re-resolve. `npm install` re-resolves,
reaches an entry whose dependency exists nowhere, and stops.

**What it costs.**
- Nobody can add a dependency or a workspace. Doing either means regenerating the
  lockfile, and regenerating it is the command that fails.
- The decision service was built as a plain directory rather than an npm
  workspace for exactly this reason: `planes/execution` resolves `@metis/*`
  through the root `node_modules` links, and its image runs a root `npm ci`.
  That works, and it is a workaround.

**What closed it.** The stale entries were removed from `package-lock.json` and
npm reconciled the rest with `npm install --package-lock-only`, which now
succeeds:

- the fifteen workspace directories, the `node_modules/@metis/types` link to the
  missing `packages/types`, and the `planes/execution` entry, which described
  the untracked build and a directory the root `workspaces` globs do not
  include;
- whatever only those entries depended on, pruned by npm;
- `@metis/types` from `packages/nodes-core/package.json`. This entry said no
  `package.json` depended on a missing package; that held for `@metis/trace`
  and not for `@metis/types`, which nodes-core declared and never imported.
  With the stale entries gone it was the one thing still sending npm to the
  registry for it.

Every package that remains keeps its version, resolved URL and integrity,
compared entry by entry before and after, so `npm ci` installs the same tree
less what nothing on disk uses. `tests/lockfile-workspaces.test.ts`, in the
Integration gate, fails when the lockfile names a workspace directory with no
`package.json`, one outside the `workspaces` globs, or an `@metis` link to
nothing; it went red with a stale entry put back.

The decision service is still a plain directory rather than a workspace. G-134
made that a workaround; it is now a choice ADR-016 §3's migration job can revisit.

**Done when:** the stale entries are gone from `package-lock.json`, `npm install`
at the root succeeds from a clean clone, `npm ci` in CI is unchanged in what it
installs, and a check fails when the lockfile names a workspace directory that is
not on disk.

### G-075 — A condition could read only the request, so no rule could ask about the offer it judged

**Registered:** 2026-09-11 · **Resolved:** 2026-09-14 · **Status:** Resolved · **Work item:** [W-026](BACKLOG.md)

**What was true when this was registered.** `pol_afford_retention` — *"a
retention offer must reduce, not increase, the customer bill"* — sat on the
suitability tier, and its one condition read `offer.monthly_delta`, one number
for the whole request. Every condition was evaluated against `request.input`
(`packages/runtime/src/deterministic/engine.ts`, `policyPasses`), so every
retention candidate in a decision passed or failed together; in the seed the
number was a coin flip, and each refusal was recorded as `SUITABILITY_FAILED`
under a Consumer Duty pack.

**What had changed by 2026-09-14.** That policy went with the telco-uk
catalogue, the coin flip went from the seed, and telco-us declares no
suitability policies (`apps/console/mocks/fixtures/catalogue.ts`, the
suitability section). No trace showed the defect any more. The defect was still
in the language: a condition could read only request paths, and the schema had
no per-candidate scope (ADR-014 §2), so the next affordability rule a tenant
wrote would have hit it the same way. The product owner ruled that the entry
was wrong as written and decided the design (ADR-017).

**What closed it.** [ADR-017](adr/ADR-017-conditions-read-the-candidate.md):

- **An `offer` root, bound per candidate.** `SchemaRoots.candidate`, optional,
  alias fixed as `offer` because neither engine sees the schema. A path
  beginning `offer.` reads the candidate's record in the catalogue snapshot,
  which `catalogueSnapshotHash` already covers, so nothing is added to the input
  or to replay. Fields under it declare `origin: 'catalogue'`.
- **A value may name a path.** `{ path }` compared with the field, on `eq`,
  `ne`, `gt`, `gte`, `lt` and `lte` only, between comparable types (money only
  with money). A side that resolves to nothing fails the condition whatever the
  operator.
- **Both engines.** `policyPasses` in the TypeScript engine and in
  `engines/kotlin/engine/.../Engine.kt`; the Kotlin engine reads the candidate
  from the offer's raw record, since its typed `Offer` carries no price.
- **The compiler, the API and the editor.** `conditionProblems` checks both
  sides, so the compiler and every policy write refuse what the engines cannot
  evaluate; the conditions field offers a comparison only with fields the server
  accepts; the telco-us schema declares the candidate root.

**Proven.** Each check was seen to fail with the thing it guards broken, and to pass again restored:

| Break | What went red |
|---|---|
| Any two field types comparable | `refuses money compared with a plain number…`, `compares enums only when they declare the same members` |
| A path value accepted with any operator | `refuses a path value with an operator that has no meaning for two fields` |
| The candidate root allowed any alias | `refuses a candidate root not addressed by offer…` |
| Catalogue origins not policed | `refuses a catalogue field outside the candidate, and any other origin inside it` |
| `rootsOf` ignoring the candidate root | seven tests, from resolving an `offer.` path to the G-075 comparison itself |
| `isPathValue` accepting extra keys | `treats anything but exactly { path: string } as a literal` |
| TypeScript engine: an `offer.` path reads the request | the two corpus cases that read the candidate |
| TypeScript engine: a missing side let through | `a path value whose other side is missing fails closed` |
| Kotlin engine: an `offer.` path reads the request | `DecisionConformanceTest`: 2 of 40 decisions diverge, the same two cases |
| Kotlin engine: a missing side let through | `DecisionConformanceTest` |
| **E2E:** the editor offers no field to compare with | `@screen-only a rule compares each offer with the customer, and keeps the comparison`; restored, 3 of 3 passed on a fresh harness server |

Before the three new corpus cases were added, the 37 existing ones were
regenerated and compared byte for byte: none moved. The console's seeded
decisions did move, because the schema pin they carry is a hash of the telco-us
schema, which gained the candidate root; the decision index is regenerated with
them.

**What it does not do.** There is no arithmetic: *"costs less than the current
bill"* is expressible, *"costs at least $5 less"* is not. A declared
per-candidate derived value is the next decision if a margin is needed
(ADR-017, *Consequences*).

### G-130 — Every client-side navigation removed the document's title, and axe caught it when the timing lined up

**Registered:** 2026-09-14 · **Resolved:** 2026-09-14 · **Status:** Resolved · **Work item:** none — found and closed in one change

**What was seen.** Axe reported `document-title` ("Documents must have `<title>`
element") on screens whose title was static metadata in `app/layout.tsx`:

| Where | Commit | Test | Retry |
|---|---|---|---|
| main, flake-hunt | `cd13e8e` | `accessibility.spec.ts` › the decision trace has no violations | failed again |
| main, flake-hunt | `cd13e8e` | `offer-catalogue.spec.ts` › the catalogue, and an offer open beside it, are free of violations | failed again |
| #59, e2e shard 3 | `b74cc59` | `offer-catalogue.spec.ts`, the same test | failed again |
| a local `npm run gates`, 2026-09-13 | — | `accessibility.spec.ts`, the decision trace | — |

The last row was attributed to a competing dev server in [G-104](gaps.md).
**That attribution was wrong.** The CI runners had nothing else on them, and a
retry that fails the same way is not load. G-104 carries the correction.

**What it was.** Not hydration, not axe starting before a navigation settled,
and not streaming metadata. Next renders a metadata title inside the client
router's per-route `Head` (`next/dist/client/components/app-router.js`), which
is keyed by route and remounted on every client-side navigation. The old title
is removed when the navigation commits and the new one is mounted once the new
route's head resolves. In between, the document has no title.

Measured with a `MutationObserver` through the navigation, on a harness-owned
server, ten navigations of ten:

- **Opening an offer beside the catalogue:** no title for 20–37ms. The detail
  heading painted 85–179ms *before* the title was removed, five times of five,
  because the pane renders from the list already loaded while the navigation is
  still in flight. A test that waits for that heading and then runs axe starts
  just ahead of the gap, so it failed on retry as well: the ordering is
  structural, not load.
- **Opening a trace from the decisions list:** no title for 14–26ms. The `h1`
  came 150–187ms *after* the title returned, which is why this screen failed
  less often.
- **A plain `goto`:** a title at first paint every time. No test that only loads
  a page failed this way.

This was a product defect, not a test defect: a screen reader announcing the
document on navigation had, for that window, no title to announce.

**What was tried first, and did not work.** `htmlLimitedBots: /.*/` in
`next.config.js`, which serves blocking rather than streamed metadata. The gap
was unchanged — removed at 164–261ms, back 19–28ms later, ten navigations of ten —
because the remount is the router's, not the stream's. Reverted.

**What closed it.** The title is rendered as `<title>` in the root layout's
`<head>`, and `title` is gone from the `metadata` export so Next does not emit a
second one. The root layout is never remounted by a navigation, so its title is
never removed. The axe checks were not changed: they neither skip the rule nor
wait for a title, because there is no longer a moment without one.

**The check.** `apps/console/tests/e2e/document-title.spec.ts` watches the
document through opening an offer and opening a trace, and fails on any removal
of a `<title>` node; it also asserts exactly one title afterwards. It counts
removals rather than sampling whether a title exists: a sample taken in the
observer's callback runs after the whole task, and the first version of the
check, which sampled, passed three attempts in twelve with the gap present.

**Proven.** Each run on its own harness-owned server:

| Run | Result |
|---|---|
| The fix, with the new check, the diagnostic and both axe tests that had failed, each five times | 36 passed, 0 failed; the diagnostic recorded no title removal on any of ten navigations |
| The title moved back into `metadata` | the new check failed ten times of ten, each on "a `<title>` was removed during the navigation" |
| Restored | 10 of 10 passed |

### G-015 — A flow can ignore consent and nothing says so

**Registered:** 2026-09-07 · **Resolved:** 2026-09-13 · **Status:** Resolved · **Work item:** [W-013](BACKLOG.md)

**Resolved: consent is applied to every decision, by the engine, whatever nodes
the flow declares.** Until now it was read only inside a constraint node, so a
flow without one decided as though every customer had agreed, and a constraint
node placed after arbitration applied consent to a winner already chosen.

**Where it belongs: the engine, not the compiler.** A compiler that refused a
flow with no constraint node would guard one path. The Kotlin service loads
bundle artifacts directly, the corpus hands artifacts to both engines, and the
engine's own comments say an artifact can arrive having skipped compilation. It
would also accept the wrong shape: a constraint node after ranking satisfies
"has a constraint node" and protects nothing. Fail closed on compliance has to
hold on every path, so it lives where every path ends (ADR-014 §7, taxonomy 2.3).

**How.** Consent is applied exactly once per decision. A constraint node that
runs before ranking applies it as it always has, so those traces are
byte-identical. If ranking, or the end of the flow, is reached without one, the
engine applies it itself — same exemption, same `CONSENT_WITHHELD` code — and
records a step with `nodeId` `__consent` and `nodeType` `consent`, a name no
flow can declare. It is not recorded on every decision: that would move all
10,400 seeded chain hashes for no change in what any decision does, and add a
second place for consent denials to land to G-070's attribution problem. Both
engines, identically.

The diagnostic this entry first asked for exists too, reframed:
`ARBITRATION_WITHOUT_CONSTRAINT`, a warning, now about the frequency caps and
cooldowns that remain a constraint node's to apply.

**The size — predicted before regenerating, diffed after.**

- *As committed:* 25 of the decision corpus's 34 chain hashes and ids moved —
  exactly the 25 flows that rank before any constraint node — each by one
  inserted `__consent` step that removed nothing. **No winner moved**, and no
  other decision field. The 60 service cases, the service bundle and the 10,400
  seeded decisions did not change at all: every live flow is
  `next-best-action`, whose constraint node comes before ranking. The zero is
  because #50 (G-065) had just made those 25 requests state the grant they had
  been assuming.
- *Where the defect was live:* sent as they were before #50, with no consent,
  **20 of the 25 flows lose their winner** — all to no offer — where the engine
  as it was changed none. The other 5 keep it: nothing commercial is left to
  remove, or there was no winner anyway. G-065 put it as 27 cases kept their
  winner "because the others have no constraint node"; 25 of those have none
  before ranking, and 20 kept their winner only because nothing checked.
- *Outside the corpora:* `packages/runtime/tests/slate.test.ts` ranked with no
  constraint node and stated no consent, and its slates came back empty —
  correctly. It now states the grant. No other unit suite, and nothing in the
  Kotlin service, moved.

Three corpus cases pin it in both engines: *consent is applied to a flow with no
constraint node*, *absent consent is applied to a flow with no constraint node*,
and *a constraint node after ranking does not stand in for consent*.

**Checks, each seen red.** Removing the engine's two calls turns red 4 named
tests in `packages/runtime/tests/consent.test.ts` (*a flow with no constraint
node …*) and 28 decision conformance cases; applying consent only after the flow
ends, rather than before ranking, turns the same 32 red. In Kotlin the same
removal turns red `DecisionConformanceTest` › *a flow with no constraint node
has consent applied by the platform, before ranking*, and the corpus test.
Removing the compiler warning turns 3 tests red in
`packages/compiler/tests/compile.test.ts`. The trace rail's test *shows the
platform's consent step as a stage* did **not** bite when only the new type
label was removed — the rail's id pattern already names `__consent` — and bites
with both removed.

**Not covered:** consent is still what the request asserts (G-065, ADR-014
§7.2–§7.5). Consent and frequency denials across several constraint nodes still
attach to whichever ran first (G-070). The dead `frequencyPolicyIds` field this
entry also found is now [G-114](gaps.md).

#### As registered, 2026-09-07

`inbound-web-offers` ran for as long as it has existed with four filter nodes
and no constraint node. Consent and frequency are enforced at constraint nodes
only, so a website could post `marketing: false` and a full week of contacts,
the engine would read both off the request, and offer anyway. Fixed in 1.9.0 by
adding `constraint_web_contact`.

The fix is not the interesting part. **Nothing detected it**, and nothing would
detect the next one.

The compiler already emits `ARBITRATION_MISSING_SCORE` when a flow arbitrates
with no scoring node in front of it — the same shape of defect, caught. The
missing sibling is a diagnostic for a flow that reaches arbitration with no
constraint node: its candidates have passed no consent check and no frequency
cap, and the trace says so only by omission, which is the hardest thing to
notice in an audit.

Worth noting why it hid for so long: the flow's own description called it
"lighter", the arbitration formula honestly said `V^1.0 × B^1.0`, and every
decision it made was correct *given its nodes*. Every artefact was truthful.
The absent gate was the only evidence, and absence is what a diagnostic is for.

One smaller finding from the same investigation:

- **`ExecNode.frequencyPolicyIds` is declared and never populated or read.**
  Now its own entry, [G-114](gaps.md).

##### Not a finding: the empty account hero

This entry previously registered a second one, claiming the storefront's
signed-in preset was suppressed at suitability and left "the account page
showing nothing with the reason two screens away". That was wrong, and it is
recorded rather than deleted because the mistake is the instructive part: it
generalised from a single preset to the demo, and it was written without
opening the page it described.

There are five presets, three of them signed in. Four fill the account hero.
The fifth — `affordability`, Jo Okafor — is empty *on purpose*, and its own
note says so: every growth offer fails `pol_afford_5g`, the slot falls back to
the site's own content, and the panel names the rule. Verified end to end: the
page renders "Nothing offered here…" inline, the trace carries
`ruleId: pol_afford_5g` on each denial, and the panel prints it.

So the suppression is not a rough edge to smooth. It is the FCA-facing tier
doing the thing the tier exists for, on the surface where a buyer can see it.
Anyone tempted to make this preset "work" should change what the demo
demonstrates deliberately, not quietly.

### G-106 — A size class that named nothing rendered at whatever it inherited, and no check noticed

**Registered:** 2026-09-13 · **Resolved:** 2026-09-13 · **Status:** Resolved · **Work item:** none — a defect, fixed in the slice that registered it

Tailwind generates nothing for a class it does not know. So `text-h2` — on the
offer drawer's title and on every filter block's figure — and `text-heading`, on
every form dialog's title, produced no CSS at all, and each element took the size
of its parent. Three titles and figures meant to be large read at body size,
across every drawer, every create and edit dialog, and the filter blocks on
`/offers` and `/creatives`.

The type-scale guard written the same day did not catch them. It failed on a
fixed size (`text-[11px]`) and on a Tailwind default size (`text-sm`), but a
class matching no size at all passed both patterns — the same failure as the 45
hardcoded compact labels, one level further out. Found reading `filter-blocks.tsx`
during the sentence-case slice.

**Resolved by:** both titles now `text-title` and the figure `text-figure`, the
sizes the scale names for a title and for the one number on a panel.
`apps/console/tests/type-scale.ts` now fails on any `text-*` class that is not a
size on the scale, a colour, or one of the non-size text utilities, with the
valid names read from the resolved Tailwind config rather than written down.
`tests/unit/type-scale.test.ts` proves it flags `text-h2`, `text-heading` and a
misspelt colour, and passes an opacity modifier, a variant prefix, alignment and
the default palette. Bite-proven against `main`.

### G-102 — The console uses the all-caps and tracked labels the visual spec forbids

**Registered:** 2026-09-13 · **Resolved:** 2026-09-13 · **Status:** Resolved · **Work item:** slice three of the 2026-09-13 design pass, by the product owner

`docs/METIS_CONSOLE_SPEC.md` Part 5 lists, under *Type*, "No all-caps labels. No
tracked-out eyebrows above headings", and repeats "All-caps tracked eyebrow
labels" under *Forbidden* as one of the tells that make a build read as
generated. The console carries **48 `uppercase` classes in 24 files and 42
letter-spacing classes in 21 files**, counted on 2026-09-13 by the same sweep that
found the 126 off-scale type sites. That includes the eyebrow above the Overview's
thesis panels, added the same day.

**Kept out of the type-scale slice on purpose.** A size, a line height or a
weight outside the scale is a token failure with one right answer. Whether every
section label loses its capitals and tracking is a decision about the forbidden
list itself — it restyles most of the console's section headings — and the
product owner put it in slice three, the design pass on the non-Cascade screens.

**Done when:** each `uppercase` and `tracking-*` either goes, or the spec's
forbidden list is amended to say where they are allowed, and a check holds
whichever answer is chosen.

**Decided: sentence case everywhere.** The product owner chose the spec over an
amendment, table headers and nav group labels included. The recount on the day
found **49** all-caps classes and **49** widened letter-spacing classes in 26
files, stories included — the first count missed the three in
`primitives.stories.tsx`. Two shared components carried most of what a reader
sees: `Metric`'s label and `DataTable`'s column header, on every metric and every
table in the console.

**Resolved by:** every one removed. Tight and negative tracking on titles and
figures stays, because the spec forbids tracked-*out* labels, not tracking. One
label was relying on the capitals to hide its casing: a creative's content keys
on `/offers/[id]` were split on capitals into "image Url", and now read "Image
URL". `apps/console/tests/letter-case.ts` fails on an all-caps class, widened
tracking, or either as an inline style or CSS declaration, and its test proves
each rule fires and that a `value="uppercase"` option is not a class. Bite-proven
on the unchanged tree: 49 and 49.

### G-092 — The console formatted every date and number as British, and there was no tenant locale to read instead

**Registered:** 2026-09-12 · **Resolved:** 2026-09-13 · **Status:** Resolved · **Work item:** none

`toLocaleString('en-GB')` and `toLocaleDateString('en-GB')` were written at every
call site that showed a date or a number — 77 of them across 36 files, 22 on
`/performance` alone — and four files each carried a copy of
`currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€'`. For a UK tenant this
was invisible. For `telco-us` it meant every date on every screen was day-first:
`05/09` was the fifth of September to the console and the ninth of May to a
Verizon reviewer, beside a catalogue, copy and tenant that were American.

**It stopped being a formatting nit when the tenant became American**, and the
product owner said so: a reviewer sees British dates and `en-GB` currency on
every screen of a US demo.

**The earlier fix was a workaround wearing a fix's clothes.** On 2026-09-12 three
hardcodings were "fixed" by deriving the answer from the catalogue: new offers
took the currency of `store.offers[0]`, new creatives the locale of
`store.creatives[0]`, and `/performance` read the currency off the first offer in
the taxonomy. Nothing held the answer, so the first record was asked to guess.
A tenant whose first offer happened to be priced in euros would have authored
every new offer in euros and reported its revenue in euros.

**Resolved by giving the tenant a locale and having the formatting read it — not
by writing a different literal at 77 sites.**

- **A tenant setting.** `TenantSettings { tenantId, locale, currency }` in the
  contract, with `getTenantSettings` and `updateTenantSettings` on
  `/tenants/{tenantId}/settings`. A locale is accepted only if the runtime can
  format in it — an unknown tag would not fail, it would silently fall back to a
  default, which is the bug — and is stored canonical. Currency is limited to
  what `Money` can hold. Writing needs `admin:settings` and is audited as
  `TenantSettingsChanged`.
- **One formatter.** `apps/console/lib/format.ts` is the only file that calls the
  platform formatters. A call site says *what* it shows — a date, a count, an
  amount — and keeps its own choice of shape; the locale is never its to choose.
  `useFormat()` reads the tenant's formatter from `TenantFormatProvider`, which
  `RequireAuth` mounts around every signed-in screen and which renders nothing
  formatted until the settings arrive, rather than formatting in a default first.
- **The guesses are gone.** The server's new-offer currency and new-creative
  locale read the tenant's settings; `/performance` renders its minor-unit totals
  in the tenant's currency; the descriptor codec takes the currency from the host
  and throws rather than guessing when nothing supplies one — `moneyCurrencyDefault:
  'GBP'` is removed from the Offer descriptor.
- **Settable from the screen.** A Tenant card on `/settings` shows the locale, the
  currency, and a date and an amount as this tenant reads them, and opens the
  `TenantSettings` descriptor form (Rule 8). The page itself stays hand-built:
  ADR-015 holds the Form pattern for design review and keeps `/settings` as it is
  until then, and this slice does not pre-empt that review. The conformance count
  does not move.

**Checks:**

- `apps/console/tests/e2e/tenant-locale.spec.ts` (`@screen-only`) — signs in,
  confirms `/audit` timestamps and `/performance` totals read the American way,
  switches the tenant to `de-DE` / EUR through the form, and asserts the same two
  screens now read German dates and euro amounts. A second test: an account
  without `admin:settings` is told why rather than shown a control.
- `apps/console/tests/unit/locale-formatting.test.ts` — no file under `app/`,
  `components/` or `lib/` calls a platform formatter except `lib/format.ts`, names
  a locale, or draws a currency symbol by hand. This is what stops the
  seventy-eighth call site.
- `apps/console/tests/unit/format.test.ts` — the same instant and amount read
  differently per locale, with the zone pinned.
- `apps/console/tests/unit/tenant-settings-api.test.ts` — permission, refusal of
  an unformattable locale and an unholdable currency, canonical storage, audit.
- `packages/ui-metadata/tests/descriptors.test.ts` — the descriptor matches the
  schema, and the codec refuses to guess a currency.

**Proved to bite** (Rule 9), each on a server the harness started for the run:

- The formatter made to ignore the tenant locale: the e2e went red at the first
  post-switch assertion — `/settings` never showed `5.9.2026` — while the
  permission test beside it stayed green; all six formatter unit tests failed.
- A component made to format for itself in `'en-GB'`: the guard failed on both
  the platform-formatter rule and the locale-literal rule.
- The `admin:settings` check removed: exactly the refusal test failed, with a 200
  where a 403 was expected.

Sites converted: every `'en-GB'` formatting call in `app/`, `components/` and
`lib/`, by a script that kept each site's own shape options and changed only
where the locale comes from; the four currency-symbol maps were deleted rather
than converted.

**What this does not do.** Dates render in the *viewer's* time zone, not the
tenant's — see G-100. `formatMoney` in `@metis/core/domain` still carries its own
symbol map; nothing in the console calls it. The performance API still answers
minor units with no currency (G-093): the screen now knows the currency from the
tenant, but the response still cannot describe itself.

### G-035 — A reused dev server corrupted results, and the harness now owns the server it measures

**Registered:** 2026-09-09 · **Resolved:** 2026-09-13 · **Status:** Resolved · **Work item:** none

**How it was filed.** *"A long-lived dev server degrades until the suite is
unusable."* Playwright reused whatever was on port 3000
(`reuseExistingServer: true`). On 2026-09-09 a `next dev` process up seventeen
hours at 2.2 GB ran `npm run test:a11y` at **2 tests in 10 minutes** where a
fresh one ran **49 in 2.7 minutes**. The decision then was to refuse a reused
server older than two hours — stated at the time as a guess with a reason, one
observation rather than a curve.

**What it actually is: the same class as [G-002](gaps.md).** A reused server
is a result that depends on where the suite ran rather than on the code. G-002
hid changes — a fixture edited after the server started never reached it, so a
bite-proof read as "this check does not bite". This one corrupts results — a
worn server does not fail, it slows, so every timing-sensitive assertion
becomes a coin flip and a slow suite reads as a flaky one. Neither announces
itself. Both were found by somebody distrusting a convenient result.

**The measurement that retired the threshold.** On 2026-09-12 a full run went
from about twenty tests a minute to about **one**, partway through, on a server
roughly forty minutes old. The two-hour guard could not have caught it, for two
separate reasons:

1. **Age was the wrong variable.** That server had served a full run and part
   of another, and other suites were running on the machine beside it. The
   damage tracked work served and load around it, not wall-clock time. Any age
   threshold either refuses healthy servers or admits worn ones.
2. **It ran once, before the suite.** A server that degrades *during* a run
   passes a check made at its start.

On a server the harness had just started, with nothing else running, the same
suite ran **384 passed in 16.8 minutes** with no slowdown from first test to
last.

**Three answers were weighed.**

- **A shorter threshold.** Rejected: it tunes the wrong variable, and would
  still have passed the forty-minute server at thirty-nine.
- **A throughput probe.** Measures the right symptom and would also catch
  contention. Rejected as the control: the baseline differs between a laptop and
  a CI runner, so the number is a guess again, and a probe before the suite has
  the same blind spot as the age check.
- **The harness owns the server's lifecycle.** Chosen. Every observed case —
  seventeen hours, forty minutes, and G-002's stale seed — was a *reused*
  server. Never reusing one removes the cause rather than estimating it.

**What was built.**

- `apps/console/playwright.config.ts` starts `next dev` on its **own port
  (3200)**, with its **own dist directory (`.next/e2e`)**, hands it a **run
  token**, and sets `reuseExistingServer: false`. With reuse off, Playwright
  refuses a busy port before any test runs.
- **The dist directory is what makes that livable.** Next 16 takes a lock at
  `<distDir>/lock` and refuses a second `next dev` on the same directory, so a
  suite on the default directory would fail whenever a person had the console
  open. On its own directory it runs beside theirs. Inside `.next`, so git and
  eslint already ignore it. `next.config.js` reads `NEXT_DIST_DIR`; everybody
  else gets `.next`.
- **`next dev` rewrote `tsconfig.json` on the harness's first run**, adding
  `.next/e2e/types` and `.next/e2e/dev/types` to `include` — the same thing it
  does for `.next/dev`. Committed rather than reverted, since a revert is
  recreated by every run, and `e2e-harness.test.ts` asserts the globs stay so a
  run leaves the tree clean.
- `GET /api/_test/uptime` echoes the run token. `global-setup.ts` refuses a
  server that does not echo *this* run's token, before the seed check.
- **The refusal logic is a pure function**, `apps/console/tests/server-trust.ts`,
  so each refusal is a unit test — `tests/unit/server-trust.test.ts`. That
  closes the half of [G-095](gaps.md) that was about the decision; see there
  for what remains.
- `tests/unit/e2e-harness.test.ts` pins the invariant: no reuse, a port nobody
  starts a console on, a dist directory of its own inside `.next`, the token
  handed over, and `next.config.js` honouring the directory. The first time a
  cold start feels slow, turning reuse back on is the convenient move; this
  fails before anyone believes a result from it.

**The cost, stated.** Every local invocation pays a cold start and the warmup
project's route compile — about half a minute on a warm cache. A bite-proof
loop that reran one spec against a live server now pays that each time. That
is the price of a proof meaning something, and Rule 10 already said a proof
against a reused server proves nothing.

**What this does not fix.** A machine doing other work while the suite runs.
The 2026-09-12 run was disturbed by suites started beside it, and no harness
setting prevents that. CLAUDE.md's rule stands: a run you disturbed is
discarded, not reported.

The two-hour age refusal is removed — with the server always minutes old it
could not fire — and its reasoning is kept here rather than deleted, because
the reason it was wrong is the useful part.

**`ECONNRESET` on teardown**, the one failure left under `--repeat-each=12`
when this was filed, has not been reproduced since and was not re-measured
here. It is a transport fault on a reused server's teardown POST; whether it
survives a harness-owned server is unknown, and it is not claimed fixed.

### G-097 — The note that exists to stop stale numbers had gone stale twice, for the reason it was written

**Registered:** 2026-09-12 · **Resolved:** 2026-09-12 · **Status:** Resolved · **Work item:** none

`docs/design/` holds four mockups given to this project as reference material
for building screens. Their volumes were invented. On 2026-09-11 each gained a
note in its chooser bar, because a wrong number in a design reference becomes a
wrong number in a screen:

> **Figures illustrative** — layout is the reference, not the numbers. Drawn
> before 2026-09-11; the seed now runs 2 live flows, 10,400 decisions, 5,200
> each, 35.0% offered, and no `outbound_call`.

**Eleven days later every figure in it was wrong.** The tenant became
`telco-us`: one flow, five offers, three channels, 45.1% offered. The note was
rewritten on 2026-09-12 with the new numbers — the second time the same
sentence had been corrected for the same reason, and the first correction was
itself the fix for the mockups being stale.

**A count in two places is a count that will disagree**, which is this
register's own opening principle and is what the note did: it restated figures
whose home is the console and the seed. Nothing checked it. No test reads
`docs/design/`, so it went stale silently and was noticed only when somebody
happened to read it beside the thing it describes.

**Resolved by dropping the figures and keeping the warning**, on the product
owner's decision of 2026-09-12. All four notes now read, verbatim:

> **Figures illustrative** — the layout is the reference, not the numbers.
> Placement and offer names are checked against the fixtures; every volume here
> is invented.

That sentence cannot go stale, does the whole job the note was added for, and
points a reader who wants real numbers at the console rather than at a design
file. The figures that remain in the mockups' own tables are exactly what it
disclaims.

The counter-argument, for the record: the figures made the gap between the
mockup and the product concrete, so a reader comparing a 2,146 against a real 5
saw immediately how far apart they were. That was the reason they were put in.
It was not worth a sentence that had been wrong more often than it had been
right.

**What still is not checked:** the placement and offer names the note now
claims are verified against the fixtures are verified by hand, not by a test.
No check reads `docs/design/`. The claim is narrower than the old one and
cannot rot the same way — a renamed placement makes the mockup wrong, not the
note — but it is a claim. A check that read the four files for placement ids
and compared them against `catalogue.ts` would be a small one to write.
Not registered separately; recorded here.

### G-002 — A reused dev server made Rule 9 unreliable, not just its fixtures stale

**Registered:** 2026-09-05 · **Resolved:** 2026-09-12 · **Status:** Resolved · **Work item:** none — the remaining half is [G-095](gaps.md)

**How it was filed, and why that was too small.** *"A reused dev server serves
pre-edit fixture data."* Playwright's `webServer` sets
`reuseExistingServer: true`, `store.ts` seeds itself at module load, and a
server already running when a fixture changes keeps the old seed — so the entry
said the workaround is to restart it. Filed as an inconvenience about demo data
for seven days.

*Since 2026-09-13 ([G-035](gaps.md)) the harness starts its own server every run
and never reuses one, so the reuse this entry describes no longer happens in an
ordinary run. The fingerprint refusal stays, as the check that names what
differs when it does.*

**What it actually is.** A mechanism that makes Rule 9 unreliable. A bite-proof
is *edit the guarded thing, watch the check go red.* If the edit never reaches
the server the check stays green, and the inference drawn is **"this check does
not bite"** when the truth is **"the check was never shown the change"** — a
false negative on the one control this project uses to decide whether a test is
worth anything.

It happened on 2026-09-12. A declared boost was set to 1.0 to prove an e2e
assertion depended on it; the suite passed; the reasonable conclusion — the
assertion is worthless — was wrong. Restarted, the same proof failed in one
line. **Nothing in the suite said so.** It was caught by distrusting a
convenient result, which is not a control. Every bite-proof in this project's
history was taken against whatever the dev server had loaded at startup.

**Fixed by refusal, not by reloading.** The store now carries
`seededFingerprint` — a hash per part of everything it seeded — and
`/api/_test/uptime` reports it. `global-setup.ts` computes the same function
over the files on disk and refuses the suite on a difference, naming the part:

```
  server seeded  a7c060c8ae60
  disk is        33b851ec550d
  differing in:
    boosts               server a47745ad62cc   disk 8ec46b5bbf1f
```

Reload was rejected deliberately. It fails open — a reload that misses a module
leaves the suite running against stale data and says nothing, which is the
failure being fixed — and a mid-suite re-seed would discard published versions
and ledger rows, trading one unreliable check for many flaky ones. Refusal
fails closed.

A timestamp was rejected too: *"older than the newest fixture file"* needs a
list of directories to watch, so it refuses a good server because an unrelated
file was touched and trusts a stale one whose staleness came from a directory
nobody listed. The fingerprint compares the thing itself.

**Where it had to live, which took two attempts.** Computing it from the fixture
modules compares disk to disk — Next re-evaluates an edited `catalogue.ts`
without re-seeding the store. A module-scope constant in `store.ts` fails the
same way, because the store is stashed on `globalThis` and survives hot reload
while the module does not. Only a field on the stashed object goes stale
together with the seed it describes. Both wrong versions reported "server
matches disk" for ever; see [G-095](gaps.md).

**And the guard's own silent hole is closed — this is where G-082 went.**

It read `if (!res.ok) return`, so a server answering the port but not the
endpoint was treated as no server at all. **The staler a server is, the likelier
it has lost the endpoint the guard asks about, so the check was least able to
fire exactly when it mattered most.** On 2026-09-11 a `next dev` with a broken
module graph answered `/` with 200 and every API with 404; the suite reused it
and produced 341 failures in 65 minutes against a commit that was fine, and the
guard printed nothing. It now refuses and names what answered.

That hole was registered as **G-082** on 2026-09-11, on the branch of
[PR #33](https://github.com/kevinbotman9-cpu/Metis/pull/33), which never merged
— so the id never reached `main`. The pull request was closed on 2026-09-12
rather than merged: by then the hole was fixed here, and merging would have
landed an *Open* entry describing a closed defect. **G-082 is therefore this
paragraph**, and the id is not reused.

**G-083 and G-084 were never used by anyone.** Not lost, not withdrawn — never
written. The sequence on `main` runs 081, then 085, and the next person reading
it should not go looking for two entries that do not exist.

**Not covered.** The refusal path has no automated test — [G-095](gaps.md).

### G-094 — The storefront's headline contrast showed the same refusal twice, because its presets were one level too flat

**Registered:** 2026-09-12 · **Resolved:** 2026-09-12 · **Status:** Resolved · **Work item:** none — a defect, fixed in the slice that found it

`STOREFRONT_DEMO.md` describes the two presets a demo opens with:

> **Anonymous — fibre at the address** · Full Fibre wins the hero.
> **Anonymous — no fibre** · The same visitor, one field different.
> `acq_fibre_900 — ELIGIBILITY_FAILED · pol_fibre_available`, and SIM Only takes
> the slot. This is the cheapest way to show the cascade doing real work.

**Both presets produced the second answer.** Fibre was refused either way, and
SIM Only took the hero in both, so the cheapest way to show the cascade doing
real work was showing it do the same thing twice.

Each preset's input was shaped like this:

```js
input: {
  customer: { age: 34, credit_status: 'pass', … },
  address: { fibre_available: true },   // a sibling of `customer`
  usage:   { … },
}
```

`address` sat beside `customer`, not inside it. Every policy reads
`customer.address.fibre_available`, which resolved to `undefined`, and a
missing value fails a comparison closed — correctly. So the eligibility gate
refused fibre for the visitor whose address had it, and the demo's one
side-by-side contrast was two identical cascades.

**Why nothing caught it.** The refusal it produced is the refusal the demo
wanted to show, in the preset where it was wanted. Nobody comparing the two
screens would see a bug; they would see the no-fibre story working and assume
the fibre one did too. No test opened the panel (that was
[G-087](gaps.md)), and no test asserted the two presets differ.

**Fixed with the three scenarios that replaced them.** One customer id across
all three, every field under `customer`, and
`brief-scenarios.spec.ts` asserts the fibre and no-fibre slates are *not* equal
and that the second lacks what the first led with. `applyPreset` read the same
flat paths for its account widgets and was corrected with them.

### G-087 — The storefront's explanation panel rendered nothing, because the trace endpoint under-served and the panel read the wrong envelope

**Registered:** 2026-09-11 · **Resolved:** 2026-09-12 · **Status:** Resolved · **Work item:** none — two faults, both fixed; the third is [G-088](gaps.md)

`STOREFRONT_DEMO.md` says of the demo panel: *"Every figure in the panel comes
from the decision the platform returned."* **No figure in it ever had.** The
detail body of every decision card rendered as an empty `<div>` — no
eliminations, no scores, no chain hash, no connector provenance — from
`3d55f1a` on 2026-09-07, the commit that built the slate and the panel together,
until 2026-09-12. Four days, and every demo given from this page in them.

**Two separate faults, and the interesting one is not the obvious one.**

**1. The panel read the wrong envelope.** `return (await res.json()).decision`
against a route that serves the record at the top level. `undefined`, and the
card's whole detail block is a template literal guarded by `const d =
r.decision`, so it collapsed to the empty string. No error, no console warning,
a page that looked perfect above the fold.

That read is not arbitrary, which is why it survived: **the JVM service serves
`{ id, decision, chainHash }` at this same path** — the engine's runtime
envelope — while the console API serves the flat `DecisionRecord` the spec
declares. The panel was right about one of the two implementations. That
divergence is [G-088](gaps.md); it is not this entry.

**2. The DTO under-served, and unwrapping alone would only have moved the
failure.** Corrected to read the response itself, the next line throws on
`d.candidateKeys` — which the DTO did not carry. Nor `catalogueSnapshotHash`.

The projection had both and dropped them:

```ts
candidateCount: d.candidateKeys.length,   // the set, reduced to its length
// d.catalogueSnapshotHash — never carried at all
```

**`catalogueSnapshotHash` is the sharper omission.** `chainHash` covers the
input snapshot, the catalogue snapshot and the decision. The endpoint served
two of those three, so a caller held a hash it could not check and could not
say which catalogue produced the answer — from the endpoint whose entire job is
to answer that. The console's own replay route already reached *past* this DTO
into the stored runtime record to get the field, and the JVM service reports it
on `/health`. Everything needed it; only the contract lacked it.

**`candidateKeys` is a lossy projection of a fact the engine already has.** The
cascade rail's entry stage reads *"Every action the flow was allowed to
consider"* and could only print a number. The set is derivable — union every
denial key with the winner — which is exactly the re-derivation that produces
two consumers disagreeing about one decision.

**Decided: the DTO was wrong.** `DecisionRecord` now carries `candidateKeys`,
`catalogueSnapshotHash` and `schema`, all required; `candidateCount` stays and
is `candidateKeys.length`, derived rather than stored beside it. Serving them
moves no hash — the chain hash is over the engine's decision, not over this
projection — so the change is purely additive.

**The check that was missing.** `storefront-reporting.spec.ts` and
`outcome-loop.spec.ts` both drive this page hard and assert only on what the
*site* renders and what it reports back. Neither opened the panel.
`storefront-panel.spec.ts` now opens it and asserts both hashes are sha256, the
candidate set is named, the cascade lists refusals and the provenance names a
connector. Proven to bite by restoring the exact `.decision` read: it fails on
`not.toBeEmpty()` with *"unexpected value: empty"*, which is the original
symptom stated precisely.

### G-086 — The reject cooldown was authored, displayed, hashed, and enforced by neither engine

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — a defect, fixed in the slice that registered it

**What was false.** `/frequency-policy` told every reader:

> Frequency caps **and cooldowns**. These suppress an otherwise-winning offer,
> and the suppression is recorded in the trace so it can be explained.

and counted a metric, **"With cooldown — suppress after decline"**, over the
three policies carrying a non-zero value. `docs/review/GAPS_PLATFORM.md` said
*"Caps and cooldowns enforced"*. None of it was true. A customer who declined an
offer was shown the same offer on the very next request.

**What was actually there.** `cooldownDaysAfterReject` was declared on
`FrequencyPolicy` in `packages/core/src/domain.ts`, served by the API, authored
in the fixtures, rendered on the screen, and **hashed into every
`CatalogueSnapshot`** — so every decision this platform has ever made attests to
a rule that never ran. Read by nothing: the field appeared in thirteen files and
in neither engine's constraint node.

**Why it survived.** Three things pointed the wrong way at once.

- The reason code's own documentation claimed it. `types.ts` described
  `FREQUENCY_CAP_BREACHED` as *"A frequency cap **or cooldown** was already
  spent"*, so a reader of the engine saw the case handled.
- Nothing could have caught it. No test named the field, and none could have:
  `DecisionRequest` had nowhere to put a rejection, so there was no input that
  would have made a correct engine behave differently from the broken one.
- It is the half of a pair whose other half works. Caps are enforced, and
  "frequency policy" reads as one feature.

**The fix.** A cooldown needs an event the engine can see. `contactHistory`
gained `rejects` — the most recent decline per offer key, supplied by the caller
exactly as contact counts already are — and the constraint node now suppresses a
candidate when any offer inside a policy's scope was declined inside that
policy's window. Both engines, with a conformance case pinning them together,
and a distinct reason code, `COOLDOWN_ACTIVE`, because *"they said no
recently"* and *"we have contacted them too much"* are different facts about a
customer and a trace that conflates them cannot answer either question.

**What this deliberately does not do.** The platform still cannot record a
rejection of its own. `OutcomeType` is a monotone funnel — conversion ⊆
acceptance ⊆ click ⊆ impression — with no negative event in it, so a decline has
no home in the interaction log and the caller has to supply it. That is
consistent with how caps already work, and it is a smaller claim than the screen
used to make. Outcome-conditioned suppression driven by the platform's own
interaction history is [G-044](gaps.md)'s neighbourhood and remains absent.

### G-085 — Storybook could not build, and could not render a story with real data, while every pull request was required to screenshot one

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — a defect, fixed in the slice that registered it

**What was broken.** `npm run build-storybook` failed on main:
`"createHash" is not exported by "__vite-browser-external"`, in
`packages/runtime/src/deterministic/canonical.ts`. The fixtures a realistic
story renders from are the engine's output — `mocks/fixtures/catalogue.ts`
imports `seed.ts`, which runs `@metis/runtime`'s deterministic engine — and
the engine hashes with `createHash('sha256')` from `node:crypto`, which a
browser does not have. One failing import fails the whole preview bundle, so no
story built at all. In `storybook dev`, where modules load one by one, the two
story files that import fixture values — `nav-rail.stories.tsx` and
`layouts/list-detail.stories.tsx` — threw *"Module node:crypto has been
externalized for browser compatibility"*; both were loaded and seen to throw.
The other fifteen import no fixture values and were not individually checked.

**How long.** Measured from the history, and by building it:

| From | To | Storybook | CLAUDE.md required Storybook-first and a Storybook screenshot |
|---|---|---|---|
| 2026-09-03 20:36 (`27b325a`) | 2026-09-04 08:17 (`e500ddd`) | Absent until 21:55 (`4a5147d`), then unable to boot: `@storybook/nextjs` 7.6 needs `next/config`, which Next 16 removed — per `e500ddd`, *"so the stories actually run"*. Not rebuilt here | Yes |
| 2026-09-04 08:17 | 2026-09-09 05:04 | Worked. Built here at `9af3938` (2026-09-08 19:54), the commit before the break | Yes |
| 2026-09-09 05:04 (`7af77ff`, *"demo-telco-us is a tenant with a history"*) | this fix | `build-storybook` failed. Built here at `7af77ff` and seen to fail with the error above | Yes |

About **71 hours of the 188** the requirement had existed when this was
written (2026-09-11 16:45) — the first 12 with no Storybook that ran, the
last 60 with one that could not build. **All 31
pull requests this repository has merged** landed inside the second window;
six of them changed a story (#1, #4, #7, #8, #10, #31), and none could have
attached the screenshot the definition of done asks for from a built
Storybook. Nothing said so, because no gate and no workflow step ran
Storybook — `tests/gates-parity.test.ts` holds the gates to the workflow, and
neither had it.

**Fixed.**

- `.storybook/main.ts` resolves `node:crypto` to `.storybook/node-crypto.ts`
  — SHA-256, FIPS 180-4, fifty lines — for the browser bundle only. The
  engine's production hashing, every decision id and chain hash, still runs on
  Node's native implementation; the runtime is unchanged.
- `tests/unit/storybook-crypto.test.ts` holds the shim to `node:crypto` byte
  for byte: the published vectors, every length from 0 to 300 across the
  padding boundaries, multi-byte text, a megabyte, streamed updates, the
  `readUIntBE` the engine reads a digest through — and the engine's own
  `hash` and `seededUnitInterval` over the seeded catalogue, loaded once on
  each implementation. One round constant changed made all seven fail, the
  engine-level test included.
- **A gate, and a step.** `storybook` in `scripts/gates.mjs` and *Storybook
  builds* in `verify`, after the unit tests. Removing the alias turned the
  gate red on the same error; removing the workflow step and keeping the gate
  turned `gates-parity` red. `build-storybook` gains `--disable-telemetry`:
  without it a failed build stops at an interactive crash-report prompt, which
  would hang a local `npm run gates` rather than fail it.

**Evidence.** With the fix, the static build loads all 94 stories in
Chromium, each rendered and none throwing; a story id that does not exist was
reported as an error by the same probe, so it can fail.

**Not done.** A build proves the bundle, not that each story renders. The
render probe above ran by hand; making it a gate needs a browser in `verify`
or a job of its own, which is a decision about CI time rather than a fix.

### G-081 — The migration tests force-drop their database while its connections are still closing, and fail with every assertion passed

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — a defect in tests written for G-076 to G-078, fixed in the slice that registered it

**What failed.** `verify` on PR #29, a change to this file alone: run
34607009000, job 103287789058, the Core step. All 6 files and all 130 tests
passed; Vitest then failed the step on one unhandled error — `57P01
terminating connection due to administrator command` — from a connection to
`metis_migrate_check_3109_…`, the database `tests/migrate.test.ts` makes for
itself. Once in the 23 Console runs since the forced drops landed; the other
two failures in that window are not it. Nothing on the branch touched a test.

**Why.** Each of the four migration test files — core's `migrate.test.ts` and
the `migration.test.ts` of registry, ledger and catalogue — ends with
`await own.pool.end()` then `DROP DATABASE … WITH (FORCE)`. pg-pool's
`end()` resolves when its list of clients is empty, and `_remove` empties that
list *before* `client.end()` has closed anything (`node_modules/pg-pool/index.js`,
`_remove` and `_pulseQueue`). So the drop can arrive while a connection is
still closing. `FORCE` terminates it; the server sends it `57P01`; the
client's idle listener re-emits that on the pool, and the pool has no error
listener, so it surfaces as an uncaught exception. The client in CI's log is in
exactly that state: `_ending: true`, `_ended: false`.

**Reproduced.** With each connection held open 200 ms past the point
`pool.end()` resolves, ten teardowns gave **20 uncaught `57P01`s with
`FORCE`** — two connections, two errors, every time — and **none with a
plain drop**, which waits for them to leave. Unheld, 20 forced teardowns on
the development machine gave none: the window is narrow, and CI is where it
opens.

**Fixed.** All four files drop plainly. A plain `DROP DATABASE` never tells a
backend to terminate — `57P01` cannot arise from it — and waits up to five
seconds for other sessions to go. If one never does, it refuses, naming the
database: *"is being accessed by other users"*, seen with a pool deliberately
left open. `FORCE` had been turning that leak into a random uncaught error
instead.

**The check.** `tests/database-suites-serialised.test.ts`, *"never force-drop a
database while its pool is still closing"*: no test file in a package that
opens PostgreSQL connections may force-drop a database, comments aside. It went
red naming `packages/core/tests/migrate.test.ts` with main's version of that
file restored, and again naming `packages/catalogue/tests/migration.test.ts`.

**Evidence.** Core, registry, ledger and catalogue, 3 runs each against a
freshly created database: 12 of 12 green, no unhandled error in any log, no
database left behind. That is evidence the plain drop works, not that the
flake is gone — it never showed locally. The reproduction above is the
evidence about the flake.

### G-071 — Two compile contexts disagree, and the registry published under the weaker one

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-075](BACKLOG.md)

`retention-outbound` — *Retention Outbound Queue*, active, version 3.1.0 —
compiles or does not depending on who asks.

- **The console's compile view rejects it.** `compiled.ts` compiles with
  `servedChannels`, so ADR-012 §B2's channel-aware `NO_DELIVERABLE_CREATIVE`
  fires 18 times, one per offer whose creatives cannot be rendered on a channel
  this flow serves. `/decision-flows` shows the flow red and the home page
  counts it blocked.
- **The registry accepted it.** `seedRegistry` publishes against plain
  `compileContext`, which omits `servedChannels`, so the same check falls back
  to *"has an id in `creativeIds`"* — which these offers satisfy. Version 3.1.0
  is published and promoted to production, and the decide route executes it.

So the flow is live because one context accepted it, and shown as broken
because another rejects it. Neither is wrong about its own question; nothing
holds them to each other.

**What it decides.** Of the 3,466 seeded decisions this flow made, **807 award
an offer today's channel-aware check refuses** — 23%, across 8 distinct offers.
The engine is not wrong to award them: ADR-012 deferred option A, eliminating
such a candidate before arbitration, so nothing in the decision path filters
them. The compiler is the only thing that knows, and the context that knows is
not the context that published.

**Nothing fails.** The screen shows it, no check asserts it. A publish today
through the console's own route would be rejected, because
`currentCompileContext` passes `servedChannels`; the seeded registry does not,
and nothing compares what the registry accepted against what the console would
accept now.

**Found on 2026-09-11 while pinning the schema.** The seeded exec artifacts
first took their pin from the console's compile view, so two of four carried
none — and every one of this flow's decisions then disagreed with the same
decision made through the route, which runs what the registry published. The
fixtures now pin from the registry's context, which is what the route executes,
and the corpus agrees again.

That fix is also the sharp version of the problem: **a pin is only worth what
the artifact it sits on is worth**, and there are two artifacts for this flow —
one the registry published and one the console would refuse to publish. The
same is true of `policySources` and the node tiers from [G-055](gaps.md) and
[G-058](gaps.md), which are equally pinned to whichever compile happened.

It has been in this state since 2026-09-10, when [G-042](gaps.md) tightened
`NO_DELIVERABLE_CREATIVE` from *"no creative at all"* to *"no active creative
on a channel this flow serves"*. Before that it compiled clean. The offers it
awards have been undeliverable for longer than that; the check that says so is
a day old.

**Done when:** one compile context serves both, or a check fails when a
published version would be rejected by the context the console compiles with
today.

**Resolved by one builder.** `compileContextFor(flowId, sources)` in
`apps/console/mocks/fixtures/compiled.ts` is the only place a compile context is
assembled. The caller supplies the catalogue it wants judged — the fixtures for
a seeded compile, the store for a live one — and the per-flow part, which
channels this flow's own slots deliver on, is computed from that same catalogue
rather than from a second lookup. `seedRegistry`, the publish route and the
console's flow list all call it. The route's private `decidableChannelsFor` and
the fixture's `servedChannelsFor` were the same logic written twice; both are
gone.

**Not "the console drops `servedChannels`".** That would undo ADR-012 §B2, the
check that exists because an offer whose only creative is switched off used to
compile clean. The weaker context was not a decision anybody took; it was
`seedRegistry` being written before `servedChannels` existed and never
revisited.

**The check that would have caught it:**
`apps/console/tests/unit/compile-context.test.ts` — every version the registry
has in production must compile under the context the registry publishes with,
and the flow list's verdict must equal the publish verdict. Verified to bite by
recreating the bug: publishing with an empty channel set and marking the flow
active fails two of its four assertions, naming the flow in production the
compiler refuses.

**What the demo loses.** `retention-outbound` is `retired`, so three live flows
become two:

- **3,466 of the 10,400 seeded decisions came from it**, a third of the corpus.
  They are gone; the two surviving flows now make 5,200 each.
- **Every one of the 807 offers it made was undeliverable.** Its 807 winning
  decisions and the 807 that awarded an offer the compiler refuses are the same
  set — the flow never once produced an offer that could be delivered.
- **Its slot is no longer decidable.** `plc_retention_queue` delivers on
  `outbound_call` and had no live flow left to answer it; a slot that still
  called itself decidable would be claiming an agent can be prompted with an
  offer nothing will produce.
- **The seeded history has no outbound-call decisions at all.** The generator
  drew a fifth of its decisions for that slot, and a corpus that kept doing so
  would be seeding history the platform would now refuse to make. Four channels
  remain — web 2,657, sms 2,603, email 2,574, push 2,566. The demo loses the
  one channel a human being was going to speak on, which is the honest state of
  a tenant with two outbound-call creatives.

**A check already here caught the half-done version.** `fixtures.test.ts` —
*decides only for slots that are live* — failed with `['retention_queue']` when
the flow was retired and the generator was not, which is exactly its job.

**Why not author the eighteen creatives instead.** That would have turned a red
check green by inventing the content whose absence is the finding. This tenant
has **two** active outbound-call creatives against 78 email, 79 sms, 75 web and
69 push — [G-044](gaps.md) — so a retention flow that can only telephone people
has almost nothing to say on the telephone. Writing eighteen call scripts into
the fixture would have buried that.

**The corpora moved once**, predicted and then diffed: every decision id and
chain hash in `decision-index.json` was compared before and after. 3,468
decisions kept their exact chain hash, 6,932 were replaced, and
`service-cases.json` moved 120 of 180 hash fields — the chain and input halves,
not the catalogue, which this change does not touch. `decision-corpus.json` and
`canonical-corpus.json` moved **zero**, as predicted: their cases are synthetic
and name none of this tenant's flows.

### G-078 — The new migration tests run beside the Postgres suites and flake, in whichever package loses the race

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — the fix is a
one-line sequencing change and the choice is below; see *Closed* at the end

`packages/{registry,ledger,catalogue}/tests/migration.test.ts`, added on
2026-09-11 for [G-076](gaps.md), each **create and drop their own database** —
`CREATE DATABASE`, then `DROP DATABASE IF EXISTS … WITH (FORCE)` — and Vitest
runs them in parallel with the package's existing `postgres.test.ts`, which is
working in the shared `metis_*_test` database over the same server. Creating a
database, force-dropping one, and migrating another concurrently is a lock
pattern PostgreSQL is entitled to refuse.

**Two failures, in different packages, neither reproducible afterwards:**

- **CI**, on the merge commit for PR #23: `packages/ledger/tests/postgres.test.ts`
  › *keeps tenants apart* failed with `40P01`, a deadlock — *"Process 127 waits
  for AccessExclusiveLock on relation 17580; blocked by process 129. Process 129
  waits for ShareLock on relation 17603; blocked by process 127."*
- **Locally**, on the same commit, a different package:
  `packages/registry/tests/migration.test.ts` timed out in a hook after 10s
  while `postgres.test.ts` ran beside it.

Neither reproduces. `test-registry` is 3 for 3 on `main` without the merge, and
3 for 3 on the merge commit; a full `npm run gates` on the merge commit was
22 of 22 with both Registry and Ledger green. **The failure moves between
packages and survives on neither tree, which is the signature of contention
rather than of a defect in either.**

It will bite every pull request until those tests are serialised, and each time
it will look like a different package's fault.

**Three fixes, and the one to take:**

1. **A per-package advisory lock.** `pg_advisory_lock` around migration and
   teardown, so the two files take turns. The most surgical, and it puts
   locking logic inside the thing under test — a migration test that passes
   because its own lock worked is testing the lock.
2. **A Vitest sequencing rule.** `sequence.groupOrder`, or marking the database
   files sequential. Equivalent in effect and spread across two mechanisms;
   somebody adding a fourth database file has to know to add it to the list.
3. **`fileParallelism: false` for the three database packages**, in each
   package's Vitest config. One line each, no new logic, and it covers every
   file added later without anybody remembering.

**Take 3.** These suites are I/O-bound against one server, so parallelism buys
almost nothing — the whole registry suite is about 12 seconds — and the cost it
does buy is a red pull request that reproduces nowhere. The advisory lock is
worth revisiting only if a database suite ever grows large enough for the
serial time to matter.

**Done when:** the database suites in those three packages cannot run
concurrently with each other, and a run of each package's tests repeated ten
times is clean.

#### Closed 2026-09-11

**What deadlocked, read from the server log CI kept.** Not the migration tests
themselves. Process 127 was the ledger's `postgres.test.ts` running
`TRUNCATE outcome_events, idempotency_keys, decision_records` between cases;
process 129 was the ledger migration being re-applied to the same database —
the pre-runner file, `BEGIN; CREATE TABLE IF NOT EXISTS …`, which
`create-store.test.ts` re-ran every time it built a store. The re-run took
`ShareLock` for each `CREATE INDEX IF NOT EXISTS` and the truncate took
`AccessExclusiveLock` for each table, in opposite orders. The new migration
tests' `CREATE` and `DROP DATABASE` calls appear in the same log as forced
checkpoints seconds before: they widened a window between two files that were
already racing. That merge commit was tested before the runner (G-077) landed.

Reproduced directly: 200 truncates against 200 concurrent migration re-runs on
one database gave **4 deadlocks with the pre-runner file** (`5aefa4b`) and
**0 with the runner**, which runs no DDL on a database already at its version.

**The hook timeout is a second mechanism, and it is not concurrency.** It
recurred in core with its files already serialised: all 128 assertions passed
and the file failed in `afterAll`, five databases left behind. The server log
says why. Every case created a database of its own; each `CREATE DATABASE`
copies the template into shared buffers; and the first `DROP DATABASE` forces
a checkpoint that writes them all — 10,231 buffers, **53.9 seconds** on the
development machine, against a 60-second limit. The runs either side scraped
through at 50.6 and 44.6. CI's checkpoints take milliseconds, which is why this
half showed only locally.

**Fixed both ways.**

- **`fileParallelism: false`** in the Vitest config of every package whose
  tests open a PostgreSQL connection: registry, ledger, catalogue — option 3
  above — and core, whose runner tests create databases.
  `tests/database-suites-serialised.test.ts` holds it for a package that
  starts talking to the database later; it went red naming `ledger` with the
  setting removed, and again with it commented out.
- **One database per migration test file, emptied between cases** with
  `DROP SCHEMA public CASCADE; CREATE SCHEMA public`, instead of one per case.
  Each case still starts from nothing — no tables, functions, triggers or
  version table — and there is one template copy to flush instead of ten. The
  runner's bites were re-run under it and fail exactly as before.

**Evidence: repeated runs, each against a freshly created database, as CI
starts with.**

| Tree | Result |
|---|---|
| `main`, before either fix | ledger, registry, catalogue 30 of 30 green — and in all 30 the database files ran at the same time, by Vitest's own timings |
| Files serialised only | ledger, registry, catalogue 30 of 30, one file at a time; core failed its first run on the checkpoint above |
| Both fixes | ledger, registry, catalogue and core 10 of 10 each — 40 of 40, no two database files overlapping in any run, no skipped test counted as a pass, no database left behind, and no checkpoint over 7.4 seconds |

The first row is the argument against trusting a green run here: thirty in a
row passed while the race was running every time.

**One hazard this leaves standing.** These suites **skip rather than fail when
the database is unreachable** — `it.skip("postgres at … is not reachable")`.
With the shared test databases missing from a development machine, a serialised
run reported *"3 passed | 2 skipped"* per package and exited green: the whole
PostgreSQL half had not run, and the only sign was a skip count. CI is safe,
because its service container is always there. It is why the evidence above
counts tests rather than exit codes.


### G-077 — A change inside an existing `CREATE` never reaches a database that already has the table

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — decided and built the day it was registered; see *Closed* at the end

**How the schema changes today.** Each of the three stores has one migration
file (`packages/{registry,ledger,catalogue}/migrations/001_*.sql`), re-run whole
by `runMigration` on every start, built from `CREATE … IF NOT EXISTS`. That
statement does nothing to a table that already exists. So editing a column, a
constraint or a default inside it changes every *new* database and silently
never reaches an existing one. The only way a change reaches an existing
database is a hand-written conditional statement in the same file — an
`ALTER … IF NOT EXISTS`, or a `DO` block that probes `information_schema` first
— and nothing records which of them a given database has run.

**The registry has needed four of those in seven days**: the `strategy_name` →
`flow_name` rename, `shadow_version`, the widened event-type `CHECK`, and
`tests`. One of the four was placed where it could not work, which is G-076. The
ledger and catalogue have so far only added whole tables, which do reach an
existing database.

**The checks added for G-076 cannot see this.** They migrate an *empty* database
once and twice and compare; an edit inside a `CREATE` applies to an empty
database identically both times. The one upgrade case that exists covers a
single column, `registry_versions.tests`. CI never sees an old database at all,
because every job starts with a new one.

**It has already happened.** Every historical version of each migration was
built into a database and upgraded with today's migration, then compared with a
fresh one — a one-off diagnostic, not a check. Ledger and catalogue: every
version reaches today's schema. Registry: every version does except the first.
A registry database created before the vocabulary rename (`929d6ef`, 2026-09-04)
ends with both foreign keys on `registry_environments` still named
`…_strategy_name_active_versi_fkey` and `…_strategy_name_previous_ver_fkey`: the
rename renamed the columns and not the constraints. The local
`metis_registry_test` this was written on carries both. They behave identically
today; the first change that names either constraint misses it on that database,
and `IF EXISTS` makes the miss silent.

#### The fix, as it was registered

1. **Numbered migrations, each run once, with a recorded version.** `001_…`,
   `002_…` per package; a `schema_migrations` table (version, checksum, applied
   at) written in the same transaction as each migration, under the advisory
   lock `runMigration` already takes; a runner that applies what is missing in
   order and **refuses to start if an applied file's checksum has changed**. A
   change is a new file, reviewed as one. Nothing edits history.
2. **An upgrade-diff check, keeping the one idempotent file.** CI builds a
   database from the base branch's migration, applies the pull request's, and
   diffs it against a fresh one — the diagnostic above, run on every change. It
   detects and fixes nothing: every change is still hand-written conditional DDL
   in one growing file, a constraint change still needs a `DO` block, and it
   proves an upgrade from the previous version only, not from whatever version a
   deployment is actually on. A data backfill has nowhere to go.
3. **A declarative schema-diff tool at deploy** (Atlas, pg-schema-diff and the like).
   The target schema is declared and the tool writes the `ALTER`s. That puts
   generated DDL against production at start-up, and an ambiguous change — a
   rename — reads as drop-and-add, which on an append-only table is data loss
   nobody reviewed.
4. **Freeze the `CREATE` bodies.** A check refuses any edit inside an existing
   `CREATE`, so every change has to be an `ALTER` placed after it. The cheapest
   option. It keeps the conditional-DDL file and its reasoning cost, and still
   records nothing about what a database has run.

**Option 1, with a runner written here rather than a dependency.** The
one-connection lock and the file's own `BEGIN`/`COMMIT` are already bespoke in
three copies of `create-store.ts`, and what is needed is small: read a
directory, compare against a table, apply in order, record a checksum.
`node-pg-migrate` would also do it, and brings its own lock and table
conventions to reconcile with those.

**What option 1 costs today: one slice, and nothing else.** No chain hash moves,
no API changes, no data moves. The runner once, three `create-store.ts` files
switched to it, the three existing checks kept (all migrations applied to an
empty database produce the schema), and one new check: a file under
`migrations/` that exists on `main` may not change. And one thing that is only
free now: **each `001` can be rewritten as a plain baseline**, the rename block
and the conditional steps deleted and the two constraints given their current
names, because no database exists whose upgrade path has to be preserved.

**What it costs once a database holds real data — and this is what should
decide the timing.**

- **Nothing records what any database has run.** Adopting numbered migrations
  then starts with inferring each live database's version from its schema, by
  the kind of diff above, one environment at a time, and recording a baseline
  that was guessed. A wrong guess applies DDL to production, or skips DDL it
  needed.
- **The shims become permanent.** Every conditional step in each `001` is then
  load-bearing for some live database, so none can be removed, and every reader
  of the file carries all of them, correctly ordered, forever.
- **Changes that need existing rows rewritten stop being free.** The ledger's
  three tables, `registry_events` and `catalogue_events` refuse `UPDATE` and
  `DELETE` by trigger. Today a `NOT NULL` column with no default, a narrowed
  `CHECK`, or ADR-004's amendment — encrypting `decision_records.record` and
  re-deriving its subject column — costs nothing, because there are no rows.
  Once there are, each needs either a trigger bypass inside a migration, which
  ADR-004 rejects as the end of the guarantee, or a new table beside the old
  one that still holds what it cannot delete.
- **The timing is fixed from both sides.** ADR-004's amendment already says no
  deployment may write real customer references to the PostgreSQL ledger until
  its changes land. Those are the first non-additive changes this schema will
  need, and they need a mechanism that runs a change once and records that it
  did. So: before or with ADR-004's ledger changes, and before the first
  database that holds real data — which is the same date.

**Done when:** a database created from any earlier migration reaches the same
schema as a fresh one, held by a check that builds such a database rather than
assuming it; an edit to a change that has already been applied is refused by a
check; and which option was taken is recorded.

#### Closed 2026-09-11, with option 1

`packages/core/src/migrate.ts` applies `packages/{registry,ledger,catalogue}/migrations/NNN_*.sql`
in order, each once, in a transaction with a row in `<store>_schema_migrations`
recording its version, name and checksum, under the store's own advisory lock. A
runner written here rather than `node-pg-migrate`: the three copies of the lock
and transaction handling in `create-store.ts` are now one. Before applying
anything it refuses an applied file that has changed or been renamed, an applied
file that is gone, a gap or duplicate in the numbering, a file with its own
`BEGIN` or `COMMIT`, and a database that has the first migration's objects and
no record of running it — one built before this, refused rather than adopted so
its drift is not carried forward.

**The one-time freedom was taken.** Each `001` is now a plain baseline: no
`IF NOT EXISTS`, no conditional blocks, no `BEGIN`/`COMMIT`. The registry's
rename block and its three other upgrade steps are deleted, and the two foreign
keys on `registry_environments` are named in the migration —
`registry_environments_active_version_fkey` and
`registry_environments_previous_version_fkey` — so nothing depends on a name
Postgres generated from a column that has since been renamed, and no database
carries the `strategy_name` names forward.

**Checked three ways, each seen to fail:**

- **An edited applied file.** The runner refuses it —
  `refuses an applied file that has changed, and applies nothing` and
  `refuses a renamed applied file` in `packages/core/tests/migrate.test.ts`,
  both red with the checksum comparison taken out of the runner. And a pull
  request cannot make the edit in the first place: `tests/migrations-frozen.test.ts`
  compares every migration file where the branch left `main` against the
  working tree by the same checksum. Against a commit holding the runner it went
  red on a one-line comment added to `001_registry.sql`, and on
  `001_ledger.sql` deleted; a new `002` passed. CI checks out with
  `fetch-depth: 0` so `origin/main` is there, and the check fails rather than
  skips without it.
- **A missing file in the sequence.** `refuses a missing file in the sequence`
  — refused from the directory, before a connection is opened — and
  `refuses a database that has run a file which is no longer there`; red with
  the gap check and the missing-file check taken out respectively.
- **A database at an older version reaching a fresh one's schema.**
  `brings a database at an older version to the schema a fresh one has` in core,
  over a three-file sequence, and
  `brings a database at every earlier version to the schema a fresh one has` in
  each store. With the runner made to skip a file on resume, both went red —
  the store's version proved with a temporary registry `002`, failing on
  exactly the index that file created. Until a store has a `002` its loop has
  nothing to iterate, and its comment says so rather than hiding it.

The G-076 checks stay in all three stores: one run produces the schema two runs
produce, and the store can read after one run.

**What it costs, once.** A database built before this is refused, with a message
naming it and saying to drop it; the local `metis_registry_test` on the machine
this was written on is one. CI is unaffected — every job starts with an empty
database. After that, the cost is the one this was chosen for: a change to a
schema is a new file.

### G-076 — The registry migration leaves out a column on a fresh database, and CI fails when the wrong test file migrates first

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** none — a defect, fixed in the slice that registered it

`packages/registry/migrations/001_registry.sql` adds `registry_versions.tests`
with `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS` at line 68 — **before**
`CREATE TABLE IF NOT EXISTS registry_versions` at line 71, which does not
declare the column. On a database that has never been migrated, the first run
skips the `ALTER`, because there is no table yet, and then creates the table
without the column. The column exists only after a second run.

CI starts an empty PostgreSQL for every `verify` job, and two files in the
Registry step migrate it in parallel vitest workers: `tests/create-store.test.ts`
through `createRegistryStore`, and `tests/postgres.test.ts` directly. The
advisory lock in `runMigration` serialises the two runs and does not order them.
When `create-store.test.ts` takes the lock first, the second run adds the column
and the suite passes. When `postgres.test.ts` takes it first, it starts querying
a table with no `tests` column:

```
tests/postgres.test.ts > registry over postgres > stores a flow that compiles
error: column "tests" does not exist
  at PostgresRegistryStore.getVersion  packages/registry/src/postgres-store.ts:87
```

**It has failed four of the last sixty Console runs**, every time on that test
with that error, and once on `main`:

| Run | Event | Branch | Commit |
|---|---|---|---|
| 34324459994 | pull_request | `feat/shadow-mode` | `a2494d3` |
| 34499075432 | pull_request | `feat/delivery-record` | `4173581` |
| 34516083121 | workflow_dispatch | `main` | `e6d62ab` |
| 34581324960 | pull_request | `docs/retention-suitability` | `eac2fd3` |

`e6d62ab` is the clearest of them: it passed `verify` on push at 18:36 and failed
it on a manual dispatch at 18:43, with no change in between.

**Nothing registered it.** Each of the first three was followed by a green run on
the next attempt, which is what a race looks like from outside, and the fourth
landed on a docs-only pull request whose code was byte-identical to a `main` that
had just passed.

**The flake hunt cannot see it.** It re-runs the Playwright suite — three passes
and a shuffled one — and never runs the registry's PostgreSQL tests; the job has
no database. Repeating them would not help if it did: the race exists only on a
database's first migration, and every later run finds the column already there.
It is a race in database setup, not in the suite, and repeating the suite against
one database cannot reproduce it.

**Done when:** the `CREATE` declares `tests`; the `ALTER` stays for databases
created before it; and a check that migrates a fresh database once asserts the
schema is complete — the same schema two runs produce — verified to bite by
reverting the migration.

**Closed 2026-09-11, in the slice that registered it.** The `CREATE` now
declares `tests`, and the `ALTER` stays for databases whose table predates the
column, with a comment saying why both exist
(`packages/registry/migrations/001_registry.sql`).
`packages/registry/tests/migration.test.ts` gives each case an empty database of
its own — the condition every other check in the package hides — and asserts
three things: one run produces the schema two runs produce, compared across
columns, constraints, indexes and triggers rather than against a hand-kept list;
the store can read after one run; and the `ALTER` still adds the column to a
table that lacks it.

Verified to bite twice. With the migration reverted to its committed form, all
three fail — the first on exactly one missing column, `registry_versions.tests`,
the second on CI's own error. With the `CREATE` fixed and the `ALTER` deleted,
the first two pass and the third fails alone, so the upgrade path is held by its
own check rather than borrowed from the fresh-database ones. The Registry step's
78 tests then pass against a freshly created database, the state CI starts every
job in.

**Superseded the same day by G-077.** The `ALTER` kept above for databases
created before the column is gone with the rest of `001`'s upgrade steps:
`001_registry.sql` is now a plain baseline applied once by the runner, and a
database built before it is refused rather than patched.

**Extended the same day to the other two migrations in the tree**, the ledger's
and the catalogue's (`packages/{ledger,catalogue}/tests/migration.test.ts`).
Both passed on arrival: neither has this defect. Each check was then seen to
fail with G-076's shape planted in its own migration — a column moved out of
its `CREATE` into an `ALTER` ahead of it — on both the one-run comparison and the
store's reads, and passes again with the migration restored.
### G-069 — A rule's fields and a connector's fields are different vocabularies

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-074](BACKLOG.md)

A targeting policy names fields as dotted paths into the profile:
`customer.bill_to_income_ratio`, `contract.days_to_end`,
`usage.pct_of_allowance_3mo_avg`. A connector declares what it provides as flat
names: `monthlySpend`, `arrearsDays`, `inGoodStanding`, `dataUsageGb`.
**Nothing maps one onto the other**, so no policy in this tenant reads a field
any connector supplies.

**The trace cannot say where a value came from.** The evidence pane's *Source
system* row resolves a rule's fields against `sourceBindings` and finds nothing,
every time, for every rule. It has been drawing "no connector supplied a field
this rule reads; the value came from the request" since it was built, which
reads as a fact about the decision and is really a fact about the vocabularies.
Found on 2026-09-11 while wiring [G-056](gaps.md), which is why the value
timestamps went onto the decision rather than under the rule.

**The seeded decisions do not consume integration data at all.** The generator
builds a nested profile, and the connectors' declared fields are read by no
policy, so the integrations in this corpus are decorative: the latency budget
counts them, the trace records bindings for them, and no decision turns on a
value any of them supplied. A demo claiming a connector fed a refusal would be
describing something that did not happen.

A modelling gap rather than a fixture typo. Either connectors declare what they
provide in profile-schema paths, or something maps between the two and the
mapping belongs in the artifact. Either changes what decisions read, so it moves
every chain hash in the corpora — which is why it is registered here rather than
fixed in passing.

**Done when:** a policy condition can name a field a connector supplies, a
decision reads it, and the trace's source attribution resolves — with the corpus
regenerated deliberately and the hash movement recorded.

**Resolved by** ADR-014 §2's first instalment, accepted 2026-09-11.

**Profile paths won**, and the reasoning is in the code rather than in taste:
the engine already resolved every policy condition by dotted path
(`readPath`), the compiler already validated those paths against this schema
segment by segment, and a connector already declared two names per field —
`path` into its own payload and `field` for where the value lands. Only the
second changed meaning. A mapping layer was rejected: it would have been a
third vocabulary, and to be replayable it would have had to be pinned in the
artifact, which is one more thing to drift.

**What changed:**

- **Two roots.** `Customer` holds what is true of a subject whoever supplied
  it; `Context` holds what only the caller knows. Aliases are declared, so
  `customer.age` still resolves and `address.fibre_available` became
  `customer.address.fibre_available`.
- **Every field declares `origin` and `class`**, both required by the type.
  `origin: 'connector:conn_credit_bureau'` is what lets a trace name the system
  behind a value; `class` is declared and not yet acted on, because consent is
  ADR-014 §7 and its own chain-hash move.
- **The schema is pinned.** The compiler hashes its content into
  `{ id, version, hash }`, the artifact carries it, and every decision carries
  the same triple — `null`, explicitly, when an artifact pins none.
- **Connectors declare profile paths**, `resolveInputs` writes by path, and the
  caller's input is merged branch by branch rather than replacing a whole
  branch. A shallow spread would have dropped every resolved value behind one
  field the caller happened to send.
- **`pol_credit_pass` reads `customer.credit_band`**, supplied by
  `conn_credit_bureau`. About one customer in seven is refused on a value the
  tenant's own record does not hold, and the trace names the connector that
  supplied it.

**The same bug existed in both engines, and neither had seen it.** Source
bindings were derived with `binding.field in request.input` in TypeScript and
`request.input.containsKey(binding.field)` in Kotlin — a flat-key test against
a path, so every binding was dropped and the trace could attribute nothing. The
Kotlin half surfaced only because all 60 service decisions diverged after the
TypeScript half was fixed.

**The corpora moved once, deliberately**, and every hash was diffed: 981 fields
compared, before and after. `decision-corpus`: 28 chain hashes, being the 27
existing cases plus one new case that pins a schema — no existing input or
catalogue hash moved, because that corpus's inputs and catalogues did not
change. `service-cases`: 60 of 60, on all three hashes. `canonical-corpus`:
none, because it tests serialisation rather than decisions. The Kotlin engine
reproduces all of it byte for byte.

**What it does not cover:** the decide route still injects `experiments` at the
input root, which neither root declares ([G-072](gaps.md)); and two of the
schema's own fields — `credit_status` and `credit_band` — now describe the same
question from two sources, which is a modelling tidy-up nobody has done.

### G-058 — A node's type cannot say which question the node answers

**Registered:** 2026-09-10 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-066](BACKLOG.md)

`filter_suitability` has `nodeType: 'constraint'`. So does `constraint_contact`.
One is the FCA-facing affordability tier and the other is a weekly contact cap,
and the compiled artifact records the same type for both.

The type says how a node *behaves* — it removes candidates against a predicate —
and nothing says which of the three targeting tiers, or none of them, it
implements. `filter_eligibility` and `filter_relevance` are both `'filter'`, so
the same collision exists one tier up.

The trace reader needs the tier to label its rail, and with the type unusable it
infers from the node **id**: `/suitab/` matches `filter_suitability`,
`/frequen|contact|cap/` matches `constraint_contact`. That works on this
tenant's four flows and is fragile in exactly the way a name derived from an
identifier always is. A flow authored tomorrow with a node called
`check_the_money` gets labelled by its raw id, which the screen renders honestly
and which is still not the tier.

The information exists upstream: a `TargetingPolicy` has `kind: eligibility |
relevance | suitability`, and a filter node names the policies it applies. The
tier could be derived from the policies rather than guessed from the id — that
is a compiler change, not a console one, and it would put the tier in the
artifact where the trace could simply read it.

**Done when:** an elimination names the tier it belongs to, or the compiled node
carries it — so no reader has to parse an identifier to find out which question
refused an offer.

**Resolved by:** the compiler derives the tier from the kinds of the targeting
policies a node declares and writes it onto the compiled node — `tierOf` in
`packages/compiler/src/decision-flow/compile.ts`. A constraint node declaring no
targeting policies is `frequency`, which is what it enforces. A node whose
policies span two tiers gets none rather than one of the two, and the field is
absent rather than `undefined`, because the artifact hash is taken over that
object.

The trace reader reads it. Id matching survives only for nodes no tier
describes, behind the node's `type`, which names a source or an arbitrate node
exactly. `labelFor('check_the_money', 'constraint', 'suitability')` is the case
the old patterns could never have handled, and it is a test.

**No chain hash moved.** The tier is on the artifact, and the hashed decision
names its artifact by id and version, never by hash. Verified rather than
asserted: all 136 hash fields in `docs/conformance/` compared before and after
regeneration, none moved, and the corpora did not change at all — the service
bundle is built from exec artifacts, which carry neither new field.

**What it does not cover:** the tier names the policies a node *declares*, not
everything it enforces. Consent and frequency are applied at every constraint
node, so a `CONSENT_WITHHELD` denial can sit under a node whose tier is
`suitability`. See [G-070](gaps.md).

### G-056 — `sourceCalls` records how long a value took to fetch, never when it was computed

**Registered:** 2026-09-10 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-066](BACKLOG.md)

A `SourceCall` carries `connectorId`, `ms`, `cacheHit`, `outcome` and `fields`.
It has no timestamp.

So a decision can say *the consent registry answered in 12ms and it was a cache
hit*, and cannot say **when the value it returned was true**. For a cache hit
that is the whole question: the figure the decision used may have been computed
seconds or hours earlier, and nothing in the record distinguishes those.

`ms` without a timestamp looks like an oversight rather than a decision — a
duration is the less useful of the two for an audit, and it is the one that was
modelled.

The consequence for the trace reader is direct: the evidence pane can name the
connector that supplied the field a rule read, and has to state *when* as an
explicit absence. A regulator asking "was that consent flag current" gets no
answer.

**Done when:** a source call records when its value was computed — distinct from
when it was fetched, for a cache hit — or an ADR says why the fetch time is the
only thing worth recording.

**Resolved by:** `SourceCall` carries `fetchedAt` — when this decision asked —
and `observedAt`, when the value was computed. They are the same for a call that
reached the connector; for a cache hit `observedAt` is when the cache stored
what it returned, which is the age an auditor needs. `IntegrationCache` gained
an optional `entry(key)` returning the value and its `storedAt`, and
`MemoryIntegrationCache` implements it.

A cache that cannot say leaves `observedAt` absent, drawn as unknown. Filling it
with the read time would make every cache hit look fresh, which is the failure
this guards and which has its own test.

Both fields are in `Measurements`, which is never hashed, so **no chain hash
moved.**

**Where it shows:** on the trace's evidence pane, as the values the decision
used, each with its connector and its age. Not under the selected rule, where it
would be more useful — a rule's fields do not resolve to a connector at all in
this tenant, for a reason that has nothing to do with timestamps:
[G-069](gaps.md).

### G-055 — No pack is recorded against the rule it supplied

**Registered:** 2026-09-10 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-066](BACKLOG.md)

A `TargetingPolicy` has an id, a name, a kind, a description, conditions and a
scope. It has no package.

A compiled artifact does lock `packageVersions` — `@metis/nodes-core@1.4.0`,
`@metis/core@2.1.0` for this tenant — so a decision can say which packs it
compiled against. It cannot say which of them supplied a given rule.

That is the wrong granularity for the question packs exist to answer. A
regulatory pack is the unit a customer installs, audits and is held to; "this
offer was refused by a rule that came from the UK GDPR pack version 1.4" is the
sentence a compliance officer wants, and the platform can produce neither half
of the attribution.

The trace reader states it as an absence and names the artifact's packs beside
it, which is the most it can honestly say.

**Done when:** a rule names the package that supplied it, so a refusal can be
attributed to a pack rather than to a bare policy id.

**Resolved by:** a pack declares the policies it supplied — `PackManifest` in
`packages/core/src/domain.ts` — the compiler resolves every policy the flow
references, and the artifact carries `policySources`: policy id to pack id, name
and version. The trace reader names the pack behind a refusal, "UK Consumer Duty
1.4.0", beside the rule that made it.

A rule no pack claims is absent from the map, and the pane says the tenant
authored it. That is an answer rather than a hole, and it is the common case:
four of this tenant's eleven targeting policies come from a pack.

**No chain hash moved**, for the same reason as [G-058](gaps.md): the
attribution is on the artifact, and `packageVersions` in the hashed decision
already pins which pack versions the decision compiled against. The two together
answer the question without either being restated inside the hash.

**What it does not cover:** installing a pack, versioning its contents, and what
happens when two packs claim one policy — the compiler resolves in declaration
order and the first wins, which is a rule nobody has agreed to. Pack membership
is authored data with nothing enforcing it.

### G-064 — Four resolved entries sat under `## Open`, so the register overstated what is wrong

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-072](BACKLOG.md)

This file's own instructions say a closed entry moves to **Resolved**. Nothing
checked it, and four had not moved: G-049, G-050, G-054 and G-060, each marked
`**Status:** Resolved` while sitting under `## Open`. The Open section listed 38
entries where 34 were open.

The cost is small and exactly the cost this register exists to remove. Anyone
counting what is still wrong by reading headings — which is how a register is
read — got a number wrong by four, and could only find out by opening each
entry. All four were written and resolved inside a week, by the sessions that
wrote the entries.

**Resolved by:** `tests/gaps-register.test.ts` compares each entry's section
with its `**Status:**` line, and a second assertion fails if either section
empties out, so a rename cannot make the first pass over nothing. The four
entries were moved. Verified to bite three ways: on the four themselves, before
they were moved; on an open entry marked Resolved where it stands; and on a
resolved entry moved back under `## Open`.

**On duplicate entries, which is the other half of the same problem.**
[G-037](gaps.md) and [G-052](gaps.md) are one defect filed a day apart, and
neither session found the other's entry. Whether a check could catch that was
measured across all 1,953 pairs of entries rather than guessed:

- **By text similarity, no.** On word overlap the known duplicate ranks 15th of
  1,953. Fourteen pairs score higher and none is a duplicate, so a threshold
  that catches it flags fifteen pairs to find one. A check with that precision
  gets an exception list and then gets ignored.
- **By shared citations, yes, narrowly.** Counting the source files an entry
  cites in backticks, G-037 and G-052 share two. Across the 561 pairs where both
  entries are open, **no pair shares two**, and the seven that share one share a
  document like `CAPABILITIES.md` rather than code. So "a new entry citing two
  of the same source files as an open entry, neither naming the other's id"
  would have caught this duplicate and, on today's register, fires nowhere else.
- **What it would still miss:** a duplicate written without citing the same
  files. G-055 and G-057 read as neighbours and share no path at all.

Not built in this slice: it is a second check with a different shape, and the
measurement above is what it should be judged on. Registered as
[W-073](BACKLOG.md).

### G-063 — Nothing held the checks `main` requires to the jobs that exist

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-070](BACKLOG.md)

Which checks a pull request must pass is a branch ruleset in GitHub's settings,
ruleset 22569031, edited by hand and readable only through the API.
`tests/gates-parity.test.ts` held the workflow and `npm run gates` to each other,
and neither to the ruleset, so the ruleset could drift from the workflow in both
directions without anybody seeing:

- **A job added to the workflow is not required.** It runs, it can go red, and
  the pull request merges anyway.
- **A job renamed or removed stays required.** GitHub waits for a check that
  will never report, and every pull request blocks until somebody with admin
  rights works out why.

On 2026-09-10 the list was replaced by hand: the four e2e shards came out and
`e2e-report` went in. It matched the workflow afterwards only because it was
read back from the API.

**Resolved by:** `scripts/check-required-checks.mjs` reads
`GET /repos/{repo}/rules/branches/main` (what is in force on the branch,
across every ruleset) plus classic branch protection. It compares that with the
check-run names every job in `console.yml` reports, one per matrix
combination. Every job must be required unless it is declared in `NOT_REQUIRED`
with a reason: today `e2e`, whose shards `e2e-report` gates, and
`flake-hunt`, which pull requests skip. A declaration that has gone stale
fails too. It runs as the `required-checks` gate in the `spec` job, using the
`GITHUB_TOKEN` every job already has, so no secret is needed. Verified to
bite against the live ruleset four ways:

- a job added to the workflow: exit 1;
- a required job renamed: exit 1, naming both directions;
- a declaration made stale: exit 1;
- an API it could not read: exit 2, not a pass.

`tests/required-checks.test.ts` holds the comparison and the matrix naming
offline.

**What it does not cover:**

- **It depends on state outside the commit.** A ruleset edit turns the next run
  red on an unchanged commit. That is deliberate: it is the only place the edit
  becomes visible.
- **Locally it reads anonymously.** That is limited to sixty requests an hour,
  and it fails rather than passes when offline, so `npm run gates` now needs a
  network. If the repository became private, a local run would need
  `GITHUB_TOKEN` set.
- **It does not read `if:` conditions.** A job that is required and skipped on
  pull requests would pass it.
- **The authenticated path has now run in CI**, twice: on pull request #16 and
  on the push run for the merge commit `b6c7d5e`. Both `spec` jobs print the
  list read from the API — `e2e-report, kotlin-conformance, spec, verify` —
  against the six jobs in the workflow.

### G-062 — CI typechecked the console without Next's route types

**Registered:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-069](BACKLOG.md)

`apps/console/next-env.d.ts` was committed in the form `next dev` writes, which
imports `./.next/dev/types/routes.d.ts` and `./.next/dev/types/root-params.d.ts`.
On a CI runner no `next` command has run before `Typecheck (console)`, so
neither file exists, and TypeScript drops a side-effect import of a missing file
without a word. CI's typecheck therefore ran without the route types. A
developer's ran with them whenever a dev server or a build had left `.next`
behind, which is nearly always. It was the same command with different inputs,
and the less complete run was the one that gated.

It has not hidden an error yet. With `next-env.d.ts` and `.next/types` both
removed, the console typecheck still passes. That is luck about which types the
code happens to use, not coverage.

**Resolved by:** the console's `npm run typecheck` is `next typegen && tsc
--noEmit`, and `scripts/gates.mjs` and the workflow both run it. `next typegen`
writes `.next/types` and `next-env.d.ts` in about four seconds without a
build, so the local and CI typechecks now read the same generated types.
`next-env.d.ts` is no longer tracked ([G-052](gaps.md)).

**What it does not cover:** `tsconfig.json` includes `.next/types/**/*.ts` and
also excludes `.next`, and the exclusion wins for anything nothing imports.
`next-env.d.ts` imports `routes.d.ts` and `root-params.d.ts`, so those two are
checked. `.next/types/validator.ts`, which Next generates to check each route's
exports against what the framework expects, is imported by nothing and is never
type-checked. Observed with `tsc --listFilesOnly`.

### G-052 — Two tracked generated files never regenerated identically, and `npm run gates` rewrote both

**Registered:** 2026-09-10 · **Extended:** 2026-09-11 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-069](BACKLOG.md)

Until 2026-09-11 this entry's work item was W-001, *Fix the holes in the checks
themselves*, DONE since 2026-09-06 and about something else, so an open gap
pointed at a closed item. It had also already been registered once, as
[G-037](gaps.md), on 2026-09-09.

Two halves. The first, `decision-index.json`, was registered on 2026-09-10. The
second, `next-env.d.ts`, was found the same day by the first full run of
`npm run gates`, and is registered here rather than separately because it is
the same defect: a tracked file whose content depends on which command last
wrote it.

`apps/console/mocks/fixtures/decision-index.json` is generated by `npm run
generate` and committed. Its `totalMs` column holds the wall-clock time each
decision took **at generation**, so the file changes every time it is rebuilt
whether or not anything about the decisions changed.

Found by regenerating the client during unrelated work: 4,553 of 10,400 rows
differed, every one of them only in `totalMs`, mostly 0 ↔ 1. Same ids, same
order, same winners, same chain hashes.

Two costs, and the second is the one that matters:

**A 2.2 MB diff of pure noise** lands in whatever pull request happens to touch
the spec, which is a reliable way to make a reviewer stop reading diffs.

**It weakens the byte-identity gate by example.** This repository's strongest
habit is that regenerating the conformance corpora must produce identical bytes
— that is how a determinism claim is kept honest. A neighbouring generated
artefact that is *expected* to churn teaches the opposite reflex, and the next
unexplained corpus diff gets waved through as "just the timings".

`totalMs` is measurement, not fact about a decision, and it is not what this
index is for: the console reads it to list and filter decisions.

**The second file: `apps/console/next-env.d.ts`.** Next.js writes this file
itself, and two Next commands disagree about what it should say. The committed
copy is the dev-server form, importing `./.next/dev/types/routes.d.ts` and
`./.next/dev/types/root-params.d.ts`. `next build` rewrites both imports to
`./.next/types/…`, and `next dev` writes them back. **No content the file could
be committed with survives both commands**, so whichever ran last decides
whether the tree is dirty.

**Why it is worse now than when it was registered.** `npm run gates` rewrites
both files on every run. The index is rewritten by the `client` gate, which runs
the whole of `npm run generate` but diffs only
`packages/client/src/generated.ts`. `next-env.d.ts` is rewritten by `bundle`,
whose `playwright.bundle.config.ts` runs `npm run build` after `e2e` has run
against the dev server, so the run ends with the build form on disk. Session
Discipline now tells every session to report gates by running exactly that
command. **The step that proves a tree is clean is the step that makes it
dirty**, and the obvious next move, `git commit -a`, commits 2.2 MB of timings
and a flipped type path under whatever the slice was about. That is what
happened the first time it ran: both files landed in the commit that introduced
`npm run gates` and had to be amended out.

None of this shows in CI, where every job starts from a fresh checkout and
throws the tree away afterwards.

**Options — named, not chosen.** The two halves need not take the same answer.

1. **Stop tracking them.** Ignore the file and generate it before anything
   needs it.
   - `next-env.d.ts`: create-next-app's own template `.gitignore` lists it.
     The cost is ordering. In `verify`, `Typecheck (console)` runs before any
     `next` command, and without the file the console loses
     `/// <reference types="next" />`. So something has to write it first,
     which means a new step before typecheck, in `scripts/gates.mjs` and the
     workflow together.
   - `decision-index.json`: the MSW handlers read it, so a fresh clone serves
     no decision list until `npm run generate` has run. That becomes a setup
     step for every clone, every CI job that starts the console, and Storybook.
2. **The gate stops regenerating them.**
   - `decision-index.json`: this entry's original fix. With no measured
     duration in the index, regeneration is byte-identical, and the `client`
     gate's `npm run generate` rewrites the file with the same bytes. The
     alternative, having `client` run only the client half of `generate`,
     leaves the index checked by no gate at all.
   - `next-env.d.ts`: the bundle gate would have to build without touching the
     working copy. Whether Next can be told not to write the file has not been
     checked.
3. **The run cleans up after itself.** `scripts/gates.mjs` notes which of the
   two files were clean when the run started and restores those at the end.
   This is the cheapest option, and it hides the churn rather than removing
   it. An interrupted run still leaves the tree dirty. The restore must not
   touch a file the developer had already changed on purpose. It turns the gate
   runner into something that writes to the working tree, which today it does
   not. And it does nothing for anyone running `npm run build` or
   `npm run generate` directly.

**Done when:** `npm run gates` on a clean tree leaves `git status` empty, and
something fails when it does not. If the index stays tracked, the original
condition also stands: regenerating it twice produces identical bytes, asserted
by a check.

**Decided 2026-09-11:** option 1 for `next-env.d.ts`, option 2 for the index.

**Resolved by:**

- **`next-env.d.ts` is ignored and untracked**, as Next's own documentation
  asks (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`).
  The console's `npm run typecheck` is now `next typegen && tsc --noEmit`, and
  both the gate and the workflow run it. Option 1's cost was stated wrongly
  above: the console typecheck passes with no `next-env.d.ts` and no `.next`
  at all, so nothing broke for want of the file. Running without it is how CI
  had been typechecking all along, which is [G-062](gaps.md).
- **The index carries no latency.** `totalMs` is gone from the index, from the
  `Decision` schema that search results use, from the regenerated client, and
  from the three places that displayed it: the `/decisions` Latency column, that
  screen's average, and the home page's "% of budget". Nothing measured sat behind
  any of them, which is [G-061](gaps.md). A decision's duration is still on its
  trace, measured when the trace executes. `npm run generate` twice produces
  identical bytes.
- **The `client` gate compares every file `npm run generate` writes**: the
  client, the index and the route list. Verified to bite by putting the
  stopwatch column back into the generator. The old form of the check passed,
  exit 0, reporting the client "byte-identical"; the widened one failed, exit 1,
  on the index.
- **`npm run gates` fails if a green run changed the working tree**, naming each
  path a gate wrote. It compares every path `git status` lists, with a hash of
  its bytes, before and after the run, so a slice in progress can still run its
  gates. Verified to bite by force-tracking the old `next-env.d.ts` and running
  the typecheck gate: the gate passed, and the run failed naming the file. On
  the real tree it is silent.
- **Two back-to-back full runs** of `npm run gates` on `e953eca`, from a clean
  tree, were 22 of 22 green each, and `git status` was empty before the first,
  between them and after the second. That took 26 and 29 minutes; e2e is 20 of
  each, 380 passed and 31 skipped, none flaky.

### G-037 — `build-decision-index.mjs` does not produce the same bytes twice

**Registered:** 2026-09-09 · **Resolved:** 2026-09-11 · **Status:** Resolved · **Work item:** [W-069](BACKLOG.md)

`npm run generate` rewrites `apps/console/mocks/fixtures/decision-index.json`,
and running it twice on an unchanged tree changes the file. The difference is
one column: `totalMs`, a measured execution time, moved from `1` to `0` on the
first row. Chain hashes and every other column are byte-identical, so nothing
about a decision changed — a timing measurement is being baked into a committed
fixture.

CI regenerates and diffs `packages/client/src/generated.ts` only
(`.github/workflows/console.yml`), so this file has never been checked and the
wobble has never been visible. It surfaced on 2026-09-09 when a slice ran
`npm run generate` for a spec change and got an unrelated 2.2 MB file in its
diff.

**Done when:** `npm run generate` twice in a row leaves the tree clean, either
because the index stops carrying a measured duration or because the duration is
taken from the same recorded run each time.

**Resolved by [G-052](gaps.md)**, which registered the same defect a day later
without finding this entry — the register had no work item to hang it on, so
nothing pointed back here. The index stopped carrying a measured duration. Both
entries are kept: this one is the earlier record, and G-052 carries the second
file, the decision and the checks.

### G-060 — The local gate and the CI gate were different gates, and nothing said so

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-068](BACKLOG.md)

Running the obvious commands in a terminal and seeing green meant having
checked *some* subset of what CI checks. Which subset was knowable only by
reading `.github/workflows/console.yml` line by line, and three things had
drifted out of it entirely.

**The root lint ran nowhere on a pull request.** `verify` sets
`working-directory: apps/console` as a job default. Its `Lint` step — written
to be the root lint, and commented as such — therefore ran `npm run lint`
*inside the console*, which is the console's own lint. The step immediately
after it, `Lint (console)`, ran the console's lint again. So
`eslint packages bench tests scripts` had never run in CI, and the two steps
that looked like belt and braces were the same brace twice.

**Three workspaces ran nowhere in CI.** `test:core`, `test:catalogue` and
`test:portability` are in the root `npm test` chain and appeared in no workflow
step: canonical serialisation, the catalogue model and the export/import round
trip were verified on developer machines and nowhere else.

**`npm run conformance` was not a script.** CLAUDE.md names it twice — every
session is told to open and close by running it — and `package.json` had no
such entry. Every session has been invoking
`node --import tsx scripts/conformance.mjs` by hand, and the documented command
would have failed. The UX contract therefore ran in CI not at all.

The three met in one place on 2026-09-10. A two-character mistake — an unused
`useMemo` import — reached a pull request behind three consecutive session
reports that lint was clean. Each report was made after running the root lint,
which does not cover the console; CI caught it with the console lint, which is
the one CI runs twice.

That is the shape of the defect: **not that a check was missing, but that two
different sets of checks both called themselves "the gates"**, and every claim
made from a terminal was about the smaller one without saying so.

**Resolved by:** `npm run gates` runs the list in `scripts/gates.mjs`, which is
exactly what CI runs, in each job's order, stopping where CI stops.
`tests/gates-parity.test.ts` reads that list and the workflow and fails when
either gains or loses a step the other does not have — verified to bite in both
directions, by adding a step to the workflow and by removing a gate from the
script. A workflow step that is genuinely setup goes in `NOT_A_GATE` with a
reason, and a job outside the local run is declared with one.

The three holes were closed in the same change: the root lint gained
`working-directory: .`, the three workspaces gained steps, and `conformance`
gained a script and a CI step.

**One gate needed a different shape.** `npm run conformance` exits non-zero on
a healthy tree — 26 standing failures, most of them `layout-manifests`, a rule
that fires once per route with no implementation behind it. Wired in raw it
would have reddened every pull request and taught everyone to ignore the one
check that reads the UI contract. `scripts/check-conformance.mjs` enforces what
CLAUDE.md actually says — the count may not rise — against
`docs/ux-conformance-baseline.json`, and fails equally when the count falls and
the baseline was not lowered in the same commit, because unrecorded slack is
where the next regression hides. Verified in all three directions: rise exits 1,
unrecorded fall exits 1, at the baseline exits 0.

**What it does not cover:** `kotlin-conformance` stays out of the local run, so
a change that breaks the JVM engine is caught on the pull request rather than
before it. Running Gradle before every console commit is the wrong trade; the
declaration in `OUT_OF_SCOPE` says so out loud rather than leaving it to be
discovered.

### G-054 — The flake hunt stopped at the first flake and threw away the evidence

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-063](BACKLOG.md)

Run #33 was the first time the scheduled hunt ever fired, and it reported one
sample out of four.

The four runs were a plain `run:` chain, so Run 1's failure ended the job and
Runs 2, 3 and **Run 4 — shuffled group order** were skipped. Run 4 is the only
step that varies which specs have run before which, which is the whole reason
the job exists; it has never executed. A hunt for a suite that fails one run in
three that stops after the first failure has learned nothing it did not already
know.

The upload was worse, because it looked fine: `##[warning]No files were found
with the provided path: apps/console/playwright-report`. Two independent causes.
`--reporter=line` on the command line replaces the config's reporter list, so
`playwright-results.json` was never written; and `playwright-report` is the
*html* reporter's directory, which nothing in this repo produces. The trace and
the screenshot **were** captured — the log names
`test-results/…/trace.zip` — and an upload pointed at the wrong directory
discarded them. By the time anyone read the run, the failure could not be
reproduced from it.

`if: failure()` on the upload would also have stopped firing once the runs
carried `continue-on-error`, so it is now `if: always()`.

**Resolved by:** `tests/flake-hunt.test.ts`, over
`.github/workflows/console.yml`. Each run carries an `id` and
`continue-on-error`, a final *"Every run must be clean"* step reads all four
outcomes and fails once with all four visible, and each run writes its own
`playwright-results-N.json` and `test-results/run-N`. `playwright.config.ts`
reads `PLAYWRIGHT_JSON_OUTPUT_NAME` explicitly, because a config `outputFile`
wins over the environment variable and four runs would otherwise have
overwritten each other.

### G-050 — `RequireAuth` checked for a session and never for a permission

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-061](BACKLOG.md)

The navigation manifest's `permission` field gated one thing: whether a link was
drawn in the rail. Nothing enforced it on the route.

Twenty-one routes. Four enforced a permission by hand-writing their own
`Guarded()` wrapper. **Sixteen enforced nothing**, and three of those sixteen —
`/decisions`, `/decision-flows`, `/performance` — *declared* a permission the
rail obeyed and the route ignored. The link was hidden and the URL was open. A
detail page never had a guard at all, so `/offers` was shut while
`/offers/prop_5g_unlimited_24` was not, and offer ids are printed in traces.

Two things kept it invisible for the life of the console:

**Every test asserted what a permitted user could see.** None asserted what a
refused one could not. A guard is only observable through its refusals.

**No account could be refused anything.** Sarah, Priya and Marcus hold
`view:offers`, `view:flows`, `view:decisions` and `view:audit` between them with
no gaps, so even a correctly written test signing in as one of them would have
found every screen open and concluded nothing.

The fix is not sixteen more guards. A guard a page opts into is a guard some
page will not write, and the repository has the evidence: five wrote one, sixteen
did not, and nothing went red. `RequireAuth` now derives the requirement from
the same manifest `buildNav` reads, so a route cannot opt out by omission — only
by not being a route. The four hand-written wrappers were deleted.

Three variants of the same omission surfaced while fixing it, all of them the
rail and the route disagreeing about what a screen requires:

- `/placements` **enforced** `view:flows` while the manifest declared nothing,
  so the rail offered the link to people the page then refused.
- The Policy group hid `/targeting-policies` and `/frequency-policy` from Priya,
  who holds `edit:policies` and authors the qualification model, because nothing
  declared the entitlement for the rail's permission rule to find.
- `/settings` was filed under Administration › Tenancy beside Tenants and
  Residency. It is the signed-in user's own name, theme and environment; it is
  now reached from the account panel and gated on nothing.

`view:integrations` and `view:autonomy` were added to the vocabulary rather than
gating four read surfaces on `edit:integrations` and `edit:autonomy`. "You may
not look unless you may change" is backwards on this product.

**Resolved by:** `apps/console/tests/unit/route-authorisation.test.ts` (eight
assertions) and `apps/console/tests/e2e/route-authorisation.spec.ts`
(`@screen-only`, seven). Verified to bite three ways: reverting `RequireAuth` to
the session-only check turns one unit and three e2e red; a page rendering
outside `RequireAuth` turns *wraps RequireAuth, without exception* red; and a
page enforcing what the rail does not declare was red on arrival, on
`/placements`.

**The limit, stated rather than left to be discovered.** The check that no link
is drawn to a screen that will refuse it covers the **navigation rail**, which
is generated from the manifest and therefore enumerable. It does not cover links
inside a page. `/integrations/traffic` links each call to the decision it
produced, and `view:integrations` and `view:decisions` are different
permissions: an operator who may read the call log may not read what it links
to, and finds that out by clicking. Every screen with a cross-reference has the
same shape. Enumerating in-page links means either a convention every `Link`
follows or a crawl, and neither is this change.

### G-049 — `/performance` gave a delivered decision and an undeliverable one the same marker

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-060](BACKLOG.md)

The screen half of [G-046](gaps.md), registered separately because the corpus
half was a seeding rule and this one is a reading of the numbers.

`/performance` opened on four figures in a row — decisions, offered, offered
nothing, with an outcome — and a table of rates beneath them. Nothing anywhere
on it distinguished a decision that reached a customer from one that won a slot
on a channel with no sender, and **2,687 of the 3,426 decisions that offered
something are the second kind**.

Every figure on the old screen was correct. A marketer read `3,426 offered` and
a click rate under it and drew a conclusion that was false, because the two
numbers described different populations and the screen said so nowhere. That is
the failure mode this platform is least able to afford: it is the most
screenshot-able surface in the product and the one whose numbers most look like
evidence.

Rebuilt on **Cascade** — `docs/METIS_CONSOLE_SPEC.md` §4.7, added by the same
slice. Five stages that nest, the break at `deliverable` drawn in the block
colour with the count that fell out stated on the stage itself, and every rate
below it naming the channel it describes. The overview, before a stage is
selected, puts the realised value beside the expected margin of what was decided
and never delivered.

**Resolved by:** `apps/console/tests/e2e/performance-cascade.spec.ts` — six
checks, each verified to bite: smoothing the break, rendering a rate for an
undeliverable channel, and dropping the rail on selection each turn exactly one
of them red.

### G-036 — The root lint step covers neither `tests/` nor `scripts/`

**Registered:** 2026-09-09 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** none

`npm run lint` at the root is `eslint packages bench --ext .ts`. CI runs exactly
that, so nothing lints the two trees where every check written this week lives:
`tests/` holds `vocabulary`, `docs-status`, `adr-status`, `gaps-register` and
`api-paths`, and `scripts/` holds the conformance gate, the corpus builders and
`report-flaky.mjs`.

Found on 2026-09-09 while confirming a new script was clean. `npx eslint .` from
the root reports an error in `tests/source-hygiene.test.ts:126` —
`no-control-regex`, present since `660e56f` — that the CI step cannot see. The
capability map's "Lint clean" line was corrected on 2026-09-09 to say so; this
entry is why the error survived long enough to need correcting.

**Not fixed here.** Widening the glob turns that pre-existing error into a red
CI, which is a change somebody should make deliberately rather than as a side
effect of a slice about flake detection. It is one `eslint-disable-next-line`
away from being safe to do.

**Done when:** `npm run lint` covers `tests` and `scripts`, and passes.

**Closed 2026-09-09.** `npm run lint` is now
`eslint packages bench tests scripts --ext .ts,.mjs`, and CI runs that.

**It surfaced exactly two errors, and neither was a defect.** Both are the rule
firing on code that is doing the right thing, which is why both are silenced at
the site with the reason rather than by turning the rule off or excluding the
file:

- `scripts/build-conformance-corpus.mjs:63` — `no-loss-of-precision` on
  `123456789012345678901234`. The literal loses precision deliberately: that is
  the case. ADR-003 asks what an integer past 2^53 serialises to *after* the
  double has already rounded it, so writing it any other way would test a
  different number.
- `tests/source-hygiene.test.ts:126` — `no-control-regex` on
  `/[\u0000-\u001f\u007f]/`. Matching control characters is the job: it
  renders the bytes around a forbidden one for a person to read, and a raw NUL
  or ESC in that output would corrupt the terminal it is printed to.

The corpus regenerates byte-identical, so nothing in either fix touched a hash.

**Two is a low number and that is the finding.** The trees that had never been
linted turned out to be almost clean, which means the cost of this gap was not
accumulated debt — it was that a real error sat visible-to-nobody for days while
`docs/CAPABILITIES.md` claimed the lint was clean.

### G-046 — The seeded corpus recorded outcomes on channels nothing delivers

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-059](BACKLOG.md)

`seededOutcomesFor` required the winning offer to have an active creative on the
decision's channel — the rule G-041 added — and never asked whether anything
**delivered** that channel. Since ADR-013 split `active`, four of the demo
tenant's five channels are `delivery: null`.

The tell was that the funnel inverted:

| stage | before | after |
|---|---|---|
| decisions | 10,400 | 10,400 |
| offered | 3,425 | 3,425 |
| **deliverable** | 738 | 738 |
| **seen** | **887** | **416** |
| acted | 184 | 79 |

**887 seen against 738 deliverable.** More people saw a message than could have
been sent one, and a funnel whose stages are not nested is the sign that they
measure different populations. 471 of the impressions and 105 of the actions
were on email, sms, push or outbound_call — channels with nothing that sends.

It is exactly the error G-041 corrected, one level out: that one counted a win
as a render, this one counted a render on a channel with no sender.

Impressions 887 → 416, clicks 184 → 79, acceptances 26 → 6, rejections 57 → 27,
conversions 20 → 4. Five prose citations of `887` corrected with it.

**Resolved by:** `apps/console/tests/unit/seeded-outcomes.test.ts`, *"starts no
funnel where nothing delivers the winning channel"* — verified to bite by
removing the rule, which produced ten named decision ids.

### G-043 — A placement's `active` flag carried two different meanings

**Registered:** 2026-09-10 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-058](BACKLOG.md)

`Placement.active` was read as *"this slot is live and may be decided for"* —
`decidePlacement` refuses an inactive one — and written as *"this slot is
delivered end to end"*: `weekly_offers_send` was `active: false` because nothing
sent it, while the corpus decided for it 2,042 times. In the spec it was
`type: boolean` with no description at all, so the field carrying two meanings
was not documented as carrying one.

Split by [ADR-013](adr/ADR-013-delivery.md) phase one into `decidable` and
`delivery: { mode } | null`. `caller` is what web has always been — the platform
returns a slate and the website renders it — and `null` is the honest state of a
slot worth deciding for that has no far end, which is four of the demo tenant's
five channels.

**Resolved by:** `apps/console/tests/e2e/placement-authoring.spec.ts`,
*"deciding and delivering are separately settable"*, which sets a slot to refuse
requests while keeping a deliverer — a state one boolean could not express.

### G-042 — Nothing related a creative's channel to the channel a decision is made for

**Registered:** 2026-09-09 · **Resolved:** 2026-09-10 · **Status:** Resolved · **Work item:** [W-057](BACKLOG.md)

Two guards existed against an offer that cannot be delivered and both were
channel-blind. `offerMayBeActive` was `creatives.some((c) => c.active)`, so one
active email creative made an offer activatable and it could then win a web
placement. `NO_DELIVERABLE_CREATIVE` fired only when `creativeIds.length === 0`
— no creative at all, active or not, on any channel — while its own remedy text
asked for *"at least one active creative for a channel this flow serves"*.

Closed by [ADR-012](adr/ADR-012-an-offer-with-nothing-to-render.md) option B,
accepted 2026-09-10. Both take the channels the tenant's active placements
deliver on. The compiler now separates three states, because the remedy differs
for each: no creative written, creatives that are all switched off, and live
creatives on channels this flow does not serve.

**Option A — eliminating such a candidate before arbitration — is deferred and
not scheduled**, and the ADR records the condition for reconsidering it:
coverage, not time. Refusing to rank while 38 of 202 active offers have nothing
to send on any channel would delete the evidence rather than fix the cause.

**Resolved by:** `packages/compiler/tests/compile.test.ts`, *"an offer whose
creatives cannot actually deliver"*, and
`apps/console/tests/e2e/creative-coverage.spec.ts`.

### G-041 — The seeded corpus reported impressions for offers that could not have been rendered

**Registered:** 2026-09-09 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** [W-015](BACKLOG.md)

`seededOutcomesFor` in `apps/console/mocks/fixtures/outcomes.ts` started an
outcome funnel for every decision that had a winner, and never asked whether
that winner had an active creative on the decision's channel. It was the same
defect the storefront had in the same week — counting a **win** rather than a
**render** — with the storefront half fixed and this half not.

Measured over the committed index, all 10,400 decisions:

| | before | after |
|---|---|---|
| Decisions that offered something | 3,425 | 3,425 |
| …whose winner has an active creative on that channel | 1,303 | 1,303 |
| Impressions | 2,101 | **887** |
| Clicks | 477 | 184 |
| Acceptances | 65 | 26 |
| Conversions | 49 | 20 |

The corpus overstated impressions by **2.37×**, worst where creative coverage is
thinnest: 281 of 284 outbound-call impressions were impossible, 375 of 465 on
push, 299 of 387 on sms, against 150 of 566 on web.

**One thing this did *not* do, stated because it was claimed and was wrong.** It
did not distort the rates. A seeded click is drawn conditionally on its seeded
impression, so removing an impossible impression removes its whole funnel with
it: the click rate moved 22.7% → 20.7% and the acceptance rate 13.6% → 14.1%,
which is sampling noise, not correction. The inflation was in the **counts**.
The rates-are-wrong claim holds for the live storefront half, where a real
impression was reported and no click could follow it, and it does not hold here.

Nothing needed regenerating: the seeded outcomes are a projection computed per
request, not stored — `seededOutcomeMap` rebuilds them from the decision index
in under 40ms and no committed artifact held them. Four prose comments cited
`2,101` and were corrected with it.

**Resolved by:** `apps/console/tests/unit/seeded-outcomes.test.ts`, *"reports an
impression only where the winner had something to render"*, which fails on the
generator as it stood.

**The second half is a different problem and is not resolved.** 2,122 of the
3,425 offered decisions have a winner with nothing to render on the channel that
won, and 38 of 202 active offers have no active creative on any channel. That is
a property of the platform rather than of the seeding — see G-042.

### G-003 — The decision trace accessibility test fails after a write-heavy run

**Registered:** 2026-09-08 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** none

`accessibility.spec.ts › the decision trace has no violations` failed once, in a run that immediately followed `form-descriptors.spec.ts`, `offer-authoring.spec.ts` and `permissions-and-writes.spec.ts` — all of which create offers and creatives by clicking. It passed in isolation and passed again on a clean full sweep (49/49), so **it has not been reproduced on demand and the cause is not established**. The suspicion is store state: `apps/console/mocks/store.ts` is process-wide, the specs above write to it, and the trace test opens whichever decision happens to be first in the grid — so a decision rendered against a catalogue a previous spec mutated is a plausible source of a node the earlier sweep found and the later one did not. `POST /api/_test/reset` re-clones a seed captured at module load, which is the same limitation already recorded two rows above. Recorded rather than fixed because a flake diagnosed by guesswork is a flake twice: the next occurrence should be captured with the axe violation id and the decision id before anything is changed. **Reproduced 2026-09-08**, under exactly the predicted condition: `npm run test:a11y` run immediately after the offer and creative e2e suites failed 1 of 49 on this test, and the same command run on its own passed 49 of 49 minutes later. Two observations, same shape, still no violation id captured — the ordering dependency is now established, the cause is not.

**Widened 2026-09-09, with evidence.** This is not confined to the accessibility
test, and it is not a flake in the sense of "sometimes slow". Three full runs on
2026-09-09 produced three different victims, each passing in isolation
immediately afterwards:

- `app-shell.spec.ts` › `the badge count matches the number of items listed`
- `form-descriptors.spec.ts` › `locks the channel when editing…` — twice
- `experiments.spec.ts` › `names the field path an arm reaches policies at` and
  `refuses a key that would collide at the same field path`

The last pair failed on a **stashed, pre-change tree** while
`form-descriptors.spec.ts` passed on it — which is the finding worth keeping.
Changing what else runs changes which test fails, so the cause is the shared
store rather than any one assertion, and a bisect that blames the most recent
commit will blame the wrong thing.

The shape is now clear enough to name: `apps/console/mocks/store.ts` is
process-wide, `POST /api/_test/reset` re-clones a seed captured at module load,
and several specs assert on `.last()` or on a count over a list other specs
grow. Any of the three would be survivable alone.

**Still not fixed, and deliberately.** The fix is one of: a store per worker, a
reset that rebuilds from the fixtures rather than from a captured clone, or
removing every positional assertion. That is a test-architecture change and it
should not be made inside a slice about something else, three times over,
guessing.

**Closed 2026-09-09. Three ingredients, three fixes.**

**The reset did not reset.** `resetStore()` returned before it had finished:
`seed()` kicks off two background jobs — the registry seeding itself and the
ledger resolving its store — and neither was awaited, so `POST /api/_test/reset`
answered `{ reset: true }` while the registry was still filling. Worse, after
the first call `seed()` returns an object that is *not* `store`, so the ledger
upgrade was landing on a discarded object and being lost on every reset. It now
drains `shadowInFlight` first, awaits both readiness promises **before** the
swap, and clears the module-level call log that `seed()` cannot reach.
`catalogue-state` is deliberately left alone: it is keyed by content hash, so a
stale entry can never be returned for a different catalogue, and clearing it
would make a decision recorded before the reset unreplayable.

**Two buttons on the offer page were both called "Edit".** That is why the tests
counted positions — `.last()` over every Edit on the page, which is the offer's
as well as each creative's, so the assertion depended on how many creatives
existed and therefore on what other specs had left behind. It was also an
accessibility defect in its own right: a screen-reader user tabbing heard the
word "Edit" twice with nothing to tell the two apart. Both now carry an
`aria-label` naming what they edit, and the specs address them by name.

**No assertion was weakened.** `form-descriptors` and `offer-authoring` assert
exactly what they asserted before; only the locator changed, from a position to
an identity.

**Measured, not asserted.** Five full runs, plus one with the spec files
shuffled into four groups run in a random sequence against the same reused
server — all on a freshly started dev server, for the reason in
[G-035](#g-035--a-long-lived-dev-server-degrades-until-the-suite-is-unusable):

| Run | Result | Duration |
|---|---|---|
| 1 | 324 passed, 0 failed | 12.8m |
| 2 | 324 passed, 0 failed | 15.2m |
| 3 | 324 passed, 0 failed | 14.0m |
| 4 | 324 passed, 0 failed | 13.4m |
| 5 | 324 passed, 0 failed | 13.5m |
| 6 — shuffled, 4 groups | 98 + 51 + 76 + 102 = 327 passed, 0 failed | 14.3m |

Before these fixes, three consecutive full runs produced three *different*
failures, and a bisect would have blamed whichever commit was newest.

An earlier attempt at this same proof, run against a `next dev` process that had
been up for seventeen hours, gave five clean and one failure. That measurement
was discarded rather than reported, because the server was the variable — see
G-035.

### G-012 — `score-adaptive` is a node type with no behaviour of its own

**Registered:** 2026-09-07 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** [W-029](BACKLOG.md)

The compiler accepts it and the engine computes it exactly as `score-model`: a
seeded deterministic function of customer, offer key and pinned model version.
Nothing adaptive exists — W-032 — and the fixture flow that used it has been
moved to `score-model`, which is what it always was.

Kept rather than removed, because it is the seam W-032 fills and deleting it
would move the question rather than answer it. Registered because a node type
that claims a capability the engine does not have is the same species of problem
as the trace that named an adaptive model: nobody writes a false claim, and the
naming makes one.

When W-032 lands, either the type gets behaviour or it goes. Until then a flow
author choosing it gets ordinary scoring, and the trace says so.

---

**Closed 2026-09-09, by deprecation rather than deletion.** ADR-009 §7 puts
adaptive scoring out of scope for v1, so the compiler now refuses the node type
with `DEPRECATED_NODE_TYPE` and names `score-model` as the replacement.

**It could not be deleted, and the reason is worth recording.** A case in
`docs/conformance/decision-corpus.json`, recorded 2026-09-05, carries
`score-adaptive` inside its hashed eliminations. Removing the type from the
runtime would have changed that decision's chain hash — a statement about
something that happened. So the runtime still executes it and history replays
unchanged, while nothing new can be built on it. This is the first time the
immutability promise has forced a deprecation where a deletion was wanted, and
it will not be the last.

### G-020 — A live decision’s trace cannot be opened in the console

**Registered:** 2026-09-09 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** none

Found by ADR-008 phase one: the storefront makes a real decision, reports a real
outcome against it, `/performance` counts it — and clicking through to the
decision behind the number gives **"This page couldn't load"**.

`GET /decisions/{id}/trace` resolves a seeded decision through `findTrace`,
which returns the console's flattened shape, and a live one through
`store.ledger.get(...)`, which returns `entry.record` — the **runtime**
`DecisionRecord` from `@metis/runtime`, shaped `{ id, decision: {...} }`. The
spec declares this operation returns the **API** `DecisionRecord`, which is the
flat shape with `scores`, `eliminations`, `arbitration` and `timestamp` at the
top level. Two different types share the name and the route returns whichever
store answered.

`apps/console/app/api/[...path]/route.ts:687-699`. Verified live: the API
answers 200 with `{"id":"dec_7d72e92a7a3d2b7d","decision":{...}}` and the page
throws reading `trace.scores`.

**Why no check caught it.** `contract.spec.ts` asserts every non-proposed
operation is served and returns what the spec declares, and it exercises this
one with a seeded id — which takes the `findTrace` branch and is correct. The
ledger branch has never been contract-tested, because until the storefront
started reporting outcomes there was no test that made a live decision and then
opened it.

**The consequence for ADR-008.** Phase one closes the loop and the number on
`/performance` is real, but the rule in `CLAUDE.md` — *every displayed number
links to its source trace or explains why it cannot* — is broken for exactly the
decisions this slice creates. The `@screen-only` test in `outcome-loop.spec.ts`
originally asserted the trace opened; that assertion was removed rather than
weakened, and this entry is where it went.

**Done when:** the ledger branch projects to the API shape, `contract.spec.ts`
exercises `getDecisionRecord` against a decision made in the same test rather
than a seeded one, and `outcome-loop.spec.ts` regains the assertion that the
decision behind a reported outcome opens and replays.

**Not fixed here.** It is a defect in the trace route, not in the loop, it
predates this slice, and fixing it properly means extending the contract suite
to cover live decisions — which is the real repair and is larger than the
projection itself.

**Closed the same day.** `toApiTrace` in `mocks/fixtures/decisions.ts` is now the
one projection both branches use, so the ledger branch returns the flat shape
the spec declares instead of the runtime record. `contract.spec.ts` gained the
branch it had never reached: it makes a decision, opens its trace, asserts every
field the console reads is at the top level and that `decision` is *not* a key,
and separately asserts a seeded trace and a live one have the same shape.
Verified to bite by restoring the old line — two tests fail with the runtime
record in the received value.

### G-021 — The console edits a catalogue the engine does not read

**Registered:** 2026-09-06 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-005](BACKLOG.md)

`apps/console/mocks/store.ts` deep-clones the fixture modules on seed, with the
comment "so mutations never write back through to the fixture modules".
`apps/console/mocks/fixtures/engine.ts` builds `catalogueSnapshot` from those
same fixture modules. `executeDecision` is passed `catalogueSnapshot`.

So the offers, boosts and ranking weights the console edits are a different
object from the ones the engine ranks with. Changing the arbitration weights in
`/arbitration` persists to the store and is audited — both true, and both what
`EXPERIENCE_LAYER_STATUS.md` claims — but it does not change any decision.

Established by reading both sides, not by running: the clone is explicit, and
the snapshot's imports are the fixture exports.

This is why W-005's second half is more than swapping a store. Repointing the
console at `packages/catalogue` means deciding what the engine reads, which is
a real design question — a decision records the hash of the catalogue it saw,
so the engine cannot simply read whatever the console last wrote without that
hash becoming a moving target mid-flight. The likely shape is a snapshot taken
per decision and cached by hash, but it is a decision to make rather than a
refactor to perform.

---

### G-022 — A created offer cannot be decided, for two reasons

**Registered:** 2026-09-07 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-024](BACKLOG.md)

Attempted end to end: created `upsell_speed_boost` through `createOffer`, saw it
in `/offers` and on its detail page with the right empty states, then asked for a
decision. It appears nowhere in the trace, and the catalogue snapshot hash is
unchanged from before it existed.

Two independent causes, and fixing either alone changes nothing.

1. **The engine reads a different catalogue.** `catalogueSnapshot` is built from
   the fixture modules; `createOffer` writes to `store.offers`. This is the entry
   above about arbitration weights, reached from the other end — W-005's second
   half.
2. **A flow's candidate set is a fixed list.** `candidateKeys` on the artifact
   names four keys, and a new offer is in none of them. Even with one catalogue,
   an offer is only decidable once a flow names it, and the canvas is read-only
   (W-024) with no other way to edit the set.

So the console can author an offer and cannot make it live, and the second half
of that is not visible anywhere in the UI — `/offers` shows the offer as `active`
and flags only that it has no creative. "Active" here means the catalogue row
says active, not that any flow can select it.

Worth stating plainly because it is the first thing a buyer tries. The demo
answer today is that authoring is real, storage is real, audit is real, and the
path from a new offer to a decision runs through a fixture edit and a redeploy.

---

### G-023 — Creating a policy does not make it apply

**Registered:** 2026-09-07 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-024](BACKLOG.md)

Found while wiring rollups into a decision, by writing a test that assumed
otherwise and watching it fail.

The engine evaluates only the policies a flow node names in `policyIds`. A
policy created through `POST /targeting-policies` is stored, is audited, and
reaches the catalogue the engine reads — and is then evaluated by nothing,
because no node references it.

This is the same shape as `candidateKeys` for offers, and it has the same fix:
flow authoring. Until then the write path is real and the effect is not, which
is precisely the class of defect this codebase keeps finding, so it is held by
an assertion rather than left to be discovered in a demonstration —
`aggregation-decision.test.ts`, "a policy nobody attached". That test creates a
policy that would refuse every candidate and asserts the candidates survive.
When flow authoring lands it should become the opposite assertion.

**What does work today:** editing an existing policy that a node already names.
That reaches the engine, and the rollup tests use it.

---

### G-024 — The Kotlin conformance gate could pass without reading the corpus

**Registered:** 2026-09-05 · **Resolved:** 2026-09-05 · **Status:** Resolved · **Work item:** none

The tests read `docs/conformance/*.json` by path at runtime, so Gradle had no input dependency on them: after regenerating a corpus, `./gradlew test` reported `UP-TO-DATE` and passed. Fixed by declaring the corpora as `tasks.test` inputs in both modules. Kept here as a record, because the same shape recurs — a check whose real input is invisible to the thing that decides whether to run it.

### G-025 — Four components agree on API paths, and one typecheck covered one

**Registered:** 2026-09-05 · **Resolved:** 2026-09-06 · **Status:** Resolved · **Work item:** [W-001](BACKLOG.md)

The spec, the generated client, `apps/console/lib/api-client.ts` (hand-written template URLs), the dev API route handler (a string switch) and the Kotlin service router (another string switch) must all agree. Only the generated client is type-checked. `contract.spec.ts` covers the spec-versus-dev-API pair at E2E time and does bite — verified by pointing a spec path at an unserved route — but the console's own client URLs and the Kotlin router are checked by nothing.

### G-026 — The root typecheck checks zero files

**Registered:** 2026-09-04 · **Resolved:** 2026-09-06 · **Status:** Resolved · **Work item:** [W-001](BACKLOG.md)

The root tsconfig has `"include": []` and only references, and `tsc --noEmit -p` does not build references. CI now also runs the console's typecheck, which resolves `@metis/core`, `@metis/runtime` and `@metis/compiler` through path aliases and is what actually covers them. `bench/*` is still outside every working typecheck — the missing `connectors` field on its catalogue was caught by a failing benchmark, not by the compiler.

### G-027 — CI has never run

**Registered:** 2026-09-08 · **Resolved:** 2026-09-08 · **Status:** Resolved · **Work item:** none

`.github/workflows/console.yml` is the definition of done, enforced — and nothing enforces it, because the repository has **no git remote** and no `main` or `master` branch. Its triggers are `push` to those two branches and `pull_request`; neither can fire. Found while asking whether the `Lint (console)` step was blocking or advisory: it is blocking by construction — no `continue-on-error`, a non-zero exit fails the job — and it had simply never executed. That is why seven lint errors sat on the working branch from 2026-09-07 to 2026-09-08 with nothing stopping. Every other step in that file is in the same position: the determinism gate, the p99 budget, the axe sweep and the bundle budgets are all written, all correct, and all unrun. Until there is a remote, the only thing actually gating this repo is what somebody runs locally.

### G-028 — CDH domain model and agentic autonomy

**Registered:** 2026-09-04 · **Resolved:** 2026-09-04 · **Status:** Resolved · **Work item:** none

Added to the OpenAPI spec as proposed operations. The execution plane has built none of them;
the console runs against the development fixture store.

| Operation | Needed for | Platform status |
|---|---|---|
| `getTaxonomy` | Objective › Category › Offer tree | Not built |
| `listOffers` / `getOffer` | Offer catalogue and detail | Not built |
| `createOffer` / `updateOffer` | Authoring offers | Not built — writes are echoed, not persisted |
| `listCreatives` | Per-channel content | Not built |
| `listTargetingPolicies` | Eligibility / relevance / suitability | Not built |
| `listFrequencyPolicies` | Suppression and frequency caps | Not built |
| `getArbitrationConfig` / `updateArbitrationConfig` | P × V × B × C weights | Not built |
| `listAutonomySettings` / `updateAutonomySetting` | Agentic autonomy per scope | Not built |
| `listAgentActivity` | Agent activity feed | Not built |
| `login` / `getSession` | Authentication | Not built — no real identity provider yet |

#### Still outstanding from earlier

- `simulateDecisionFlow` — ad-hoc simulation. `/simulations` states plainly that this is not built
  and shows only simulations attached to change sets.
- `getCounterfactual` — minimal-input-change explanations. No UI yet.

#### Notes for the platform team

- **Money is minor units.** `Money.amount` is an integer in pence to avoid float drift.
- **Autonomy resolution is most-specific-first**: offer › category › objective › tenant. The
  reference implementation is `resolveAutonomy()` in `packages/core/src/domain.ts`.
- **`objectiveId` on `Offer` is denormalised** from its category, for tree and breadcrumb
  rendering without a second lookup.
- **A offer with no active creative cannot be delivered.** The console flags this; the
  compiler should reject promoting a flow whose candidate set includes one.

---

### G-029 — W-005 half closed: the engine reads what the console writes

**Registered:** 2026-09-06 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-005](BACKLOG.md)

The catalogue half is done. Live decisions build their `CatalogueSnapshot` from
`store.*` rather than from the fixture modules, so arbitration weights, boosts,
targeting policies, frequency caps, offers and connector activation now reach
the engine.

It was verified as broken before it was fixed, because the failure had a fully
green path: `PUT /arbitration` answered 200, persisted, audited, and updated the
formula the screen renders — and the next decision came back byte-identical.
`fixtures/engine.ts` carried a comment claiming the opposite was true.

**What came with it, necessarily.** A `DecisionRecord` keeps
`catalogueSnapshotHash` and never the catalogue. Once the catalogue is editable,
replay has to fetch the one the decision names or it answers a different
question. `mocks/catalogue-state.ts` keeps every distinct catalogue by hash and
`POST /decisions/{id}/replay` returns **409 `catalogue_unavailable`** rather
than replaying against a substitute. The fixture catalogue is registered at
startup so the 5,000 seeded decisions stay replayable.

**Still open, and this is the remaining half of W-005:**

- **Creating an offer still does not make it decidable.** A flow's candidate set
  is `candidateKeys` on the artifact — a fixed list — so a new offer is not a
  candidate until a flow names it. Editing an *existing* offer now does affect
  decisions; creating a new one does not. Closing this needs flow authoring, not
  more catalogue work.
- **Flows, policies, frequency caps, boosts and the taxonomy are still FIXTURE
  for create and edit.** The engine now reads the store; the console still has
  no screen that writes to most of it.
- **Replay of a live decision is not byte-identical**, and this is unchanged and
  unrelated: resolution adds connector fields (`marketingConsent`,
  `profilingConsent`) that a replay caller cannot reconstruct, so the only diff
  is `$.inputSnapshotHash`. Seeded decisions, whose inputs are baked in, replay
  `identical: true`.

See `docs/review/PLATFORM_DIRECTION.md` for what this unblocks and in what order.

---

### G-030 — Targeting policies are authored from the screen

**Registered:** 2026-09-07 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-024](BACKLOG.md)

Phase C recorded targeting policies as `FIXTURE` for create and edit. They now
have a write path: `POST /targeting-policies/{tenantId}` and
`PUT /targeting-policies/{tenantId}/{policyId}`, gated on `edit:policies` —
which the fixtures give to compliance and the administrator, and deliberately
not to the decision architect.

The editor is a picker over the data model rather than a text field, and that
is the point rather than a nicety. `PolicyCondition.field` was a free-text
dotted path, and one character wrong in a leaf did not error — it decided.

Three controls, each derived from the one before:

1. **Field** — a list built from `getProfileSchema`. There is nowhere to type a
   path, so the demonstrated defect is unrepresentable rather than merely
   rejected.
2. **Operator** — the set the server sent for that field's type. `contains`
   cannot appear on a number.
3. **Value** — typed, and an enum renders its declared members, so `passed`
   cannot be written where the model says `pass`.

The server checks the same rules again through `conditionProblems`. The editor
cannot be the only guard: the API is reachable without it.

**Still `FIXTURE` for create and edit:** decision flows and their nodes,
frequency caps, boosts, the taxonomy, and the data model itself. The model is
served and browsable at `/data-model`; editing it is the next surface owed.

**Not yet resolved by any of this:** creating an offer still does not make it
decidable, because a flow's candidate set is a fixed `candidateKeys` list. That
needs flow authoring.

---

### G-031 — A created offer is decidable, and a created policy runs

**Registered:** 2026-09-07 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-024](BACKLOG.md)

Both gaps registered earlier today are closed by flow authoring, and both for
the same reason: the missing step was never the write path, it was that nothing
could attach the new object to a flow.

- **Candidate offers** are edited on the flow page. An offer absent from the
  list is still never a candidate — that has not changed and should not — but
  the list is now something a person can change.
- **Policies bind to nodes.** A filter or constraint node names the policies it
  applies, and the engine has always evaluated only those.

`flow-authoring.test.ts` walks the whole chain for each: create the offer,
give it a creative, add it to the candidate set, publish, promote, decide — and
the same for a policy that suppresses everything. The compiler refused the
first attempt with `NO_DELIVERABLE_CREATIVE`, which is the gate working, so the
test walks the real path rather than routing around it.

**What did not change, deliberately.** Saving a graph changes no decision.
Decisions run the version promoted to an environment, so an edit reaches them
through compile, publish and promote — three separate steps with two separate
permissions. `an edit reaches decisions only through publish and promote`
pins it, and if that test ever fails the console has quietly become a deploy
button.

**Found while doing it:** `publishArtifact` compiled against the *fixture*
compile context, so an offer or policy created through the console was
invisible to the compiler at publish time — a flow naming one would have been
rejected for referencing something that, as far as the compiler could see, did
not exist. Same seam as the catalogue and the artifacts, in the place it would
have been hardest to notice. `currentCompileContext()` now builds it from the
store, and publish and the draft save share it so they cannot disagree.

**Still FIXTURE for create and edit:** the taxonomy, frequency caps, boosts,
and the data model itself. Flows, offers, creatives, policies, connectors,
arbitration weights, autonomy and data sources are all editable from the screen.

---

### G-032 — Outcomes are read

**Registered:** 2026-09-07 · **Resolved:** 2026-09-07 · **Status:** Resolved · **Work item:** [W-018](BACKLOG.md)

`POST /outcomes` had written to a store nothing read since the ledger existed,
so the platform could say what it decided and never whether it worked.
`GET /performance/{tenantId}` joins them, and `/performance` renders it.

Counting only. Attribution modelling, uplift and incrementality are statistical
claims that would be unfalsifiable inside a platform whose selling point is
that every number is traceable to its source, so they are deliberately absent
and the page says so.

**Two defects found by looking at the rendered page rather than the tests.**

1. **Rates were over offers, not observations.** The first version divided 0
   acceptances by 146 offers and printed `0.0%`, which reads as "we measured and
   nobody took it" when the truth was that no channel had reported anything.
   The denominator is now decisions with an outcome, coverage is shown beside
   it, and a row nobody reported on shows a dash.
2. **`POST /outcomes` refused a seeded decision while `GET` accepted one.** The
   five thousand decisions the console displays could be read for outcomes and
   never given one, so the measurement loop could not be exercised against any
   of them. The route now materialises a seeded decision into the ledger on its
   first outcome, which keeps the ledger's invariant — an outcome always joins
   to a decision — without paying for five thousand inserts nobody may measure.

**Known and deliberate:** the report fetches outcomes one decision at a time.
Correct and slow, and the right shape to replace with a join when there is a
store that can do one. An approximation would have been a number nobody could
check.

**Still absent:** experiments and holdouts, volume and budget constraints, a
model registry behind the scoring seam, and channel adapters. Nothing sends an
outcome yet (W-017), which is why every rate on the page is currently a dash.

---

### G-033 — Five controls were enabled and did nothing

**Registered:** 2026-09-09 · **Resolved:** 2026-09-09 · **Status:** Resolved · **Work item:** none

Found by clicking, in the E4 coherence review, not by any suite. `Export PDF`,
`Export JSON`, `New flow`, `Version history` and `Export DIR` were `<Button>`
elements with no `onClick` at all. They rendered correctly, passed axe, fitted
their bundle budgets and satisfied every assertion anybody had written, because
a control that does nothing is indistinguishable from one that works to every
check this repository had.

This product had already written the rule down twice, in prose, in the source —
*"An enabled control that does nothing is a promise; a disabled one with a
reason is an absence somebody can plan around"* — and followed it three times
out of eight. `apps/console/tests/unit/dead-controls.test.ts` now holds it:
a `<Button>` under `app/` or `components/` either carries a handler, is a
submit, is wrapped by a `<Link>` or a Radix `asChild`, or is `disabled` **and**
carries a `title` saying why. Verified to bite by removing one `title`.

Two of the five are now built. `Export JSON` on a decision trace and
`Export DIR` on a compiled flow write real files, asserted by reading them off
disk in `evidence-export.spec.ts`. The other three are gaps:

#### W-053 — the regulator-ready evidence pack

§7.5 of the experience plan asks for a PDF *"with a hash verification page"*.
That is a document — renderer, pagination, a verification page that restates
the chain hash and how to check it — not a serialisation, and the console has no
document renderer and no PDF dependency. `window.print()` dressed as "Export
PDF" would be the same promise the dead button made.

**What stands in today:** `Export JSON` carries the same evidence, machine
readable, and the button says so.

**The check that would close it:** an e2e test that exports the pack and asserts
the hash on its verification page matches the decision's chain hash.

#### W-054 — comparing two flow versions

`ArtifactSummary.versions` is a list of version numbers. What changed between
two of them is a diff view nobody has built, and §7.2 asks for three kinds at
once: a canvas diff, a textual diff, and a semantic summary. `Export DIR` gives
a person the material to diff two versions outside the product, which is a
workaround rather than the feature.

**The check that would close it:** an e2e test that opens two versions of a flow
and asserts a node added in the later one is marked as added.

#### W-055 — a disabled control's reason is not reachable by keyboard

The convention states the reason in a `title`. A `disabled` button is not
focusable, so a keyboard or screen-reader user never reaches the tooltip: the
reason is visible to a mouse and invisible to everyone else. The convention was
kept as-is rather than changed mid-slice, because changing it means changing
five call sites and deciding between `aria-disabled` with a live description
and a visible inline note — a design decision, not a fix.

**The check that would close it:** an axe rule or a Playwright assertion that
every disabled control's reason is in the accessibility tree.

---

---

## Appendix — operations resolved by the contract work

Not gap entries: a log of which spec operations became real, kept because it
records when each contract was first enforced. No ids, and the register check
does not scan it.

| Operation | Resolved | Notes |
|---|---|---|
| `generateOpenAPISpec` | 2026-09-04 | Inverted. The spec is hand-authored and is the source of truth; `packages/client` is generated *from* it, and CI fails if the two disagree. Generating the spec from code would have made the implementation authoritative, which is backwards for a contract. |
| `searchDecisions` | 2026-09-04 | GET with query parameters, not POST — search state lives in the URL. 5,000 decisions, virtualised. |
| `getDecisionRecord` | 2026-09-04 | Real engine output. The `DecisionRecord` schema in the spec now matches what the engine emits. |
| `replayDecision` | 2026-09-04 | Re-executes and compares chain hashes. Contract-tested. |
| `createChangeSet` / `getChangeSet` | 2026-09-04 | |
| `approveChangeSet` / `rejectChangeSet` | 2026-09-04 | Approval applies the diff and writes to the audit log. Permission-gated server-side, not just in the UI. |
| `getTaxonomy`, `listOffers`, `getOffer`, `listCreatives` | 2026-09-04 | Offer catalogue, Objective › Category › Offer. |
| `listTargetingPolicies`, `listFrequencyPolicies` | 2026-09-04 | |
| `getArbitrationConfig` / `updateArbitrationConfig` | 2026-09-04 | |
| `listAutonomySettings` / `updateAutonomySetting` | 2026-09-04 | |
| `listAgentActivity` | 2026-09-04 | Fixture data — no agent is running. The *shape* is real; the activity is not. |
| `listChangeSets`, `listAuditEvents`, `listArtifacts`, `getArtifactSummary` | 2026-09-04 | These were **served but missing from the spec entirely** until the contract work. |
| `login` / `getSession` | 2026-09-04 | Development identity only. No real identity provider. |
| `publishArtifact`, `promoteVersion`, `rollbackVersion` | 2026-09-04 | The artifact registry. Publishing compiles first and refuses errors; publishing does not activate; versions are immutable. |
| `getRegistryEntry`, `listRegistryFlows`, `listRegistryEvents` | 2026-09-04 | Versions, environment state, and the append-only log including refusals. |
| `executeDecision` | 2026-09-04 | Served by two implementations — the console's development store and the JVM service — held to the same 60 chain hashes. |

**Caveat that applies to every row above.** "Resolved" means the console has a
working endpoint with an enforced contract. Everything except the registry is
served over an in-memory store that resets when the process restarts; the
registry can be backed by PostgreSQL via `METIS_DATABASE_URL`. The execution plane does not serve any of them.
When it does, the contract is already written and the tests already exist.

---

---

**Last reviewed:** 2026-09-09.
