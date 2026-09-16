# Current directive

**Issued:** Tuesday 15 September 2026, by the product owner, superseding the demo-week directive issued the same morning.
**Why:** the internal demo on Friday 18 September 2026 is no longer the priority. No more work is aimed at it. The platform's data layer is: which operations run against a real store, what each remaining one needs, and what has to land before it.
**Expires:** not set. It stays in force until the product owner replaces it.

This file exists so these constraints live in the repository rather than in a chat message.

## In scope

1. This amendment.
2. A read-only survey of the data layer, before any code. It answers five questions:
   1. Which operations the decision service (`planes/execution`) serves against PostgreSQL today, and which still run through the console's development API over `apps/console/mocks/store.ts`.
   2. For each remaining operation, what a real implementation needs: schema, store, migration, service route and generated client method.
   3. Which screens show figures that are fixture values with no real source, and what each would have to be computed from.
   4. What has to land first. The product owner's assumption is tenant provisioning and authentication; the survey confirms or corrects it.
   5. The order, in slices, with an honest estimate and the parts that cannot be sized yet.
3. Then stop. The product owner picks the first slice from the survey.

## The data-layer order

Delivered on 2026-09-15 by the survey, amended the same day, and **re-ordered on 2026-09-16** after slices 1 to 3 landed. Each slice is its own pull request. The product owner picks the next; estimates are in working days, and "unsized" means the slice waits on a decision that fixes its size.

Completed slices keep their original numbers. Everything after slice 3 was
renumbered by the re-order; nothing outside this file referred to those numbers.

### ADR-019 is accepted and mostly unbuilt

Parked on 2026-09-16, deliberately, so that a part-built state does not read as
a finished one later.

