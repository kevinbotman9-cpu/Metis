# ADR-013: Delivery, and the difference between deciding and sending

**Status:** Accepted
**Date:** 2026-09-10 (proposed)
**Decided:** 2026-09-10
**Deciders:** product owner
**Owner:** Product owner
**Decision needed by:** — decided

**Decided: phase one only.** The delivery record and the `active` split, with
nothing sending behind them. No adapter is scheduled.

**The adapter is blocked, not deprioritised.** There is no recipient anywhere in
the profile schema — `EmailContent` carries `fromAddress` and no `to`, and the
`Address` entity is a *service* address carrying fibre availability. W-008 must
land before any adapter can address a message. This is a dependency and should
not be restated as a preference or a sequencing choice: an adapter with nowhere
to send is not a smaller adapter, it is a different and unbuildable thing.
**Constrains:** `Placement` in the OpenAPI spec, `OutcomeType` in
`packages/ledger/src/types.ts`, `decidePlacement`, the storefront,
`/creatives?view=coverage`, `/performance`, and W-017, W-018 and W-019.
**Arises from:** G-043 and the end-of-session finding on 2026-09-10. ADR-012
closed the question of whether an offer has content; this is the question of
whether anything sends it.

## Context

**The platform decides on five channels and can deliver on one.** 8,255 of the
10,400 seeded decisions are on sms, push, email or outbound_call. Not one of
those four has anything behind it.

The web channel works, and the way it works is the thing to notice: the platform
does not deliver on web either. `decidePlacement` returns a slate and *the
caller* renders it. Delivery is the website's job, synchronous, in-band, and the
platform never sends anything. `apps/console/public/storefront/index.html` is
that caller, and it is why web looks solved.

**Nothing in this platform has ever sent anything.** The only egress in the
decision path is `HttpIntegrationGateway.fetch`, which POSTs a question in order
to read an answer, and `packages/runtime/tests/no-egress.test.ts` asserts that
the deterministic core reaches no network at all. Outbound delivery is therefore
not a fifth connector. It is the first time the platform would act on the world
rather than read it.

### Four things the model does not have

**A word.** §3 of `CLAUDE.md` is normative and has no verb for sending.
*Placement* is a slot, *creative* is content, *channel* is a medium. The thing
that puts the second into the first over the third is unnamed, which is a
reliable sign that it is also unbuilt.

**A recipient.** `EmailContent` carries `subject`, `preheader`, `body`,
`fromName` and `fromAddress`. There is no `to`, and there is nowhere to get one:
the profile schema's `Address` entity is a *service* address — *"the service
address, and what the network can deliver there"*, carrying fibre availability —
and no email address, telephone number or push token exists anywhere in the data
model. `customerId` is an opaque key. **An email adapter today could compose a
message and would have nobody to send it to.** That is W-008, and it is a hard
dependency rather than a detail.

**A state between deciding and being seen.** `OutcomeType` is
`impression | click | acceptance | rejection | conversion`. The first of those
presumes arrival. On web that is true — render and impression are the same
instant. On every other channel at least three moments are collapsed into one:
the platform accepted the message for sending, the provider accepted it, and the
customer received it. Queued, deferred for quiet hours, throttled, soft-bounced,
hard-bounced, rejected for complaint history — none is expressible.

**A trigger.** A web decision is pulled: somebody loaded a page. An email
decision has to be pushed by something, and nothing pushes. W-019, the batch
executor, is open. So the 2,042 seeded `weekly_offers_send` decisions were made
by a generator standing in for a scheduler that does not exist.

### What is already decided and constrains this

**ADR-007** governs credentials and names this case explicitly: *"every future
outbound integration including the email adapter (W-017)"*. Configuration holds
a reference, never a value; a missing credential is a configuration error with
its own outcome, and deliberately does not fall through to a connector's
`onFailure` mode.

**ADR-008 §2** fixes the binding between a decision and what happened to it: the
decision id and nothing else, never reconstructed from customer, offer and time.
`DecisionLedger.recordOutcome` enforces it — an outcome whose decision it cannot
find is refused with `OUTCOME_WITHOUT_DECISION`.

**ADR-012** established that an offer must have content on a channel somebody
serves, and deferred refusing to rank until coverage is healthy.

## Decision

### 1. Delivery is a record the platform writes about itself, not an outcome

A **delivery attempt** is a first-class record bound to a decision id, with its
own states:

```
accepted   the platform took responsibility for sending it
deferred   held — quiet hours, throttle, retry backoff
dispatched the provider accepted it
delivered  the provider confirmed arrival
failed     it will not arrive, with a reason and whether it is permanent
suppressed not attempted, and why — no address, no consent, no adapter
```

**Not an `OutcomeType`.** An outcome is something the customer did; a delivery
is something the platform did. Folding `sent` into the outcome funnel would put
the platform's own actions into the customer's denominator, which is the same
error as counting a win as a render (G-041) with the sign reversed.

`suppressed` earns its place by being the state the seeded corpus is in for
8,255 decisions today and cannot express.

### 2. `active` splits, because it is answering two questions

`Placement.active` is `type: boolean` in the spec **with no description at
all** — the field carrying two meanings is not documented as carrying one. It
becomes:

```
decidable: boolean        may a decision be made for this slot
delivery:  { mode: 'caller' | 'adapter', adapterId?: string } | null
```

- **`decidePlacement`** gates on `decidable` alone. Today's behaviour, under a
  name that says which question it answered.
- **The storefront** is `mode: 'caller'` and changes nothing. It was always the
  deliverer for web; the model now says so instead of leaving it implied.
- **The coverage screen** changes meaning, and this is the sharpest consequence.
  It currently measures content against *active placements' channels*, so on the
  seeded tenant it reports 164 of 202 offers "partly covered" across five
  channels, four of which cannot send at all. **It is measuring the wrong
  denominator**: it reports holes on channels nothing could use, and reports
  green where content exists with no sender behind it. Under the split it
  measures against channels with a delivery mode, and the other four become a
  stated absence rather than a column of red badges.

`null` delivery is the honest state for a slot that is decidable and has no far
end — which is four of this tenant's five channels.

### 3. The adapter contract mirrors the gateway, because ADR-007 already fixed
the shape

An interface in the runtime and no implementation in it that reaches a network,
exactly as `IntegrationGateway` and `SecretProvider` are:

```
send(request: {
  decisionId, tenantId, placementKey,
  recipient,          // resolved outside the adapter — see §5
  creative,           // already channel-validated
  idempotencyKey,     // the decision id; a retry must not double-send
}): Promise<{ state, providerRef?, reason?, permanent? }>
```

Four clauses follow from decisions already made:

1. **Outside the decision path.** Decide, record, *then* deliver. The core
   reaches no network and this must not be the exception that changes that.
2. **`credentialRef`, never a value** (ADR-007 §1, §3). A missing credential is
   `suppressed` with reason `credential_unavailable`, is a configuration error,
   and is **not** retried as a transport failure (ADR-007 §4).
3. **The provider's own reference is stored.** Bounce and complaint webhooks
   arrive keyed by the provider's id, not ours. Without `providerRef` the return
   path has to be reconstructed from customer and time, which ADR-008 §2
   forbids.
4. **A retry re-sends the same decision, never a new one.** Re-deciding on retry
   would make the message depend on when the retry ran, and two customers with
   identical histories would get different offers because one of them bounced.

### 4. Email is second, and sms is the tempting wrong answer

Email, which is what W-017 already names. The case, and the case against the
obvious alternative:

- **Content is built and populated.** `EmailContent` is the richest of the four
  and 78 active email creatives exist against 79 sms and 69 push.
- **The slot is already configured.** `weekly_offers_send` has `slotCount: 2`,
  so it exercises the slate path rather than the single-winner path.
- **Its failure modes are the ones W-018 needs.** Bounce, complaint and
  unsubscribe are well-specified, provider-reported, and unsubscribe must write
  through to consent (W-013) — which is a rule the platform needs for every
  channel and can only be designed against a channel that reports it.

**Sms looks simpler and is worse for this purpose.** One field, 160 characters,
no rendering — and delivery receipts that are unreliable, often absent, and vary
by carrier. It would prove the adapter contract against the channel least able
to demonstrate the thing the contract exists for, which is recording what
actually happened. Build it second, where the contract is already fixed.

**Outbound_call is not a channel this platform can deliver on at all** and
should be honest about it: two creatives exist across 251 offers (G-044), and
the "adapter" is a human reading a screen. Its delivery mode is `caller`, like
web, with the agent console as the caller.

### 5. Binding, and the return path

The delivery attempt carries `decisionId` and is refused if that decision does
not exist — the same invariant `recordOutcome` already enforces. The join is:

```
decision → delivery attempt → providerRef → provider webhook → outcome
```

Outcomes continue to arrive through `POST /outcomes/{tenantId}/{decisionId}`
unchanged. What the delivery record adds is the ability to resolve a webhook
that only knows `providerRef` back to a decision id, which is the step that
currently has no answer.

### 6. When delivery fails after the decision succeeded

**The decision stands.** It is in the ledger, hashed and replayable, and a failed
send does not make it wrong. Three things follow that the platform gets wrong
today:

**Frequency caps count deliveries, not attempts.** A cap consumed by a message
that never arrived locks a customer out of a contact they never received. Today
`contactHistory` is *supplied by the caller* — the storefront types it into a
form — so the platform has no opinion at all. Once it owns delivery it must have
one, and this is it. The attempt is still recorded, so repeated failure is
visible rather than an infinite retry.

**A hard failure is information about the address, not about the offer.** A
bounce writes through to contactability (W-013). It must not land in the offer's
performance, where it would look like an offer nobody wanted.

**`/performance` separates the two.** A decision whose delivery failed is
currently offered-and-unmeasured, indistinguishable from a channel that simply
did not report back. With delivery states it is distinguishable, and the report
stops attributing a delivery failure to the offer.

### 7. The corpus keeps deciding, and stops being silent about it

**Yes — it should keep deciding on channels with no adapter.** A decision is not
a delivery, the engine's behaviour on an sms decision is real and worth
demonstrating, and a corpus confined to web would misrepresent the product in
the other direction.

