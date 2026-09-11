# ADR-014: The data spine — what a customer attribute passes through, and where METIS stops

**Status:** Proposed
**Date:** 2026-09-11 (proposed)
**Owner:** Product owner
**Decision needed by:** 2026-09-18. Spine 1's fifth slice is ad-hoc distribution
simulation (W-020), and a simulation needs a population to run over. There is
none. If that slice opens before this is decided it will have to generate one,
and the only generator in the tree is `seededUnitInterval` — so the screen whose
job is to say what a change does to customers would report what it does to a
hash. From that date, every slice touching consent, contact points or model
features is inventing the shape this ADR exists to fix.
**Constrains:** `packages/core/src/profile-schema.ts` and `intake.ts`;
`resolveInputs` and `resolveAggregations`; the console's decide path
(`apps/console/app/api/[...path]/route.ts:559-633`); `DecisionRequest.consent`
and the consent default in both engines; `CatalogueSnapshot` and
`DeterministicDecision`, and therefore every chain hash; `packages/ledger`;
`ScoringContext`; the recipient in ADR-013 §3; the `feature-store` connector
kind; `redis` in `docker-compose.yml` and ADR-002's Redis row; W-008, W-009,
W-010, W-011, W-012, W-013, W-020 and W-035.
**Arises from:** three blocks named by the product owner on 2026-09-11 —
ADR-009's third step has no features to score, ADR-013's adapter has no
recipient, and eligibility evaluates against fields that arrive as fixtures —
and sections 1 to 3 of `docs/evaluation/TRUTH_AUDIT.md`.
**Written against:** `45b9ad3`, then rebased onto `cc08b71`. None of the
commits between the two touches `packages/core`, `packages/runtime`,
`packages/ledger`, the console's API route, the catalogue fixture or the
profile-schema fixture, so the line numbers below hold on both.

## Context

### The finding, in one sentence

**METIS holds nothing about a customer.** Every value an eligibility rule reads
arrives in the body of the decision request, typed by whoever called; the values
the platform fetches for itself are read by no rule. A data model, an intake
pipeline and a rollup mechanism all exist and are tested, and the thing between
them — a place where a value is held against a customer — does not.

### One attribute, hop by hop

Follow `customer.credit_status`, which `pol_credit_pass` reads
(`apps/console/mocks/fixtures/catalogue.ts:801-812`), from a system that knows
it to the rule that uses it.

| Hop | What the value needs | What the code does | Where it breaks |
|---|---|---|---|
| 1. Declared | A field in a model the tenant owns, versioned | One `ProfileSchema` in `apps/console/mocks/fixtures/profile-schema.ts`, root `DecisionInput` (`:38`), `version: '1.0.0'` typed by hand. `getProfileSchema` is the only operation | Not in `CatalogueSnapshot` (`packages/runtime/src/deterministic/types.ts:118-133`), so no decision names the model it was read against. Adding a field is an edit under `apps/console/mocks`. The Kotlin engine has no schema at all |
| 2. Arrives | A path from a source system into the platform | Intake lands a pasted JSON array (`apps/console/app/data-model/intake/page.tsx:321-325`) into an in-memory `Map` capped at 5,000 rows (`route.ts:189`, `:1903-1905`). `kind: file` is a label; the spec has no upload (G-011) | `DataSourceDefinition` has no key column (`packages/core/src/intake.ts:69-87`), so a landed row describes nobody. Activation sets `status = 'active'` (`route.ts:1952`) and nothing reads an active source |
| 3. Held | A value stored against a customer | Nothing | No profile store. `redis` is declared in `docker-compose.yml` and no client exists anywhere in the tree |
| 4. Found | The customer identified | `customerId`, a string the caller chooses | No resolution. One person's anonymous and signed-in sessions are two unrelated subjects |
| 5. Resolved | Read before the core, hashed | `resolveInputs` merges connector fields, and the request wins over them (`packages/runtime/src/integration/resolve.ts:296-309`) | The only store it can read is the request body |
| 6. Evaluated | The rule reads a real value | `readPath` over `request.input` | The value is what the caller typed: a hash in the seeded corpus (`apps/console/mocks/fixtures/engine.ts:259`), a literal in the storefront (`apps/console/public/storefront/index.html:534`) |
| 7. Recorded | What was read, from where, as of when | `inputSnapshotHash` (`types.ts:277`) and connector bindings | Values are not retained (G-009), a source call has no `computedAt` (G-056), and no schema version is recorded |

Hop 3 is the break, and every other break points back at it. Intake cannot put a
value there because a landed row does not say whose it is. Identity cannot be
resolved into it because it does not exist. Rollups have nothing to roll up
because the collections they read come from the request. The model plane has no
feature to read from it, and delivery has no contact point to find in it.

