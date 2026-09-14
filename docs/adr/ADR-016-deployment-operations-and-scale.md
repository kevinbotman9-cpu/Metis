# ADR-016: What ships, how it reaches an environment, and what it does when Postgres is gone

**Status:** Accepted
**Date:** 2026-09-13 (proposed)
**Decided:** 2026-09-13
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided

**Accepted as written:** all seven clauses, including §5.2's striking of W-045's
cached-decision rung, and the build order — with one amendment to the build
order decided the same day, recorded under *Build first, defer*: the stores a
decision reads come before the first unit.
**Constrains:** `planes/execution`; the decision operations served today by
`apps/console/app/api/[...path]/route.ts`; `packages/core/src/migrate.ts` and the
three `create-store.ts` files that call it; `docker-compose.yml`; `bench/harness`;
the performance table in `README.md`; W-045 (degradation ladder); W-071
(aggregate latency); artefact 3 of the slice definition in `CLAUDE.md`;
ADR-002's EventStoreDB, Redis and ClickHouse rows; ADR-001's *Validation*
section.
**Arises from:** a read-only survey on 2026-09-13. `planes/execution` has no
tracked files, and there is no container build, no environment beyond fixtures,
no migration runbook and no rollback outside the artifact registry. Also G-061,
G-068, W-045, and `docs/CAPABILITIES.md` rows *Multi-tenancy*, *S1 benchmark* and
*S1's remaining variants*.

## Context

### There is no execution plane, and the decision API is the development mock

Slice artefact 3 says a public endpoint lives in `planes/authoring` or
`planes/execution`. `planes/authoring` does not exist. `planes/execution` exists
on disk only as an untracked `dist/` and a `tsconfig.tsbuildinfo` left from
2026-09-04; `git ls-files planes` returns nothing. Every slice that shipped
artefact 3 pointed at an empty directory.

The decision operations are served by `apps/console/app/api/[...path]/route.ts`.
That route imports its state from `@/mocks/store`. In practice:

- The registry is always in memory. `apps/console/mocks/store.ts` › `const registryStore = new InMemoryRegistryStore()` @ `f94c5e49d` builds an
  `InMemoryRegistryStore` whatever `METIS_DATABASE_URL` says, and `apps/console/mocks/store.ts` › `'production', artifact.updatedBy` @ `f94c5e49d`
  promotes the fixture artifacts to `'production'` at every start.
- Only the ledger reaches Postgres (`apps/console/mocks/store.ts` › `built.ledgerReady = createLedgerStore()`).

So the one running system is the console process. It authors, decides and
records, from fixtures, for one tenant, `telco-us`. A console deploy is a decision
outage, and a decision traffic spike is an authoring outage.

The JVM service (`engines/kotlin/service`) is the other candidate, and its README
rules itself out:

- state is in memory;
- integration resolution is not ported;
- there is no authentication;
- *"It is not deployable as-is and is not claimed to be."*

It loads a bundle file (`Main.kt`) because *"there is no artifact registry to
fetch from yet"*.

### What a Postgres outage does today

On a decision request, `apps/console/app/api/[...path]/route.ts` › `await store.ledger.record(store.ledger.entryFor(trace, decisionRequest.tenantId))` awaits `store.ledger.record(...)` before
answering. The comment above it gives the reason: a decision the platform made
and cannot produce afterwards is worse than one it failed to make.
`apps/console/app/api/[...path]/route.ts` › `await store.ledger.claim(` then awaits an idempotency claim, and every GET awaits
`ledgerReady` (`apps/console/app/api/[...path]/route.ts` › `await store.ledgerReady`). With Postgres unreachable, every decision request
fails. That is a better failure than a silent fall-back to storage that forgets,
which all three `create-store.ts` files refuse. But it is not a ladder:
`docs/CAPABILITIES.md` lists taxonomy 17.6 as `ABSENT`, and W-045's rungs
(*full → cached → default → static*) have no implementation and no decision
about what "cached" would mean for a hashed record.

