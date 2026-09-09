# Coherence review

**Phase E4 of `docs/EVALUATION_BRIEF.md`. Walked 2026-09-09 against a running
console on `feat/shadow-mode` at `7af77ff`, signed in as each demo account.**

E1 and E3 scored the product line by line. This phase asks the question a line
scoring cannot: whether the lines add up to something a person can use. Every
finding below was reached by driving the console, not by reading the code —
where code is cited it is to explain a break I first saw on screen.

---

## Question 5 — which personas can complete an end-to-end task

**Two of six.** The vision document names Decision Architect, Marketer, Data
Scientist, Compliance Officer, Operator and Executive. Three have a sign-in;
the console's own login screen labels them, and one of the three (Administrator)
is not one of the six.

| Persona | Task completed end to end | Verdict |
|---|---|---|
| **Decision Architect** | Author an offer, give it a creative, add it to a flow's candidate set, publish, promote, and see it win a real decision | **YES** |
| **Compliance Officer** | Find a decision by date and channel, read the elimination cascade, replay it, and see the stored and replayed chain hashes match | **YES, up to the last step** |
| Marketer | — | NONE |
| Data Scientist | — | NONE |
| Operator | — | NONE |
| Executive | — | NONE |

**Decision Architect — yes, fully.** Signed in as `sarah.chen@telco.example`,
the whole chain is reachable: `/offers` → New offer → the offer is refused
activation with nothing to deliver → Add creative → activate →
`/decision-flows/next-best-action` → **Edit graph** (a live node palette:
Source, Filter, Constraint, Score, Switch, Arbitrate, with drag-to-connect and
Save graph) → publish → promote → the offer appears as a candidate and can win.
`flow-authoring.test.ts` walks this same chain and the compiler refused its
first attempt with `NO_DELIVERABLE_CREATIVE`, so the test walks the real path
rather than routing around the gate. This is a complete weekly task for a real
job.

**Compliance Officer — yes for the proof, no for the evidence.** I did this
end to end: `/decisions` → 10,400 rows, virtualised, sortable → open
`dec_eca1fb223441ea28` → the full cascade with seven nodes, three candidates
removed at relevance naming the policy that removed each, nineteen scored, the
ranking formula written out as `Priority = P^1.0 × V^1.0 × B^1.0 × C^0.5`, a
per-candidate score table, per-node timings, consent state, connector
provenance and the chain hash → **Replay this decision** → "Identical", with the
stored and replayed hashes shown side by side. That is the single strongest
thing in this product and it works exactly as promised.

It then stops. The `Export PDF` and `Export JSON` buttons at the top of that
page are `<Button>` elements with **no `onClick` handler at all**
(`apps/console/app/decisions/[id]/page.tsx:117-123`). They are enabled, styled
identically to working controls, and do nothing when clicked — no download, no
dialog, no console error. The U2 gate in the Experience Layer plan reads: *"a
compliance officer can find a decision from a date range, understand why the
offer was chosen, replay it, and export defensible evidence, without help."*
The first three clauses pass. The fourth is a dead control.

**Marketer — none.** No account exists; the nearest, Sarah, is labelled
*Decision Architect* on the login screen. Of the seven marketer surfaces the
plan names — taxonomy browser, action editor, content library, campaign builder,
always-on outbound monitor, frequency policy editor, results — two exist
(`/creatives`, and a read-only `/frequency-policy`), and the one that would
close a marketer's loop, results with lift by segment, reports zero (below).
There is no audience, no schedule, no send.

**Data Scientist — none.** No account. The `Intelligence` nav group is visible
only to the administrator, and the routes beneath it in the persona manifest —
`/models`, `/adaptive-models`, `/features/definitions`, `/drift`,
`/propensity` — do not exist, so the generated navigation correctly hides them.
Propensity is `0.05 + seededUnitInterval(...) * 0.9`, and the trace says so in
the sentence the scientist would read.

**Operator — none.** No account, and no screen of any kind for throughput,
latency distribution, error budget, degradation state or queue depth. The
closest thing in the product is a benchmark that runs offline in CI.

**Executive — none.** No account. `/performance` is the nearest surface and it
opens on `WITH AN OUTCOME: 0`.

---

## Question 1 — three complete-looking capabilities, walked

### 1. Decision search, trace and replay

**Path:** log in → nav `Evidence` → `Decisions` → sort/scan 10,400 rows → click a
row → read the cascade → `Replay this decision`.

Three breaks, in the order a person hits them.

**a. The summary strip mixes two denominators.** The header reads
`DECISIONS 10400 · in the current filter`, then `OFFER MADE 2312 · across 5,000
loaded rows` and `SUPPRESSED 2688 · across 5,000 loaded rows`. The qualifier is
present and honest, and it is still the wrong shape: three numbers of the same
visual weight sit side by side, and two of them are drawn from a different
population than the first. A reader computes 2312/10400 and gets a 22% offer
rate; the true rate over the loaded sample is 46%. The fix for the page-size bug
found last session moved the error rather than removing it.