### The three blocks, located on the trace

**The model plane has no features.** `ScoringContext` is
`{ tenantId, customerId, offerKey, modelKey }`
(`packages/runtime/src/scoring/index.ts:39-46`). ADR-009 §5 has a model declare
its features as paths into the profile schema. The paths exist; their values
exist only in a request body. A model imported tomorrow would be scored on
whatever a caller typed or, in the seeded tenant, on a hash.

**Delivery has no recipient.** Hop 1 has no contact point in it. `Address` is
*"the service address, and what the network can deliver there"*
(`profile-schema.ts:199-205`). ADR-013 §3 has the adapter take a `recipient`
*"resolved outside the adapter"*, and outside the adapter there is nothing to
resolve it from.

**Eligibility runs on fixtures.** The tenant has eleven targeting policies
(`catalogue.ts:790-915`). All eleven read caller-supplied grouped fields —
`customer.*`, `address.*`, `usage.*`, `contract.*`, `events.*`, `device.*`,
`offer.*`. Not one reads any of the eight fields the connectors resolve
(`catalogue.ts:1262-1355`). In the seeded corpus every caller field is
`seededUnitInterval` (`fixtures/engine.ts:256-276`). In the storefront they are
literals, and the preset labelled *"Anonymous visitor"* carries
`credit_status: 'pass'`, an age and a bill-to-income ratio
(`index.html:527-541`) — three things no website knows about somebody who has
not signed in.

### Consent: a fail-closed source wired to nothing, and a fail-open check

The most serious thing the trace found. Registered as
[G-065](../gaps.md).

- The engine enforces `request.consent` (`packages/runtime/src/deterministic/engine.ts:460`).
  When the request carries none it substitutes
  `{ marketing: true, profiling: true, thirdParty: false }` (`engine.ts:302`).
  The Kotlin engine does the same
  (`engines/kotlin/engine/src/main/kotlin/com/metis/engine/Engine.kt:247`).
  **Absent consent is granted.**
- `consentState` in the hashed decision (`engine.ts:689`) then records the
  default as though somebody had stated it. A regulator reading the trace is
  told marketing consent was given.
- `conn_consent_registry` is configured to fail closed, `defaultValue: false`,
  *"because assuming consent is the one mistake with a regulator attached"*
  (`catalogue.ts:1302-1320`). Its `marketingConsent` is fetched, hashed into the
  input snapshot, and read by nothing: no policy names it, and the engine's
  consent check never looks at it.
- In the storefront, consent is three checkboxes the visitor ticks
  (`index.html:441-443`, `:644-648`).
- 26 of the 27 cases in `docs/conformance/decision-corpus.json` carry no
  `consent`. The cross-engine conformance corpus demonstrates agreement on a
  consent state nobody supplied.

The platform has the right source configured and the wrong one enforced, and
they are not connected. The capability map's consent row states its limit as
*"consent arrives on the request"*. That is true and understates it: consent is
*assumed* when it does not arrive.

### Smaller breaks found on the way

- **The rollup's one safeguard is dropped at its only call site.**
  `packages/runtime/src/integration/aggregate.ts:38-45` carries `unresolved` so
  that *"this customer has no accounts in arrears"* and *"we never loaded their
  accounts"* stay distinguishable. `route.ts:606` computes it and `:622` reads
  only `.values`. Both declared aggregations read `customer.accounts`, which no
  preset, seed or source populates, so both resolve to nothing on every decision
  and nothing records that they did. The fixture says this is *"registered in
  docs/gaps.md"* (`profile-schema.ts:31-32`). It was not; it is now
  [G-066](../gaps.md).
- **The capability map's rollup row names the wrong checks.** The row
  *"Aggregations over history resolved at decision time"* names `usage becomes
  decision input` — `packages/core/tests/volume.test.ts:78`, a test of
  `resolveVolume`, which nothing outside its own test imports — and `merging
  into the input`, which tests the merge helper alone. The test that exercises
  the wiring, `a rollup decides`
  (`apps/console/tests/unit/aggregation-decision.test.ts:62`), is not named, and
  there is no history for the rollups to be over. [G-067](../gaps.md).
- **Intake's activation changes one field.** `activateDataSource` sets a status
  and writes an audit entry (`route.ts:1952-1961`); the only reads of landed rows
  are the landing and validation handlers (`:1903`, `:1931`). `intake.ts:27` is
  candid — *"It does not store anything"* — and the capability map's row, which
  lists activation, is not.
