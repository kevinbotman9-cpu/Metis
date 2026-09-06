# ADR-004: Retention and Erasure

**Status:** Proposed — needs a decision from product and legal before it is Accepted
**Date:** 2026-09-06
**Constrains:** the decision ledger, the interaction history store (unbuilt), the
profile store (unbuilt), and every future store holding subject data.

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