**What is built.** Clause 8 only: the tie-break is the artifact's declared order
rather than the candidate's name, in both engines, and a scored candidate the
artifact never declared is a refusal rather than a silent first place (#98). It
went first because it makes the rename in the rest of the split unable to move
a decision, and because it was provably free — measured over all 10,400 seeded
decisions, no decision turns on the tie-break, and the diff after the change
showed 0 ids moved, 0 winners, and every figure identical.

**What is accepted and not built.** Clauses 1 to 6 — the model. One offer to
many actions; what an action carries and what it inherits; the record storing
both the action key and the offer id; `PolicyScope` gaining an action level and
what "cap this offer" then means; creatives hanging off the action; experiment
arms attaching to actions. Nothing in the tree implements any of it: an offer
still carries the `key` used as the action, and `docs/CAPABILITIES.md` still
reads PARTIAL for that row, which is the honest state.

**Why it paused.** The surface was measured before starting rather than
discovered during: 28 files reference `CatalogueSnapshot`, 91 reference
creatives or `offerId`, `catalogue_creatives` carries an `offer_id` foreign key
that needs an expand-only migration, and the spec, the generated client, the
Kotlin domain and the console screens all move together. That is the 2–4 days
the estimate says, and it is more than one sitting — so it stopped at the clause
that stands alone rather than leaving the model half-applied, which is the state
this note exists to prevent.

**What clause 7 costs when it resumes.** Every decision id moves, because the id
is the chain hash: 10,400 ids and every foreign key with them, the outcome model
re-rolling because its draws are keyed on the id, and every pinned figure
re-pinned deliberately with the old and new both recorded. Clause 9's control
group — `canonical-corpus.json` byte-identical and `inputSnapshotHash`
unchanged on all 40 cases — is what says the change went where it was meant to.

### Why the order changed

Four findings from slices 2b and 3, each checked against the tree rather than
remembered:

1. **Slice 4 as it stood would have split the decision history again.** The
   `e2e` job has no PostgreSQL service — `verify` and `execution-image` have
   one, that job does not — and the decision service falls back to memory stores
   without `METIS_DATABASE_URL`. "The console calls the service" would give the
   console its seeded in-memory ledger and the service an empty one, so a
   decision made in the console would land in a history `/decisions` never
   reads. That is what slice 3 deleted, reappearing at a process boundary. The
   console's decisions and its reads therefore move together, over a store both
   processes share.
2. **The aggregates ADR does not need writing; the slice was missing.**
   [ADR-014](adr/ADR-014-the-data-spine.md) §10 is Accepted and already decides
   it: *"W-011 is a per-subject read over the ledger, not a new store"*, rollups
   declared with `origin: interaction`, windows relative to
   `request.occurredAt`, contacts counting deliveries rather than attempts,
   read in the resolution phase and hashed into the snapshot, with
   `request.contactHistory` becoming additive. §9 settles features the same
   way. The order covered §3 and §5 and never named §10, which is the slice that
   makes the frequency & suppression policy read the platform's own counts
   instead of the caller's — `docs/review/INBOUND_VS_CDH.md` finding I-3's linchpin.
3. **The `offer`/`action` split goes before anything is keyed per action.**
   [W-014](BACKLOG.md) says every chain hash moves when it lands. Rollups are
   keyed per action — contacts per action, last outcome per action — and so are
   suppression caps and experiment arms. Doing §10 first means keying all of it
   on a conflated identity and doing it twice. The cost is lowest now: the
   corpus is regenerated by a seed job, `npm run seed:ledger -- --reset` exists
   for a database that holds one, and the figures it moves are pinned in one
   file.
4. **G-068 sits where it sat, but for two reasons rather than three.** Keying
   the subject unblocks the profile store and, through it, the bias metric. It
   does **not** change a provenance label: a synthetic demo ledger stays
   synthetic after keying, and what keying buys is that `real` becomes
   possible at all. The dependency on tenant provisioning is real —
   [ADR-016](adr/ADR-016-deployment-operations-and-scale.md) §2 has
   `metis tenant create` create the key namespace and the tenant row reference
   it — so it stays behind provisioning unless the profile store is pulled
   forward with it.

Accepted by the product owner on 2026-09-16, with one change to what was
proposed: the simulation figures go first and take the removal rather than a
label, because a fabricated fairness verdict beside `ran: true` when nothing
ran is worse than an empty screen.

| # | Slice | Estimate | State |
|---|---|---|---|
| 1 | ADR-018: the seeded corpus becomes ledger rows, and screens read only the ledger | 0.5 | Accepted 2026-09-15 |
| 2a | The seed job; the in-memory seed for development and e2e, restored on reset; the 45-second warm-up threshold; the per-decision tests for decisions, the delivery gate and outcomes; the outcome reads corrected so the ledger's events are not counted twice (ADR-018 §2, §3, §5, §6) | 1–1.5 | Merged, #90 |
| 2b | Ledger query fields and their index migration; decision search on the ledger, customer by subject hash; `npm run seed:ledger` over PostgreSQL with `--reset`, refused unless the ledger is synthetic and `--tenant` names the tenant | 1–1.5 | Merged, #91 |
| 3 | Performance, the policy funnel, flow volume and outcomes read the ledger alone; the committed index and the projection's read path deleted | 1–2 | Merged, #93 |
| 4 | A change set carries a simulation only when one has run: `simulation` optional in the contract, the authored `passed`, `populationSize`, `projectedMarginDelta` and `biasRatio` removed from the fixtures and the three screens that render them, and `/simulations` saying plainly that none has run (ADR-018 §7) | 0.5–1.5 | |
| 5 | The `offer`/`action` split ([W-014](BACKLOG.md)), decided by [ADR-019](adr/ADR-019-an-action-is-an-offer-made-decidable.md). **Clause 8 shipped in #98; clauses 1–6 are accepted and unbuilt — see the note below.** | 2–4 | Part built |
| 6 | Interaction rollups read per subject (ADR-014 §10): declared with `origin: interaction`, windows relative to `request.occurredAt`, contacts counting deliveries, read in resolution and hashed into the snapshot; `request.contactHistory` becomes additive | 2–3 | |
| 7 | Frequency and suppression caps over those rollups ([W-012](BACKLOG.md)): the platform's own counts, a stable reason code per suppression, both engines agreeing | 1–2 | |
| 8 | ADR: identity, closing G-115 — who may call the decision service, and for which tenant | 0.5–1 to write | |
| 9 | The console decides **and** reads through the decision service (ADR-016 §1), over a store both processes share, with the e2e harness starting the service against it. Paired: either half alone leaves two histories | 2–4 | |
| 10 | Tenant provisioning (ADR-016 §2): control-plane store, `tenants`, `metis tenant create`, tenant settings moved, refusals | 2–3 | |
| 11 | Users and sessions, as the identity ADR decides | unsized | |
| 12 | Autonomy settings into the governance store, audited | 0.5–1 | |
| 13 | Protect the subject in the ledger: a keyed subject hash and per-subject encryption (G-068, ADR-004 clauses 1–3), after the key store is chosen. It follows tenant provisioning, because keys live in the tenant's namespace, and precedes the profile store, which ADR-004's protection has to cover | unsized until the key store is chosen | |
| 14 | The profile store and durable intake (ADR-014 §3 and §5) | 3–5 | |
| 15 | Simulation over ledger history, with a bias metric decided by ADR — the figures slice 4 removed, computed | unsized | |
| 16 | A durable connector call log | 0.5–1 | |
| 17 | Agent activity | out until an agent runtime exists | |

## Do not touch

Nothing, except what the survey shows has to come first. Those items go here, named, once the survey is delivered.

New ADRs are allowed again. This work needs them.

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings, as `CLAUDE.md` and `docs/ux-conformance-baseline.json` already require.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.

## What this replaces

The demo-week directive, issued and amended on 15 September 2026, pointed every change at Friday's demo. Everything it put in scope was merged that day, from #74 to #86: the decision trace fixes; the Architect home fixes and UX pass; the trace UX pass; the approvals badge; the sign-in page; `/decisions` opening on "Offer made"; G-133; and the regenerated `docs/DEMO_CLAIMS.md`. Its freeze, rehearsal and regression pass on Thursday 17 September are withdrawn with it. Its record of the environment label stands as a fact about any demo build: `NEXT_PUBLIC_ENV_LABEL=Demo` is set on the machine before the build and is not committed.