- **The ledger is not pseudonymous.** `subjectHash` is an unkeyed sha256 of
  `tenantId:customerRef` (`packages/ledger/src/ledger.ts:62-64`), over ids that
  are `cust_` plus a base-36 counter and so can be enumerated. And the `record`
  column beside it holds the whole `DecisionRecord`
  (`packages/ledger/src/types.ts:39-40`), whose hashed `customerRef` is the raw
  `customerId` (`engine.ts:659`). ADR-004, lines 88–89: *"the ledger already
  hashes the customer reference per tenant, so the subject is pseudonymous."* It
  does not, in the one column that holds everything else. [G-068](../gaps.md).
- **A per-candidate fact supplied once per request.** `pol_afford_retention` —
  *"a retention offer must reduce, not increase, the customer bill"* — reads
  `offer.monthly_delta` (`catalogue.ts:884-893`): one number for the request,
  applied to every retention candidate. In the seed it is a coin flip,
  `r('delta') > 0.5 ? -500 : 300` (`fixtures/engine.ts:275`). A suitability rule
  on the FCA-facing tier is evaluated per decision, not per offer. The schema
  describes the field faithfully (`profile-schema.ts:255-267`), which is the
  problem: it has no way to say *per candidate*.

The consent default, the dropped rollups, the capability row and the ledger are
registered as G-065 to G-068. The per-candidate `offer.monthly_delta` and the
inert activation are not registered; they are listed here so they cannot be
lost.

### What exists, is right, and survives

- `ProfileSchema` as a contract — entities, typed fields, sensitivity, one and
  many relationships, declared aggregations — and the compiler's full-path, type
  and enum checks against it (`packages/compiler/src/decision-flow/compile.ts:844-860`).
  `docs/review/DATA_MODEL_DESIGN.md` §2 still holds: relationships are for the
  modeller, and a rule sees a flat typed path.
- Intake's land, map, validate and report (`intake.ts:105-426`). Pure, total,
  reported by column. It is the right mapping stage with no destination and no
  key.
- The resolution phase — `resolveInputs`, `resolveScores` — as the only place a
  decision does I/O, hashed into the snapshot, guarded by `no-egress.test.ts`.
  Every read this ADR adds goes there.
- The ledger already holds decisions, outcomes and delivery attempts, bound by
  decision id, with an index on `(tenant_id, subject_hash, occurred_at DESC)`
  (`packages/ledger/migrations/001_ledger.sql:45-46`). That index is an
  interaction history's access path, and no decision uses it.

### Already decided, and binding here

- **ADR-004.** Every store holding subject data holds it under a per-subject
  key. It names W-008, W-009 and W-011 as bound. Nothing implements it.
- **ADR-009.** METIS trains nothing (§1). I/O resolves before the core (§2).
  Features are declared schema paths, never implicit (§5). Training/serving skew
  *"is not solved by this and must not be claimed"* (§5).
- **ADR-013 §3 and §6.** The recipient is resolved outside the adapter;
  frequency caps count deliveries, not attempts; a hard bounce writes to
  contactability, never to an offer's performance.
- **ADR-008 §2.** The decision id is the only binding between a decision and
  what followed it.
- **`METIS_Vision_and_Build_Plan.md` §12:** *"Not building a CRM, CDP, campaign
  execution engine or content management system. Integrate."*
- **The same plan's §4.4** says three things this ADR revisits: a pack-supplied
  data model, a Redis online store, and *"same feature definitions compile to
  both online and offline paths so training/serving skew is structurally
  prevented."* ADR-002 adopted Redis on that basis. None of the three was built.

## Decision

### 1. The boundary: METIS reads a customer at decision time; the customer data platform owns the customer

| Concern | Owned by | What METIS holds |
|---|---|---|
| Collecting events from sites, apps and back-office systems; tracking plans and their violations (taxonomy 1.2, 1.3) | The partner | Nothing |
| Identity resolution — stitching, merge and unmerge rules, survivorship, the identity graph (1.5–1.8) | The partner | The canonical id it is given, and later the merges it is told about (§6) |
| The profile of record | The partner, or the warehouse behind it | A projection of the declared fields, and nothing else (§3) |
| Consent and preferences of record | The tenant's consent platform, reaching METIS through the partner | The value it last received, with its source and time (§7) |
| Contact points of record — email, phone, push token | The partner | A projection, read at send time and never in a decision (§8) |
| Computed traits over behavioural events | The partner | The value, as a profile field |
| Audiences for activation — build, count, overlap, lookalikes, paid-media destinations (3.1–3.6, 3.10, 11.5) | The partner | Membership, as profile fields (§11) |
| The decision-time data contract | METIS | The versioned schema (§2) |
| What was decided, and what followed | METIS | The ledger: decisions, outcomes, delivery attempts (§10) |
| Rollups over that history — contacts per channel per window, last outcome per action | METIS | Computed per decision and hashed (§10) |
| Feature values as they were served | METIS | Retained per decision under ADR-004 (§9) |