### Migrations run inside whatever process starts first

`migrate()` runs when each store is created (`packages/catalogue/src/create-store.ts` › `migrate(`, `packages/ledger/src/create-store.ts` › `migrate(` and
`packages/registry/src/create-store.ts` › `migrate(`), under a per-store advisory lock,
inside the application process. The runner refuses before applying anything:

- a changed applied file (`CHANGED`);
- a missing one (`MISSING`);
- a numbering gap (`GAP`);
- a file carrying its own transaction (`OWN_TRANSACTION`);
- a database with objects and no record (`UNVERSIONED`).

`tests/migrations-frozen.test.ts` makes the same refusal at pull-request time.
That is sound engineering with no operational shape. The refusal is a thrown
error inside a web request or a process start, and nobody can log into the
environment to read it. `UNVERSIONED` even tells the reader to
`DROP DATABASE` (`migrate.ts`, the `isDuplicateObject` branch). That instruction
is right on a laptop and catastrophic if a deploy script ever acted on it.

### ADR-004's deployment constraint is a paragraph

ADR-004's amendment is binding: *no deployment may write the ledger to PostgreSQL
with real customer references* until three things exist:

- per-subject encryption of the whole record;
- a per-subject-keyed subject column;
- a rule for free-form columns.

None of the three exists. G-068 records that `decision_records.record` holds
`customerRef` in clear beside `subject_hash`. Nothing in code, configuration or
CI can tell a synthetic deployment from a real one. Setting `METIS_DATABASE_URL`
on a machine that receives real traffic violates the ADR, and nothing notices.

### A tenant is a string

`tenant_id` is a column in every store and a path segment in
`POST /api/placements/{tenantId}/{key}/decisions`. There is no tenants table, no
operation that creates one, and no refusal for a tenant nobody provisioned.
`Environment` is `string` (`packages/registry/src/types.ts` › `export type Environment = string`), so a promotion to
`prodcution` succeeds.

The only way a second tenant can come to exist is `packages/portability`'s
import. ADR-007 §6 makes an imported tenant inert until its secrets are
provisioned, which is right, and there is nothing to provision them into.

### Three stores are declared and connected to nothing

`docker-compose.yml` declares four stores and connects only `postgres`.

- **`eventstore`** (`eventstore:latest`): superseded in practice by append-only
  triggers in Postgres.
- **`redis`**: held by ADR-014 §3 until the S1 harness measures a profile read
  over budget. ADR-014 §3 also says to remove it from compose in the first slice
  that touches the profile store.
- **`clickhouse`** (`clickhouse-server:latest`): held by ADR-008 §3 until a
  measured query cost justifies it.

Two of the four images are unpinned `latest` tags.

### What has been measured, and what is being claimed

**The harness** measures the TypeScript engine in-process.

- **The CI gate** (`bench/harness/tests/gate.test.ts`): 5,000 decisions over 40
  offers, p95 under a fifth of 50 ms.
- **S1** (`bench/results/S1.json`), from a 12-core Windows laptop, commit
  `660e56f`: 20,000 decisions per variant.
  - Cold: p99 6.8 ms, 594 decisions/s.
  - Warm: p99 3.6 ms, 930 decisions/s.
- **The recorded workload** says `profiles: 1000000`. No profile store exists
  (ADR-014, row 3: *"Nothing"*), so no decision in that run read a profile from
  storage. The number describes a seeded generator, not a store.
- **The catalogue heap probe** (`scale-probe.ts`) stops at 5,000 offers.

**None of those runs includes:**

- an HTTP hop;
- a ledger write;
- a connector call;
- a second process or a second tenant;
- a table larger than a test's.

`S1.json` declares its own gaps in `notMeasured`, and `CAPABILITIES.md` states
them honestly.

**The claims made anyway:**

