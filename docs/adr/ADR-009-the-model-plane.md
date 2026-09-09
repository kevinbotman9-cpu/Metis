# ADR-009: The model plane

**Status:** Accepted
**Date:** 2026-09-09 (proposed)
**Decided:** 2026-09-09
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided
**Constrains:** `packages/runtime/src/deterministic/engine.ts`, the compiler's
score-node rules, `ExecArtifact`, the `DecisionRecord` schema and therefore
every chain hash, the input snapshot, replay, `packages/ledger`, and the shape
of W-029, W-030 and W-031.
**Arises from:** gap [G-034](../gaps.md), work item [W-029](../BACKLOG.md), and
the coherence review's finding that this is the platform's largest single
absence.

## Context

**There is no model.** `score-model` and `score-adaptive` nodes produce

```
propensity = round(0.05 + seededUnitInterval(customerId, offerKey, modelKey) * 0.9, 6)
```

at `packages/runtime/src/deterministic/engine.ts:490-527`. That is arithmetic
over a sha256. Every ranking decision this platform makes is
`boost × value × context^0.5 × a hash of the customer id`, and arbitration —
the thing the product is for — rests on it.

The engine says so, in the sentence a person reads in the trace: *"Scored 19
candidate(s) with propensity_accept_v4@4.2.0 — a pinned deterministic function,
not a trained model (W-029)."* The comment above that line records why it is
worded so bluntly: it used to read like a real model had scored, and nobody had
written a false claim — a pinned model id had made one anyway.

**Four things already exist and constrain everything below.**

*The contract is already there.* The compiler refuses a score node that does not
name a model, and refuses one whose version is not an exact `x.y.z`:
*"Without a pin the decision cannot be replayed"* (`compile.ts:559-568`). The
artifact carries `modelInvocations` in its cost manifest, and the tenant's
latency budget is enforced along the critical path — a flow that exceeds it does
not compile. So the *shape* of a model reference is settled. Only the model is
missing.

*The hot path is already tight and already measured.* The gate is p99 < 50 ms;
S1 measures 6.8 ms cold and 3.6 ms warm over a million profiles. A synchronous
model call is the single largest thing anybody could add to that.

*The deterministic core already reaches nothing.*
`packages/runtime/tests/no-egress.test.ts` blocks fetch, http, https, net,
`Socket.prototype.connect` and dns at the process level, then decides **and
replays** successfully with zero attempts, and asserts the decision hashes the
same blocked or not. A model call is I/O. It cannot go where the scoring
currently is.

*There is already a pattern for I/O in a decision.* Connectors are resolved by
`resolveInputs` **before** the deterministic core runs, concurrently, with each
value hashed into the input snapshot and each call recorded as a `SourceCall`
with its latency and cache state. A connector declaring a p95 above the tenant
budget fails compilation on its own. That is the template, and it was built for
exactly this shape of problem.

**And the loop now produces outcomes.** ADR-008 closed it: the storefront
reports impressions and clicks, the seeded corpus reports 2,101 measured
decisions of 3,425 offered. For the first time there is something to learn from
— which is precisely why this needs deciding now rather than when somebody asks.

## Decision

### 1. Integrate. Do not build a training stack

METIS is a decisioning platform whose differentiator is that every decision can
be proved. It is not a machine learning platform, and the market has several
good ones. Building a trainer would put this project in competition with tools
its customers already own, on an axis where it has no advantage, and would
double the surface that has to be made deterministic.

**So: the platform serves models it did not train, and trains nothing in v1.**
What it owns is the part nobody else does — pinning a version to a decision,
putting the score in the trace, and making the whole thing replay.

The one exception is §7.

### 2. Scoring moves out of the deterministic core, beside connector resolution

A model call is I/O and the core makes none. Scoring therefore happens in a
**resolution phase before `execute`**, exactly where connectors are, and for the
same three reasons: it can be concurrent, its latency can be budgeted at compile
time, and its result can be hashed into the input snapshot.

```
request → resolveInputs (connectors, concurrent)
        → resolveScores  (models, concurrent, NEW)
        → execute        (deterministic, no I/O, hashes everything above)
```