**The reference partner is Segment (Twilio).** Three reasons, in order of
weight. Its output is the shape this design consumes: it resolves identity into
a profile and delivers profile and event changes to a destination the receiving
platform runs, plus a warehouse sync for backfill — §5's two arrival modes,
supplied by somebody else. It covers taxonomy 1.2 and 1.3 (tracking plans,
violations, blocking), which METIS would otherwise be asked to build and should
not. And it is the partner this repository already measures itself against:
`DATA_MODEL_DESIGN.md` §1, the evaluation brief's adjacency list and the
capability taxonomy all name it. **mParticle is the named second** — its
identity service and per-profile consent state are the closest fit to §7 — and
nothing below depends on which is chosen.

Two things this does not claim. It is not a commercial commitment; that is the
product owner's call, and the architecture stands without it. And it does not
assume any partner's per-profile lookup API can sit inside a 50 ms p99. That is
exactly what this design avoids depending on (§3), and it must be verified in a
partner evaluation before anybody proposes a synchronous call.

**The contract is METIS's, not the partner's.** The ingestion operation in §5 is
partner-neutral; the Segment-shaped mapping onto it is one data source
definition, and becomes a connector package when W-038 exists.

**The mistake this clause prevents** is building identity resolution because the
profile store needs a key. It looks like storage work and is not. Which
identifiers are strong enough to merge two people is a policy with consent
consequences — merge wrongly, and one person's opt-in markets to another — and
it belongs with whoever sees every identifier. METIS does not.

### 2. The data model: profile and request separated, versioned, and named by the decision

**Two roots, and an origin on every field.** Today's root is `DecisionInput`
(`profile-schema.ts:38`): a model of a request body, not of a customer, and the
fixture's header says so — *"modelled as it is rather than as it should be"*
(`:12-23`). It becomes:

- **`Customer`**, the profile: fields held against a subject, written only by
  ingestion.
- **`Context`**, the request: what only the caller can know — session, basket,
  page, the event that triggered the decision. Supplied per request, never
  stored.

Every field declares an **`origin`** — `profile`, `request`, `connector:<id>`,
`interaction` (§10) or `aggregation` — and a **`class`** — `attribute`,
`consent`, `contact_point` or `identifier`. The class drives §7 and §8 and is
the classification ADR-004 actually needs, sharper than `sensitivity`, which
nothing enforces today. `origin` is what makes §4 enforceable, which is why this
clause precedes any store.

**Versioned, and pinned.** A schema version is an immutable, content-hashed
registry object, published and approved through change sets like a flow — the
`packages/registry` pattern, not a new one. A compiled artifact pins
`{ schemaId, version, hash }`, and `DeterministicDecision` gains the same
triple, so every decision names the model it was read against. That moves every
chain hash once, in both engines; `DATA_MODEL_DESIGN.md` §3.1 priced it and said
to pay it before the store is populated, and that advice stands.

**Editable from the screen.** `ProfileSchema` and `DataSource` join
`USER_EDITABLE_ENTITIES` (`packages/ui-metadata/src/registry/index.ts:41-57`),
where neither appears today, so the descriptor check can see them. Adding a
customer attribute is currently an edit to a file under `apps/console/mocks` —
Rule 8's vendor ticket, on the one entity where a customer adding a field is the
whole point.

**Additive or breaking.** An additive version, a new optional field, needs no
republish. A breaking one, a field removed or retyped, is refused while any
active artifact pins a path it breaks. That turns taxonomy 1.17 — *which flows
read this attribute* — into a compile-time answer rather than a search.

**Pack-supplied: not now, and said plainly.** No package system exists (G-007,
W-038). Each field records who supplied it — `tenant`, or a package id and
version — so W-040 has somewhere to write. The vision's *"pack-supplied"* is
W-040's to deliver and this ADR does not claim it.

**`offer.monthly_delta` leaves the customer model.** It is a fact about a
candidate and the schema has no per-candidate scope. Until one exists it is
declared `origin: request`, described as one value for the whole request, and
`pol_afford_retention` remains wrong as written.

### 3. The profile store is a decision-time projection, not a record

**W-008 is a read model of the declared `profile` fields.** One row per subject
per tenant, keyed by the pseudonym of §6. Each value is stamped
`{ value, source, sourceRef, asOf, receivedAt, schemaVersion }`, where `asOf` is
when the source says the value became true, not when it arrived. It is written
only by ingestion (§5) and rebuildable from the partner, so losing it is an
outage rather than a data loss. That is what makes holding it defensible under
ADR-004: the partner holds the record and its erasure obligation; METIS holds a
copy and destroys its key.