- `README.md` › `Load tested` @ `b46c4f4f9` lists *Throughput > 1000 req/sec* with a check mark and
  *"Load tested"*. The harness's own comments say that is a service-level claim
  it does not measure (`bench/harness/src/index.ts` › `is a service-level claim`, `bench/harness/src/run.ts` › `Not a loosened threshold: a different claim`), and the
  measured single-process figure is below it.
- ADR-001's *Validation* promises *p95 < 50ms under 1000 req/sec* and replay
  from 30 days ago. There has never been a deployment that was 30 days old.

## Decision

### 1. Three deployable units, built from one commit, rolled out separately

1. **The decision service** is the execution plane. It is a Node service in
   `planes/execution`, running the TypeScript engine, and serves the decision
   operations in the spec:
   - the placement decision operations;
   - `POST /api/decisions`, trace and replay;
   - outcomes and deliveries.

   It builds on `@metis/runtime`, `@metis/ledger`, `@metis/registry` and the
   integration gateway, never on `apps/console/mocks`. It holds the active
   artifact and its catalogue snapshot in memory, loaded at start and on
   promotion. It never reads the registry per request. It is stateless apart
   from the journal in §5.
2. **The console** is the Next standalone build (`output: 'standalone'`, already
   set). It carries the authoring operations and the screens. It calls the
   decision service for anything that decides, including simulation and replay,
   so the console holds no second copy of the decision path.
3. **The migration job** is a one-shot command in the same image as the decision
   service. It runs before either service rolls (§3).

**Built together.** One release tag builds all three from one commit. A chain
hash is a property of engine code, so a hash-moving change such as G-015 reaches
the decision service in one release, never piecemeal.

**Rolled out separately.** Decision traffic and authoring have different scaling
and failure domains:
- a console deploy must never interrupt decisions;
- a decision spike must never lock an author out of rolling back.

**Compatibility.** The decision service must execute any artifact the previous
release's compiler produced: the registry holds artifacts across releases, and a
rollback of the service must not orphan what is active.

**The Kotlin service is not a deployable unit.** It stays the conformance witness
that makes the two-engine claim true (`DecisionConformanceTest`,
`ServiceConformanceTest`). A JVM deployment is a later decision that needs its
own gateway, auth and persistence. The mistake this clause prevents is shipping
the JVM service because it already has an HTTP server: its README says why it
cannot be deployed, and every one of those reasons is still true.

**Artefact 3 of the slice definition becomes true** when the first decision
operation moves into `planes/execution`. Until then, amend `CLAUDE.md` to say
where decision endpoints actually live, not where they were meant to.

### 2. A tenant is provisioned by a command, and the decision service refuses one that was not

1. **A `tenants` table**, in a control-plane store of its own and created by a
   migration like any other, is the only place a tenant exists. It records:
   - the id;
   - the data class (§4);
   - locale and currency (G-092);
   - the declared environments, in promotion order;
   - the reference to the tenant's ADR-004 key namespace.
2. **Provisioning** is a command-line operation, `metis tenant create`, as well
   as an API operation, for the same reason `packages/portability` is a CLI: an
   operator must be able to do it without a console someone is logged into. It
   is idempotent and audited. In one transaction it:
   - writes the tenant row;
   - creates the key namespace;
   - declares the environments;
   - creates an empty catalogue;
   - issues the first administrator invitation.

   Connector secrets are not provisioned by it. Per ADR-007 §6 they arrive later,
   and until they do, the import report lists them as unresolved.
3. **Import is provisioning's second entry point.** `portability` import targets
   a tenant that `tenant create` has already created, never a string.
4. **The decision service and the registry refuse what the table does not
   declare:**
   - a decision for an unknown `tenantId`;
   - a promotion to an undeclared environment.

   Both registry refusals are recorded, as refusals already are.

### 3. Migrations run as a gated job, and the services only verify

