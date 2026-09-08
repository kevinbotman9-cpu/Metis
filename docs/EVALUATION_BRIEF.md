# METIS — Evaluation Brief

**Mode: READ-ONLY.** Phases E1–E4 below modify no source file. If you find
something broken, record it. Do not fix it. An agent that begins remediation
before the survey is complete produces a partial map and a false sense of
progress.

You may create files under `docs/evaluation/`. Exactly one existing file is
edited by this brief: E3 extends `docs/CAPABILITIES.md`, because that is the
repo's single status source and a second one is the drift this whole exercise
exists to catch. Nothing else is touched.

**Output of this brief:** three new documents plus an extended capability map,
then a stop. The product owner decides what happens next.

---

## E1 — Truth audit of the existing codebase

`PHASES_SUMMARY.md` claims all phases complete. Treat every claim in it as
**unverified**. Your job is to establish what is actually there.

For every claim in `PHASES_SUMMARY.md`, produce a row in
`docs/evaluation/TRUTH_AUDIT.md`:

| Claim | Verdict | Evidence | Notes |
|---|---|---|---|

**Verdicts** (use exactly these):
- `BUILT` — implementation exists AND a named test exercises it AND a console route
  operates it.
- `ENGINE-ONLY` — implementation and tests exist, no operable screen.
- `SCREEN-ONLY` — a screen renders but reads mock/static data.
- `SCAFFOLD` — files exist, no working behaviour.
- `ABSENT` — nothing found.

**Evidence rules — these are strict:**
- Evidence is `path/to/file.ts:L120-160` plus a test name plus a route path.
- "It looks like this is handled in the runtime package" is not evidence.
- A type definition is not an implementation.
- A test that asserts a function returns without throwing is not a test.
- If you cannot find evidence in 5 minutes of searching, the verdict is `ABSENT`.
  Do not reason about what the code probably does.

Also record, for the whole repo:
- Total source LOC excluding generated files, tests, and node_modules.
  (`PHASES_SUMMARY.md` claims ~50,000. Report the real number.)
- Which of the four persistence stores (Postgres, EventStoreDB, Redis, ClickHouse)
  are actually connected to running code versus present only in config.
- Every route under `apps/console/`, and for each: does it fetch real data, mock
  data, or nothing?
- Every hand-rolled `fetch`/`axios` call outside a generated client.
- Every hardcoded colour, spacing or font value not sourced from a token.

---

## E2 — Build the capability taxonomy

Do not evaluate against Pega alone. The buyer's requirements list is drawn from
everything they have used. Construct a vendor-neutral taxonomy of what a serious
decisioning and marketing platform is expected to do.

**Source products to mine** (public documentation and product tours only; do not
attempt to access anything gated):

*Decisioning:* Pega Customer Decision Hub · Adobe Journey Optimizer Decisioning ·
Salesforce Marketing Cloud Personalization (formerly Interaction Studio) ·
SAS Customer Intelligence 360 · HCL Unica · Zeta Marketing Platform · Redpoint

*Rules and decision engines:* FICO Blaze Advisor · Provenir · Taktile ·
Decisions.com · Camunda DMN

*Campaign and journey orchestration:* Braze · Iterable · Airship · MoEngage ·
CleverTap · Insider · Bloomreach Engagement · Klaviyo

*Experience optimisation and experimentation:* Optimizely · Dynamic Yield ·
Monetate · Ninetailed · Statsig

*Data and identity adjacency (boundaries, not build targets):* Segment · mParticle ·
Tealium · Amperity · Adobe Experience Platform · Salesforce Data Cloud

**Taxonomy structure** — one section per domain, each line item a testable
requirement written as a user capability, not a feature name:

1. Data, profile and identity
2. Consent, preference and privacy
3. Audience and segmentation
4. Offer and action management
5. Content, creative and asset governance
6. Eligibility, relevance and suitability
7. Arbitration and ranking
8. Predictive and adaptive models
9. Experimentation and measurement
10. Journeys and orchestration
11. Channels and delivery (inbound, outbound, paid, agent-assist, batch)
12. Frequency, suppression and fatigue
13. Simulation, testing and pre-production QA
14. Analytics, attribution and reporting
15. Governance, approval, environments and audit
16. Administration, extensibility and screen configurability
17. Operations, reliability and cost

**Write each line item like this:**
> `4.12` — A business user can create a new version of an existing offer,
> alter one attribute, and have both versions live with independent effective dates,
> without engineering involvement.