**Read once per decision, before the core**, beside `resolveInputs`, as ADR-009
§2 requires of any I/O. Values merge into the input, are hashed into
`inputSnapshotHash`, and are bound in the trace with `origin: profile`. A
subject with no profile is recorded `profile: absent`, explicitly, and its fields
fail closed under the comparison rules that already exist. A field older than
its declared `maxAge` is treated as absent and recorded as stale. Freshness can
change the decision, so it belongs in the hashed half, not the measured one —
which, for profile fields, answers G-056.

**Postgres first**, behind one behaviour suite run over memory and Postgres —
the pattern `packages/registry`, `ledger` and `catalogue` already use — with each
subject's values encrypted under their ADR-004 key.

**Redis stays unconnected, and ADR-002's *"Feature Store (online): Redis"* row is
superseded.** Redis enters only as a read-through cache when the S1 harness
measures the profile read at a million profiles above its share of the budget —
the rule ADR-009 applied to the feature store, and it applies harder here,
because a cache holding plaintext must be purged when a subject's key is
destroyed. A cache nobody measured a need for is an erasure path somebody will
forget. Remove `redis` from `docker-compose.yml` in the first slice that touches
the store: the file's own header has to argue readers out of reading its
presence as intent, which is the argument for deleting it.

### 4. A caller may narrow a decision, never widen it

The rule that makes the store matter. `resolveInputs` lets the request win over
anything resolved (`resolve.ts:296-298`). That is how an anonymous visitor
carries a credit status, and how a checkbox grants consent.

- **A `profile`, `consent` or `interaction` field cannot be supplied on the
  request.** A request carrying one is refused `422`, naming the field. Moving a
  field's origin from `request` to `profile` is a schema version, and from that
  version the caller can no longer assert it.
- **Where the caller legitimately knows something the platform does not, it may
  only add caution.** It may withdraw consent for a session, never grant it
  (§7). It may add contacts the platform did not make, never remove any (§10).
- **`request` fields are unchanged.** The caller is their only source.

**The mistake this prevents** is keeping "the request wins" as a convenience for
callers that already hold the value. That convenience is the whole of today's
eligibility-on-fixtures problem, and it would survive the profile store intact:
a store the caller can overrule is a suggestion.

Replay is unaffected. It reads the snapshot, and its hand-fed `422
input_required` path (G-009) is already labelled as supplied.

### 5. Intake: one ingestion contract, keyed, written only to the projection

**Stream and API are one operation.** A proposed
`POST /profiles/{tenantId}/records` takes a batch of
`{ subjectId, sourceRef, asOf, values }` from a named data source. Idempotent on
`sourceRef`. Per field, the latest `asOf` wins, never the latest arrival —
webhook destinations deliver out of order as a matter of course. Records pass
through the existing `mapRow` and `validateRows` (`intake.ts:229-382`), so a
record that violates the schema is refused with the per-column report that
already exists; taxonomy 1.1 is met by code already written.

**`DataSourceDefinition` gains a key** — a `subjectColumn` and the identifier
namespace it is in — and activation starts to mean *this source writes to the
profile store*. Without a key, even a durable version of today's pipeline could
not say whose row it holds.

**Batch is the same mapping over pages of rows**, reporting accepted and
rejected counts and returning rejected rows with reasons (1.13). A file upload
waits for an upload path the spec does not have (G-011, W-015). A Kafka
consumer, direct warehouse reads (1.14) and change-data capture are packages
(W-038).

**Lineage by construction.** Every stored value carries the `sourceRef` and the
data source that wrote it, which is W-010's done-when.

### 6. Identity: one canonical key from upstream, and METIS resolves nothing

- **The tenant declares one canonical identifier namespace** — the partner's
  resolved id — and a decision request's `customerId` is in it. METIS does not
  stitch, merge, or choose survivors.
- **An identifier outside that namespace is decided with no profile**, and the
  record says `identity: unresolved` rather than implying a known customer. An
  anonymous visitor becomes a decision about an anonymous visitor.
  `docs/review/INBOUND_VS_CDH.md` finding I-7 stays open, now stated rather than
  hidden.
- **Merges the partner reports are recorded append-only as alias facts** —
  *A became B at t*, and retractions for an unmerge (1.7). Phase two; deferred,
  with its consequence stated below.
- **One pseudonym scheme for every store**, the one ADR-004's amendment of
  2026-09-11 sets out: the profile store, the ledger and the interaction read
  (§10) key on `HMAC(subjectKey, customerRef)`, found through the key store by a
  tenant-keyed pseudonym — never the raw id, never an unkeyed hash. A key per
  tenant alone is not enough: it would let anyone holding it find an erased
  person's rows. The same amendment settles `customerRef` in the hashed decision
  (`engine.ts:659`): the stored record becomes ciphertext under the subject key,
  so the field may stay and no chain hash moves. Both must be in place before the
  store is keyed, because the ledger's append-only triggers make the first real
  row the last chance to change either.

