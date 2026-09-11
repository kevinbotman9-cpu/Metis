# ADR-004: Retention and Erasure

**Status:** Accepted
**Date:** 2026-09-06 (proposed)
**Decided:** 2026-09-09
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided
**Constrains:** the decision ledger, the interaction history store (unbuilt), the
profile store (unbuilt), and every future store holding subject data.
**Amended:** 2026-09-11 — a premise was wrong: the ledger was never
pseudonymous. The decision stands; see *Amendment, 2026-09-11* at the end.
**Amendment accepted:** 2026-09-11, product owner, with its deployment
constraint taken as binding: **no deployment may write the ledger to PostgreSQL
with real customer references** until per-subject encryption of the whole
record, a per-subject-keyed subject column, and a rule for free-form columns all
exist. The conformance corpora are unaffected — their references are synthetic.

## Context

Two commitments in this platform point in opposite directions.

**Append-only is load-bearing.** The registry, the ledger and the catalogue's
edit log all reject `UPDATE` and `DELETE` at the schema, by trigger, and the
reason is stated in each migration: an audit that can be rewritten is not an
audit. A decision record is a fact about what was decided, and §11's immutable
audit claim rests on nobody — including us, including anyone holding the
connection string — being able to change it after the fact.

**A subject can demand erasure.** UK GDPR Article 17 and its equivalents give a
person the right to have their personal data erased. A decisioning platform
holds a great deal of it: the inputs a decision was made from, the outcome
events that followed, and in time a profile and months of interaction history.

These cannot both be satisfied by deleting rows. Deleting a decision record
breaks the chain the audit depends on, and keeping it breaks the erasure right.

**Deciding this now is the point of the ADR.** Nothing is populated yet: the
ledger holds test data, the profile store and interaction history do not exist.
Retrofitting erasure across four stores after they hold years of production
data is the single most expensive thing on the backlog, and it is expensive in
a particular way — it requires re-encrypting or rewriting history, which is
exactly the operation the append-only guarantee exists to forbid.

## Decision

**Crypto-shredding, with a per-subject key.**

1. Every field that identifies or describes a subject is encrypted at rest with
   a key held per `(tenantId, subjectHash)`. The keys live in a key store
   separate from the data.

2. Erasing a subject destroys that key. The rows stay exactly where they are,
   the chain hashes stay valid, the append-only triggers are never bypassed,
   and the plaintext becomes unrecoverable.

3. **A replay of an erased subject's decision fails explicitly.** It reports
   that the subject was erased, when, and under what request — it does not
   return a decision computed from nulls, and it does not return "could not
   reproduce", which would be indistinguishable from an engine bug. This is the
   most important consequence in this document: the failure mode has to be
   legible, because it will be met by an auditor asking why a decision cannot
   be reproduced.

4. What survives erasure is what carries no personal data: the decision id, the
   chain hash, the flow and version, the timestamp, and the fact that an
   erasure occurred. That is enough to answer "how many decisions did this flow
   make in March" and not enough to answer anything about the person.

5. Retention is a per-tenant policy, enforced by a scheduled job with its own
   test, and expiry destroys keys by the same mechanism. Retention and erasure
   are then one code path rather than two, which matters because the rarely-run
   one would otherwise be the one that is broken.

## Why not the alternatives

**Delete the rows.** Simplest, and it breaks the thing the platform sells. The
triggers would have to be dropped or bypassed for the deletion, and a store
whose immutability has an exception is a store with no immutability — the next
question is always who else can use that exception.

**Redact in place.** Overwriting personal fields with nulls is an `UPDATE`, so
it has the same problem, and it changes a record whose hash is recorded
elsewhere. A decision record that no longer hashes to its own chain hash is
worse than one that is missing.

**Keep everything and rely on legal basis.** Legitimate interest does not
displace an erasure request, and "we cannot erase" is not a defensible
architecture for a platform sold into regulated industries. It also concedes a
differentiator: §14 claims deterministic governance, and an erasure story that
amounts to "we do not" is not governance.

**Tokenise identifiers only.** The ledger already hashes the customer reference
per tenant, so the subject is pseudonymous rather than identified. That is
genuinely useful and it is not sufficient: the input snapshot holds the
attributes a decision was made from, which describe the person whether or not
their name is attached.

## Consequences

**Accepted costs.**