Not like this:
> ~~Offer versioning~~

Target 180–260 line items. Mark each `TABLE-STAKES` (three or more of the source
products have it and buyers will ask unprompted), `DIFFERENTIATING` (one or two
have it), or `FRONTIER` (nobody does it well).

Write to `docs/evaluation/CAPABILITY_TAXONOMY.md`.

---

## E3 — Score Metis against the taxonomy

Join E1 and E2. **This phase extends `docs/CAPABILITIES.md`. Do not create a
capability ledger, a scorecard, or any second document that says what is built.**
Three documents once made that claim here and all three had drifted; the map
exists to be the only one, and `tests/docs-status.test.ts` fails a status table
that appears anywhere else.

### Two new columns on every row

Add these to every existing table in `docs/CAPABILITIES.md`:

| Column | `YES` only if |
|---|---|
| Operable from screen? | You can name the route a person reaches it from |
| Configurable without code? | Adding a field or changing a rule needs no change under `apps/console/` |

These two are the ones that matter and the ones previous reviews of this codebase
have skipped. A row that cannot answer them is answered `NO`, not left blank.

### Reconciling the two status scales

E1's verdicts are a survey instrument. `docs/CAPABILITIES.md` has its own scale,
and its rule — **BUILT means a named test goes red when it breaks** — is stricter
than E1's. The map's rule wins. Map E1 verdicts on the way in:

| E1 verdict | Becomes | Condition |
|---|---|---|
| `BUILT` | `BUILT` | Only if you can name the check. Otherwise `PARTIAL` |
| `ENGINE-ONLY` | `PARTIAL` | With `Operable from screen? = NO`, and the limit stated |
| `SCREEN-ONLY` | `PARTIAL` | With the mock source named as the limit |
| `SCAFFOLD` | `ABSENT` | Files existing is not a capability |
| `ABSENT` | `ABSENT` | — |

`ABSENT` is a fifth status value this phase adds to the map's legend: *nothing
found, and nobody has committed to it.* It is distinct from `PLANNED`, which
carries a stage number, and from `OUT OF SCOPE`, which is a decision. Add it to
the legend table at the top of the map, do not leave readers to infer it.

### Taxonomy items with no row

A taxonomy line item the map does not cover gets a new row in the section it
belongs to, at `ABSENT`, citing the taxonomy ID as its evidence. Keep the map's
evidence discipline: name a file, a check, or say plainly that there is nothing.

Put the verdict in a middle column, never the last one. `tests/docs-status.test.ts`
reads the last cell of every table row, and the map is allow-listed only so long
as it stays the single claim.

### The three counts

Add one section, `## Evaluation counts`, dated, with three counts and nothing else
editorial. Each count names the rows it came from, so it can be recomputed rather
than trusted:

- `TABLE-STAKES` items at `ABSENT` — the evaluation-loss list.
- Items at `BUILT` or `PARTIAL` where `Operable from screen? = NO` — the inventory
  list. This is work already paid for that delivers nothing.
- Items where `Configurable without code? = NO` — the extensibility debt list.
  Each of these gets more expensive every week it stays.

Finally, update the map's **Last verified** line with today's date and how you
verified — by running the suites, not by reading the code.

---

## E4 — Coherence review

The failure mode this brief exists to catch is a platform that scores well
line-by-line and is incoherent as a product. Answer these in
`docs/evaluation/COHERENCE_REVIEW.md`:

1. Pick the three most complete-looking capabilities. For each, walk the full path
   a real user takes to reach it: log in → nav → find it → configure it → see the
   result. Where does the path break? Screenshot or describe each break.
2. Which capabilities exist with no upstream producer or downstream consumer? (An
   adaptive model nobody can attach to a decision flow. A trace nobody can view.)
3. Where do two subsystems solve the same problem differently? Name every place
   the product has more than one answer to the same question.
4. What does a first-time user see on the landing screen, and what can they
   actually accomplish in ten minutes?
5. Which of the six personas in the vision document can complete **any** end-to-end
   task today? Name the task or write NONE.

Question 5 is the headline number. Report it first.

---

## Stop here

Do not propose a remediation plan. Do not begin work. Report:
- The three documents, and the diff to `docs/CAPABILITIES.md`.
- The three counts from E3.
- The answer to E4 Q5.
- Your top three surprises — things that were materially different from what
  `PHASES_SUMMARY.md` implies.

Then wait.