### 7. Consent: read from its source, never assumed, never granted by a caller

**Consent of record belongs to the tenant's consent platform.** METIS reads it
and never holds the record. It arrives as `consent`-class fields — per purpose
(marketing, profiling, third party) and per channel where the source has them
(2.1, 2.2) — each with its `asOf`, through ingestion (§5) or a consent connector
like the one already configured.

1. **Absent is withheld.** The default at `engine.ts:302` and `Engine.kt:247`
   flips. `consentState` becomes, per purpose, `granted | withheld | absent`;
   `absent` is enforced as `withheld` and recorded as itself, so a trace stops
   claiming consent nobody gave.
2. **The source decides, and the caller can only narrow.** The engine's consent
   is the resolved consent-class value. `request.consent` is demoted to a caller
   assertion, combined as the more restrictive of the two. The storefront's
   checkboxes can still withdraw for a session. They cannot grant.
3. **Stale is absent.** A consent value older than the tenant's declared
   `maxAge` is absent, and so withheld (2.6). The connector path already fails
   closed on error; this extends it to lag.
4. **The trace names the source and the time** — taxonomy 2.4, and G-056 for the
   field where it matters most.
5. **Write-through runs both ways.** An unsubscribe or hard bounce reported to
   METIS (ADR-013 §6) updates the projection at once, so the next decision sees
   it, and is forwarded to the partner as the record holder; the partner's later
   echo is idempotent by `asOf`.

Not decided here: whether consent is applied by the platform on every path
rather than at a constraint node a flow may omit (G-015, taxonomy 2.3). Same
subject, different mechanism; it belongs to W-013's slice.

**The mistake this prevents** is keeping the default because every caller sends
consent. The corpus shows they do not — 26 cases of 27. Fail-closed exists for
the caller that forgets, and a default that grants is invisible exactly when it
matters.

### 8. Contact points: the decision reads contactability; delivery reads the address

- A contact point is a `contact_point`-class profile field carrying its channel,
  a verified flag and `asOf`.
- A decision may read derived booleans — `contact.email.reachable`: present,
  verified, not hard-bounced — as `profile` fields, and eligibility may require
  them.
- **The address never enters a decision's input.** The delivery pipeline resolves
  it at send time from the projection, by subject. The delivery attempt records
  which contact-point version it used and never the value. With no address the
  attempt is `suppressed`, reason `no_address` — ADR-013 §1's state, with a real
  cause behind it.

Three reasons. An address in the input is personal data in every snapshot for no
decisional gain. Resolving at send time sends to the address the customer has
now. And a bounce written back through §7.5 flips `reachable`, which the next
decision sees. This is what ADR-013's *"resolved outside the adapter"* resolves
to, and it is what unblocks W-017.

**The mistake this prevents:** *"add a `to` field to `DecisionInput`"* — the
one-line fix that puts every customer's email address under every decision's
hash.

### 9. Features: one definition, one implementation, and the served values kept

**A feature is a declared schema path** (ADR-009 §5 stands), from one of four
sources: a profile field; a partner computed trait, arriving as a profile field
and never recomputed; a rollup over METIS's own history (§10); or request
context. `ScoringContext` gains the declared feature values, taken from the
resolved input rather than fetched a second time.

**One definition does not compile to an online and an offline path, and will
not.** METIS trains nothing (ADR-009 §1), so it has no offline training path of
its own to keep in step. And compiling a rollup into warehouse SQL as well as
running it here makes two implementations of `max`: `aggregate.ts`'s *"absent is
not zero"* is the first thing a translation to SQL loses, silently.

**What METIS guarantees instead: the values served are the values exported.**
With ADR-004's per-subject retention of the input snapshot — the same retention
G-009 needs for replay — every decision's feature values as served are kept and
exportable, joined to their outcomes by decision id (ADR-008 §2). A training set
built from that export cannot skew from serving for the features in it, by
construction. That is the whole of the anti-skew claim METIS may make, and the
vision's *"structurally prevented"* is withdrawn.

**Recomputing a rollup over history** — a backfill, a simulation, the batch
executor — runs the same TypeScript function over the ledger, not a translation
of it: the same code on a different schedule, which is the equivalence W-019
already demands of the artifact.

**The `feature-store` connector kind is retired.** Nothing serves it, and the
live gateway refuses it by name (`packages/runtime/src/integration/http-gateway.ts:118-126`).
`conn_billing_ledger` and `conn_network_usage` become data sources feeding
`profile` fields.

