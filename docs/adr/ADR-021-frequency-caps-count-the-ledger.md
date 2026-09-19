# ADR-021: Frequency caps count the platform's own contacts

**Status:** Accepted
**Date:** 2026-09-17 (proposed)
**Decided:** 2026-09-17
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided. Its five questions were put and answered on
2026-09-17 before any code, and two more — which deliveries count, and where a
read is recorded — were answered the same day when the code showed the first
answer counted nothing.
**Amended 2026-09-17** by the product owner: §9, a scoped cap counts the contacts
about its scope. This ADR as first accepted said a cap scoped to one offer
counted every contact on the channel, which contradicted ADR-019 §4 and ADR-020 §4.
**Constrains:** `packages/ledger` (`countContacts` on both stores,
`contactsFor`, `capsApply`, `readContacts`, migration
`003_delivery_subject.sql`); the TypeScript and Kotlin engines' constraint node
and decision record; `docs/conformance/decision-corpus.json`;
`docs/metis-api.openapi.yaml` (`ContactsRead`, `Denial.code`,
`ContactHistory.withinPeriod`); the console's `resolveAndExecute`, read on
placement decisions only; the trace reader; the storefront's visit date; delivery
timestamps in both services (§8); `POST /api/decisions`, `planes/execution` and
`engines/kotlin/service`, which do not read yet (G-150).
**Arises from:** [ADR-014](ADR-014-the-data-spine.md) §10, Accepted, which decides
that interaction history is a per-subject read over the ledger and that
`request.contactHistory` becomes additive, and slices 6 and 7 of the data-layer
order in `docs/DIRECTIVE.md` — taken together, as decided on 2026-09-17.

## Context

**A cap was enforced on a number the platform never checked.** `FrequencyPolicy`
declares at most N contacts per period, and the engine compares
`request.contactHistory.withinPeriod[period]` against it. That number is typed by
the caller: the storefront has three counters in its panel. The platform records
every decision and what it did about delivering it, and read none of it back
into the next decision. ADR-014 §10 decided the fix and named no mechanism; the
directive split it into a rollup slice and a caps slice.

**What was true before any code, checked against the tree:**

- `delivery_attempts` is bound to a decision, not a customer, and carries an
  append-only trigger (`001_ledger.sql`). A cap's question — this customer, this
  channel, this period — could only be answered by reading every decision the
  customer was part of.
- The ledger writes two delivery states today: `dispatched` for a web placement
  and `suppressed` for email and SMS, which have no adapter. Nothing writes
  `delivered` or `failed`.
- Every delivery row is written whether or not the decision offered anything.
- The decision service and the JVM service are held to the same 60 service
  conformance cases, and the JVM service keeps no delivery history.

## Decision

### 1. One query, not a rollup declaration

A cap reads one thing: **distinct decisions that offered something and were
handed over to this customer on this channel, per period.** Not a general
mechanism for declaring rollups on the schema; that waits for something else
that needs one.

- `delivery_attempts` gains `subject_hash`, written by the ledger from the
  decision it has just read, and the index
  `(tenant_id, subject_hash, channel, at DESC)`. Expand-only: the column is
  nullable and **not backfilled**, because the append-only trigger refuses the
  UPDATE and disabling it inside a migration is the hole the trigger closes. An
  attempt written before the migration carries no subject and is not counted.
  Every ledger that can hold one is synthetic and is reset rather than migrated
  (ADR-019 §7).
- **A decision that offered nothing is not a contact.** The query joins the
  decision and counts only those with a winner: a delivery row exists for every
  decision, and one that handed over nothing is not a message.
- **A decision counts once, at its first counting attempt**, however many
  attempts it took.

### 2. Each period is a rolling window back from the decision

`day` is the 24 hours, `week` the 7 days, `month` the 30 days before
`request.occurredAt` — never the clock and never a calendar boundary, so a replay
lands in the same window and no time zone decides whether a contact counts.
"Month" is therefore thirty days, not the calendar month. The upper bound is
inclusive; each lower bound is exclusive.

