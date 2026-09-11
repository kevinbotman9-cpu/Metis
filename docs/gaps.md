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

### G-082 — The stale-server guard cannot fire against a server stale enough to have lost its uptime endpoint

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** none — a two-line fix, and the second half is a decision

[G-035](gaps.md) put a guard in `apps/console/tests/global-setup.ts`: Playwright
reuses whatever is on port 3000, a long-lived `next dev` degrades, so the setup
asks `GET /api/_test/uptime` and refuses a server older than two hours. It has
a hole, and the hole is the shape of the thing it guards.

```ts
const res = await fetch(`${baseURL}/api/_test/uptime`);
if (!res.ok) return;                       // ← a 404 is treated as "no server"
```

**A 404 makes it return silently**, on the assumption that nothing is listening
and Playwright is about to start its own. But a server answering 404 *is*
listening, `reuseExistingServer` takes it, and the suite runs against it. **The
staler a dev server is, the likelier it has lost the endpoint the guard asks
about — so the check is least able to fire exactly when it matters most.**

**Observed 2026-09-11.** A `next dev` for this repository had been up since
11:42 serving a broken module graph: `/` answered 200, `/api/taxonomy` and
`/api/_test/uptime` both 404. A gates run at 14:53 reused it. Every test failed
at sign-in, because no page rendered without the API:

- **341 failed, 4 passed**, where the same commit had run 382 passed / 31
  skipped an hour earlier;
- **65 minutes** against a normal 14, because 341 tests each waited out a
  10-second locator timeout;
- the guard printed nothing.

The run was discarded and re-run against a fresh server: 22 of 22 green, e2e
815 seconds. Nothing was wrong with the commit.

**Two things to fix, and the second is a decision.**

1. **A server that answers the port but not the endpoint should be refused, not
   ignored.** Distinguish "connection refused" — nothing there, carry on — from
   "something answered and it was not our API", which is a server nobody should
   measure against. That is the two-line half.
2. **`reuseExistingServer: true` assumes one agent per machine.** Two lanes now
   work in this repository on one host, and whichever suite starts second
   silently inherits the other's server — with its state, its uptime and its
   module graph. [G-002](gaps.md) describes the fixture-staleness half of this
   and [G-035](gaps.md) the degradation half; neither anticipated a second
   agent owning the port. The options are a per-lane port, refusing a server
   this process did not start, or accepting the coupling and saying so.

**Done when:** a suite that reuses a server which does not answer
`/api/_test/uptime` stops with a message naming it, and the multi-agent case in
point 2 has an answer written down.
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

GitHub has created **no check suite at all** for a pull request head commit
**three times, on two different pull requests**, all on 2026-09-11:

- **PR #23, on open.** `2486223` sat for over thirty minutes with zero check
  runs and zero check suites. Closing and reopening the pull request, which
  normally re-fires `pull_request`, produced nothing either.
- **PR #23, on a later push.** `f10ca61` behaved the same way.
- **PR #33, on open.** `0b1d8ed`, opened 15:33:06Z, had zero check suites and
  zero workflow runs at 15:43Z. For scale: PR #32 was opened nine minutes
  earlier and its `pull_request` run was created **four seconds** later. Ten
  minutes of nothing is roughly 150× the normal latency, not a slow queue.

Every time, Actions itself was healthy: other lanes' pull requests ran normally
within the hour, `GET /actions/permissions` returned enabled, and the workflow
was `active`. Other pushes on the same branches triggered normally, so it is
intermittent rather than a configuration fault — the event simply never
arrived.

**It is not rare.** Three misses across the twelve or so pull-request events
this repository saw on 2026-09-11 is a rate high enough that a session which
waits politely for a green tick will, sooner or later, wait for ever.

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

**The wait, until something automates it: ten minutes.** The normal latency is
seconds, the three observed misses were still empty at ten, thirty and ten
minutes, and no observed run has ever started later than a minute after its
event. Ten minutes of an empty check-suite list means the event is gone, not
late. Dispatch then.

