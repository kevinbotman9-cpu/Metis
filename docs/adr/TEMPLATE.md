# ADR-NNN: Title in sentence case

**Status:** Proposed
**Date:** YYYY-MM-DD (proposed)
**Owner:** Who is accountable for getting this decided. A person or a named
role, never "the team" — a decision owned by everyone is owned by nobody, which
is how ADR-004, 005, 006 and 007 sat Proposed for three days short of a month
with nothing tracking them.
**Decision needed by:** YYYY-MM-DD. The date after which the cost of not
deciding exceeds the cost of deciding badly. Say what happens on that date, not
just when it is.
**Constrains:** the files, packages and future work this decision binds.
**Arises from:** the review, gap or incident that produced it, where there is one.

<!--
On acceptance, replace the Status block with:

**Status:** Accepted
**Date:** YYYY-MM-DD (proposed)
**Decided:** YYYY-MM-DD
**Deciders:** who decided
**Owner:** who owns the consequences
**Decision needed by:** — decided

`Owner` and `Decision needed by` are required while an ADR is Proposed.
`tests/adr-status.test.ts` fails when an ADR has been Proposed for more than
thirty days without an owner. It is the weak version of the rule on purpose:
the strong one — that no implementation may reference a Proposed ADR's subject —
is not checkable by anything this repository has, and ADR-006 records what that
gap cost.
-->

## Context

What is true that makes a decision necessary. Forces in tension, commitments
already made, and the specific thing that breaks if nobody chooses. Cite files
and line numbers rather than describing them.

Prefer stating the surprising fact over stating the general problem. An ADR that
opens with "we need to think about caching" is not yet an ADR.

## Decision

What was decided, in the imperative, as numbered clauses where there is more
than one. Each clause should be something a reader could later find violated.

Where a clause exists to prevent a specific tempting mistake, say what the
mistake is. Most of the value in an ADR is in the alternative that looks
reasonable and is not.

## Consequences

What becomes true, including the parts that are worse. An ADR with no cost
section is a proposal, not a decision.

Name the first thing that will be wrong as a result, and who will notice it.

## Alternatives considered

Each with the reason it lost. An alternative dismissed in a clause is not
considered; one that gets a paragraph and a specific objection is.