`score-model` stops computing anything. It becomes a node that **reads a score
already resolved**, the way a source node reads a field already fetched. The
node keeps its name, its pinned model reference and its place in the graph; only
the arithmetic leaves.

This is the whole architectural claim of this ADR, and everything else follows
from it. In particular it means the no-egress test keeps passing unchanged,
which is the property worth protecting: the thing that makes a METIS decision
defensible is that once the inputs are fixed, nothing else can influence it.

### 3. A score enters the hash as a quantised decimal, not a float

ADR-003 makes numbers canonical by shortest-round-trip `Number::toString`, and
warns in its own text that *"a single ulp survives rounding to 8dp whenever the
true value sits near a rounding boundary, and then the hash differs."* A model
runtime is exactly where that bites: ONNX Runtime, a JVM scorer and a Python
reference implementation are not required to agree in the last bits of a float,
and none of them promises to.

**A score is quantised at the boundary of the platform, once, by the resolver,
before it is hashed or used.** `round(p, 6)` by ADR-003's rule — `Math.round(n *
10^6) / 10^6`, ties toward positive infinity — which is what the current
function already does and is therefore already conformance-tested in both
engines.

Two consequences worth stating rather than discovering:

- **Quantisation is part of the contract, not an implementation detail.** Two
  scorers agreeing to 6dp produce the same decision; two agreeing to 9dp but not
  6dp produce different chain hashes and the corpora catch it. That is the
  correct direction for the check to fail in.
- **A model whose useful signal lives below 1e-6 cannot be used here.** That is
  a real restriction and it excludes nothing anybody ranks offers with.

### 4. A model is a registry object, versioned like a flow

A `Model` is: an id, a semantic version, a `kind` (`propensity`, `value`,
`ranking`), the feature contract of §5, a declared p95 in milliseconds, an
owner, and an immutable artifact hash over the serialised weights.

It binds to a flow exactly as it does today — `node.model = { id, version }`,
pinned at compile time — and the existing rules apply unchanged: an unpinned
version fails compilation, and `modelInvocations` already lists what a flow
calls. The declared p95 joins `criticalPath` the way `connector.declaredP95Ms`
does, so **a flow that adds a model call it cannot afford stops compiling**. No
new mechanism; the compiler was built with the hole already in it.

Versions are immutable and republishing the same content is a no-op, as in
`packages/registry`. A model is promoted between environments through the same
change set and approval path as a flow, which means the answer to "who approved
this scorer" is the answer already given for everything else.

### 5. The feature contract: declare, resolve, refuse

There is no feature store (W-009) and there will not be one in v1. What exists
is the profile schema with declared aggregations, resolved at decision time and
already merged into the request — the mechanism `usage becomes decision input`
tests.

**A model declares the features it needs as paths into the profile schema.**
Compilation resolves every path against the tenant's schema, and:

- a path that does not exist is a compile error, with the spelling suggestion
  the policy editor already produces;
- a path whose type does not match what the model declares is a compile error;
- a feature supplied by a connector inherits that connector's latency into the
  critical path, so an expensive feature is refused at compile time rather than
  discovered at p99.

**No implicit features. No "the model reads the profile".** A model that can
read anything cannot be reasoned about, cannot be latency-budgeted, and makes
the erasure question in §8 unanswerable. The declaration is the thing that makes
the rest of this ADR possible.

**Training/serving skew is not solved by this and must not be claimed.** The
same paths are used at decision time; whether the training set was built from
the same definitions is outside the platform. What the platform can do is record
which feature values it passed, which it already does for connectors — so a
skew, when it happens, is at least evidenced.

### 6. ONNX and PMML: import as opaque, refuse what cannot be pinned

**Yes, and narrowly.** The import path (W-030) takes a file, computes its hash,
reads its declared input and output signature, and maps that signature onto the
feature contract of §5. The platform never interprets the model's internals.

Three refusals, each stated at import rather than at decision time:

- a model whose input signature cannot be mapped onto declared features;
- a model with more than one output, or an output that is not a scalar in
  `[0,1]` for a `propensity` kind;
- **a model containing an operator whose result is not required to be
  bit-reproducible across runtimes.** This is the one that will be unpopular and
  it is not negotiable: an operator that may differ between two conforming
  implementations breaks the property this platform sells. A blocklist per
  format, versioned with the importer.

PMML is second, not first, and possibly never: it is a smaller share of what
customers actually have, and its scoring semantics are specified in prose that
implementations read differently — which is a poor foundation for a hash.

### 7. Adaptive learning is out of scope for v1, and the reason is not effort

The loop produces outcomes now, so the objection "there is nothing to learn
from" has expired. Three others have not.

**An adaptive model changes what it decides without a change set.** Every other
thing that alters a decision in this platform goes through publish, promote,
approval and an append-only record. A model that updates itself from traffic is
a decision-changing mechanism with no approval path, and adding one is a
governance design, not a feature.

**It breaks replay unless the weights are versioned per decision.** If a model
updated between a decision and its replay, re-executing against the recorded
inputs produces a different score. The fix is to pin the *weights* — a version
per update — which means an adaptive model publishes a new immutable version
every few minutes and the registry grows without bound. That is solvable and it
is a storage and retention design of its own.

**The outcomes are mostly synthetic.** 2,101 of the measured decisions come from
the seed, and provenance now says so on every response. A model trained on that
corpus would have learned `seededUnitInterval`. This is a fine reason to wait
and a poor reason to hurry.

So: **contextual bandits and adaptive models are Gate 3**, and `score-adaptive`
— today a node type with no behaviour distinct from `score-model`
([G-012](../gaps.md)) — is **removed** rather than left as a promise. A node
type that does nothing is worse than an absent one, because it reads as
capability in a canvas.

### 8. Erasure: a key cannot shred a model

ADR-004 destroys a per-subject key and leaves the ciphertext. It works because
every store holding subject data holds it encrypted under that key. **Model
weights are not encrypted under anybody's key**, and a subject who contributed
to a training set remains in the weights after their key is destroyed. Crypto-
shredding cannot reach them, and no amount of care in the serving path changes
that.

Three rules follow, and the first is the one that matters:

1. **The platform does not train, so it does not hold training sets.** This is
   the strongest reason for §1 and it should be recorded as a reason rather than
   a convenience. Erasure obligations attach to whoever trained the model.
2. **A model version records the date of the data it was trained on**, declared
   at import and not verified — the platform cannot verify it. An erasure
   request after that date is answerable: the subject may be in versions trained
   after it, and the tenant is told which.
3. **Nothing writes an erased subject's features into a decision record.** Only
   feature *paths* and the resolved values already covered by ADR-004's
   encryption go into the input snapshot. The score itself is a number about a
   person and is treated as subject data.

**What this ADR cannot fix and must say plainly:** if a tenant brings a model
trained on their customers and then erases one, this platform will faithfully
keep serving a model that learned from that person. It can say when the model
was trained and who owns it. It cannot make the model forget. Any claim that
METIS "supports the right to erasure" has to be scoped to the data METIS holds.

### 9. The trace carries the score, its version, and its inputs

A score node's trace entry gains: the model id and pinned version, the resolved
score, the feature values passed (subject to §8.3), and the resolver's latency
and cache state — the same fields a `SourceCall` already carries, because it is
the same kind of event.

What it does **not** gain in v1 is per-feature attribution. Shapley values or
equivalent (W-031) are a separate decision: they cost more than the score does,
they are approximations with their own parameters, and publishing an
approximation inside a trace whose entire claim is exactness needs its own
argument. The trace should say the contribution is not available rather than
show an estimate — the same discipline `/performance` already applies to
attribution.

**The sentence in the trace changes when this lands, and that is the point.**
`engine.ts:519-524` currently declares the propensity is not a trained model.
When it is one, that sentence describes something else, and the comment above it
already anticipates this.

### 10. Replay when the score came from a model

A decision records `inputSnapshotHash` and never the values. Replay re-executes
against the recorded snapshot and asserts a byte-identical chain hash, opening
no socket.

**The resolved score is part of the input snapshot, not something replay
recomputes.** Replay must never call the model: calling it would open a socket
the no-egress test forbids, would take the p95 of a model that may have been
retired, and would answer a different question — "what would this model say
today" rather than "what did this decision do".

Three failure modes, each with a distinct and legible answer:

- **The model version was retired.** Replay succeeds. The score is in the
  snapshot; the model is not needed. This is the case that justifies the whole
  design.
- **The subject was erased.** Replay fails explicitly, per ADR-004 §3, and the
  score is subject data so this holds for model-scored decisions too.
- **The caller supplies inputs by hand** (the existing 422 `input_required`
  path). They must supply the score as well, and it must be labelled as
  supplied rather than resolved, so a hand-fed replay cannot be presented as
  a reproduction.

## Build first, defer

**First — the resolver, with the existing function behind it.** Move scoring out
of `execute` into `resolveScores`, keep `seededUnitInterval` as the only
registered scorer, and change nothing else. Every corpus hash stays identical
because the arithmetic and the rounding are unchanged; if any hash moves, the
move is a bug and the corpora say so immediately. This is the whole
architectural change, it is testable to the byte, and it ships with no model in
it. Do this before anything else and it is safe to be wrong about the rest.

**Second — the `Model` registry object**, versioned, approvable, with the
declared p95 joining the critical path so the compiler starts refusing flows
that cannot afford their scorers. Still no real model.

**Third — one ONNX model, one tenant, one flow**, with §6's refusals enforced at
import and the trace carrying the score and its version.

**Deferred, with the reason:**

- **Adaptive learning and bandits** — §7. Gate 3, needs a governance design.
- **Per-feature attribution (W-031)** — §9. Needs its own argument about
  publishing an approximation inside an exact trace.
- **A feature store (W-009)** — §5 works from the profile schema. A store is a
  performance decision, taken when a measured feature resolution exceeds budget.
- **PMML (W-030, second half)** — §6.
- **Model monitoring and drift** — real, and it belongs with the outcome loop
  rather than with the serving path. It needs recorded outcomes at volume that
  are not synthetic.
- **Removing `score-adaptive`** — done as part of step one, not deferred, but
  named here because it is a deletion and deletions get forgotten.

## Consequences

**The first thing that will be wrong** is the latency budget. A tenant will
declare a model p95 that is optimistic, the compiler will accept the flow
because it believes the declaration, and the p99 gate will fail in CI. That is
the correct place for it to fail and the message should say which model's
declaration was wrong — the same lesson the connector budget already learned.

**The corpora become the model contract's enforcement.** Once a real model is
pinned, `docs/conformance/decision-corpus.json` has to carry a case that
exercises it, and the Kotlin engine has to produce the same score. That means
either both engines embed a scorer or the corpus records the resolved score as
an input. **The second.** Scoring is outside the core in both, so the corpus
tests the core, and the model is tested separately.

**The trace gets longer and slower to read.** Feature values per score node on a
19-candidate decision is a lot of rows. The audience toggle already exists for
this and the Engineer view is where they belong.

**One claim gets weaker and should.** "Every decision replays byte-identically"
stays true. "The platform reproduces what the model did" becomes "the platform
reproduces the decision the model's output produced" — which is what it could
ever have honestly claimed, and the difference will matter to a regulator.

## Alternatives considered

**Score inside the deterministic core, calling out.** Simplest to write and it
deletes the property this platform sells. `no-egress` would have to be weakened
from "the decision path opens no socket" to "the decision path opens only
approved sockets", and every argument that follows from the strong version stops
holding.

**Embed the model in the artifact so scoring stays pure.** Genuinely tempting:
the artifact is already immutable, hashed and pinned, and an embedded model
would make scoring deterministic by construction with no resolver at all. It
fails on size — artifacts are stored per version and diffed in a console — and
on the fact that a customer's model is their property and putting a copy in
every export bundle is a data protection question nobody wants.

**Build the trainer.** Rejected in §1. Also: the erasure obligations in §8 land
on whoever trains, and taking them on for a capability the customer already has
is a poor trade.

**Keep `seededUnitInterval` and say so.** The honest status quo, and it is what
the trace does today. It stops being viable the moment a customer asks the
platform to use their model, which is the first question anybody asks after
seeing the arbitration screen.
