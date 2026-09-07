# ADR-007: Secrets and Connector Authentication

**Status:** Proposed — needs a product and security decision before any code that ships authentication
**Date:** 2026-09-07
**Constrains:** `Connector` in the OpenAPI spec, integration resolution in
`packages/runtime/src/integration/`, the export format (W-002), the audit log,
and every future outbound integration including the email adapter (W-017).

## Context

A connector is "a configured route to data the platform does not hold". Five are
configured in the fixtures and three are named by live flows. Not one of them can
authenticate, because the `Connector` schema has no field in which to say how.

That is not an oversight to patch with an `apiKey` property. Three commitments
already made turn a secret stored in connector configuration into a permanent
mistake.

**The audit log is append-only.** `updateConnector` writes the connector to the
audit log, and the triggers reject `UPDATE` and `DELETE` — Phase A verified the
rejection by attempting it. A credential written into a config field is therefore
in the audit forever. It cannot be redacted after a leak, and rotating it leaves
the old value permanently readable to anyone with audit access. The property that
makes the audit trustworthy is exactly the property that makes it the worst place
in the platform to put a secret.

**Export carries the catalogue out of the platform.** W-002 exports nine tables
to a file and re-imports them elsewhere. If credentials live in connector rows,
every export is a credential dump, and the round-trip conformance check would be
asserting that the dump reproduces faithfully.

**ADR-004 does not cover this.** Crypto-shredding is keyed per subject. A bureau
API key is tenant infrastructure, not subject data, so it falls outside that
scheme entirely and needs its own answer.

There is also a smaller, sharper constraint: `sourceCalls` are stored on the
measured half of every decision record. Anything the gateway records about a call
is retained per decision, at decision volume.

## Decision

**Configuration holds a reference. It never holds a value.**

1. `Connector` gains an `auth` object that describes *how* to authenticate, not
   *with what*:

   ```
   auth: { scheme: 'none' | 'bearer' | 'header' | 'basic',
           headerName?: string,      // scheme: header
           credentialRef?: string }  // opaque name, e.g. "bureau/experian/api-key"
   ```

   `scheme: 'none'` is the default, so every existing connector stays valid.

2. A `SecretProvider` interface resolves a `credentialRef` to a value at fetch
   time, in the same shape as `IntegrationGateway`: an interface in the runtime,
   with an environment-variable implementation for development and a
   file/KMS/Vault implementation for production. The runtime package holds the
   interface and no provider that reads a network.

3. **The value has no path to any surface.** It is not in the spec's schemas, so
   no API response can carry it; not in the domain type, so no export can; not in
   the audit entry, because the audit entry is the connector row; not in the
   decision record, because `SourceCall` carries latency, cache state, outcome
   and field names, and gains nothing else. This is structural rather than a
   redaction rule that every future call site has to remember, which is the whole
   argument for it.

4. **A missing credential is a configuration error, not a connector failure.**
   Resolution fails with a distinct outcome — `credential_unavailable` — and does
   *not* fall through to the connector's `onFailure` mode. A connector configured
   `onFailure: 'omit'` whose secret was never provisioned would otherwise produce
   a decision that looks successful, replays exactly, and was made without the
   data it was supposed to read. Silent is the one thing this must not be.

5. **Rotation touches no configuration.** Changing a secret's value changes no
   connector row, creates no version, and writes no audit entry — deliberately.
   The audit records configuration changes, and a rotated key is not one. The
   provider owns its own rotation history, on its own retention.

6. **An imported tenant is inert until its secrets are provisioned.** Connectors
   arrive with refs that resolve to nothing, and every authenticated connector
   fails loudly on first use. That is the correct behaviour and worth stating as
   a feature: an export cannot be used to impersonate the system it came from.
   The import report lists unresolved refs so the gap is visible before a
   decision is attempted rather than after.

## Why not the alternatives

**A secret field on the connector, redacted on read.** Redaction is a rule
someone must apply at every call site — the list endpoint, the audit writer, the
export, the trace, and each one added later. The append-only audit makes a single
missed call site permanent. Structure beats discipline here.

**A secret field, encrypted with a platform key.** Better, and still puts
ciphertext into the audit log and the export, still creates a connector version
on rotation, and moves the same problem up one level to the platform key. It buys
confidentiality at rest and none of the properties this ADR is actually after.

**An egress proxy that holds all credentials.** Genuinely good, particularly for
regulated deployments where a single audited egress point is worth having on its
own merits. It is not rejected — it is one implementation of the gateway and
provider interfaces above. It is rejected only as *the* answer, because it
requires infrastructure to stand up before a single authenticated connector
works, and because the platform still needs a way to name which credential a
connector uses.

**Per-tenant KMS from the outset.** That is a provider implementation, not a
different shape. It can be chosen later without changing anything decided here,
which is the point of fixing the shape now.

## Consequences

**Accepted costs.**

- A secret provider becomes infrastructure the platform needs before any
  authenticated integration works, including outbound email (W-017). Development
  gets the environment-variable provider; production does not.
- Two failure modes exist where connectors previously had one, and the new one
  deliberately ignores `onFailure`. Operationally that means a provisioning
  mistake takes a flow down rather than quietly degrading it. That is the
  intended trade.
- The spec change is additive and the client regenerates, so the console compiles
  against it or fails to compile.

**What this forbids.** No credential, token, cookie, signed URL or client
certificate may be stored in any catalogue, registry or ledger row, in any
environment, including development. The moment one is, it is in an append-only
log and an export.

**What is not decided here.** Which providers are implemented, whether
credentials are scoped per tenant or per connector, and OAuth client-credentials
and mTLS. OAuth in particular needs token caching, and a cached token is state
that resolution would have to hold and expire — that is a design question of its
own and it should not be answered by implication.

## Status, honestly

**Proposed, not Accepted.** It commits the platform to a secret store as
infrastructure and has security consequences that are not an engineering call
alone.

What exists in the codebase today is an unauthenticated HTTP gateway: it fetches
`rest` connectors over HTTPS, applies timeouts and failure modes, and sends no
credentials of any kind, because there is nowhere to put them. That makes it
useful against internal and unauthenticated endpoints and useless against a
credit bureau. The limitation is registered in `docs/gaps.md` and stated in
`docs/CAPABILITIES.md`; it is not worked around anywhere.