**Done when:** something notices that a head commit has no check suite ten
minutes after it was pushed and says so — the wait above is a habit, and a
habit is what failed twice before anyone wrote it down.

### G-001 — Project references do not build

**Registered:** 2026-09-04 · **Status:** Open · **Work item:** [W-001](BACKLOG.md)

The original cause is gone: `packages/compiler/src/compile.ts` was deleted with the rest of the Phase 0 tree. `tsc --build` still fails, on two causes that were hidden underneath it — the per-package tsconfigs have no `@metis/core/domain` path mapping (only `packages/registry`'s does), and `bench/harness` declares a `rootDir` of `bench/harness/src` that its own `@metis/runtime` imports fall outside. Until this is fixed the per-package tsconfigs cannot be used for typechecking, and `bench/*` is checked by nothing.

### G-002 — A reused dev server serves pre-edit fixture data

**Registered:** 2026-09-05 · **Status:** Open · **Work item:** none

Playwright's `webServer` has `reuseExistingServer: true`, and `apps/console/mocks/store.ts` seeds itself from the fixtures **at module load**. A dev server already running when a fixture changes therefore keeps the old seed, and `POST /api/_test/reset` does not help — it re-clones the same captured seed. Observed as a `getArbitrationConfig` contract failure that passed immediately against a fresh server. Turning reuse off would add a cold start to every local run, so the workaround is to restart the server after editing a fixture; CI is unaffected because it always starts one.

### G-035 — A long-lived dev server degrades until the suite is unusable

**Registered:** 2026-09-09 · **Status:** Open · **Work item:** none

Playwright reuses whatever is on port 3000 (`reuseExistingServer: true`), and a
`next dev` process that has been up long enough stops being a valid thing to
measure against.

Observed 2026-09-09. The process had been running seventeen hours at 2.2 GB
resident. Against it, `npm run test:a11y` managed **2 tests in 10 minutes**;
against a freshly started server, the same command ran **49 in 2.7 minutes**.
Every timing-shaped failure recorded in this register before that point should
be re-read with it in mind.

**Decided 2026-09-09: refuse a reused server older than two hours.**

`apps/console/tests/global-setup.ts` reads `GET /api/_test/uptime` before the
suite runs and throws if the server has been up longer, naming the age and
telling the reader to restart it. Verified to bite by lowering the threshold to
one millisecond: the run stops with the message rather than producing numbers
nobody should trust.

**Why two hours, since it is a judgement and not a measurement.** It sits
between the two numbers there is evidence for. A cold start costs about thirty
seconds, so refusing at two hours costs at most one cold start per two hours of
work — inside the noise of a suite that takes fourteen minutes. The only
degradation actually observed was at seventeen hours. Two hours is comfortably
inside that and comfortably longer than any single sitting of edit-and-rerun, so
a developer iterating should never see it and a server left up overnight always
will.

**What is still unknown, and how to settle it.** Nobody has measured where the
degradation begins; there is one observation at seventeen hours and one
non-observation at zero. Recording the server's age alongside the suite duration
for a few weeks would turn this into a number. Until then it is a guess with a
reason attached, which is better than reuse with neither.

**Not chosen: dropping the reuse.** It would cost a cold start on every local
invocation for a problem that appears once a day at most, and the people who pay
that are the ones running the suite most often.

**One test was passing for the wrong reason, and the fix exposed it.**
`seeds nothing running` asserted `getByText('running')` had count 0.
`getByText` is a case-insensitive substring match, so it also matched the page's
own **"Running"** metric label — the assertion could only pass by running before
the list rendered and finding nothing at all. Adding a wait for the seed to
`beforeEach` turned that false pass into the failure it had always been. It now
reads the badge with `{ exact: true }` and separately asserts the page's own
counter says 0: the same claim, addressed precisely, checked twice.

Under `--repeat-each=12` on a fresh server: **16 failed / 1 passed** before the
G-003 fixes, **12 failed / 85 passed** after them, **1 failed / 96 passed** after
the addressing fix. The remaining one is `ECONNRESET` on the teardown's reset
POST — the dev server dropping a connection, which is a transport fault rather
than an ordering one.

**Done when:** `--repeat-each=12` passes ten times in a row without an
`ECONNRESET`. Six consecutive full runs are clean; this narrower probe is not.

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

### G-015 — A flow can ignore consent and nothing says so

**Registered:** 2026-09-07 · **Status:** Open · **Work item:** [W-013](BACKLOG.md)

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
  `toExecArtifact` does not map it, and the engine draws frequency policies
  from `catalogue.frequencyPolicies` by scope instead. So a flow author who
  set it would get no error and no effect. Either wire it or delete it.

#### Not a finding: the empty account hero

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

### G-075 — Retention suitability is decided per request, not per offer, and in the seed by a coin flip

**Registered:** 2026-09-11 · **Status:** Open · **Work item:** [W-026](BACKLOG.md)

**Suitability is not being checked for retention offers.** `pol_afford_retention`
— *"a retention offer must reduce, not increase, the customer bill"* — sits on
the suitability tier, the tier that exists for the FCA (G-015 calls it *"the
FCA-facing tier"*), scoped to the whole retention objective
(`apps/console/mocks/fixtures/catalogue.ts:913-923`). Its one condition reads
`offer.monthly_delta`. That is one number per request, not one per offer: the
engine evaluates every condition against `request.input`
(`packages/runtime/src/deterministic/engine.ts:431`), so every retention
candidate in a decision is tested against the same value and they all pass or
all fail together. Whether a particular offer would raise this customer's bill
is never asked.

In the seeded corpus the value is a coin flip —
`offer: { monthly_delta: r('delta') > 0.5 ? -500 : 300 }`
(`apps/console/mocks/fixtures/engine.ts:275`). Executed over the seed,
`retention-outbound` — twenty candidates, all of them retention offers — made
2,378 decisions in which retention offers reached the policy. **None split.** In
all 1,188 where the coin came up `300`, every one of those offers was refused; in
all 1,190 where it came up `-500`, none was.

**The trace names a real policy either way.** Each refusal is recorded as
`SUITABILITY_FAILED` with `ruleId: pol_afford_retention`, which reads as an
affordability judgement about that offer for that customer. Each pass reads as
the same judgement going the other way. Neither is one. A compliance officer
opening either trace is shown a named suitability rule applied, and nothing in
the record says the rule compared a single request-level number that did not
come from the offer. Since G-055 closed, the refusal is also attributed to a
pack: `pol_afford_retention` belongs to *UK Consumer Duty 1.4.0*
(`catalogue.ts:804-808`), and the trace reader names that pack beside the
refusal (`apps/console/components/trace-evidence.tsx:24-27`). A coin flip is
now presented as a Consumer Duty affordability refusal.

**Fixing it is a modelling change, not an edit to the rule.** The profile schema
has no way to express a per-offer input: `offer.monthly_delta` is declared on an
entity the request supplies once (`apps/console/mocks/fixtures/profile-schema.ts:255-267`),
and a condition can read only request paths, never a field of the candidate it
is judging. The facts a real check needs exist separately — an offer carries
`financials.price` (`packages/core/src/domain.ts:50-60`), and the billing
connector resolves `monthlySpend` — and there is no way to write a condition
that combines them per candidate. Rewording the rule, or supplying a better
number on the request, leaves it deciding every retention offer at once.

Found while tracing the data spine for
[ADR-014](adr/ADR-014-the-data-spine.md), which describes it under *Smaller
breaks found on the way*.

**Done when:** a suitability condition can be evaluated per candidate against
that candidate's own values, both engines agree, and a corpus case in which one
retention offer lowers the bill and another raises it records one refused and one
passed, under the same policy in the same decision.

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

## Resolved

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
