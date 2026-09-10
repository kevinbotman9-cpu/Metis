# ADR-012: An offer that wins a channel it has no creative for

**Status:** Proposed
**Date:** 2026-09-09 (proposed)
**Owner:** Product owner
**Decision needed by:** 2026-10-09. After that date the number below is a
number the demo has been showing for a month, and Spine 5 — the CSR's ranked
slate — is the next thing that would be built on top of a ranking that can
return an action nobody can deliver. Deciding late costs a second consumer of
the same wrong answer.
**Constrains:** `packages/compiler/src/decision-flow/compile.ts`,
`packages/core/src/creative.ts`, `packages/runtime/src/deterministic`,
`docs/conformance/*`, `apps/console/app/offers`.
**Arises from:** G-041's second half. Found on 2026-09-09 while correcting the
seeded outcome generator, which had been reporting impressions for offers that
could not have reached anybody.

## Context

**2,122 of the 3,425 decisions in the seeded corpus that offered something
picked an offer with no active creative on the channel that won.** That is 62%.
It is not spread evenly:

| Channel | Decisions won | Winner cannot render | |
|---|---|---|---|
| outbound_call | 700 | 689 | 98% |
| push | 696 | 561 | 81% |
| sms | 645 | 496 | 77% |
| email | 646 | 187 | 29% |
| web | 738 | 189 | 26% |

The catalogue says the same thing from the other side. Of 202 active offers,
**38 have no active creative on any channel at all**, and by channel the offers
with nothing to send are: outbound_call 200, push 133, web 127, email 124,
sms 123.

### Two guards exist, and both are channel-blind

**`offerMayBeActive`** (`packages/core/src/creative.ts:238`) is
`creatives.some((c) => c.active)`. One active email creative makes an offer
activatable, and it may then win a web placement. Its own doc comment describes
the failure it does not prevent: *"an offer could be active, win a decision, and
have nothing to render — which is exactly what the storefront's 'no creative for
this channel' state is showing when it appears."*

**`NO_DELIVERABLE_CREATIVE`** (`compile.ts:653`) fires when
`p.creativeIds.length === 0` — no creative at all, active or not, on any
channel. Its own remedy text asks for more than it checks: *"Add at least one
active creative for a channel this flow serves."* It checks neither `active` nor
the channel.

So an offer with a single active email creative passes both, and the platform
will rank it for a web slot.

### What happens today, at each exit

- **The storefront** renders *"X won this slot, and has no web creative for it.
  The platform has no content library yet, so there is nothing to render"* — a
  notice with no call to action. Since 2026-09-09 it correctly reports no
  impression for that slot. It is the only surface that tells the truth about
  this, and it tells it to whoever is looking at the demo, not to whoever owns
  the catalogue.
- **The decision record** shows the offer winning arbitration, with no
  elimination and no diagnostic. A compliance officer reading the trace sees a
  clean decision. Nothing in it says the customer saw nothing.
- **`/performance`** now excludes these decisions from `measured`, so they
  appear as offered-and-unmeasured — indistinguishable from a channel that
  simply did not report back.
- **The compiler** passes the flow.
- **`/offers`** shows a creative-coverage bar per offer. It is the closest thing
  to a surface for this and it is per-offer, not per-channel, and nothing
  aggregates it.

### Why this is not simply a seeding artefact

It would be comfortable to call this a thin demo catalogue. Two things say
otherwise. All four **active** placements are web (`weekly_offers_send` on email
is inactive), yet the corpus decides across five channels — so the mismatch is
in the model, not only in the data. And the guards above would let a real tenant
do exactly the same thing: nothing in the platform relates a creative's channel
to the channel a decision is made for.

## The options

### A. Refuse to rank it

Make renderability an eligibility condition inside the decision: a candidate
with no active creative for the request's channel is eliminated before
arbitration, with its own reason code.

The catalogue snapshot the engine hashes already carries creatives
(`CatalogueSnapshotRecord.creatives`), so the input exists and replay stays
deterministic — a historical decision replays against its recorded snapshot and
gets the same answer.