**b. The decision id is clipped on arrival.** The results grid opens
horizontally scrolled such that the `Decision` column — the primary identifier,
and the thing a compliance officer copies into an email — is cut in half behind
the nav rail. It is recoverable by scrolling; it is the first thing on screen
and it is unreadable.

**c. Evidence export does nothing.** As above. Two enabled buttons, no handlers.

Everything between those breaks is excellent, and the audience toggle
(`Customer / Business / Analyst / Engineer / Regulator`) genuinely re-renders —
the Regulator view drops node-kind badges and re-headlines to "Policies applied,
consent state and evidence", and the consent block reads `marketing: granted ·
profiling: granted · thirdParty: granted` sourced from `conn_consent_registry`.

### 2. Authoring an offer and getting it decided

**Path:** log in as Sarah → `Catalogue` → `Offers` → New offer → Add creative →
Activate → `Decisioning` → `Decision flows` → the flow → Edit graph → publish →
promote.

The path works. Three breaks around it.

**a. `New flow` is an enabled dead control.** On `/decision-flows`, the primary
action on the Decision Architect's own list screen is
`<Button variant="primary">New flow</Button>` with no handler
(`app/decision-flows/page.tsx:195`). Verified live: `disabled=false`, clicking
does nothing. `Version history` and `Export DIR` on the flow detail page are the
same (`app/decision-flows/[id]/page.tsx:106,109`).

**b. The map says this path does not exist.** `docs/CAPABILITIES.md` states, in
a section headed *"Authoring, which is worth stating plainly"*: **"The canvas is
read-only… it cannot be drafted in the console — node positions are authored in
fixtures, not laid out."** There is a working graph editor with a node palette
and a Save button. The same file's §9 row says an offer created from the console
**"cannot be decided — the engine reads a different catalogue (W-005) and a
flow's candidate set is fixed (W-024)"**, and `docs/gaps.md` records both closed
on 2026-09-07 (*"a created offer is decidable, and a created policy runs"*, and
*"W-005 half closed: the engine reads what the console writes"*). Two claims in
the capability map are two days stale and understate the product. I carried both
forward in E3 without checking them, which is the same failure the map exists to
prevent, arriving from the opposite direction.

**c. Saving is not shipping, and the screen says so.** "Saving does not change
any decision — publish and promote do." That is correct and well-worded. It is
also the point at which a first-time user needs to understand a three-stage
model nothing has yet explained to them.

### 3. Governance and approvals

**Path:** log in → landing → `Awaiting your approval` → `All approvals →` →
open a change set → read the diff → approve or reject.

The change-set detail page is the second-best surface in the product: a
field-level diff (`pol_heavy_user.conditions[0].value: 0.8 → 0.7`), a simulation
replayed against 240,000 customers, a margin impact of +£43,200/month, a bias
ratio of 1.04 against a 1.20 gate, and full provenance including the agent
identity and autonomy tier. Signed in as Sarah it correctly shows
`approve:changes required` and renders **no** approve or reject control at all —
hidden, not disabled, exactly as the ADR requires.

**The break is one level up.** The landing page shows Sarah a panel headed
**"Awaiting your approval"** listing two change sets she has no permission to
approve. The permission model is enforced correctly two clicks later and
advertised incorrectly on the first screen she sees.

---

## Question 2 — capabilities with no producer or no consumer

**Outcome capture is a consumer with no producer, and it is the largest one.**
`POST /outcomes/{tenantId}/{decisionId}` is served, tested and durable.
`/performance` says out loud what that means: *"Nothing has been reported back.
3,426 offers were made and no channel has recorded an impression, a click or an
acceptance against any of them, so every rate below is empty rather than zero.
Outcomes arrive through POST /outcomes; no channel adapter sends them yet
(W-017)."* Every measurement capability downstream inherits this: performance by
action, performance by arm, the experiment holdout, and any notion of lift all
terminate in a column of dashes. The honesty is exemplary and the chain is
still dead at both ends — nothing delivers a message, so nothing can report one.

**Three persistence stores are producers with no consumer.** PostgreSQL-backed
registry, ledger and catalogue, each with migrations, dual implementations and a
shared behaviour suite. The only non-test caller is
`packages/portability/src/cli.ts:17-19`. The console reads an in-process store
instead. Nothing a person can click reaches any of them.

**`packages/nodes-core` is imported by nothing** — 445 lines of operator
metadata, registered in `gaps.md`, and the typecheck found its registry could
never have constructed a node.

**Volume constraints** (`packages/core/src/volume.ts`, 181 lines, tested) have no
route and no screen. **Flow test cases** (`packages/runtime/src/flow-tests`) are
consumed by the publish gate but authored by no screen, so the gate can only run
cases that arrived in a fixture. **Placement** is a configured object that
governs delivery, in a product with no delivery.

**Consent is a producer nobody owns.** It arrives on the decision request and is
enforced properly. There is no consent store, no preference screen and no
ingestion path — the `conn_consent_registry` connector in the demo is a recorded
gateway. The platform enforces a state it has no way to be told.

---

## Question 3 — where the product has two answers

**1. What to do with a control whose API does not exist.** Three places disable
it and write the reason in a comment: `/agentic` New scope rule (*"No API
creates a scope rule… Disabled with the reason rather than enabled and dead"*),
`/arbitration` New boost (*"An enabled control that does nothing is a promise; a
disabled one with a reason is an absence somebody can plan around"*),
`/offers/[id]` Request change. Five places leave it enabled and dead: `New
flow`, `Version history`, `Export DIR`, `Export PDF`, `Export JSON`. The
convention is written down, argued for in prose, and followed 3 times out of 8.

**2. How many decisions there are.** `/decisions` and the landing page say
**10,400**. `/performance` says **10,401**. The same corpus, two screens, one
apart. The offer rate differs more sharply: `/decisions` implies 46% of loaded
rows resulted in an offer, `/performance` reports 3,426 of 10,401, which is 33%.

**3. Whether a console edit reaches the engine.** `docs/gaps.md` (2026-09-07):
it does, and `catalogue-configurability.test.ts` asserts the ranking actually
changes. `docs/CAPABILITIES.md` *Known holes* table: **Open** — *"a
ranking-weight change persists, is audited, and changes no decision."* Both
sentences are in the repository today and only one is true.

**4. Where a gap is registered.** `docs/gaps.md` holds ten W-numbers;
`docs/BACKLOG.md` holds fifty-one. `engine.ts:522` and `artifacts.ts:147` both
send a reader to W-029, which is in the backlog and not in the gap register that
`CLAUDE.md` names as the place to look.

**5. How a user edits an object.** Four mechanisms: a declared form descriptor
(Offer, Creative), a hand-built dialog (TargetingPolicy, in
`components/policy-form-dialog.tsx`), a bespoke weights editor (`/arbitration`),
and a graph canvas (decision flows). Rule 8 says the first is the only permitted
answer; it covers two of fourteen entities.

**6. Where state lives.** The in-process store backs every screen; PostgreSQL
backs the same entities in `packages/*`. Both are real, tested, and hold
overlapping models of offers, decisions and versions.

---

## Question 4 — the first ten minutes

The landing screen is dense and good-looking. Four metric cards — decisions
10,400, average latency 0.55ms against a 50ms SLA, decision outcomes split
offered/suppressed, flow compilation 2 clean / 1 warning / 1 blocked, governance
2 pending / 3 guardrail stops. Below them, two panels: *Awaiting your approval*
with two agent-raised change sets marked "sim passed", and *Agent activity* —
six entries with autonomy tiers, including two that were stopped
(`maxBoostDelta (0.15) exceeded: requested 0.35`) and one auto-reverted when a
bias gate observed a 1.31 disparity ratio. A `Jump to` strip offers Offers,
Decisions, Arbitration and Agentic AI. A persistent badge in the corner reads
**Fixture data**.

It is an unusually strong first screen. It says what the product is for in about
four seconds: this thing decides, it lets agents act, and it stops them.

**What a first-time user can accomplish in ten minutes:** open a decision from
any date in the last two years and read the complete reasoning; replay it and
watch two hashes match; create an offer, be refused activation for having
nothing to deliver, add an SMS creative, be refused again for exceeding 160
characters with the count shown against the field, fix it, and activate;
open a change set and read a field-level diff with its simulated margin and bias
impact; browse 251 offers with faceted search.

**What they cannot:** learn whether any of it worked. Every rate in the product
is empty. They also cannot build an audience, schedule anything, send anything,
or find a customer — and if they are one of four of the six personas, they
cannot sign in.

**One thing the landing screen gets wrong for everyone.** It is byte-identical
for all three accounts apart from the greeting. The plan's §7.1 makes the
approvals inbox "the product's home for most users" and §7.2–7.7 give each
persona a different workspace; the navigation is genuinely persona-generated and
correctly hides what an account cannot reach, and then the home screen ignores
that entirely — including by offering Sarah a panel titled "Awaiting your
approval" for approvals she is not permitted to give.

---

## The shape of the incoherence

The product is coherent along one axis and absent along the other. Everything
that happens **inside a single decision** is built, tested, cross-checked
against a second engine implementation, and legible on screen: candidates,
policies, scores, arbitration, reasons, timings, consent, provenance, hash,
replay. Everything that happens **before or after a decision** — where the
customer data came from, who the audience is, what got sent, what happened next
— is missing, and the two ends are missing for the same reason: nothing crosses
the boundary of the process.

That is why the Decision Architect and the Compliance Officer can work and the
other four cannot. Those two personas' jobs are entirely inside the decision.
The Marketer, the Operator and the Executive all need something to have left the
building, and the Data Scientist needs something to have come back.
