# The data model — how leaders solve it, and what fits METIS

**Date:** 2026-09-07
**Question asked:** the data model and intake are missing; how do leaders and
challengers solve it; can developers define their own models with parent-child
relationships; and how does the model reach the person configuring eligibility.
**Status:** design. Nothing here is built yet.

---

## 0. The finding this starts from

`PolicyCondition.field` is documented as *"Dotted path into the customer data
model, e.g. `customer.age`"*. **There is no customer data model.** There is a
string, and a partial check.

The check — `UNRESOLVED_FIELD` in the compiler — is opt-in (`requestFields`
omitted disables it entirely) and validates **only the root segment**, because
"only the root of a dotted path can be supplied by a connector".

So `address.fibre_available` and `address.fibre_availabl` are equally valid to
every layer of the platform. Demonstrated against the real engine:

```
condition: address.fibre_available = true   → winner: acq_fibre_900
condition: address.fibre_availabl  = true   → winner: acq_sim_30

trace: "Eligibility removed 1 candidate(s)."
       acq_fibre_900: ELIGIBILITY_FAILED (pol_fibre_available)
```

The typo does not error. It **decides**, and the trace explains the decision
with a confident reason code naming a real policy. A regulator reading that
record is told this customer was refused fibre on eligibility grounds. The
truth is that the rule could not be evaluated and `undefined === true` is false.

`compare()` handles this carefully for numeric operators — there is a comment
explaining that `undefined` must not silently pass a comparison — but careful
handling of a missing value cannot distinguish *"the customer has no value"*
from *"the author typed a field that has never existed"*. Only a schema can.

This is the strongest argument for the work: the platform's central claim is
that every decision is explainable, and today a misspelling produces a decision
that is confidently explained and wrong.

---

## 1. How the market solves it

Five products, one shape.

| | Model | Intake | Parent-child | Reaches the rule builder as |
|---|---|---|---|---|
| **Pega CDH** | Class hierarchy and properties; the Customer Analytic Record is the decision-time view | Data Flows over Data Sets — database, file, stream/Kafka, Cassandra | Page lists (`.Accounts(1..n)`); rollups via Interaction History summaries and aggregates | Property picker over the class |
| **Adobe RTCDP / AJO** | XDM: classes plus field groups, versioned; union schema for Real-Time Customer Profile | Streaming HTTP and Edge, batch files, source connectors, with an explicit source→XDM mapper | Schema relationships by reference identity; **computed attributes** for rollups | XDM tree in Segment Builder |
| **Salesforce Data Cloud** | Data Lake Object (raw) → Data Model Object (canonical), mapped | Data Streams per source | DMO relationships on keys; **Calculated Insights** for rollups | Related-object navigation in the segment canvas |
| **Braze** | Flat custom attributes, custom events, nested objects, catalogs | SDK, REST, warehouse sync | Deliberately shallow — catalogs as lookups | Attribute dropdown |
| **Segment / mParticle** | Tracking plan as schema governance; computed traits | Sources and destinations | Warehouse-backed entities (Linked Audiences) | Trait/entity picker |

**Four things every one of them does, and METIS does none of:**

1. **The schema is declared and versioned**, separately from any rule that uses it.
2. **Intake is two-stage** — land the source shape, then *map* it to the canonical
   model. Nobody makes the source shape the model.
3. **Rules do not traverse relationships at decision time.** They read
   pre-computed rollups: IH summaries, computed attributes, calculated insights.
   The relationship exists for the *modeller*; the *rule* sees a scalar.
4. **The rule builder browses the schema.** Nobody types a field path.

Point 3 is the one that matters most for METIS, because it means the
architectural constraint the deterministic engine imposes is **not a
limitation** — it is what the leaders already converged on for latency reasons.

---

## 2. Can developers define their own models, with parent-child? Yes

With one boundary that has to be drawn deliberately.

### 2.1 The model layer — free-form

A `ProfileSchema` as a first-class catalogue object:

```
entity Customer
  age                    integer     required
  credit_status          enum(pass, refer, fail)
  bill_to_income_ratio   decimal     0..1
  → has many Account
  → has one  Address

entity Account
  status        enum(active, closed, suspended)
  arrears_days  integer
  balance       money
  → has many Transaction
```

Entities, typed fields, enums, units, nullability, PII classification,
descriptions, and one-to-one / one-to-many relationships. Declared by whoever
models the tenant's data. Versioned like a flow.

### 2.2 The decision-time contract — flat, typed, and hashed

The engine takes `input: Record<string, unknown>` and hashes it. Reading a live
relational graph inside the deterministic core would destroy replay: the same
request would decide differently as the graph changed underneath it.

So relationships are **resolved before the core**, in `resolveInputs` — the
same place connector fields already resolve, already guarded by
`no-egress.test.ts`. A child collection reaches a policy as a declared
aggregation:

```
Customer.accounts.count(status = 'active')        → accounts.active_count
Customer.accounts.max(arrears_days)               → accounts.worst_arrears_days
Customer.accounts.any(status = 'suspended')       → accounts.has_suspended
Customer.transactions.sum(amount, last 90 days)   → transactions.spend_90d
```

The aggregate is computed at resolution time, enters the input, and is hashed
with it. **Replay stays byte-identical because the number the decision saw is
part of what was decided** — exactly as connector-supplied fields work today.

This is the same answer Pega, Adobe and Salesforce arrived at. It is convergent
design, not a workaround.

### 2.3 The boundary, stated plainly

| Modeller sees | Rule sees |
|---|---|
| Entities, relationships, cardinality | Flat typed paths |
| `Customer → Account → Transaction` | `accounts.worst_arrears_days` |
| Declares the aggregation | Consumes its result |

An author who wants a new rollup declares a new aggregation on the schema; they
do not write a traversal inside a policy. That keeps the policy language small,
the latency bounded, and the decision replayable.

**Deliberately deferred:** array-valued fields with `any`/`all` quantifiers in
the policy language. It is expressible and it is a language change with its own
hashing and cost questions. Aggregations cover the cases that matter first.

---

## 3. How the model reaches eligibility configuration

This is the question that turns the schema from documentation into a control.

**Today:** a policy's `field` is a free-text string. Nothing offers the
available fields, nothing checks the leaf, and a typo silently suppresses.

**With a schema**, the policy editor becomes a three-part control where every
part is derived:

1. **Field** — a picker over the schema tree, grouped by entity, searchable,
   showing type and description. Not a text input. A field that does not exist
   becomes **unrepresentable** rather than caught later.
2. **Operator** — the list is derived from the field's type. `integer` offers
   `gt/gte/lt/lte/eq/ne/exists`; `enum` offers `in/not_in/eq`; `boolean` offers
   `eq/exists`. `contains` never appears on a number.
3. **Value** — the input is typed by the field. An enum renders its declared
   members as a dropdown, so `credit_status = 'passed'` cannot be authored when
   the schema says `pass`.

And three checks upgrade for free:

- `UNRESOLVED_FIELD` goes from **root-only and opt-in** to **full-path and
  always on**, validated against the schema the flow pins.
- Type mismatch becomes a compile error: `customer.age contains "x"` is
  rejected at authoring rather than silently false at decision time.
- **Coverage** becomes answerable: for a given flow, which schema fields must be
  supplied, by which connector or by the caller — which is the honest version of
  the `requestFields` list that is hand-maintained today.

### 3.1 Traceability

The schema is versioned and **belongs in the hashed catalogue**, so a decision
record names the model version it was evaluated against. Without that, a schema
change silently reinterprets history — the same failure the catalogue snapshot
registry was built to prevent.

This has a cost worth stating up front: adding `ProfileSchema` to
`CatalogueSnapshot` moves `catalogueSnapshotHash` for every decision once, and
the service conformance corpus regenerates. That is a one-time, deliberate
break, and it is cheaper now than after the profile store exists.

---

## 4. Intake, and why it is a separate decision

The model is a **contract**. Where values come from is a separate question, and
today there are already two answers: the caller sends them, or a connector
resolves them. A third — a stored profile — is what Phase D sequenced as item 5
and what ADR-004 warns is the expensive one to retrofit.

**The sequencing that de-risks it:**

| Stage | Needs a profile store? | Pays off |
|---|---|---|
| Declare the schema; field picker; full-path validation | **No** | Immediately — kills the silent-suppression class of bug |
| Map connector `provides` onto schema paths | **No** | Coverage analysis becomes real |
| Intake: land a source shape, map it to the model | Partly | Batch and streaming ingest |
| Profile store with identity resolution | Yes | Segments, simulation, journeys |

The first two stages store no customer data at all. They are pure contract, and
they deliver the largest single correctness win available. That means **the
schema can and should land before the retention decision**, rather than waiting
behind it.

This is the opposite of the order the market suggests — leaders present schema
and profile store as one product — and it is right for METIS specifically,
because METIS's problem today is not "where do values live" but "nothing knows
what a valid field is".

---

## 5. What I would build first

A vertical slice that closes the demonstrated defect:

1. `ProfileSchema` in `@metis/core` — entities, typed fields, enums,
   relationships, aggregations. Versioned; part of the catalogue.
2. Seeded from the fields the fixtures already use, so the existing corpus
   validates against it rather than being rewritten to fit.
3. Compiler: full-path validation and type checking against the schema, with
   the existing `didYouMean` suggestion kept — it becomes far more useful once
   leaves are checked.
4. Console: `/data-model` to browse and edit it, and a typed field picker in the
   targeting-policy editor.
5. A test asserting the demonstrated defect is now impossible: a policy
   referencing `address.fibre_availabl` fails to compile rather than deciding.

Aggregations are declared in stage 1 and resolved in a later stage; declaring
them early is what stops the schema being reshaped when relationships arrive.