### 10. Interaction history is the ledger, read per subject

**W-011 is a per-subject read over the ledger, not a new store.** The ledger
already holds what W-011 describes — decisions, outcomes and delivery attempts,
bound by decision id, indexed by subject and time — and none of it is read back
into a decision. `contactHistory` is supplied by the caller (`engine.ts:442`), so
a website reports how often it has shown an offer and cannot know about any
other channel.

- Rollups are declared on the schema with `origin: interaction` and a window
  relative to `request.occurredAt`, never the clock: contacts per channel per
  period counting **deliveries, not attempts** (ADR-013 §6); last outcome per
  action; impressions without response.
- Read in the resolution phase, merged and hashed. Replay reads the snapshot and
  never the ledger, which is W-011's own done-when.
- `request.contactHistory` becomes additive under §4: contacts the platform did
  not make, from a call centre say, can be added; none can be removed.
- W-012's caps then read the platform's count — the change
  `INBOUND_VS_CDH.md` I-3 calls the linchpin of the inbound loop.

**The mistake this prevents** is building a second event store because
"interaction history" sounds like a separate product. `eventstore` is declared in
`docker-compose.yml` beside `redis` under the same header comment. The events are
already in Postgres.

### 11. Audiences: the partner builds them; METIS reads membership and simulates over its own projection

- Building, counting, overlap, lookalikes and activation to paid media (3.1–3.6,
  3.10, 11.5) are the partner's.
- Membership reaches METIS as declared boolean profile fields, one per audience
  the tenant exposes (`audience.high_value_at_risk`), checked at compile time
  like any other path. Array-valued fields with `any`/`all` stay deferred
  (`DATA_MODEL_DESIGN.md` §2.3).
- What METIS needs that is audience-shaped is a **population**: the sample W-020
  simulates over and W-019 runs through. That is a sample of the projection,
  optionally narrowed by a predicate in the targeting-policy condition language —
  not a new entity. `Audience` stays in `PENDING`.
- *"Why did this customer not qualify"* (3.8) is METIS's to answer for its own
  eligibility, which the trace already does, and the partner's for its audiences.

**The mistake this prevents:** building the audience builder because it is the
first thing a marketer asks for — `COHERENCE_REVIEW.md`: *"There is no audience,
no schedule, no send."* A builder over a projection that holds only decision
fields would be a worse CDP than the one the tenant already runs.

## What W-008, W-009 and W-011 become

- **W-008 — the profile schema as a versioned registry object, and the profile
  projection.** Two roots with `origin` and `class`; pinned by the artifact and
  named by the decision; editable through descriptors; plus §3's projection.
  *Done when* gains: a decision names its schema version; a request carrying a
  `profile` field is refused; and mutating the projection between a decision and
  its replay leaves the replay unchanged — a test that moves here from W-009,
  because this is where a live store first exists.
- **W-009 — no longer an online feature service.** The resolution step for
  `profile` and `interaction` fields, with per-field `asOf`, explicit misses and
  stale-as-absent. The `feature-store` kind retires. Its replay-exactness
  *done when* stands.
- **W-011 — the ledger, read per subject,** windowed on `occurredAt`, counting
  deliveries. It unblocks W-012 and ADR-013 §6.

And their neighbours:

- **W-010** becomes §5's single ingestion contract. Its note deferring identity
  resolution is replaced by §6: identity is not deferred, it is the partner's.
- **W-013** becomes §7 — consent as a sourced, fail-closed, narrow-only input,
  not a store.
- **W-035** becomes reading partner audiences plus a population predicate for
  simulation. Still Gate 3; the builder is not METIS's.

## Build first, defer

**First — consent fails closed, and its source decides.** Flip the default in
both engines; make `consentState` tri-state with its source; resolve consent from
the registry connector that is already configured and already fetched; make
`request.consent` narrow-only. No store, no partner and no key store — every part
exists except the wiring. It goes first because it is the only break on the trace
that is wrong in the unsafe direction today. The 26 corpus cases that omit
consent gain an explicit `granted`, so they keep exercising ranking, and new
cases cover `absent` and stale. One chain-hash regeneration, both engines.

**Second — the schema as a versioned, editable, pinned object with `origin` and
`class`.** Still stores no customer data, so it can land before ADR-004's key
store exists, as `DATA_MODEL_DESIGN.md` §4 argued. If it lands close behind the
first, take both chain-hash moves in one corpus regeneration.

**Third — the interaction read over the ledger.** Contacts per channel per
window, counting deliveries; W-012's caps read it; `contactHistory` becomes
additive. No ingestion and no partner: it reads only what the ledger already
holds.