- A key store becomes infrastructure the platform cannot run without, and
  losing it destroys data as effectively as deleting it. It needs its own
  backup, its own restore drill, and its own place in the DR work (W-050).
- Encryption sits between the ledger and its own contents, so every read pays
  for it. The decision path does not read the ledger, so the p99 gate is
  unaffected; replay and search are.
- The conformance corpora contain no personal data and are unaffected. This is
  worth stating because it would be easy to assume otherwise.

**What this forbids.** No store may hold subject data outside the per-subject
key. That is a constraint on W-008 (profile store), W-009 (feature service),
W-011 (interaction history) and W-032 (adaptive learning) — the last most
sharply, because a model trained on erased subjects has learned from data that
no longer exists, and no key destruction reaches inside model weights. Training
sets must be rebuildable, and a model whose training data included an erased
subject must be retrainable rather than merely re-labelled.

**What is not decided here.** The key store implementation, the cipher, the
rotation policy, and whether tenant-level keys sit above subject-level ones.
Those are implementable choices; this ADR fixes the shape, which is the part
that is expensive to change later.

## Status, honestly

**Proposed, not Accepted.** This commits the platform to an architecture with
real operational cost, on a question with legal consequences. The backlog asked
for the decision to be made now rather than after four stores are populated,
and this is the recommendation with its reasoning — but adopting it is a
product and legal call, not an engineering one, and it should be taken as such
before W-008 begins.

Nothing in the codebase implements this yet, and `docs/CAPABILITIES.md` records
retention and erasure as unbuilt.

## Amendment, 2026-09-11 — the ledger was never pseudonymous

**A correction, not a new decision.** Crypto-shredding with a per-subject key
stands, and so do clauses 1 to 5. What was wrong is a fact this ADR relied on
when it scoped them. This section records what was assumed, what is true, and
what follows for the design. The text above is left exactly as it was accepted,
so the error stays readable where it was made. Registered as
[G-068](../gaps.md); found while tracing the data spine for
[ADR-014](ADR-014-the-data-spine.md).

### What it assumed

Two passages carry the assumption.

- **The rejection of "tokenise identifiers only"**, in *Why not the
  alternatives*:
  *"The ledger already hashes the customer reference per tenant, so the subject
  is pseudonymous rather than identified. That is genuinely useful and it is not
  sufficient: the input snapshot holds the attributes…"* The reasoning it
  records is that the identifier was already handled, and the per-subject key
  was needed for the attributes.
- **Clause 1** indexes subject keys by `(tenantId, subjectHash)`, which treats
  the hash as an index that reveals nothing.

Clause 4's list of what survives erasure inherits both: it assumed the rows left
behind after a key is destroyed hold nothing that identifies the person.

### What is true

1. **The hashed decision carries the raw identifier.**
   `customerRef: request.customerId`
   (`packages/runtime/src/deterministic/engine.ts:659`), and the Kotlin engine
   emits the same field, so it is in every conformance corpus case.
2. **The ledger stores the record whole, in clear.** `decision_records.record`
   is `jsonb` (`packages/ledger/migrations/001_ledger.sql:37`,
   `packages/ledger/src/types.ts:39-40`). Every row holds the identifier one
   column from `subject_hash` — and with it, in clear, what the decision says
   about the person: which suitability rule refused them, a propensity per
   candidate (subject data, per ADR-009 §8.3), and `consentState`.
3. **`subject_hash` separates nothing.** It is an unkeyed sha256 of
   `tenantId.length:tenantId:customerRef` (`packages/ledger/src/ledger.ts:62-64`).
   Anyone with read access and a list of candidate identifiers — account
   numbers, phone numbers, the seeded `cust_` plus a base-36 counter — can
   recompute it and match.
4. **Every ledger table is append-only by trigger** (`001_ledger.sql:171-184`),
   and one carries a column with no rule about what goes in it:
   `outcome_events.detail`, free-form `jsonb` *"for whatever the channel
   reported"* (`types.ts:63`).
5. **None of it holds real data yet.** The console writes the ledger to
   PostgreSQL only when `METIS_DATABASE_URL` is set, and the truth audit found
   PostgreSQL *"used by no service"* (`docs/evaluation/TRUTH_AUDIT.md:78`).

So the identifier was not handled, the attributes were not the only exposure,
and the index hides nothing. The rejection of "tokenise identifiers only" still
stands, on stronger grounds than it gave: the platform had not tokenised the
identifier either.

### What changes in the design

