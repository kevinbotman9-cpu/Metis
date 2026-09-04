# JVM decision service

An HTTP service that makes decisions with the Kotlin engine, producing the same
chain hashes as the TypeScript one.

## Run it

```bash
./gradlew :service:run --args="--bundle ../../docs/conformance/service-bundle.json --port 8081"
```

The bundle holds the artifacts and the catalogue snapshot in the shapes the
TypeScript engine executes, exported from the console fixtures by
`npm run corpus:service`. There is no artifact registry to fetch from yet — it
is registered in `docs/gaps.md` — so the service reads a file rather than
pretending to a lifecycle it does not have.

## Endpoints

| | |
|---|---|
| `POST /api/decisions` | Make a decision. Same operation as the console's, same OpenAPI contract. |
| `GET /api/decisions/{id}/trace` | Fetch a decision this process made. |
| `POST /api/decisions/{id}/replay` | Re-execute against the recorded snapshot. |
| `GET /health` | What is loaded, and the catalogue hash it will stamp on every decision. |

## What it proves

`ServiceConformanceTest` loads the console's real strategies and catalogue,
starts the service, and pushes 60 decisions the TypeScript engine actually
produced through HTTP. Every chain hash must match.

That is the claim a JVM deployment rests on. The value and decision corpora are
synthetic — cases written to isolate one rule each — so on their own they would
only show that the two engines agree about cases chosen to be agreed about.
These 60 are the product's own data.

The console asserts the other half in `contract.spec.ts`: its endpoint
reproduces the same 60 hashes. One corpus, two implementations, both checked.

## Honest limits

- **State is in memory.** A restart loses every trace, so replay only works for
  decisions this process made. There is no event store.
- **`com.sun.net.httpserver`, not Netty.** In the JDK, so the service has no
  HTTP dependency, and thread-per-request. The engine sustains a few thousand
  decisions per second per core; this server is the limit long before the engine
  is. Swapping it changes nothing about the decisions produced, which is why it
  was not worth a dependency yet.
- **No integration resolution.** `resolveInputs` is not ported. Connector values
  must arrive already resolved in `request.input`. That is not a gap in the
  engine — resolution is I/O and sits outside the deterministic core by design —
  but a production JVM deployment needs a gateway before it can call anything.
- **No authentication.** The console's dev API checks a bearer token; this does
  not. It is not deployable as-is and is not claimed to be.
