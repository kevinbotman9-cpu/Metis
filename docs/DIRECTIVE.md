# Current directive

**Issued:** Saturday 19 September 2026, by the product owner, replacing the framing of the data-layer order issued on 15 September.
**Why:** the data layer needed an aim, not a list. The order below had become a queue of slices with no statement of what they add up to.
**Expires:** not set. It stays in force until the product owner replaces it.

This file exists so the aim and its constraints live in the repository rather than in a chat message.

## The aim: held, provenanced, erasable

**Metis holds the customer data a decision needs, knows where every value came
from and how fresh it is, and can destroy it provably.**

- **Held.** A decision reads what it needs from Metis's own store at decision
  time, not from a caller's request body and not from a synchronous call to
  somebody else's system. What is held is a **decisioning-shaped extract** — the
  declared fields a decision reads, ADR-014 §3's projection — and never a
  master customer record. The vision's non-goals stand (*"Not building a CRM,
  CDP, campaign execution engine or content management system. Integrate."*,
  `METIS_Vision_and_Build_Plan.md` §12): identity resolution, the profile of
  record and the consent of record stay with the systems that own them
  (ADR-014 §1).
- **Provenanced.** Every value a decision used can say where it came from and
  when it was true: the source, the connector or the request, and its age at the
  moment of the decision. ADR-022 records the origin of every field today;
  freshness (`asOf`, `maxAge`) arrives with the profile store.
- **Erasable.** Every value that identifies or describes a customer is held under
  that customer's key, and erasure is **the destruction of that key**, with a
  record that it happened and a check anyone can run — cryptographic, not a
  deletion job. The rows stay where they are, the chain hashes stay valid, and
  the append-only triggers are never bypassed (ADR-004). A backup restored later
  re-applies every erasure before it serves. **Erasure is provable, not
  instant:** a key already unwrapped in a process can be used for up to 60
  seconds after it is destroyed (ADR-025 §3), and wherever the product says
  erasure is provable it says "within 60 seconds" in the same place.

**This is not new architecture.** ADR-004 decided crypto-shredding with a
per-subject key; ADR-014 decided the projection, the origins and the boundary;
the schema's `origin` on every field and the ledger's subject column were built
for it. It has never been built. Every step below is a step toward it.

## The steps

Each step lands whole or not at all, as `CLAUDE.md`'s slices do. The **Order**
column says, for each constraint on a step's position, whether a dependency
**forces** it — the step cannot be built without the other — or whether it was
**chosen**, and so is open to being changed.

| Step | Toward | What | After | Order | State |
|---|---|---|---|---|---|
| A | Erasable | **The key store**: decided by ADR — store, cipher, lifecycle, what ADR-004 left open — then built: a per-tenant key provider, per-subject keys, erasure with a record and a check | — | **Chosen** to go first: nothing forces it ahead of C or F, but B, D and G cannot start without it, so it unblocks the most | [ADR-025](adr/ADR-025-the-key-store.md) accepted 2026-09-19, with §5's Version A; being built |
| B | Erasable | **The subject protected in the ledger**: the record and ADR-025 §5's encrypted projection under the subject key, the keyed subject column, `outcome_events.detail` under the key, and every ledger reset once (was slice 13, G-068). **The reset destroys `metis_dev`**: the decisions made by hand through the storefront, and the 2026-09-19 dump, which its restore notes warned a later commit might refuse — this is that commit. The product owner is told before it runs, to decide whether to drive the storefront again first | A | **Forced** after A: there is no key without it. **Chosen** before C: a synthetic tenant's key can be a file (ADR-025 §1), so B does not need provisioning; a `real` tenant does | |
| B′ | Erasable | **Decision search that does not degrade with tenant size** — what ADR-025 §5's Version A costs. `/decisions` filters and totals become a scan of the tenant's history under encryption: 309 ms per page at 10,400 decisions, measured, and growing linearly. One of three: **backward paging** through time until a page of matches is found; **estimated totals** instead of an exact count; or **a per-tenant search index held under a key**. Which one is decided when the step starts | B | **Decided by the product owner** (2026-09-19): with B or straight after it, because `/decisions` is the screen an auditor uses to find a decision, and a search that degrades with history must not be discovered at a million rows | |
| C | Held | **Tenant provisioning** (ADR-016 §2): `metis tenant create`, recording the tenant's data class and key provider (was slice 10) | A | **Chosen** after A: provisioning could land first and add the two fields later; doing it after A means recording them once | |
| D | Held, provenanced | **The profile store and durable intake** (ADR-014 §3, §5): one encrypted row per subject, each value stamped with source and `asOf`, read once per decision (was slice 14) | A; B; C | **Forced** after A: ADR-004 forbids a store of subject data outside the key. **Chosen** after B and C: the profile store needs keys, not the protected ledger or provisioning — but putting it after B means the ledger's subject column and the profile's are built the same way once | |
| E | Provenanced | **Freshness in the decision**: `maxAge` per field, a stale value treated as absent and recorded as stale, hashed (ADR-014 §3, G-056) | D | **Forced** after D for profile fields, whose `asOf` the profile store supplies. **Chosen** for connector fields, which carry `observedAt` today (ADR-022 §5) and could have freshness earlier | |
| F | Held | **The decision service reads the ledger** (G-150), and the console decides and reads through it (was slice 9) | the identity ADR (was slice 8); B | **Forced** after the identity ADR, as the data-layer order recorded: who may call the service decides what it may read. **Chosen** after B: the service's cap read would otherwise be written for a plaintext ledger and rewritten for an encrypted one | |
| G | Erasable | **Replay of live decisions** (G-009): the input snapshot kept, under the subject key, so a live decision replays and an erased one fails legibly (ADR-004 §3) | A; B | **Forced** after A and B: the snapshot is subject data and may only be stored under the key, in the protected ledger | |
| H | Provenanced | **Simulation and the bias metric** over held, keyed history (was slice 15) | D; an ADR for the metric | **Forced** after D: a bias metric compares outcomes across attributes Metis does not hold until the profile store does. **Forced** after its ADR: the metric is undecided | |
| — | | The identity ADR (was slice 8), users and sessions (was 11), autonomy settings (was 12), the connector call log (was 16) | | Not steps toward the aim. The identity ADR is taken when F needs it; the rest when a step needs them | |