1. **Services stop migrating at start.** `create-store.ts` gains a verify-only
   mode, the default outside development. It reads
   `<store>_schema_migrations`, compares it with the migrations the code carries,
   and refuses to become ready when the database is behind. A database ahead by
   versions the code does not know is allowed only because of clause 3.
2. **The migration job** runs `migrate()` for every store from the release image,
   once per environment, before any rollout. Its exit status gates the rollout.
   Its output, which the runner already writes to be read without a debugger, is
   attached to the deployment record. That output is the operator's only view,
   because nobody logs in.
3. **Every migration is expand-only against the release before it.** A rolling
   deploy runs release N−1 code against schema N for minutes, and a code rollback
   runs it for as long as it takes. So a migration may add but never:
   - rename or drop;
   - tighten a constraint N−1 violates.

   Removal is a later migration, one release after nothing reads the column.
   There are no down migrations. The files are frozen and the ledger tables
   refuse `UPDATE`, so a "down" would be a promise the schema forbids.
   **Rollback is the previous image against the expanded schema.**
4. **Data changes to append-only tables are new tables,** never backfills.
   ADR-004 point 5 already says why, and the job has no path around it.
5. **The job never acts on a refusal's advice.** `UNVERSIONED` and `CHANGED` stop
   the job and the rollout; nothing in a pipeline drops a database or rewrites a
   checksum row. The runner's `DROP DATABASE` advice gains a qualifier that the
   job prints: *a development database only*. The tempting mistake here is a
   "repair" flag on the job for the day a refusal blocks a release. That flag
   would convert a stopped deploy into silent drift between environments, which
   is what G-077 was.

### 4. ADR-004's constraint is a startup refusal, not a sentence

1. **Every deployment declares `METIS_DATA_CLASS`,** either `synthetic` or
   `real`. It has no default in any built image: an image started without it
   refuses to start. `docker-compose.yml` and the e2e harness set `synthetic`
   explicitly.

   The mistake this prevents is a default of `synthetic` so that development
   "just works". The environment that forgets the variable is the one holding
   real data.
2. **The ledger store exposes its subject protection as a constant of the code,**
   `none` today. The implementation of ADR-004 points 1–3 changes it, and a test
   that decrypts nothing without a subject key proves the change.
   `createLedgerStore` refuses to start when all three hold:
   - the data class is `real`;
   - the store is Postgres;
   - protection is `none`.

   The refusal names ADR-004 and G-068. It takes the same shape as today's
   refusal of an unreachable database, and it is tested the same way.
3. **The tenant row carries the data class too,** and the migration job refuses
   an environment whose deployment class and tenant classes disagree. A
   `synthetic` deployment must not quietly serve a tenant provisioned as `real`.
4. **G-068's check becomes a post-deploy smoke** in every `real` environment and
   a unit test in CI. It records a decision and asserts the raw `customerId`
   appears in no column in clear. When protection is `none`, clause 2 means
   there is no `real` environment for it to run in, which is the point.

### 5. The degradation ladder, when Postgres is unreachable

**The principle:** a customer may get no offer, but never an offer the platform
cannot produce afterwards, and never a timeout. Every rung is recorded, and each
rung's trigger is a budget, not a hang.

| Rung | Trigger | What is served | What is recorded |
|---|---|---|---|
| 0 — full | Ledger write and idempotency claim succeed within their share of the budget | The decision | The record, synchronously, as today |
| 1 — journalled | Ledger write fails or exceeds its budget; the request carries **no** idempotency key | The decision | The record, fsynced to a bounded local journal on a persistent volume; the measured half (never hashed) carries `recordedVia: journal`. A drainer appends journalled records to the ledger in order when Postgres returns, verifying each chain hash as it lands |
| 2 — declined | Journal full or unwritable; or the request carries an idempotency key and the claim cannot be made | The placement's declared fallback content (ADR-012), with `decided: false` and reason `LEDGER_UNAVAILABLE` — **no decision id**, because no decision was made | A degradation event (the spec's proposed `getDegradationEvents`) to the journal if writable, otherwise to the log |
| 3 — channel static | The decision service is unreachable | Whatever the channel renders after its own timeout | Nothing the platform can record; the platform's promise is to answer at rung 2 inside the budget so this rung is reached only by a dead service |