**Fourth — the key store, the projection, one ingestion endpoint and the
pseudonym function.** The first slice that retains customer attributes, and
blocked on ADR-004 having an implementation, which none of the three before it
is. After it: a Segment-shaped mapping as a data source definition; contact
points; ADR-013's email adapter; ADR-009's third step, with features that have
values.

**Deferred, with the reason:**

- **Alias facts for merge and unmerge** (§6). Until they exist, frequency caps
  and history undercount across an anonymous-to-known merge.
- **Redis** (§3), until the S1 harness measures a need.
- **An offline store.** ClickHouse stays unconnected. The offline side is an
  export to the tenant's warehouse (§9), not a store METIS runs.
- **File upload**, which needs an upload path (G-011, W-015). **Kafka, direct
  warehouse reads, change-data capture** — packages (W-038).
- **Pack-supplied schemas** (W-040). **Two schema versions live at once** (1.21).
  **Array-valued fields** in policies.
- **An audience builder.** Not deferred: it is the partner's.
- **Compiling features to SQL.** Rejected, not deferred (§9).

## Consequences

**The first thing to go wrong:** flipping the consent default empties the slate
for any caller that does not send consent — an integration that looked fine the
day before. The corpus notices first: 26 of 27 cases decide differently until
they say what they had assumed. That is correct and should be expected rather
than discovered. The Kotlin service's 60 cases all carry consent and are
unaffected.

**The decision path reads a database for the first time.** ADR-004's *"the
decision path does not read the ledger, so the p99 gate is unaffected"* stops
being true: it reads the profile and the ledger, both under per-subject
encryption. S1 has to be re-measured with both in the path, and its *"feature-store
miss"* variant, named in the result as unmeasurable, becomes measurable.

**A partner outage stops updates, not decisions.** Decisions continue on the
projection until fields pass their `maxAge` and then fail closed — consent first,
because its `maxAge` is shortest. A long outage suppresses marketing across the
tenant. That is the correct failure, and it will be reported as an incident.

**The demo gets harder to run and more honest.** Once a field's origin is
`profile`, the storefront presets cannot type it, and the anonymous visitor loses
its credit status. The seeded tenant needs a projection seeded through the
ingestion endpoint rather than a request generator — and new decisions for the
10,400 seeded customer ids must read values the generator also produced, or the
demo's customers change between their old decisions and their new ones.

**METIS holds personal data at rest** in a store built to be read on every
decision. The key store becomes infrastructure the platform cannot run without —
ADR-004's accepted cost, now due — with its own backup and restore drill (W-050).

**The partner's name will be read as a commitment.** It is a reference
integration against a METIS contract, and §1's table does not change if the
product owner chooses otherwise.

**Two capability-map rows need correcting, and this ADR edits neither.** The
intake row lists activation, whose output reaches no decision, and the rollup row
names checks that do not exercise it (G-067).

## Alternatives considered

**Build the customer data platform** — identity, profile of record, audiences,
consent of record. It would close every absent row in taxonomy §1–3 on METIS's
own terms. It loses three ways: the vision's §12 already rules it out; identity
is a policy with consent consequences that belongs with whoever sees every
identifier; and it would compete with a product every telco buyer already runs,
on an axis where METIS has no advantage, while doubling the surface that must be
made deterministic. That is ADR-009's argument against building a trainer,
unchanged.

**No store: every decision calls the partner's profile API.** Seriously tempting.
Nothing to erase, no drift, ADR-004 nearly free, and the connector mechanism
already exists. It loses on enumeration: W-020 has to simulate over a population
and W-019 has to run over millions, and a lookup API answers *"tell me about this
customer"*, never *"give me a sample of customers"*. It also puts an external
service's latency and availability inside every decision, which the compiler
already refuses for the bureau at 180 ms. Kept per field: connectors remain for
values that must be live — bureau, stock — and for consent where a tenant insists
on reading it at source.

**Redis first, as ADR-002 decided.** Rejected for now (§3): no measured need,
harder to purge on erasure, and Postgres is already operated with a
behaviour-suite pattern around it.

**Let the request keep winning.** The status quo and the cheapest option. It is
also the mechanism by which an anonymous visitor carries a credit status and a
checkbox grants consent, and a profile store the caller can overrule changes
nothing about either.

**Compile each feature definition to both the online path and warehouse SQL** —
the feature-platform approach. Rejected in §9: two implementations whose null
semantics diverge, built to protect a training path METIS does not have.

**Put the recipient address in the decision input.** The one-line fix to
ADR-013's blocker. Rejected in §8.

**Keep `DecisionInput` as the root and add fields to it.** Rejected because it
leaves nowhere to say where a field comes from, and §4 cannot be enforced without
that.