**What it costs.** A ninth entry in `REASON_CODES`
(`packages/runtime/src/deterministic/types.ts:198`), which
`decision-conformance.test.ts` requires the corpus to exercise. And it changes
what a decision *is*, so **every chain hash in every conformance corpus moves**,
in both engines. That is the same class of change as the 2026-09-05 rename, and
it is the reason this is an ADR rather than a patch. It also makes the engine
depend on content, which ADR-001's two-plane split has so far kept apart:
arbitration currently reasons about offers, not about what fills them.

### B. Call it a catalogue defect and surface it

Leave the decision alone. Tighten the two guards and give the gap a screen:

1. `NO_DELIVERABLE_CREATIVE` checks for an **active** creative on a channel the
   flow's placements actually serve, which is what its remedy text already
   claims. Today's version would still pass an offer whose only creative is
   switched off.
2. `offerMayBeActive` takes the channels the tenant serves, so activating an
   offer with nothing to send on any of them is refused where the person can
   still fix it.
3. A coverage surface: offers × channels, with the holes visible. `/creatives`
   already has the data and a "No placement" lens; this is the same question
   asked per channel.

**What it costs.** Nothing hashed moves and no corpus regenerates. But a
decision can still pick an offer nobody can deliver — it just becomes somebody's
job to notice. And (1) would fail the seeded catalogue's own flows on day one,
which is either the point or a blocker depending on whether the fixtures get
creatives first.

### C. Both

B first, because it is cheap and it makes the size of the problem visible to the
person who can fix it. A afterwards, once the catalogue is not itself the
largest source of the failure — running A against today's fixtures would
eliminate 62% of winning candidates and leave the demo emptier than the defect
does.

## Recommendation, not a decision

**C, sequenced.** The argument for doing B alone is that ranking is about offers
and delivery is about content, and folding content availability into arbitration
puts a channel concern inside the decision core for the first time. The argument
for eventually doing A is the one the trace makes: a decision record that shows
a clean win for something the customer could never have been shown is a record
that is true about arbitration and false about the world, and this product's
central claim is that the trace is what you can rely on.

The thing that should not happen is A alone. It would make the corpus look
healthy by removing the evidence — 62% of wins would become eliminations, the
storefront's "no creative" notice would stop appearing, and the catalogue would
still have 38 active offers with nothing to send on any channel.

**What is not being decided here** is whether the seeded catalogue should get
the missing creatives. That is W-015 and it is a different question: it changes
what the demo shows, not what the platform guarantees.

## Consequences

Under C, the first thing that goes wrong is that (B1) turns
`NO_DELIVERABLE_CREATIVE` red on the seeded flows, and whoever runs
`npm run test:compiler` next sees it before anybody has decided whether the
fixtures or the check is wrong. That is deliberate — it is the same failure the
storefront has been rendering to reviewers for weeks — but it should be expected
rather than discovered.

Under A, every corpus regenerates and `engines/kotlin` must land the same reason
code in the same release, or the two engines disagree and the conformance suite
says so.

Under B alone, the trace keeps showing clean wins for undeliverable offers, and
the next person to build on ranking — Spine 5's ranked slate for a CSR —
inherits it.

## Alternatives considered

**Filter at delivery instead: let the offer win, and have the caller skip it.**
This is what the storefront does now, and it is why the bug reached
`/performance`: every consumer has to remember, and the first one that forgets
reports an impression. It also makes the slate a lie — `rankedCount` and the
entries a caller receives would include things the caller must discard, so slate
composition rules (W-028) would compose over candidates that are not really
there.

**Require every offer to have a creative on every channel.** Refused: it is a
modelling error dressed as a constraint. An offer that is genuinely web-only is
a normal thing, and the platform should be able to say so — which is exactly
what the channel-aware version of the guard would let it say.

**Treat it as a data-quality report only, with no enforcement anywhere.** This
is B without (1) and (2). It was tempting because it breaks nothing, and it is
what `/offers`' coverage bar already half does. It loses because a report nobody
is required to act on is how 38 offers came to be active with nothing to send.