1. **Keyed requests skip rung 1.** A per-instance journal cannot see another
   instance's claim. Deciding without the claim risks two decisions for one key,
   which is exactly what idempotency is for. One decision or none, never two:
   fail closed, as consent does.
2. **W-045's "cached decision" rung is struck.** Serving a customer an earlier
   decision under a new request would attach an old record's id and hash to
   inputs it was not made from, so the trace would lie. The one legitimate reuse
   is replaying the *same* request's recorded decision, and that is idempotency
   at rung 0.
3. **Artifacts and catalogue snapshots do not depend on Postgres per request.**
   They are held in memory (§1) and written to a local content-addressed cache,
   keyed by the artifact hash the registry already binds.
   - *Postgres down with a warm instance:* the service keeps deciding from what
     is loaded.
   - *Postgres down at cold start with a cache:* the service loads the last
     activation it recorded and says so on `/health`.
   - *Postgres down at cold start without a cache:* the service is not ready.
     It never serves a decision from nothing.
4. **Authoring has no ladder.** With Postgres unreachable the console goes
   read-only and says so. Publish, promote and rollback are refused, because a
   promotion nobody can record is the change set this platform exists to
   prevent.
5. **Every rung is chaos-tested before it counts as built** (W-045's *Done when*),
   against the built image with Postgres stopped mid-run, not against a mocked
   store.

### 6. Compose holds what is connected

1. **Remove `eventstore`, `redis` and `clickhouse` from `docker-compose.yml`** in
   the first slice under this ADR, and pin `postgres` to a minor version. A
   deployment pipeline is written by reading compose, and each unused service it
   copies is:
   - a stateful thing to patch and back up;
   - under ADR-004, a surface erasure must reach.

   ADR-014 §3 already ordered the Redis removal. This extends it to the other two
   and brings the removal forward.
2. **EventStoreDB does not return.** Append-only audit is Postgres triggers
   (registry, ledger, catalogue). ADR-002's EventStoreDB row is superseded.
3. **Redis earns a place by measurement,** in one of two ways:
   - **The profile read:** ADR-014 §3's condition, a profile read at a million
     stored profiles above its share of the budget, measured by M4 below. It
     enters as a read-through cache of ciphertext, purged when a subject key is
     destroyed.
   - **Shared journal or claim state:** if rung 1 or keyed requests need state
     across instances. Even then a Redis-held idempotency claim is not durable
     and cannot replace the ledger's. A proposal to use it that way must say
     what happens to a claim lost on failover.
4. **ClickHouse earns a place by measurement:** ADR-008 §3's condition, an
   aggregate query over the ledger whose cost on Postgres exceeds a stated
   budget at a stated row count, measured by M2 below. The likely first case is
   G-061's p50/p95/p99 over a window. ClickHouse enters as a derived read model,
   rebuildable from the ledger, holding only what the ledger holds and under the
   same subject keys. It is never written to directly.

### 7. No latency or scale figure goes to a buyer without its measurement id

**The rule.** A figure given to a buyer cites a run in `bench/results/` that
carries S1's context fields: infrastructure, code version, workload, cache state
and confidence interval. Any variant it does not cover is listed as not measured.
A figure without a run is stated as a target, in those words.

**The README.** Its throughput row is corrected to a target. The ADR does not
edit it, so the correction is the first slice's work.

**What must be measured first**, each against the built decision service image
over HTTP with open-loop load (a request's latency counts from when it was due,
not when the load generator got round to sending it):

| Id | Measurement | Why the current numbers do not answer it |
|---|---|---|
| M1 | p50/p95/p99 at sustained 1,000/s and burst 2,000/s for at least 30 minutes, per instance and at stated instance counts, on declared hardware | S1 is in-process, single-process, 20,000 decisions, no HTTP |
| M2 | The same with the synchronous ledger write to Postgres, at `decision_records` sizes of 10M and 100M rows, including the `decision_records_by_subject` index and idempotency-key growth | No benchmark has written a ledger row; the p99 gate is scoped to a path that does not |
| M3 | The same with the integration gateway in the path, including one degraded provider at stated latency and error rates | S1's `notMeasured` names it |
| M4 | Profile read at 1M and 10M stored, per-subject-encrypted profiles, including the ADR-004 key read | There is no profile store; S1's 1M profiles are a generator parameter |
| M5 | Catalogue heap and activation time per instance at 10k, 50k and 100k offers | The heap probe stops at 5,000 |
| M6 | Throughput against instance count, to the point where the single Postgres writer, not the service, is the limit | Nothing has run two instances |
| M7 | Ladder timings: time to rung 1 after Postgres loss, rung-2 rate as the journal fills, drain time, and a count of duplicate or missing records after drain (must be zero) | The ladder does not exist |
| M8 | First-decision latency and time-to-ready of a new instance, cache warm and cold | S1-cold is the first decisions of a process that already loaded everything |
| M9 | Tenant B's p99 while tenant A bursts | One tenant has ever been served |

## Build first, defer

**Amended at acceptance, 2026-09-13.** Before the decision service, the stores
it reads are made to hold everything a decision reads, as their own reviewed
change. Connectors are part of the hashed catalogue snapshot and have no store;
placements have no store; and the Postgres catalogue store returns every array
sorted by id where the fixtures are not, so a decision served from it could not
reproduce the 60 service cases. So: connectors on the catalogue store, a
placements table, portability learning both, and id-sorted fixtures — which
moves the catalogue hash of every decision, and is predicted before and diffed
after like every other hash move. The decision service follows on those stores.
The README correction below had already landed on its own.

**First: the decision service as a deployable unit, with the check that proves
it is one.** That means:

- `planes/execution` as a tracked package serving the placement decision
  operation from real stores, with auth and `/health`;
- a container image built in CI from the release commit;
- a job that starts the built image and sends the 60 service cases over HTTP,
  asserting every chain hash, as `ServiceConformanceTest` does for the JVM
  service.

The same slice removes the three unused services from compose and corrects the
README's throughput row.

It comes first because every other clause attaches to it:
- the startup refusal of §4;
- verify-only migrations of §3;
- the ladder of §5;
- every measurement in §7.

Until it exists, each of those would be built into the console's mock route and
moved later, and the move is where it would break. It is also the smallest thing
that makes artefact 3 true.

**Second: §4, the data-class refusal.** It is small, it closes a compliance
constraint that today rests on nobody forgetting, and it has to exist before any
environment other than a laptop runs the image the first slice builds.

**Then, in order:**
1. §3, the migration job and verify-only services;
2. M1 and M2;
3. §2, tenant provisioning, which the first conversation about a second customer
   will ask for;
4. rung 1 and rung 2 of §5 with M7;
5. M3–M6, M8 and M9 as the pieces they measure land.

**Deferred:**
- A JVM deployment.
- Multi-region placement and data residency (taxonomy 2.10, `ABSENT`).
- Autoscaling policy.
- Redis and ClickHouse, until §6's measurements say otherwise.
- Any orchestration choice beyond "a container image and a one-shot job". That
  choice belongs to the first customer's platform, and this ADR constrains what
  the units do, not where they run.

## Consequences

- **The console loses its ability to decide on its own.** Local development
  needs the decision service running beside it, which is a second process, and
  the e2e harness must start both (G-035's rule: its own servers, never a reused
  one). That costs startup time on every e2e run, and the first person to notice
  will be whoever runs `npm run gates` locally.
- **Expand-only migrations make every schema change two releases.** Renames
  become add, copy-on-write-by-new-table, then drop a release later. That is
  slower and it is the price of a rollback that works.
- **Rung 2 means customers get fallback content during a Postgres outage** that
  outlasts the journal. Channel owners will see offer rates fall to zero and
  must be told that the drop is the design, not the incident, which is why §5
  requires degradation events.
- **The data-class refusal blocks any real-data deployment** until ADR-004
  points 1–3 are built. That is the ADR-004 amendment taking effect; it was
  always true, and it becomes visible. The first person to notice will be
  whoever is asked to run a pilot on customer data.
- **Removing compose services removes a statement of intent.** ADR-002's rows
  and the Vision plan still name Redis and ClickHouse. Anyone reading only
  compose will conclude they are not planned, which is closer to the truth than
  the file's own header managed.
- **A buyer asking about throughput gets "targets, measured in-process; service
  measurements pending"** until M1 exists. That is a weaker answer than the
  README gives, and it is the true one.
- **The first thing that will be wrong:** the first slice will find console
  screens that call decision logic directly through `@/mocks/store`, not through
  an operation. Simulation, shadow comparison and the trace re-execution in the
  trace reader are likely candidates. Each is a hole in the contract, and each
  will surface as an e2e failure when the console stops containing the engine.

## Alternatives considered

**Keep one deployable: the console serves decisions, scaled horizontally.** It is
the least work: `output: 'standalone'` already produces an image. It loses on
failure domains. Every console change becomes a decision-path deploy, and an
authoring bug or a heavy screen, as G-111's bundle findings suggest, shares a
process with the 50 ms budget. It also leaves artefact 3's plane permanently
fictional. And it keeps `apps/console/mocks` on the decision path, which Rule 1
exists to prevent.

**Ship the Kotlin service as the execution plane.** It already has an HTTP server
and passes the 60-case conformance over HTTP. It loses on everything around the
engine: no gateway, no auth, no persistence, no registry client. Building those
in Kotlin means the TypeScript integration code, ledger and registry are
implemented twice before one customer is served, and the ledger's
behaviour suite would need a JVM twin. Keep it as the proof that the semantics
are a specification; decide a JVM deployment when a buyer's platform requires
one.

**Let services migrate at start, as today, under the advisory lock.** It works,
and the lock makes concurrent starts safe. It loses because the refusal lands
inside a crash-looping pod rather than a gated job. A half-rolled deployment
would then run old and new instances against a schema the new ones changed. And
a rollback cannot be told apart from "the database is ahead". Verify-only
services with a gating job give the same safety with a place to read the answer.

**Enforce ADR-004 by review: a deployment checklist that asks whether data is
real.** It costs nothing to build. It loses for the reason ADR-004's amendment
exists at all: a premise was wrong for two days and nobody noticed, and a
checklist is a paragraph with a box. The refusal costs one environment variable
and one test.

**Serve a cached decision when Postgres is down (W-045 as written).** It keeps
offer rates up during an outage. It loses because the served record's inputs are
not the request's inputs, so its trace, chain hash and replay are false for the
request it answered. A platform whose claim is that every decision explains
itself cannot answer with a decision that does not.

**Keep Redis and ClickHouse in compose as intent, as the header comment argues.**
It loses because intent belongs in an ADR, which can say what would make it true,
and compose is read by the person writing the deploy. ADR-014 reached the same
conclusion for Redis.

**Measure scale on the in-process harness at larger sizes, and quote that.** It
is cheap, and the engine's numbers are good. It loses because what a buyer is
sold is a decision over the network, recorded durably, with its connectors called.
None of those costs is in the harness, and a figure that leaves them out will be
quoted as if it included them, which S1's own header warns about.
