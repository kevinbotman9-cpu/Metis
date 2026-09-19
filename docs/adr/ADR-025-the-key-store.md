# ADR-025: The key store — envelope keys under a per-tenant key, AES-256-GCM, and erasure as destruction with a record

**Status:** Accepted
**Date:** 2026-09-19 (proposed)
**Decided:** 2026-09-19
**Deciders:** Product owner
**Owner:** Product owner
**Accepted with §5's Version A**, the encrypted projection: ADR-004 stays whole.
The reasons are the product owner's and are recorded in §5. Added on
acceptance: §3's cache bound makes erasure take up to 60 seconds, and the product
says so wherever it says erasure is provable.
**Amended on building (step A, 2026-09-19):** §1 — the tenant pseudonym has a
key of its own, wrapped under the tenant key; §3 — what an erasure record holds,
and that it is written before the key is destroyed; Consequences — the record's
pseudonym is a residual disclosure, named; and no key leaves in an export.
**Decision needed by:** — decided. Built as step A of `docs/DIRECTIVE.md`, before
step B (protecting the subject in the ledger).
**Constrains:** a new `packages/keys`; `packages/ledger` (the record, the subject
column, the cap read, the report and search reads); the profile store (ADR-014
§3, unbuilt); tenant provisioning (ADR-016 §2, unbuilt); `planes/execution` and
the console's development API; `METIS_DATA_CLASS` (ADR-016 §4).
**Decides what ADR-004 left open:** *"The key store implementation, the cipher,
the rotation policy, and whether tenant-level keys sit above subject-level
ones."* (ADR-004, Consequences.)
**Arises from:** the standing aim set on 2026-09-19 — Metis holds the customer
data a decision needs, knows where every value came from and how fresh it is,
and can destroy it provably (`docs/DIRECTIVE.md`).

## Context

### What ADR-004 decides, and what it leaves

ADR-004 (Accepted 2026-09-09, amended and re-accepted 2026-09-11) decides the
shape:

- *"Every field that identifies or describes a subject is encrypted at rest with
  a key held per `(tenantId, subjectHash)`. The keys live in a key store separate
  from the data."* (§1)
- *"Erasing a subject destroys that key. The rows stay exactly where they are,
  the chain hashes stay valid, the append-only triggers are never bypassed, and
  the plaintext becomes unrecoverable."* (§2)
- A replay of an erased subject's decision *"fails explicitly"*, naming when and
  under what request (§3). What survives erasure is *"the decision id, the chain
  hash, the flow and version, the timestamp, and the fact that an erasure
  occurred"* (§4). Retention expiry destroys keys by the same mechanism (§5).
- The amendment: the ledger's unit of encryption is **the whole record**; the
  subject column is **`HMAC(subjectKey, customerRef)`**, reached through a
  **tenant pseudonym** `HMAC(tenantKey, customerRef)` held in the key store;
  `outcome_events.detail` gets a rule; and **no deployment may write the ledger
  to PostgreSQL with real customer references** until those exist.

It leaves the store, the cipher, rotation and the key hierarchy open.

**One of its premises no longer holds.** Its Consequences said *"The decision
path does not read the ledger, so the p99 gate is unaffected."* Since
2026-09-17, ADR-021's frequency caps read the customer's contacts from the ledger
on every capped placement decision, and §9's scoped caps read the slate inside
the record. That sentence is corrected in ADR-004 itself, in the same change as
this ADR, and the read path is measured below instead of assumed.

### What exists today

- **No key handling anywhere.** No cipher, no KMS client and no key table, in
  any package or engine (searched 2026-09-19).
- **`METIS_DATA_CLASS`** (ADR-016 §4): `synthetic` or `real`, per process. The
  decision service requires it with no default. The ledger defaults it to
  `synthetic`, and **refuses to start** when it is `real` and a database is
  configured (`packages/ledger/src/create-store.ts`), because the record is
  plaintext. It is a property of the deployment, not of a tenant.