The decision's own rule already covers all of this — clause 1, *"every field
that identifies or describes a subject is encrypted at rest"*, and *"No store may
hold subject data outside the per-subject key."* What changes is what honouring
that rule requires, given the facts above. Each point follows from the decision
and adds nothing to it.

1. **The ledger's unit of encryption is the whole record.** Not selected fields.
   `customerRef` sits inside the hashed decision, and the eliminations, scores
   and consent state around it describe the subject. Encrypting fields inside
   the record would put a serialisation between the record and its chain hash,
   which is why the migration stores it whole. So `record` becomes ciphertext
   under the subject key, and the clear columns are exactly clause 4's
   survivors: decision id, chain hash, flow and version, timestamp, plus the
   subject column below. Clause 4 then describes what is stored, rather than
   what was believed to be stored.
2. **The raw identifier may stay in the hashed decision, and no chain hash
   moves.** Once the stored record is ciphertext, `customerRef` inside it is
   covered by the key like everything else. Replacing it with a pseudonym in
   the hashed decision would change every chain hash in both engines and every
   corpus, to protect a value the encryption already protects. That is the
   tempting fix and the expensive one, which is why it is named. The residual is
   stated rather than hidden: the chain hash and the content-addressed decision
   id stay in clear and are computed over the raw identifier. Confirming a
   person from them means reconstructing the whole decision — artifact,
   catalogue, every input, every score — and anyone who can do that already
   holds the subject's data.
3. **The subject column is derived from the subject key, not from the
   identifier alone.** Keying the hash per tenant would stop enumeration by
   anyone without the tenant key, and it would survive erasure: after a
   subject's key is destroyed, anyone holding the tenant key could still
   recompute the pseudonym from a known identifier and find the rows — the
   number and times of every decision about an erased person. So:
   - the ledger's subject column is `HMAC(subjectKey, customerRef)`;
   - the key store, which is the one mutable store in the design, maps
     `(tenantId, HMAC(tenantKey, customerRef))` to the subject key;
   - a search by customer goes identifier → tenant pseudonym → key store →
     subject key → ledger pseudonym.

   Destroying the subject key then leaves the rows unreadable **and unlinkable
   to the person**. That is what clause 2 promised and the current column cannot
   deliver. The cost is one key-store read per subject for a right-of-access
   search, and for ADR-014's per-subject interaction read. That is one read per
   request, not one per row, and it is accepted.
4. **A free-form column in an append-only table gets a rule.**
   `outcome_events.detail` is either encrypted under the subject key with the
   record, or restricted to a declared shape that carries no subject data. An
   append-only column that accepts anything is where the next identifier lands;
   a provider's bounce payload carries the recipient's address.
5. **The order is fixed by the triggers, and the window is now.** Encrypting
   `record` or re-deriving the subject column for existing rows is an `UPDATE`,
   which the triggers refuse and this ADR forbids. Today that costs nothing: the
   tables hold test data, and the migration can be replaced rather than altered.
   After the first real row, the only paths are a new table beside the old one —
   the old still holding plaintext it cannot delete — or bypassing the trigger,
   which *Why not the alternatives* rejects. So no deployment may write the
   ledger to PostgreSQL with real customer references until points 1 to 3 are
   implemented. This is the Context's own warning — retrofitting erasure
   *"requires re-encrypting or rewriting history, which is exactly the operation
   the append-only guarantee exists to forbid"* — applied to a store that was
   thought to be exempt from it.

### What is not affected

- **The conformance corpora.** Their customer references are synthetic, and the
  statement that they contain no personal data stands.
- **Replay** (clause 3). A replay of an erased subject still fails explicitly;
  the record it would have read is now ciphertext it cannot open, which is the
  same failure, arrived at for a reason that is actually true.
- **The p99 gate, as this ADR scoped it.** The decision path does not read the
  ledger. ADR-014 proposes that it should, and records that consequence there.

### How it was missed

The sentence that opens "tokenise identifiers only" is true of the column added
for the purpose and false of the row. The `record` column is the engine's record, and attention there has
been on determinism — that it hashes, replays and agrees across two engines —
not on what it discloses. Nothing checks the ledger for a raw identifier. G-068
names the check that would: record a decision, then assert the `customerId`
appears in no column in clear.

Separately, *Status, honestly* above still reads *"Proposed, not Accepted"*. The
header is authoritative — Accepted 2026-09-09 — and that section is left as it
was, like the rest.