### 3. A contact is a message handed over, not one confirmed received

**`dispatched` and `delivered` count.** A cap that under-counts is a customer
protection failing open. Decided by the product owner, replacing "delivered only"
on 2026-09-17, when the code showed that nothing writes `delivered` and a cap
counting only it would count nothing on any real traffic.

- **`suppressed` never counts.** Nothing was sent.
- **`failed` stops counting once an adapter writes it** — it counts now only in
  the sense that nothing writes it. A message that never arrived must not consume
  a customer's cap (ADR-013 §6), and when an adapter records one, this needs no
  change.
- **`delivered` counts with no change** when an adapter can write it.
- `accepted` and `deferred` are held by the platform and do not count.
- The time is the delivery's own `at`. For the hand-over made with the decision
  that is the decision's `occurredAt`, in both services and the seed (§8).

### 4. A count that cannot be read is not a count of zero

When the ledger cannot be read, the decision records `contactsRead: { status:
'unavailable' }` and **every candidate a cap covers is suppressed** with
`CONTACT_HISTORY_UNAVAILABLE`, naming the first cap that covers it. Candidates no
cap covers go on. Reading the failure as zero would contact a customer whose cap
is already spent. Why the read failed is logged and kept out of the hash.

`CONTACT_HISTORY_UNAVAILABLE` joins the closed set of reason codes, in both
engines, in the policy funnel's frequency stage, and explained on the trace.

### 5. The read is recorded on the decision, and its absence means something

The counts a decision was held to are in its hashed record as `contactsRead`, so
a trace can explain a suppression and a replay holds the caps to what was read
then rather than to a ledger that has moved on. The product owner's terms:

- **Absent means the platform did not read** — no cap applied on the channel, or
  the decision was made somewhere that does not read. The field is omitted, not
  written null, so no decision that never read changes identity.
- **A decision that read and found nothing carries a present field with every
  count zero.**
- **Those two must never render the same way.** The trace says "Not read from the
  ledger. The caps counted only what the caller sent." for one and "Read from the
  ledger for Web: no contacts in the last 30 days." for the other
  (`apps/console/lib/contact-history.ts`, held apart by
  `tests/unit/contact-history.test.ts`).

The platform's counts are **added** to the caller's `contactHistory`, never
instead of them (ADR-014 §10): a caller may report contacts the platform did not
make and cannot remove any. A caller cannot supply `contactsRead`; both request
builders take named fields. The engine refuses a read for another channel, or a
count that is not a whole number, and records exactly the declared fields.

Both engines are held to it by three decision-corpus cases: a read that breaches
a cap only when added to the caller's count, a read of nothing, and an unreadable
history under a category-scoped cap.

### 6. The read has a budget

**In memory: 5ms at p95, gated** over a corpus-sized history of 10,400 decisions
for 1,000 customers (`packages/ledger/tests/contacts-budget.test.ts`). Measured on
2026-09-17 on this machine: p50 0.10ms, **p95 0.21ms**, p99 0.53ms, after
indexing attempts by tenant, subject and channel — a full scan had put the
average at 2.7ms, too close to gate.

**PostgreSQL: measured, not gated.** Same history, PostgreSQL 15.13 on the same
Windows machine, client round trip included: p50 2.49ms, **p95 4.50ms**, p99
5.37ms. The plan is an index scan on `delivery_attempts_by_subject` joined to the
decision's primary key, executing in 0.65ms; the rest is the round trip. A gate
on a shared database's latency would measure the runner.

### 7. Placement decisions read now; everything else reads at slice 9

**Only the console's placement decision reads** —
`POST /placements/{tenantId}/{key}/decisions`, through `capsApply` and
`readContacts`, and the `/arbitration` preview, which ranks a placement decision.
It is what the storefront calls.