- **The subject hash is unkeyed** (G-068): `sha256(len:tenantId:customerRef)`
  (`packages/ledger/src/ledger.ts`). Anyone with a list of candidate identifiers
  can recompute it. `delivery_attempts.subject_hash` (migration 003) copies it,
  and the caps count by it.
- **The ledger queries inside the plaintext record, in SQL:**
  - expression indexes on the decision's channel and winner (migration 002);
  - `/decisions` filters on them, with a total;
  - the cap count reads the winner and every slate entry (`postgres-store.ts`).
- **The reports already read every record into the application**
  (`buildPerformance`, the funnel, flow volume). Encryption adds a decryption per
  record there and nothing structural.

### The options for where a key lives

| | In the database | Per-subject keys in a cloud KMS | Envelope: a per-tenant key, subject keys wrapped under it |
|---|---|---|---|
| **What it is** | Subject keys as rows beside the data | Each subject key is a KMS key, or every use is a KMS call | A tenant key held outside the database; each subject key random, stored in the database **wrapped** under the tenant key |
| **Build** | Smallest: a table | Little code, a large dependency: a cloud SDK, credentials, a variant per cloud | A table, wrap and unwrap, and a provider for where the tenant key lives |
| **Run** | Nothing new | A network call per unwrap on the hot path. KMS keys are billed per key, so one per subject does not scale to a customer base | One KMS call per tenant per process start (or per tenant-key cache period), none per decision |
| **Laptop** | Trivial | Cloud credentials or an emulator for every developer and every CI job | The tenant key is a local file for a synthetic tenant; no cloud |
| **Provable erasure** | **Weak.** A database backup holds the keys beside the ciphertext, so restoring it restores the data | Strong, but deletion is asynchronous where the KMS enforces a waiting period before a key is gone | Strong, **if** a restore re-applies erasures (§3). A backup holds wrapped keys, and the tenant key opens them |

### What erasure has to do to be provable

1. **Leave no plaintext.** Every store holding subject data holds it under the
   subject key: the ledger record, `outcome_events.detail`, the profile store,
   any cache. A cache of unwrapped keys or plaintext forgets within a stated
   bound.
