# ADR-010: Console UI Architecture (Next.js vs SPA)

**Status:** Accepted  
**Decision Date:** 2026-09-03  
**Deciders:** Product, Architecture  
**Affected Component:** `apps/console` and related packages

---

## Context

METIS requires a web console for six personas (Marketer, Compliance Officer, Executive, Operator, Data Scientist, Decision Architect) to design strategies, approve changes, inspect audit trails, and operate the platform. The console will be deployed into customer infrastructure (Kubernetes), sometimes air-gapped, so it must be containerisable and runnable without external CDNs.

Two viable architectures:

1. **Next.js App Router with `output: standalone`** — Server components for dense read-heavy views, client-side interactivity for editing; containerises cleanly.
2. **Vite + React Router SPA + BFF in execution plane** — Pure client-side rendering, simpler deployment model, existing execution plane handles API routing.

---

## Decision

**We are building with Next.js App Router, `output: standalone` mode.**

### Rationale

1. **Server components reduce surface area.** Dense read-heavy views (decision search with 100k+ rows, trace explorer, audit logs) benefit from server-side filtering and rendering. Less data over the wire, smaller JavaScript bundle per route.

2. **Containerisation for customer deployments.** `output: standalone` produces a fully self-contained Node server that does not require a separate application server. Single Docker image, no external dependencies, works in air-gapped Kubernetes clusters.

3. **Splitting concerns cleanly.** App Router makes it natural to separate:
   - Server components (data fetching, authorization, audit logging)
   - Client components (interaction, canvas editing, real-time updates)
   - API routes (temporary — will be replaced by typed client against the execution plane)

4. **Proven for enterprise SaaS.** Next.js App Router is well-established in regulated industries where dense, dense views and strict access control matter.

### Trade-offs Accepted

- **Requires Node runtime in-cluster.** If customer infra absolutely refuses Node, this decision breaks and we fall back to Vite SPA. That is a known exit, not a problem we need to solve today.
- **Build-time output incompatible with edge compute.** Static SSG is not viable here (strategy content is real-time). We cannot ship to Cloudflare Workers or Deno Deploy without retooling. Acceptable trade-off for the customer-deployment use case.
- **Slightly higher operational complexity.** Running Node in production requires observability (node_exporter, structured logging) and graceful shutdown handling. Teams that have done this before own it; teams without will need an extra sprint of runbook work.

---

## Alternatives Considered

### Vite + React Router SPA + BFF

**Pros:**
- Simpler deployment (static files + Node BFF, can split across runtimes)
- Existing execution plane serves as the BFF (no new service)
- Works in edge runtimes if needed later

**Cons:**
- Trace explorer (decision search 100k+ rows, virtualisation) is harder to implement reliably in a pure SPA; data fetching and filtering must all happen on client
- No server-side audit logging for console access (only API-level audit); compliance officer cannot prove who viewed a sensitive trace
- Increases client-side bundle size (must ship all query logic to the browser)
- Harder to implement granular row-level security in the client (code smell: secrets could leak)

We rejected this because **server-side data access control is non-negotiable for a compliance platform.**

---

## Implementation Constraints

1. **`output: standalone` must be enabled in `next.config.js`.** Do not use incremental static regeneration; all routes are dynamic.

2. **No external CDN for static assets.** Fonts must be self-hosted (fallback to system fonts if needed). Third-party JS (analytics, monitoring) must be self-hosted or omitted for air-gapped deployments. Use environment variables to gate external requests.

3. **Server components as default.** Explicitly mark client interactivity with `'use client'`. This is the opposite of most React codebases; auditing for "use client" at import time catches scope creep.

4. **Observability built in.** Structured logging (JSON) for all data access, with trace context propagation from the client (`x-trace-id` header). Node exporter for Prometheus scraping.

5. **No implicit dependency on `/api` routes for data.** Future state: all data goes through `packages/client`, which is generated from the execution plane OpenAPI spec. Today: `/api` routes are temporary scaffolding that proxy to the execution plane. They must be clearly marked as temporary and logged for later removal.

---

## Acceptance Criteria

- [ ] Next.js App Router installed and configured
- [ ] `output: standalone` working (test: build, run server, curl a route)
- [ ] No external CDN requests in air-gapped mode
- [ ] Structured JSON logging for all data access
- [ ] Trace context propagation working
- [ ] Server component audit passes (all "use client" explicit and justified)
- [ ] WCAG 2.2 AA lighthouse audit passing

---

## Related Decisions

- **ADR-011** (forthcoming): Client generation from OpenAPI spec
- **ADR-012** (forthcoming): Panel security model and capability bridge
- **EXPERIENCE_LAYER_PLAN.md** §4.2: Framework decisions table

---

## References

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Standalone Output Mode](https://nextjs.org/docs/app/api-reference/next-config-js/output)
- METIS Experience Layer Build Plan, §4.2

---

**Owner:** Architecture  
**Last Updated:** 2026-09-03