### Outside the order

Decided by the product owner on 2026-09-19. Neither is a step toward the aim.

- **[G-164](gaps.md) first**: the ledger refuses a repeated outcome. A duplicate
  doubles realised value while every count stays right, so nothing on the page
  contradicts it — and the refusal is small.
- **[G-159](gaps.md) after the key store**: the grid excludes what the page
  already shows. It changes the engine, and would collide with step B's changes
  to the ledger's reads.

## Do not touch

- **No `real` tenant, anywhere, until steps A and B are built.** The ledger
  already refuses to start with `METIS_DATA_CLASS=real` and a database
  (ADR-016 §4). That refusal is lifted by step B and by nothing else.
- **No store for customer data outside the key** (ADR-004): no cache, no Redis,
  no export, and no log line carrying a value a decision read.

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings, as `CLAUDE.md` and `docs/ux-conformance-baseline.json` already require.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- An ADR goes Proposed and stops; the product owner decides.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.

## The data-layer order, as it stood

Issued on 15 September 2026 and re-ordered on 16 September; replaced as a
framing on 19 September. Its completed slices are the record of what was
built. The rest are re-stated above as steps toward the aim, or set aside.

| # | Slice | State |
|---|---|---|
| 1 | ADR-018: the seeded corpus becomes ledger rows, and screens read only the ledger | Accepted 2026-09-15 |
| 2a | The seed job; the in-memory seed; the per-decision seed checks | Merged, #90 |
| 2b | Ledger query fields; decision search on the ledger; `npm run seed:ledger` over PostgreSQL | Merged, #91 |
| 3 | The reports read the ledger alone; the committed index deleted | Merged, #93 |
| 4 | A change set carries a simulation only when one has run | Merged, #95 |
| 5 | The `offer`/`action` split (ADR-019) and the recorded slate (ADR-020), in one reseed with ADR-022 and ADR-021 §9's fixture | Clause 8 in #98; the rest in the reseed, #123 |
| 6–7 | Frequency caps count the platform's own contacts (ADR-021) | #114; placement decisions only, until step F |
| 8 | ADR: identity, closing G-115 | Set aside; taken when step F needs it |
| 9 | The console decides and reads through the decision service | Step F |
| 10 | Tenant provisioning | Step C |
| 11 | Users and sessions | Set aside |
| 12 | Autonomy settings into the governance store | Set aside |
| 13 | Protect the subject in the ledger | Step B |
| 14 | The profile store and durable intake | Step D |
| 15 | Simulation over ledger history, with a bias metric | Step H |
| 16 | A durable connector call log | Set aside |
| 17 | Agent activity | Out until an agent runtime exists |

## What this replaces

The data-layer directive of 15 September 2026 and its order, whose record is
kept above. Before it, the demo-week directive of the same morning, whose record
of the environment label still stands: `NEXT_PUBLIC_ENV_LABEL=Demo` is set on the
machine before a demo build and is not committed.