**`POST /api/decisions` does not read, in the console or anywhere else, and
neither service reads.** That operation is the one the JVM service serves, and
`apps/console/tests/e2e/contract.spec.ts` holds the console to the JVM service's
hashes exactly. When the console read on it too, 44 of the 60 cases diverged —
same winners, different chain hashes, because the capped ones carried
`contactsRead` — and the JVM service keeps no delivery history to match them
with. **The exact-hash check between the console and the JVM service is worth
more than reading on an operation the storefront does not use.** The same
reasoning keeps the decision service on caller counts: reading there would give
every capped service case a hash the JVM service cannot produce.

Both decided by the product owner on 2026-09-17, the second after the first
version of this clause read on both console operations and broke that check. A
deliberate asymmetry with a known end — every operation in both services reads
once the JVM service has a delivery store — and a deadline: slice 9 of the
data-layer order, where the console starts deciding through the service. Recorded
as [G-150](../gaps.md), beside the connector-resolution asymmetry in G-008.

### 8. A delivery made with its decision is stamped when the decision happened

The hand-over recorded in the same request as a decision is timed at the
decision's `occurredAt`, in both services, as the seed already did. It was the
wall clock, which disagrees with the decision's own time on anything backdated
or dated ahead, and a cap counting back from `occurredAt` then counted the wrong
contacts. A later attempt by an adapter carries the time of that attempt. A
correction in its own right, registered and resolved as [G-151](../gaps.md).

### 9. A scoped cap counts the contacts about its scope

*Added 2026-09-17, by the product owner: "a scope that doesn't narrow what's
counted isn't a scope."* §1 counted every contact on the channel for every cap,
and the Consequences below said so of a cap scoped to one offer. That
contradicted two accepted ADRs: ADR-019 §4 (*"'Cap this offer' means: this
offer, counting contacts across every action of it"*) and ADR-020 §4 (offer- and
action-scoped caps count a delivery against the entries of its decision's
slate). No fixture had a scoped cap, so nothing could show the disagreement.

- **What a scoped cap counts.**
  - A cap whose scope is an objective, a category or an offer counts the same
    contacts as §1–§3 (distinct decisions handed over, first contact, rolling
    windows), restricted to decisions whose recorded offer (`winnerOfferId`)
    the scope covers.
  - Coverage is decided by the constraint node's own `scopeCovers`, over the
    decision's catalogue snapshot, exported so the reader cannot count a
    different set of offers from the one the engine holds to the cap.
  - A tenant cap counts every contact on the channel, as before.
  - Once ADR-020 records slates, a decision counts toward a scope when any
    entry of its slate is covered (ADR-020 §4). Until then its winner is the
    only offer it records.
- **How it is recorded.**
  - `contactsRead.scoped` holds one count per active scoped cap on the channel,
    keyed by the cap's id, beside the channel's `withinPeriod`, and is hashed
    with it.
  - It is present only when such a cap exists, so no read made before this
    clause changes identity. All 44 existing decision-corpus cases kept their
    hashes.
  - Both engines refuse a read that omits a scoped cap's count or names a cap
    the channel does not have: holding a scoped cap to the channel's count is
    the defect this clause ends, and it must not happen silently.
- **The caller's counts still count toward every cap.**
  - `contactHistory.withinPeriod` names no offer, so a contact the caller reports
    might be about the capped one.
  - Leaving it out of a scoped cap would under-count, which §3 calls a customer
    protection failing open.
  - The platform's own count is what narrows. A caller wanting to report
    contacts about one offer would need a per-scope field that does not exist.
    Not decided here.
- **Held by:**
  - the decision-corpus case *"a cap scoped to an offer counts the contacts about
    that offer, not the channel's"*, in both engines;
  - `ScopedCapTest` and `contacts-read.test.ts`, for the refusals;
  - the ledger suite on both stores, for the count;
  - `caps-read-ledger.test.ts`, for the console's placement route end to end.
- **The fixture follows with ADR-019's reseed.** An offer-scoped cap in the demo
  catalogue changes `catalogueSnapshotHash` and so every seeded decision's id. It
  lands in that commit, with its own delta table, rather than moving every id
  once now and again there.