2. **Leave nothing linkable.** After the subject key is gone the rows must not be
   findable from the identifier: the subject column is keyed on the subject key
   (ADR-004's amendment), and the tenant pseudonym's row is deleted.
3. **Survive a restore.** A restored backup brings back wrapped keys. Erasure is
   re-applied before the restored store serves anything.
4. **Be evidenced.** A record that the key was destroyed — who asked, when, under
   what request — kept where the erased data is not, and a check anyone can run:
   the key does not open, the pseudonym finds no row, and the replay fails
   legibly (ADR-004 §3).

**On the append-only tables it costs nothing at erasure time.** No row is
touched and the triggers are never bypassed. **It costs once, now.** A row
written in plaintext can never be encrypted afterwards, because that is an
`UPDATE` the triggers refuse (ADR-004 amendment, point 5). Every ledger today is
synthetic, so the migration replaces the tables rather than altering rows, and
every existing ledger is reset once more, by the path ADR-019 §7 set.

### What the read path costs

**The cipher is free.** Measured on the development laptop, 2026-09-19: Node's
OpenSSL, PostgreSQL 15 on localhost, a 100,000-key table, and a 6.2 KB record,
the mean on `metis_dev`.

| Operation | p50 | p95 |
|---|---|---|
| Encrypt a 6.2 KB record, AES-256-GCM | 0.016 ms | 0.082 ms |
| Decrypt it | 0.010 ms | 0.066 ms |
| Unwrap a subject key under the tenant key | 0.004 ms | 0.014 ms |
| Keyed subject column, HMAC-SHA256 | 0.003 ms | 0.010 ms |
| Fetch one wrapped key from PostgreSQL | 0.204 ms | 0.500 ms |

A capped decision gains one key fetch, about 0.5 ms at p95, to compute the
subject column it counts by. That sits beside the cap read's measured 4.5 ms
(ADR-021 §6).

**What moves the cost is where filtering happens**, and that is §5's choice. It
was measured the same day, on the same machine, over 10,400 decisions for 1,000
customers, plus one heavy customer with 90 web contacts in 30 days:

| p95 | A. Encrypted projection, filtered in the application | B. Clear projection, filtered in SQL | Whole record decrypted, filtered in the application |
|---|---|---|---|
| Scoped cap count, typical customer | 1.1 ms | 2.2 ms | 2.8 ms |
| Scoped cap count, heavy customer | 3.9 ms | 1.2 ms | 22.4 ms |
| `/decisions` page: web, offered, 50 rows and the total | 309 ms | 13.7 ms | 1,922 ms |

The third column is the naïve form of "encrypt everything": it moves 6 KB per
row to read three fields. It is not proposed. It is here because it is what the
cost would be assumed to be.

## Decision

### 1. Envelope keys: a per-tenant key above per-subject keys

- **The tenant key** (a key-encryption key) is never stored in the database. It
  is held by a **key provider**, chosen per tenant at provisioning:
  - `file`: a 256-bit key in a file outside the repository, created by
    `metis tenant create`. **Refused for a `real` tenant.**
  - `kms`: a reference to a key in a managed KMS; the provider asks the KMS to
    unwrap. Required for a `real` tenant. Which KMS is a deployment choice, made
    behind one interface, as the ledger's stores are.
- **A tenant pseudonym key** is 256 random bits per tenant, stored in
  `key_tenants` **wrapped** under the tenant key and unwrapped once per process.
  It is what tenant pseudonyms are computed under — not the tenant key itself. A
  tenant key held in a KMS cannot compute an HMAC locally, and asking the KMS for
  one would put a network call on every decision, which the cost table in the
  Context rules out. *(Amended on building, 2026-09-19: this clause first said
  `HMAC(tenantKey, customerRef)`.)*
- **A subject key** is 256 random bits, created on the subject's first write. It
  is stored in a `subject_keys` table **wrapped** under the tenant key, and keyed
  by the **tenant pseudonym** `HMAC(tenant pseudonym key, customerRef)`. It is
  the one mutable table in the ledger's database (ADR-004), and it is not
  append-only.
- **What the ledger stores:**
  - `record` as ciphertext under the subject key;
  - the subject column `HMAC(subjectKey, customerRef)` on `decision_records` and
    `delivery_attempts`;
  - `outcome_events.detail` under the subject key with the rest;
  - in clear: ADR-004 §4's survivors — decision id, chain hash, flow and version,
    `occurred_at` — the tenant and the subject column, and **§5's projection,
    in whichever version is chosen**.

### 2. The cipher: AES-256-GCM, bound to its row

- **AES-256-GCM** for records, projections and wrapping, with a 96-bit random
  nonce per encryption. **The row's identity is the associated data** — tenant,
  table, decision id — so a ciphertext moved to another row fails to open rather
  than opening as someone else's.
- **HMAC-SHA256** for both pseudonyms.
- Chosen because both engines have it in their standard libraries (Node's
  OpenSSL, the JVM's JCA) with no dependency, it authenticates as well as
  encrypts, and it was measured above at under 0.1 ms per record.

### 3. The lifecycle

- **Created** lazily, on a subject's first write, under the tenant key current at
  that moment.
- **Read** once per request that needs it, and cached **in process only**,
  unwrapped, for at most **60 seconds**. That bound is part of the erasure claim:
  an erased subject's data is unreadable everywhere within 60 seconds of the
  destruction.
- **So erasure is provable, and it is not instant.** For up to 60 seconds after
  the key is destroyed, a process that had already unwrapped it can still read
  the subject's data. **Wherever the product says erasure is provable — a
  screen, the API's description of the erasure operation, the erasure record
  itself, a document — it says "within 60 seconds"** in the same place. A claim
  of instant erasure would be false, and the difference is exactly the kind a
  regulator asks about. (Added on acceptance, 2026-09-19.)
- **Rotated at the tenant level only.** A new tenant key re-wraps every subject
  key row; no ledger row is touched. Subject keys are never rotated: the rows
  they encrypt are immutable, so a new subject key would protect nothing new.
- **Destroyed** by erasure or by retention expiry (ADR-004 §5, one path):
  - the subject key row and the tenant-pseudonym row are deleted;
  - the unwrapped cache entry is evicted;
  - an **erasure record** is appended to `erasures`, which is append-only:
    tenant, **the tenant pseudonym**, the ledger subject column, when, who, and
    under what request. It carries no identifier and no key. The tenant
    pseudonym is there because a restore must find the key row to destroy it
    again, and only the pseudonym finds it — see Consequences for what that
    discloses.
  - **The record is written before the key is destroyed.** A crash between the
    two leaves a record whose check reports the key still present, and which
    re-applying erasures completes. The other order could leave a destroyed key
    with no record that it was destroyed on purpose.
- **Re-applied on restore.** A restored database is not served until every
  erasure recorded since the backup was taken has been re-applied. `erasures` is
  backed up apart from the data, so a restore of the data does not roll it back.
- **Evidenced** by a check the platform runs and a person can run. For an
  erasure record: the subject key does not exist, no key opens the rows under
  that subject column, and a replay of any of them fails naming the erasure
  (ADR-004 §3).

### 4. A tenant has a data class, and the provider follows it

- **The data class moves from the process to the tenant.** `metis tenant create`
  records `synthetic` or `real` with the tenant (ADR-016 §2). It cannot be
  changed from `synthetic` to `real`: a real tenant is created real.
- **A `real` tenant requires the `kms` provider**, and the service refuses to
  load one whose key is a file. A `synthetic` tenant may use either.
- **`METIS_DATA_CLASS` stays as the deployment's ceiling:** a deployment
  declared `synthetic` refuses to load a `real` tenant. The ledger's refusal to
  start with `real` is lifted when this ADR is built, and not before.
- **The product says which it is**, on every screen, beside the ledger line
  added on 2026-09-18.

### 5. What the ledger keeps in clear — two versions, for the product owner

The ledger reads three things about a decision without opening it: its
**channel**, its **winner**, and **the actions and offers it showed**. The cap
count needs them, and so do `/decisions`' filters and totals. Everything else
stays sealed in the record. The two versions differ only in whether those three
are ciphertext or clear text.

| | **Version A — encrypted projection (ADR-004 as it stands)** | **Version B — clear projection (amends ADR-004)** |
|---|---|---|
| **What is stored** | A second small ciphertext per row, about 150 bytes, under the subject key: channel, winner, shown actions and offers | The same fields as ordinary columns, indexed |
| **ADR-004** | Unchanged. §1 holds: nothing describing a subject is in clear | **Amended.** §1 gains an exception, and §4's survivors grow to include channel and the actions shown |
| **Before erasure, someone who can read the database but not the key store sees** | That an opaque subject was decided about at a time | That an opaque subject was offered *these* offers, on *this* channel, at *these* times — a contact pattern per pseudonym |
| **After erasure** | Nothing beyond §4 | The same pattern, attached to a pseudonym that no longer resolves to anyone: anonymous, and permanent |
| **Cap count** (p95, measured) | 1.1 ms typical, 3.9 ms heavy. It grows with the customer's contacts in the window, at about 150 bytes each | 2.2 ms typical, 1.2 ms heavy. Flat |
| **`/decisions` filtering and totals** | **A scan of the tenant's window on every page:** 309 ms at 10,400 decisions, growing with history, so about 30 s at a million. Exact totals become "at least N" or cost the full scan; a filter by winner or channel cannot use an index | Index scans as today: 13.7 ms at 10,400, and roughly flat with history |
| **What has to be built for search** | A different search: page backwards through time until 50 rows match, totals estimated or dropped, or a per-tenant search index that is itself under a key | Nothing new |
| **The harm it risks** | Search that degrades with tenant size, on the one screen an auditor uses to find a decision | **A pseudonymous contact pattern in clear.** A pattern can be re-identified by joining it with anything else that holds times — web logs, a send log. The offer itself can be sensitive: in a lender's catalogue, "offered debt consolidation" says something about the person |

**What each costs to leave later.** A → B is additive: new clear columns can be
filled for new rows, but not for existing rows, whose projections are sealed
under keys the migration would have to open — which it can only do for
subjects not yet erased. B → A cannot remove what was written in clear: those
rows are append-only.

**Decided: Version A** (the product owner, 2026-09-19). ADR-004 stays whole.
Two reasons:

1. **A → B is additive; B → A is impossible.** Clear columns written to
   append-only rows can never be taken back, so choosing B is permanent — and it
   would be a permanent choice made on measurements from a development laptop.
   Choosing A leaves B available if search ever demands it.
2. **B leaves a contact pattern in clear that survives erasure.** That
   contradicts the aim this ADR serves — *can destroy it provably* — and
   provable erasure is the claim the incumbent has no answer to. Keeping a
   pattern that outlives the key would give the claim up for search speed.

**What A costs is taken as work, not left to be found.** Decision search that
does not degrade with tenant size is its own step in `docs/DIRECTIVE.md`,
landing with or straight after step B, because `/decisions` is the screen an
auditor uses to find a decision. Its three options are the ones above:
**backward paging** (walk back through time until a page of matches is found),
**estimated totals** (say "at least N", or estimate, rather than scan for an
exact count), and **a per-tenant search index held under a key**.

## Consequences

- **Search degrades with tenant history until its own step lands** (§5,
  Version A): 309 ms per `/decisions` page at 10,400 decisions, measured, and
  growing linearly. That step lands with or straight after step B.
- **A capped decision gains one key fetch**, about 0.5 ms at p95, before its cap
  count.
- **The reports gain a decryption per record** and one batched key fetch per
  report. They already read every record.
- **Every ledger is reset once more**, to replace plaintext tables with
  encrypted ones. All are synthetic, and the reset path exists (ADR-019 §7). A
  backup taken before that reset cannot be restored into the new schema.
- **A lost tenant key is a lost tenant.** For `kms`, the KMS's own durability is
  the backup. For `file`, losing the file loses a synthetic tenant, which is
  acceptable and is said at creation.
- **The conformance corpora are unaffected.** Encryption is at rest, below the
  record, so no chain hash moves (ADR-004 amendment, point 2).
- **A residual disclosure: an erasure record can confirm that a person was
  erased.** The record keeps the tenant pseudonym, so that a restore can
  re-apply the erasure (§3). Someone who can use the tenant key — directly, or
  through its KMS — and who holds a candidate identifier can compute that
  person's pseudonym and find it in `erasures`: they learn *that* the person
  was erased, and when, and nothing about them. Access to the database alone is
  not enough: the pseudonym key is wrapped under the tenant key, which is never
  in the database. It cannot be removed while restores re-apply erasures, and
  it is named here rather than left to be found. *(Found on building,
  2026-09-19.)*
- **No key leaves the platform in an export.** `subject_keys`, `key_tenants`
  and `erasures` are excluded from a tenant's export bundle, each with its
  reason (`packages/portability/src/entities.ts`): an exported key is a key no
  erasure can reach. How an encrypted history moves between instances is
  decided with step B.
- **What this does not reach:** model weights trained on an erased subject
  (ADR-004's own caveat), and anything a caller or partner holds.

## Alternatives considered

- **Keys in the database, unwrapped.** Cheapest, and erasure is not provable:
  every database backup holds the keys beside the ciphertext.
- **One KMS key per subject.** Strong, but a KMS key per customer is a billing
  line per customer, a network call per decision, and a cloud dependency on
  every laptop.
- **Rotating subject keys.** Re-encrypting an immutable row is the operation the
  triggers forbid; rotating above it is enough.
- **Decrypting the whole record to filter.** Measured in the Context at 22 ms
  per heavy customer's cap count and 1.9 s per `/decisions` page. It moves 6 KB
  to read three fields; §5's Version A is the same idea done properly.