**But provenance is answering a different question.** It says *synthetic* —
this describes no real customer — and that is true and well enforced: it survives
a `curl`, an export and a screenshot, by design. It says nothing about
deliverability, and those are two independent claims. A reviewer reading the
channel breakdown on `/performance` sees 2,145 web decisions that reached
somebody sitting beside 8,255 that could not have, with the same marker on both.

So: a decision on a placement with no delivery mode is marked undeliverable, on
the same terms provenance already established — in the payload, not the
interface. `/performance` splits the channel breakdown into delivered and
undeliverable rather than presenting one number, and the coverage screen names
the four channels as having no far end rather than counting content holes in
them.

**What this is not.** It is not a reason to delete the seeded outbound
decisions, and it is not solved by a badge. It is the same rule the provenance
work established, applied to the second thing the demo is quietly asserting.

## Phase one, as accepted

**Not the adapter. The record and the split, with nothing sending behind them.**

1. `Placement.active` → `decidable` + `delivery`, through the spec, the client,
   `decidePlacement`, the storefront and the coverage screen.
2. The delivery attempt record and its states, bound to a decision id, refused
   without one.
3. `/performance` and `/creatives?view=coverage` reading them, so the corpus's
   8,255 undeliverable decisions are a number on a screen.

This needs **zero credentials, zero egress and zero new infrastructure**, it is
the half every channel needs whichever adapter comes first, and it makes the
present state honest before adding capability to it. A platform that says "these
four channels have no far end" is in better shape than one that quietly implies
they do, even before anything sends.

Then the email adapter behind it — and **not before W-008**, because there is no
recipient address in the data model and an adapter with nowhere to send is not a
smaller version of an adapter.

## What phase one found

**The two questions are easy to conflate in the other direction too.** Wiring
the split, `NO_DELIVERABLE_CREATIVE` and `offerMayBeActive` were briefly pointed
at the *deliverable* channel set, which refused `next-best-action` outright: the
flow answers an sms slot, and an offer whose only content is an sms creative
then looked undeliverable. The offer was fine. The channel has no adapter.

So the rule is worth stating explicitly, because it was got wrong within an hour
of the split being made:

- **Authoring guards ask about content**, and take the channels a flow's slots
  are *decided* for. Whether anything sends the result is not a reason to refuse
  an offer or a flow.
- **The coverage screen asks about delivery**, and takes the channels with a
  delivery mode.

Both were `active` before, so neither distinction could be drawn at all.
`registry.spec.ts` caught it as a republish of identical content being refused —
a test about idempotency finding a semantics error, which is the argument for
having it.

## Consequences

The first thing to go wrong: splitting `active` is a breaking spec change on a
schema the storefront, the coverage screen, `decidePlacement` and the contract
suite all read. It is additive only if `active` is retained as a deprecated
alias, and retaining it re-creates the ambiguity this is meant to end. The
migration should be a single slice that moves every reader, and whoever runs
`npm run generate` next will see the client fail to compile — which is the
intended behaviour and should be expected rather than discovered.

The second: `/performance` will get worse-looking. Splitting the channel
breakdown moves 79% of the corpus into a column labelled undeliverable, and the
demo will show a platform that decides far more than it delivers. That is
accurate, and somebody will ask for it to be softened.

`suppressed` will be the most common delivery state in the seeded tenant by an
order of magnitude, which is a strange-looking corpus and a true one.

Placements are not part of the hashed catalogue snapshot, so none of this moves
a chain hash. Delivery is downstream of the decision by construction, which is
the property that makes this affordable.

## Alternatives considered

**Make delivery an outcome type — add `sent` and `bounced` to `OutcomeType`.**
Cheapest by a distance, and it is what most platforms do. Rejected because the
outcome funnel is nested and monotone by design — conversion ⊆ acceptance ⊆
click ⊆ impression — and `buildPerformance` computes rates over it. Inserting
the platform's own actions into that chain makes "click rate" a ratio over a
denominator that mixes what the customer did with what we did, and the corpus
work in G-041 is a recent demonstration of how expensive that class of error is
to find.

**Deliver from inside the decision.** Return the slate *and* send it in one
call. Tempting because it removes a moving part, and it would break the no-egress
property that `no-egress.test.ts` guards, put provider latency inside the 50ms
budget, and make a decision unreplayable — replay would either re-send or
diverge.

**One `deliverable: boolean` instead of a delivery object.** Half the fix, and it
loses the distinction that matters most: web and outbound_call are delivered by a
caller, email and sms by an adapter the platform runs. A boolean cannot say which,
and "who sends this" is the question the whole ADR is about.

**Build the adapter first and split `active` later.** The order most likely to be
chosen under pressure. It would produce one working channel and leave the model
still unable to say what is true of the other four, and the honesty problem —
which is the one currently in front of people — would be no better than it is
today.

**Say nothing about undeliverable channels and rely on the synthetic marker.**
Considered seriously, because provenance is well built and adding a second marker
risks diluting it. Rejected because the two claims are independent: a real tenant
with no email adapter would have recorded decisions that were equally
undeliverable, and the synthetic marker would say nothing about them.