- **The fixture is `cpol_disney_web_weekly`: Disney+, at most one a week on the
  web** (chosen by the product owner on 2026-09-19; this clause named no cap).
  It shows a scoped cap biting and the slots it frees going to other offers, and
  it leaves realised value where the earlier stages put it, so every money figure
  in the reseed stays attributable to the stage that moved it. Three candidates
  were measured against the seeded corpus the same day:

  | Candidate | Winners changed | Seeded figures |
  |---|---|---|
  | Disney+, at most 1 a week on the web — **chosen** | 97 | web Disney+ offers 284 → 187, Netflix 69 → 127; offered −39; realised value unchanged |
  | Fios, at most 2 a week on the web | 113 | web Fios offers 793 → 680; offered −67; realised value −$214.44 |
  | Disney+, at most 4 a month on any channel | 0 | none |

  All three move every seeded decision's id and `catalogueSnapshotHash`; none
  moves `inputSnapshotHash`; only the first two move a figure. The seeded
  requests carry the caller's per-channel counts, which name no offer and count
  toward every scoped cap (above), so on seeded history an offer cap bites
  wherever the channel's count reaches its limit. The narrowing to the capped
  offer's own contacts is what the platform's ledger read does, on live
  placement decisions.

### 10. Reading and writing a customer's contacts is one decision at a time

*Added 2026-09-18, by the product owner, closing G-160.*

A cap read is only a protection if the contact the decision makes is written
before the next decision for the same customer reads. Without that, two
decisions made at once each read the count before either writes, and both take
the last slot. The storefront decides its hero and grid together, and in two
weeks of visits by nine customers on 2026-09-18 it went over `cpol_web_daily`'s
three a day on **41 of 64 customer-days**.

**So everything from the contact read to the delivery write runs inside
`DecisionLedger.withSubject`** — the console's placement route wraps
`decideAndRecord` and `recordDeliveryFor` in it:

- **In one process,** decisions for a customer queue behind each other.
  Different customers never wait for each other, and a decision that fails does
  not hold up the next.
- **Across processes,** the PostgreSQL store takes a transaction-scoped advisory
  lock on the subject hash (`pg_advisory_xact_lock(hashtextextended(…))`),
  released when the transaction ends or the connection dies. It is taken on a
  pool of its own, never the one decisions read and write through: from the same
  pool, as many customers deciding at once as it has connections would each hold
  one and wait for another. This is what makes the decision service, which
  ADR-016 scales horizontally, safe to run as more than one instance once it
  reads (§7).

**Measured against §6, 2026-09-18,** on the test database, fresh subject per
iteration, interleaved, 300 runs: the PostgreSQL read p50 0.64ms, p95 0.86ms;
read under the lock p50 1.12ms, p95 1.68ms — **the lock adds about 0.8ms at p95,
two round trips**, which puts §6's measured 4.50ms at about 5.3ms. In memory the
queue costs nothing measurable (p95 0.03ms beside 0.05ms), and §6's gated 5ms is
untouched. What it does cost is by design: a customer's second decision waits
for the first to finish, so a page deciding two placements at once for one
customer takes the two one after the other.

**Held by** the ledger suite, on both stores: six decisions at once against a cap
of three make exactly three; and on PostgreSQL, eight across four instances
sharing the store make exactly three. Removing the PostgreSQL lock turns the
four-instance test red, three runs in three; removing the queue as well turns
the in-memory test red. The four-instance test was two instances until it was
seen passing without the lock — two instances overlap one decision at a time and
could land on three by luck.

## Consequences

