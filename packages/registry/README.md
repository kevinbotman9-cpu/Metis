# @metis/registry

Immutable, versioned, compilation-gated storage for compiled strategies.

## The rules

Four, and the stub this replaced had none of them.

**Publishing compiles first.** A strategy that does not compile is refused and
nothing is stored, so it cannot be promoted and cannot reach execution. The
console showed the compiler's verdict for weeks and nothing acted on it.

**Publishing is not activating.** A published version sits in the registry until
somebody promotes it to an environment. Conflating the two is what makes publish
a frightening button and rollback a restore-from-backup exercise.

**Versions are immutable**, bound to an artifact hash. Republishing identical
content is a no-op producing no second event — a retried deploy is not a second
publish. Different content under a published version is refused.

**Rollback returns to what ran before**, and rolling back twice returns to where
you started rather than walking backwards through history.

Refusals are recorded. An audit that only shows what succeeded cannot answer
"did anyone try to ship this?", which is the question asked after an incident.

## Storage

```
METIS_DATABASE_URL unset   in memory, lost on restart
METIS_DATABASE_URL set     postgres, per migrations/001_registry.sql
```

`createRegistryStore()` picks between them. A configured database that cannot be
reached is an error, never a fallback: starting anyway with storage that forgets
turns a deployment fault into a data-loss incident found days later.

Both implementations run the **same behaviour suite** (`tests/suite.ts`). The
rules live in `ArtifactRegistry`; a store only persists. If durable storage ever
changed a behaviour, that suite says which one rather than the two drifting
until somebody notices in production.

## Immutability is enforced twice

The application refuses to overwrite a published version. So does the schema:
`registry_versions` and `registry_events` carry triggers that reject `UPDATE`
and `DELETE` outright.

The duplication is the point. Enforced only in application code, immutability is
a convention that survives exactly as long as nobody writes a migration script,
an admin query, or a second service. A test drops the trigger from the migration
and confirms the suite notices.

`TRUNCATE` still works, and the test harness uses it between cases. Worth
knowing rather than hiding: the append-only guarantee is about rows, not about a
deliberate administrative reset.

## Running the tests

```bash
npm test                      # memory always; postgres if one is reachable
```

The PostgreSQL suite skips when no database is reachable, so a developer without
one can still run the rest. CI runs a `postgres:15` service so the skip does not
become the normal case.

Point it somewhere else with `METIS_TEST_DATABASE_URL`. It truncates between
cases, so give it a database of its own.

## What is not here

- **No connection pooling policy, retries or timeouts.** The store takes a
  `Queryable`; how connections are managed is the caller's decision.
- **No migration runner.** One idempotent file, applied by
  `createRegistryStore({ migrate: true })`. A second migration needs a real
  runner, and that is the moment to add one rather than now.
- **No signing.** `CompiledStrategy` has an `artifactHash` but nothing signs it,
  so the registry can prove content is unchanged and not who vouched for it.