- **The storefront suppresses sooner than a person expects.** `cpol_web_daily`
  allows three decisioned web slots a day, and a home-page load decides the hero
  and the grid for the selected preset's customer. So a day holds one full decide
  per customer; on the second, whichever of the two reaches the platform first is
  offered and the other is `FREQUENCY_CAP_BREACHED`, and from the third nothing
  is, for 24 hours or until an in-memory console restarts. The order is the
  arrival order, not the page's: the hero on one day, the grid on another.
  *(Corrected twice on 2026-09-18. First: this said the grid's read "already
  count[ed] the hero" and that the second load always offered the hero and capped
  the grid; the page decides the two at once, so neither read saw the other, and
  when both read before either recorded, both were offered and the cap was
  exceeded — G-160. Second: §10 now makes the two decisions for one customer run
  one after the other, so the second reads the first's contact and the cap
  holds; what this bullet describes is again true, with the order left to
  arrival.)* (The three
  presets are one customer, `cust_eva`, so switching preset does not start
  another count. When this ADR was accepted each preset sent its own id and this
  clause said so; the ids were joined later the same day, because the demo's
  claim is one customer a field apart — see G-094's correction.) That is the cap
  doing what it declares. To keep
  the page usable without changing the cap, its panel has a **Next day** control
  that moves the visit a day forward, so yesterday's contacts leave the day's
  window — which demonstrates the rolling window rather than avoiding the cap.
  It only works because of §8. The storefront's end-to-end specs advance the day
  the same way instead of resetting the store. Chosen by the product owner on
  2026-09-17 over a fresh visitor per load, a shorter period (not in
  `FrequencyPolicy.period`), and a reset button.
- **No existing decision's identity moved.** The seeded corpus executes without
  a read, and every existing decision-corpus case is byte-identical; the corpus
  grew from 41 to 44.
- **The console's two decision operations, and the two services, disagree for a
  customer the platform has contacted**, until G-150 closes: a placement decision
  holds a cap to the ledger's count, `POST /api/decisions` to the caller's.
- **What this does not do.** The cooldown after a decline still reads the caller's
  `rejects`, and not the ledger's recorded rejections. *(Corrected 2026-09-17.
  This said the reason was that "a decline is not an outcome (G-086)", which is
  false. `rejection` is an outcome type the spec declares, `POST /outcomes`
  accepts, the ledger stores and the performance report counts, and the seeded
  ledger holds 80. The real reason is that a rejection names a decision, not an
  offer, which is ambiguous on a slate. Reading them waits for ADR-020 §4
  (G-153).)* A cap scoped to one offer counts the contacts about that offer
  (§9). *(Corrected 2026-09-17. This said such a cap "still counts the channel's
  contacts, as it did", and that counts were per channel, not per offer or
  action, which contradicted ADR-019 §4.)* "Last outcome per action" and the other
  rollups ADR-014 §10 names are not built.
- **A service message a cap covers is held back when the ledger cannot be read.**
  Decided as stated in §4; if duty-of-care messages should pass an unreadable
  ledger, that is a change to this clause.
- **Found on the way:** replay's `diff` threw when a diverging decision had a member
  on one side only — a step that removed more candidates on replay — and answered
  with an error instead of the difference. Fixed.

## Alternatives considered

**Declare rollups on the schema first, and derive the cap's count from one.** ADR-014
§10's full shape. Rejected for now by the product owner: the caps need exactly one
query, and a declaration mechanism with one user is a design with nothing to test
it against.

**Calendar periods.** A "month" that means the calendar month depends on a time
zone and moves at midnight somewhere; a replay near a boundary could land in a
different window. Rejected for rolling windows.

**Count only `delivered`.** The original answer to §3. Rejected on the evidence:
nothing writes it, so every cap would count zero platform contacts.

**Treat an unreadable ledger as zero, or as "not read".** Zero contacts a customer
whose cap is spent. "Not read" makes an outage indistinguishable from a channel
with no caps, and the caps would silently fall back to the caller's number.

**Leave the read unrecorded and have replay supplied with it.** Consistent with
how caller counts work, and it contradicts ADR-014 §10: a cap suppression in a
live trace could not be explained from its record.

**Record contact history on every decision.** Moves every seeded id, so it would
wait for ADR-019's reseed; the field present only when read leaves every existing
id where it is.
